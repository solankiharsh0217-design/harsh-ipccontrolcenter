// Receives "Meta and Google Ads Confirmation Form" submissions from the Apps Script
// on the response sheet and opens an unassigned Media Buyer case for each.
//
// Auth: shared secret in the x-mb-form-secret header (MB_FORM_SECRET). No user JWT —
// Google calls this, not a signed-in person — so verify_jwt is off in config.toml.
//
// Body: { submissions: [{ submitted_at: ISO string, fields: { header: value | [value] } }] }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { financeCheck, formRowKey, mapFormFields, type PaidLeadForCheck } from "../_shared/mb-form.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Submissions older than this are history, not new work: imported closed, no alerts. */
const STALE_DAYS = 30;
const MAX_BATCH = 200;
const DAY_MS = 86_400_000;

type Outcome = "created" | "attached" | "duplicate" | "invalid";
type Admin = ReturnType<typeof createClient>;
interface Submission { submitted_at?: unknown; fields?: unknown }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const secret = Deno.env.get("MB_FORM_SECRET");
  if (!secret || req.headers.get("x-mb-form-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  let body: { submissions?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Body must be JSON" }, 400); }
  const subs: Submission[] = Array.isArray(body?.submissions) ? body.submissions : [];
  if (subs.length === 0) return json({ error: "No submissions" }, 400);
  if (subs.length > MAX_BATCH) return json({ error: `At most ${MAX_BATCH} submissions per call` }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const tally: Record<Outcome, number> = { created: 0, attached: 0, duplicate: 0, invalid: 0 };
  const errors: string[] = [];

  for (const sub of subs) {
    try {
      tally[await ingest(admin, sub)] += 1;
    } catch (e) {
      errors.push(String((e as Error)?.message ?? e));
    }
  }
  return json({ ok: errors.length === 0, ...tally, errors }, errors.length && !tally.created && !tally.attached && !tally.duplicate ? 500 : 200);
});

async function ingest(admin: Admin, sub: Submission): Promise<Outcome> {
  const submittedAt = new Date(String(sub?.submitted_at ?? ""));
  const fields = sub?.fields;
  if (isNaN(submittedAt.getTime()) || !fields || typeof fields !== "object" || Array.isArray(fields)) return "invalid";

  const m = mapFormFields(fields as Record<string, unknown>);
  const iso = submittedAt.toISOString();
  const rowKey = formRowKey(iso, m.student_email, m.student_phone);

  // Claim the submission first. A unique violation means we've seen it: stop.
  const { data: subRow, error: subErr } = await admin
    .from("media_buyer_form_submissions")
    .insert({ row_key: rowKey, submitted_at: iso, raw: fields })
    .select("id")
    .maybeSingle();
  if (subErr) {
    if (subErr.code === "23505") return "duplicate";
    throw subErr;
  }

  // From here on, a failure must release the submission row — otherwise a retry
  // would see "duplicate" and the student would never reach the desk.
  try {
    return await processSubmission(admin, subRow.id, m, fields as Record<string, unknown>, submittedAt);
  } catch (e) {
    await admin.from("media_buyer_form_submissions").delete().eq("id", subRow.id);
    throw e;
  }
}

async function processSubmission(
  admin: Admin,
  submissionId: string,
  m: ReturnType<typeof mapFormFields>,
  fields: Record<string, unknown>,
  submittedAt: Date,
): Promise<Outcome> {
  const iso = submittedAt.toISOString();
  if (!m.student_email && !m.student_phone) {
    await admin.from("media_buyer_form_submissions").update({ outcome: "invalid" }).eq("id", submissionId);
    return "invalid";
  }

  const formFields = {
    form_submitted_at: iso,
    form_raw: fields,
    brand_name: m.brand_name,
    brand_website: m.brand_website,
    brand_instagram: m.brand_instagram,
    ad_platforms: m.ad_platforms,
    preferred_start_text: m.preferred_start_text,
    annual_revenue_text: m.annual_revenue_text,
    has_gmb: m.has_gmb,
    target_locations: m.target_locations,
    bajaj_answer: m.bajaj_answer,
  };

  // Same student already has an open case → refresh its details, don't open a second.
  const existing = await findOpenCase(admin, m.student_email, m.student_phone);
  if (existing) {
    await admin.from("media_buyer_cases").update(formFields).eq("id", existing.id);
    await admin.from("media_buyer_case_events").insert({
      case_id: existing.id, event_type: "form_resubmitted", event_label: "Ads request form submitted again",
      metadata: { submitted_at: iso },
    });
    await admin.from("media_buyer_form_submissions").update({ case_id: existing.id, outcome: "attached" }).eq("id", submissionId);
    return "attached";
  }

  const finance = financeCheck(await findPaidLeads(admin, m.student_email, m.student_phone));
  const stale = Date.now() - submittedAt.getTime() > STALE_DAYS * DAY_MS;

  const { data: created, error: caseErr } = await admin.from("media_buyer_cases").insert({
    student_name: m.student_name,
    student_email: m.student_email,
    student_phone: m.student_phone,
    source_module: "ads_request_form",
    source_paid_pipeline_lead_id: finance.leadId,
    finance_check: finance.status,
    case_stage: stale ? "closed" : "form_submitted",
    is_active: !stale,
    notes: stale ? "Imported from form history — not a new request." : null,
    ...formFields,
  }).select("id, student_name").single();
  if (caseErr) throw caseErr;

  await admin.from("media_buyer_case_events").insert({
    case_id: created.id, event_type: "form_submitted",
    event_label: stale ? "Imported from form history" : "Ads request form submitted",
    new_status: stale ? "closed" : "form_submitted",
    metadata: { submitted_at: iso, finance_check: finance.status },
  });
  await admin.from("media_buyer_form_submissions").update({ case_id: created.id, outcome: "created" }).eq("id", submissionId);

  if (!stale) await notifyBuyers(admin, created.id, created.student_name, m.brand_name);
  return "created";
}

/**
 * PostgREST .or() takes a comma/paren-delimited string, so a value containing those
 * characters would corrupt the filter. Cleaned emails and 10-digit phones never do;
 * anything that does is skipped rather than interpolated.
 */
function safe(v: string | null): v is string {
  return !!v && /^[^,()\s*%]+$/.test(v);
}

async function findOpenCase(admin: Admin, email: string | null, phone: string | null) {
  const ors = [safe(email) && `student_email.ilike.${email}`, safe(phone) && `student_phone.eq.${phone}`].filter(Boolean).join(",");
  if (!ors) return null;
  const { data } = await admin.from("media_buyer_cases")
    .select("id")
    .eq("is_deleted", false).eq("is_active", true)
    .not("case_stage", "in", "(service_completed,closed)")
    .or(ors)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function findPaidLeads(admin: Admin, email: string | null, phone: string | null): Promise<PaidLeadForCheck[]> {
  const ors = [safe(email) && `email.ilike.${email}`, safe(phone) && `phone.ilike.*${phone}`].filter(Boolean).join(",");
  if (!ors) return [];
  const { data } = await admin.from("paid_pipeline_leads")
    .select("id, is_enrolled, is_final_sale, is_dropped, is_refunded, finance_status, pipeline_stage")
    .eq("is_deleted", false)
    .or(ors)
    .limit(10);
  return (data ?? []) as PaidLeadForCheck[];
}

async function notifyBuyers(admin: Admin, caseId: string, name: string, brand: string | null) {
  const { data: buyers } = await admin.from("profiles")
    .select("id").eq("can_receive_media_buyer_cases", true).is("deactivated_at", null);
  const rows = ((buyers ?? []) as { id: string }[]).map((b) => ({
    recipient_user_id: b.id,
    module_key: "media_buyer_operations",
    notification_type: "media_buyer_request_new",
    title: "New ads request",
    message: `${name}${brand ? ` (${brand})` : ""} wants to start ads. Take it if they booked with you.`,
    entity_type: "media_buyer_case",
    entity_id: caseId,
    entity_label: name,
    action_url: "/media-buyer-operations?tab=requests",
    action_label: "Open requests",
    priority: "high",
    source: "media_buyer_form",
  }));
  if (rows.length) await admin.from("notifications").insert(rows);
}
