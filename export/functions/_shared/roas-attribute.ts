// deno-lint-ignore no-explicit-any
type SB = any;

interface Webinar {
  id: string;
  webinar_name: string;
  webinar_start_date: string | null;
  webinar_end_date: string | null;
}

let webinarCache: { at: number; rows: Webinar[] } | null = null;

async function getWebinars(supabase: SB): Promise<Webinar[]> {
  if (webinarCache && Date.now() - webinarCache.at < 30_000) return webinarCache.rows;
  const { data } = await supabase
    .from("roas_webinars")
    .select("id, webinar_name, webinar_start_date, webinar_end_date")
    .order("webinar_end_date", { ascending: true, nullsFirst: false });
  const rows = (data || []).filter((w: Webinar) => !!w.webinar_end_date);
  webinarCache = { at: Date.now(), rows };
  return rows;
}
export function clearWebinarCache() { webinarCache = null; }

function endOfDayUTC(s: string) { return new Date(`${s}T23:59:59.999Z`); }
function startOfDayUTC(s: string) { return new Date(`${s}T00:00:00.000Z`); }
function addDaysUTC(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

function pickCycle(webinars: Webinar[], paymentDate: Date | null) {
  if (!webinars.length) return { webinar: null, windowStart: null, windowEnd: null, flag: "no_webinars_configured" as const };
  if (!paymentDate) {
    const w = webinars[webinars.length - 1];
    return { webinar: w, windowStart: null as Date | null, windowEnd: endOfDayUTC(w.webinar_end_date!), flag: "no_payment_date" };
  }
  let chosenIdx = -1;
  for (let i = 0; i < webinars.length; i++) {
    const end = endOfDayUTC(webinars[i].webinar_end_date!);
    if (end.getTime() >= paymentDate.getTime()) { chosenIdx = i; break; }
  }
  let flag: string | null = null;
  if (chosenIdx === -1) { chosenIdx = webinars.length - 1; flag = "post_last_webinar"; }
  const w = webinars[chosenIdx];
  const windowEnd = endOfDayUTC(w.webinar_end_date!);
  const windowStart = chosenIdx > 0
    ? startOfDayUTC(addDaysUTC(new Date(webinars[chosenIdx - 1].webinar_end_date! + "T00:00:00Z"), 1).toISOString().slice(0, 10))
    : null;
  return { webinar: w, windowStart, windowEnd, flag };
}

export async function attributeEnrollment(supabase: SB, enrollmentId: string) {
  const { data: enr, error: ee } = await supabase.from("roas_enrollments").select("*").eq("id", enrollmentId).single();
  if (ee || !enr) return;
  if (enr.manual_override) return;

  const phone: string | null = enr.clean_phone;
  const email: string | null = enr.clean_email;
  const paymentDate: Date | null = enr.payment_date ? new Date(enr.payment_date) : null;

  if (!phone && !email) {
    await update(supabase, enr, {
      attribution_status: "Manual Review", attribution_method: "No Match",
      attribution_confidence: null, attributed_media_buyer_id: null, matched_lead_id: null,
      attributed_webinar_id: null, cycle_window_start: null, cycle_window_end: null,
      cycle_attribution_flag: "no_contact",
    }, "no phone or email");
    return;
  }

  const webinars = await getWebinars(supabase);
  const cycle = pickCycle(webinars, paymentDate);
  const orParts: string[] = [];
  if (phone) orParts.push(`clean_phone.eq.${phone}`);
  if (email) orParts.push(`clean_email.eq.${email}`);

  let inWindowMatches: any[] = [];
  if (cycle.webinar) {
    let q = supabase.from("roas_leads").select("id, media_buyer_id, clean_phone, clean_email, created_at_from_sheet").or(orParts.join(","));
    if (cycle.windowStart) q = q.gte("created_at_from_sheet", cycle.windowStart.toISOString());
    if (cycle.windowEnd) q = q.lte("created_at_from_sheet", cycle.windowEnd.toISOString());
    const { data } = await q;
    inWindowMatches = data || [];
  }
  let matches = inWindowMatches;
  let usedFallback = false;
  if (matches.length === 0) {
    const { data: anytime } = await supabase.from("roas_leads").select("id, media_buyer_id, clean_phone, clean_email, created_at_from_sheet").or(orParts.join(","));
    matches = anytime || [];
    usedFallback = true;
  }
  if (matches.length === 0) {
    await update(supabase, enr, {
      attribution_status: "Unattributed", attribution_method: "No Match",
      attribution_confidence: null, attributed_media_buyer_id: null, matched_lead_id: null,
      attributed_webinar_id: cycle.webinar?.id ?? null,
      cycle_window_start: cycle.windowStart?.toISOString() ?? null,
      cycle_window_end: cycle.windowEnd?.toISOString() ?? null,
      cycle_attribution_flag: cycle.flag,
    }, "no matching lead");
    return;
  }
  const buyerIds = new Set(matches.map((m) => m.media_buyer_id).filter(Boolean));
  if (buyerIds.size > 1) {
    const earliest = [...matches].sort((a, b) => {
      const da = a.created_at_from_sheet ? new Date(a.created_at_from_sheet).getTime() : Infinity;
      const db = b.created_at_from_sheet ? new Date(b.created_at_from_sheet).getTime() : Infinity;
      return da - db;
    })[0];
    await update(supabase, enr, {
      attribution_status: "Duplicate Conflict", attribution_method: "First Touch Match",
      attribution_confidence: "Low", attributed_media_buyer_id: earliest.media_buyer_id,
      matched_lead_id: earliest.id, attributed_webinar_id: cycle.webinar?.id ?? null,
      cycle_window_start: cycle.windowStart?.toISOString() ?? null,
      cycle_window_end: cycle.windowEnd?.toISOString() ?? null,
      cycle_attribution_flag: usedFallback ? "fallback_cross_buyer" : (cycle.flag ?? "cross_buyer_in_window"),
    }, "cross-buyer conflict");
    return;
  }
  const phoneAndEmail = matches.find((m) => phone && email && m.clean_phone === phone && m.clean_email === email);
  const phoneOnly = matches.find((m) => phone && m.clean_phone === phone);
  const emailOnly = matches.find((m) => email && m.clean_email === email);
  const chosen = phoneAndEmail || phoneOnly || emailOnly || matches[0];
  const method = phoneAndEmail ? "Phone + Email Match" : phoneOnly ? "Phone Match" : emailOnly ? "Email Match" : "Phone Match";
  const confidence = usedFallback ? "Low" : (matches.length > 1 ? "Medium" : "High");
  const flag = usedFallback ? "out_of_window_fallback" : cycle.flag;
  await update(supabase, enr, {
    attribution_status: "Attributed", attribution_method: method,
    attribution_confidence: confidence, attributed_media_buyer_id: chosen.media_buyer_id,
    matched_lead_id: chosen.id, attributed_webinar_id: cycle.webinar?.id ?? null,
    cycle_window_start: cycle.windowStart?.toISOString() ?? null,
    cycle_window_end: cycle.windowEnd?.toISOString() ?? null,
    cycle_attribution_flag: flag,
  }, `auto via ${method}${usedFallback ? " (fallback)" : ""}`);
}

async function update(supabase: SB, prev: any, next: any, reason: string) {
  const changed =
    prev.attribution_status !== next.attribution_status ||
    prev.attributed_media_buyer_id !== next.attributed_media_buyer_id ||
    prev.attributed_webinar_id !== next.attributed_webinar_id;
  await supabase.from("roas_enrollments").update(next).eq("id", prev.id);
  if (changed) {
    await supabase.from("roas_attribution_logs").insert({
      enrollment_id: prev.id,
      old_media_buyer_id: prev.attributed_media_buyer_id,
      new_media_buyer_id: next.attributed_media_buyer_id,
      old_status: prev.attribution_status,
      new_status: next.attribution_status,
      change_reason: reason,
      changed_by: null,
    });
  }
}
