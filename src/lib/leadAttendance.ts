// Lead attendance timeline + cumulative hotness helpers.
// Wraps the upsert_lead_session_attendance / recalculate_lead_hotness SQL functions.

import { supabase } from "@/integrations/supabase/client";
import { normalizeEmail, normalizePhone } from "@/lib/identity";

export type Hotness = "super_hot" | "hot" | "warm" | "cold" | "inactive";

export interface AttendanceRow {
  id: string;
  lead_id: string;
  batch_id: string | null;
  webinar_id: string | null;
  webinar_name: string | null;
  session_name: string | null;
  session_date: string | null;
  session_day: number | null;
  session_duration_minutes: number;
  attended_minutes_raw: number;
  attended_minutes_capped: number;
  attendance_percentage: number;
  join_count: number;
  first_joined_at: string | null;
  last_left_at: string | null;
  attendance_grade: "hot" | "warm" | "cold" | "absent";
  source: "zoom" | "csv" | "google_sheet" | "manual";
  metadata_json: any;
  created_at: string;
  updated_at: string;
}

export interface HotnessScore {
  id: string;
  lead_id: string;
  total_sessions_attended: number;
  total_webinars_attended: number;
  total_attended_minutes: number;
  total_possible_minutes: number;
  cumulative_attendance_percentage: number;
  avg_attendance_percentage: number;
  highest_attendance_percentage: number;
  last_attended_at: string | null;
  current_hotness: Hotness;
  score_numeric: number;
  score_reason: any;
  manual_override: boolean;
  manual_grade: Hotness | null;
  override_reason: string | null;
  overridden_by: string | null;
  overridden_at: string | null;
  updated_at: string;
}

export const HOTNESS_LABEL: Record<Hotness, string> = {
  super_hot: "Super Hot",
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  inactive: "True Absentee",
};


export const HOTNESS_STYLE: Record<Hotness, { bg: string; text: string; border: string; emoji: string }> = {
  super_hot: { bg: "#FCE7F3", text: "#9D174D", border: "#F9A8D4", emoji: "🔥" },
  hot:       { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5", emoji: "🔥" },
  warm:      { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A", emoji: "🌤️" },
  cold:      { bg: "#DBEAFE", text: "#1E3A8A", border: "#93C5FD", emoji: "❄️" },
  inactive:  { bg: "#F3F4F6", text: "#374151", border: "#E5E7EB", emoji: "·" },
};

export interface UpsertAttendanceInput {
  leadId: string;
  batchId?: string | null;
  webinarId: string;
  webinarName?: string;
  sessionName?: string;
  sessionDate?: string | null;     // YYYY-MM-DD
  sessionDay?: number | null;
  sessionDurationMinutes: number;
  attendedMinutesRaw: number;
  joinCount?: number;
  firstJoinedAt?: string | null;   // ISO
  lastLeftAt?: string | null;      // ISO
  source?: "zoom" | "csv" | "google_sheet" | "manual";
  email?: string | null;
  phone?: string | null;
  rawIdentityKey?: string | null;
  metadata?: Record<string, any>;
}

export async function upsertAttendance(input: UpsertAttendanceInput) {
  if (!input.sessionDurationMinutes || input.sessionDurationMinutes <= 0) {
    throw new Error("Session duration is required and must be greater than 0 minutes.");
  }
  if (!input.webinarId && !input.webinarName) {
    throw new Error("Webinar/session name is required.");
  }
  if (!input.sessionDate) {
    throw new Error("Webinar date is required.");
  }
  const { data, error } = await supabase.rpc("upsert_lead_session_attendance", {
    _lead_id: input.leadId,
    _batch_id: input.batchId ?? null,
    _webinar_id: input.webinarId,
    _webinar_name: input.webinarName ?? null,
    _session_name: input.sessionName ?? null,
    _session_date: input.sessionDate ?? null,
    _session_day: input.sessionDay ?? null,
    _session_duration_minutes: Math.max(1, Math.round(input.sessionDurationMinutes || 60)),
    _attended_minutes_raw: Math.max(0, Math.round(input.attendedMinutesRaw || 0)),
    _join_count: Math.max(1, Math.round(input.joinCount || 1)),
    _first_joined_at: input.firstJoinedAt ?? null,
    _last_left_at: input.lastLeftAt ?? null,
    _source: input.source || "csv",
    _normalized_email: input.email ? normalizeEmail(input.email) : null,
    _normalized_phone: input.phone ? normalizePhone(input.phone) : null,
    _raw_identity_key: input.rawIdentityKey ?? null,
    _metadata: input.metadata ?? {},
  } as any);
  if (error) throw error;
  return data as unknown as AttendanceRow;
}

export async function recalculateHotness(leadId: string) {
  const { data, error } = await supabase.rpc("recalculate_lead_hotness", { _lead_id: leadId } as any);
  if (error) throw error;
  return data as unknown as HotnessScore;
}

export async function listAttendanceForLead(leadId: string): Promise<AttendanceRow[]> {
  const { data, error } = await supabase
    .from("lead_session_attendance" as any)
    .select("*")
    .eq("lead_id", leadId)
    .order("session_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as AttendanceRow[];
}

export async function getHotnessForLead(leadId: string): Promise<HotnessScore | null> {
  const { data, error } = await supabase
    .from("lead_hotness_scores" as any)
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as HotnessScore) || null;
}

export async function getHotnessForLeads(leadIds: string[]): Promise<Record<string, HotnessScore>> {
  if (!leadIds.length) return {};
  const out: Record<string, HotnessScore> = {};
  const chunk = 500;
  for (let i = 0; i < leadIds.length; i += chunk) {
    const slice = leadIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("lead_hotness_scores" as any)
      .select("*")
      .in("lead_id", slice);
    if (error) throw error;
    (data || []).forEach((r: any) => { out[r.lead_id] = r as HotnessScore; });
  }
  return out;
}

export function displayedHotness(h: HotnessScore | null | undefined): Hotness {
  if (!h) return "inactive";
  if (h.manual_override && h.manual_grade) return h.manual_grade;
  return h.current_hotness;
}

export async function setManualOverride(leadId: string, grade: Hotness | null, reason: string | null, userId: string | null) {
  const existing = await getHotnessForLead(leadId);
  if (!existing) {
    // Make sure a row exists.
    await recalculateHotness(leadId);
  }
  const { error } = await supabase
    .from("lead_hotness_scores" as any)
    .update({
      manual_override: !!grade,
      manual_grade: grade,
      override_reason: reason,
      overridden_by: userId,
      overridden_at: grade ? new Date().toISOString() : null,
      current_hotness: grade || (existing?.current_hotness ?? "inactive"),
    } as any)
    .eq("lead_id", leadId);
  if (error) throw error;
  try {
    await supabase.from("activity_logs").insert({
      lead_id: leadId,
      action_type: "lead_hotness_manual_override",
      details: { grade, reason, performed_by: userId } as any,
    } as any);
  } catch { /* non-fatal */ }
}

/**
 * Build a map of leadIds from a list of identities (emails/phones).
 * Looks up by normalized email first, then normalized phone.
 */
export async function resolveLeadIdsByIdentity(
  identities: { email?: string | null; phone?: string | null }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const emails = Array.from(new Set(identities.map((i) => normalizeEmail(i.email || "")).filter(Boolean)));
  const phones = Array.from(new Set(identities.map((i) => normalizePhone(i.phone || "")).filter(Boolean)));
  const chunk = 500;
  for (let i = 0; i < emails.length; i += chunk) {
    const slice = emails.slice(i, i + chunk);
    const { data } = await supabase.from("leads").select("id,email,phone").in("email", slice);
    (data || []).forEach((r: any) => {
      const e = normalizeEmail(r.email); const p = normalizePhone(r.phone);
      if (e) out.set(`e:${e}`, r.id);
      if (p) out.set(`p:${p}`, r.id);
    });
  }
  for (let i = 0; i < phones.length; i += chunk) {
    const slice = phones.slice(i, i + chunk);
    const { data } = await supabase.from("leads").select("id,email,phone").in("phone", slice);
    (data || []).forEach((r: any) => {
      const e = normalizeEmail(r.email); const p = normalizePhone(r.phone);
      if (p) out.set(`p:${p}`, r.id);
      if (e && !out.has(`e:${e}`)) out.set(`e:${e}`, r.id);
    });
  }
  return out;
}

export function lookupLeadId(
  map: Map<string, string>,
  email?: string | null,
  phone?: string | null,
): string | undefined {
  const e = normalizeEmail(email || ""); const p = normalizePhone(phone || "");
  return (e && map.get(`e:${e}`)) || (p && map.get(`p:${p}`)) || undefined;
}
