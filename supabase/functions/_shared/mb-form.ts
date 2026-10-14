// Pure mapping for the "Meta and Google Ads Confirmation Form" (Google Form → sheet).
// No Deno or browser APIs here: the edge function and the vitest suite both import it.

import { cleanEmail, cleanName, cleanPhone } from "./roas-clean.ts";

export type AdPlatforms = "meta" | "google" | "both";
export type FinanceCheck = "verified" | "pending" | "dropped" | "not_found";

export interface MappedRequest {
  student_name: string;
  student_email: string | null;
  student_phone: string | null;
  bajaj_answer: string | null;
  brand_name: string | null;
  brand_website: string | null;
  brand_instagram: string | null;
  ad_platforms: AdPlatforms | null;
  preferred_start_text: string | null;
  annual_revenue_text: string | null;
  has_gmb: boolean | null;
  target_locations: string | null;
  agreed_to_terms: boolean;
}

type FieldKey = Exclude<keyof MappedRequest, "student_name" | "student_email" | "student_phone" | "preferred_start_text" | "agreed_to_terms">
  | "name" | "email" | "phone" | "start_date" | "start_when" | "agreement";

/**
 * Form headers carry stray spaces, line breaks and Hindi translations, and Google
 * Forms lets anyone reword a question. Match on stable keywords instead of exact
 * text. Order matters: the first rule that matches wins.
 */
const HEADER_RULES: Array<[FieldKey, (h: string) => boolean]> = [
  ["email", (h) => h.includes("email")],
  ["phone", (h) => h.includes("whatsapp") || h.includes("phone") || h.includes("mobile")],
  ["bajaj_answer", (h) => h.includes("bajaj")],
  ["brand_website", (h) => h.includes("website")],
  ["brand_instagram", (h) => h.includes("instagram")],
  ["ad_platforms", (h) => h.includes("type of ads")],
  ["brand_name", (h) => h.includes("brand name")],
  ["annual_revenue_text", (h) => h.includes("revenue") || h.includes("turnover")],
  ["has_gmb", (h) => h.includes("google my business") || h.includes("gmb")],
  ["target_locations", (h) => h.includes("cities") || h.includes("states")],
  ["agreement", (h) => h.includes("agreement") || h.includes("understand")],
  ["start_date", (h) => h.includes("start") && h.includes("date")],
  ["start_when", (h) => h.includes("start")],
  ["name", (h) => h === "name" || h.includes("full name") || h.includes("your name")],
];

export function normHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, " ").trim();
}

export function classifyHeader(header: string): FieldKey | null {
  const h = normHeader(header);
  if (!h || h === "timestamp") return null;
  for (const [key, test] of HEADER_RULES) if (test(h)) return key;
  return null;
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
}

/** "No", "NA", "-", "none" — students type these into optional link fields. */
function blankIfNone(v: string | null): string | null {
  if (!v) return null;
  return /^(no|na|n\/a|none|nil|-+|\.+|not available|not there)$/i.test(v) ? null : v;
}

export function parseAdPlatforms(v: string | null): AdPlatforms | null {
  if (!v) return null;
  const s = v.toLowerCase();
  const meta = s.includes("meta") || s.includes("facebook") || s.includes("instagram");
  const google = s.includes("google");
  if (s.includes("both") || (meta && google)) return "both";
  if (meta) return "meta";
  if (google) return "google";
  return null;
}

export function parseYesNo(v: string | null): boolean | null {
  if (!v) return null;
  const s = v.toLowerCase().trim();
  if (/^(yes|y|haan|ha|han)\b/.test(s)) return true;
  if (/^(no|n|nahi|nhi)\b/.test(s)) return false;
  return null;
}

/**
 * Map one form submission (header → value) to case fields.
 * Values may be strings or single-element arrays (Apps Script `namedValues`).
 */
export function mapFormFields(fields: Record<string, unknown>): MappedRequest {
  const got: Partial<Record<FieldKey, string | null>> = {};
  for (const [header, raw] of Object.entries(fields)) {
    const key = classifyHeader(header);
    if (!key || got[key]) continue;
    const value = Array.isArray(raw) ? raw.join(", ") : raw;
    got[key] = clean(value);
  }

  const startParts = [got.start_date, got.start_when].filter(Boolean) as string[];
  const preferred = startParts.length === 2 && startParts[0].toLowerCase() === startParts[1].toLowerCase()
    ? startParts[0]
    : startParts.join(" / ") || null;

  return {
    student_name: cleanName(got.name ?? null) ?? "Unnamed student",
    student_email: cleanEmail(got.email ?? null).clean,
    student_phone: cleanPhone(got.phone ?? null).clean,
    bajaj_answer: got.bajaj_answer ?? null,
    brand_name: got.brand_name ?? null,
    brand_website: blankIfNone(got.brand_website ?? null),
    brand_instagram: blankIfNone(got.brand_instagram ?? null),
    ad_platforms: parseAdPlatforms(got.ad_platforms ?? null),
    preferred_start_text: preferred,
    annual_revenue_text: got.annual_revenue_text ?? null,
    has_gmb: parseYesNo(got.has_gmb ?? null),
    target_locations: got.target_locations ?? null,
    agreed_to_terms: !!got.agreement,
  };
}

/**
 * Stable identity for one form submission. Re-sending the same row (backfill run
 * twice, a retried trigger) produces the same key, so the unique index no-ops it.
 */
export function formRowKey(submittedAtIso: string, email: string | null, phone: string | null): string {
  return `gform:${submittedAtIso}:${email ?? phone ?? "anon"}`;
}

export interface PaidLeadForCheck {
  id: string;
  is_enrolled: boolean | null;
  is_final_sale: boolean | null;
  is_dropped: boolean | null;
  is_refunded: boolean | null;
  finance_status: string | null;
  pipeline_stage: string | null;
}

const FINAL_STAGES = ["Full Payment Received", "Enrolled / Activated", "Active Member", "Finance / EMI Approved", "Finance / EMI Disbursed"];

/**
 * Does the Paid Pipeline agree that this student has finished payment / finance?
 * Mirrors recomputePaidLead() in src/lib/paidPipeline.ts, plus finance "Approved":
 * a Bajaj approval is what students mean by "Bajaj process completed".
 * Never blocks a request — it only drives the badge the media buyer sees.
 */
export function financeCheck(leads: PaidLeadForCheck[]): { status: FinanceCheck; leadId: string | null } {
  if (leads.length === 0) return { status: "not_found", leadId: null };
  const rank = (l: PaidLeadForCheck): FinanceCheck => {
    if (l.is_dropped || l.is_refunded) return "dropped";
    if (l.is_enrolled || l.is_final_sale) return "verified";
    if (l.finance_status === "Approved" || l.finance_status === "Disbursed") return "verified";
    if (l.pipeline_stage && FINAL_STAGES.includes(l.pipeline_stage)) return "verified";
    return "pending";
  };
  const order: FinanceCheck[] = ["verified", "pending", "dropped"];
  const ranked = leads.map((l) => ({ l, r: rank(l) })).sort((a, b) => order.indexOf(a.r) - order.indexOf(b.r));
  return { status: ranked[0].r, leadId: ranked[0].l.id };
}
