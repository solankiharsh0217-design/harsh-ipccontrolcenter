import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

const sb: any = supabase;
const MOD = { module_key: "team_performance", module_label: "Team Performance" };

export type EntryStatus = "pending" | "submitted" | "approved" | "rejected" | "missed" | "waived";

export interface ReviewSubmissionRow {
  id: string;
  entry_id: string;
  user_id: string;
  submitted_value: number | null;
  proof_url: string | null;
  notes: string | null;
  submitted_at: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  entry?: {
    id: string;
    kpi_id: string;
    assignment_id: string;
    period_type: string;
    period_start: string;
    period_end: string;
    due_at: string | null;
    target_value: number | null;
    status: string;
    kpi?: {
      id: string;
      name: string;
      cadence: string;
      target_unit: string | null;
      proof_required: boolean;
      approval_required: boolean;
      weight: number | null;
    };
  };
  user_profile?: { id: string; full_name: string | null; email: string | null };
  reviewer_profile?: { id: string; full_name: string | null; email: string | null } | null;
}

export interface EntryWithMeta {
  id: string;
  user_id: string;
  kpi_id: string;
  assignment_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  due_at: string | null;
  target_value: number | null;
  status: EntryStatus;
  kpi: {
    id: string;
    name: string;
    cadence: string;
    weight: number | null;
    target_unit: string | null;
    proof_required: boolean;
    approval_required: boolean;
  };
  assignment: {
    id: string;
    assignment_type: string;
    template_id: string | null;
    custom_weight: number | null;
  };
  submission: ReviewSubmissionRow | null;
  effective_weight: number;
}

export interface Scorecard {
  total: number;
  approved: number;
  submitted: number;
  pending: number;
  rejected: number;
  missed: number;
  waived: number;
  approved_weight: number;
  required_weight: number;
  score_pct: number; // 0-100
}

const PROFILE_FIELDS = "id, full_name, email";

// ─────────────────────────────────────────────────────────────
// Review queue

export interface ReviewQueueFilters {
  from?: string; // ISO date yyyy-MM-dd
  to?: string;
  userId?: string | null;
  kpiId?: string | null;
  cadence?: string | null;
  status?: string | null;
  proofRequired?: boolean | null;
  approvalRequired?: boolean | null;
}

export async function listReviewSubmissions(
  filters: ReviewQueueFilters = {}
): Promise<ReviewSubmissionRow[]> {
  let q = sb
    .from("kpi_submissions")
    .select(
      `id, entry_id, user_id, submitted_value, proof_url, notes, submitted_at, status,
       reviewed_by, reviewed_at, review_notes,
       entry:kpi_entries!inner(
         id, kpi_id, assignment_id, period_type, period_start, period_end, due_at,
         target_value, status,
         kpi:kpi_definitions(id, name, cadence, target_unit, proof_required, approval_required, weight)
       )`
    )
    .order("submitted_at", { ascending: false })
    .limit(500);

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.userId) q = q.eq("user_id", filters.userId);
  if (filters.from) q = q.gte("submitted_at", `${filters.from}T00:00:00Z`);
  if (filters.to) q = q.lte("submitted_at", `${filters.to}T23:59:59Z`);

  const { data, error } = await q;
  if (error) throw error;
  let rows: ReviewSubmissionRow[] = data ?? [];

  // Client-side filter for nested fields
  if (filters.kpiId) rows = rows.filter((r) => r.entry?.kpi?.id === filters.kpiId);
  if (filters.cadence) rows = rows.filter((r) => r.entry?.kpi?.cadence === filters.cadence);
  if (filters.proofRequired != null) rows = rows.filter((r) => !!r.entry?.kpi?.proof_required === filters.proofRequired);
  if (filters.approvalRequired != null) rows = rows.filter((r) => !!r.entry?.kpi?.approval_required === filters.approvalRequired);

  // Hydrate profiles
  const userIds = Array.from(new Set(rows.flatMap((r) => [r.user_id, r.reviewed_by].filter(Boolean) as string[])));
  if (userIds.length > 0) {
    const { data: profs } = await sb.from("profiles").select(PROFILE_FIELDS).in("id", userIds);
    const map = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
    rows.forEach((r) => {
      r.user_profile = map.get(r.user_id) ?? null;
      r.reviewer_profile = r.reviewed_by ? (map.get(r.reviewed_by) ?? null) : null;
    });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Approve / Reject

export async function approveSubmission(params: {
  submissionId: string;
  entryId: string;
  reviewNotes?: string | null;
  actorId: string;
  kpiName?: string;
}): Promise<void> {
  const { submissionId, entryId, reviewNotes, actorId, kpiName } = params;
  const nowIso = new Date().toISOString();

  const { data: existing, error: fErr } = await sb
    .from("kpi_submissions")
    .select("id, status, user_id, entry_id")
    .eq("id", submissionId)
    .single();
  if (fErr) throw fErr;
  const oldStatus = existing.status;

  const { error: e1 } = await sb
    .from("kpi_submissions")
    .update({
      status: "approved",
      reviewed_by: actorId,
      reviewed_at: nowIso,
      review_notes: reviewNotes?.trim() || null,
    })
    .eq("id", submissionId);
  if (e1) throw e1;

  const { error: e2 } = await sb.from("kpi_entries").update({ status: "approved" }).eq("id", entryId);
  if (e2) throw e2;

  try {
    await logActivity({
      ...MOD,
      action_type: "kpi_submission_approved",
      entity_type: "kpi_submission",
      entity_id: submissionId,
      target_user_id: existing.user_id,
      metadata: { entry_id: entryId, kpi_name: kpiName ?? null, old_status: oldStatus, new_status: "approved" },
      summary: kpiName ? `Approved ${kpiName}` : "Approved KPI submission",
    });
    await logActivity({
      ...MOD,
      action_type: "kpi_entry_status_updated",
      entity_type: "kpi_entry",
      entity_id: entryId,
      target_user_id: existing.user_id,
      metadata: { old_status: oldStatus, new_status: "approved" },
    });
  } catch { /* non-fatal */ }
}

export async function rejectSubmission(params: {
  submissionId: string;
  entryId: string;
  reviewNotes: string;
  actorId: string;
  kpiName?: string;
}): Promise<void> {
  const { submissionId, entryId, reviewNotes, actorId, kpiName } = params;
  const notes = reviewNotes.trim();
  if (!notes) throw new Error("Rejection reason is required.");

  const nowIso = new Date().toISOString();
  const { data: existing, error: fErr } = await sb
    .from("kpi_submissions")
    .select("id, status, user_id")
    .eq("id", submissionId)
    .single();
  if (fErr) throw fErr;
  const oldStatus = existing.status;

  const { error: e1 } = await sb
    .from("kpi_submissions")
    .update({
      status: "rejected",
      reviewed_by: actorId,
      reviewed_at: nowIso,
      review_notes: notes,
    })
    .eq("id", submissionId);
  if (e1) throw e1;

  const { error: e2 } = await sb.from("kpi_entries").update({ status: "rejected" }).eq("id", entryId);
  if (e2) throw e2;

  try {
    await logActivity({
      ...MOD,
      action_type: "kpi_submission_rejected",
      entity_type: "kpi_submission",
      entity_id: submissionId,
      target_user_id: existing.user_id,
      severity: "warning",
      metadata: { entry_id: entryId, kpi_name: kpiName ?? null, old_status: oldStatus, new_status: "rejected", reason: notes },
      summary: kpiName ? `Rejected ${kpiName}` : "Rejected KPI submission",
    });
    await logActivity({
      ...MOD,
      action_type: "kpi_entry_status_updated",
      entity_type: "kpi_entry",
      entity_id: entryId,
      target_user_id: existing.user_id,
      metadata: { old_status: oldStatus, new_status: "rejected" },
    });
  } catch { /* non-fatal */ }
}

export async function markEntryMissed(params: {
  entryId: string;
  userId: string;
  kpiName?: string;
}): Promise<void> {
  const { entryId, userId, kpiName } = params;
  const { data: existing, error: fErr } = await sb
    .from("kpi_entries")
    .select("id, status, user_id")
    .eq("id", entryId)
    .single();
  if (fErr) throw fErr;
  if (existing.status !== "pending") throw new Error("Only pending KPIs can be marked missed.");

  const { error } = await sb.from("kpi_entries").update({ status: "missed" }).eq("id", entryId);
  if (error) throw error;

  try {
    await logActivity({
      ...MOD,
      action_type: "kpi_marked_missed",
      entity_type: "kpi_entry",
      entity_id: entryId,
      target_user_id: userId,
      severity: "warning",
      metadata: { kpi_name: kpiName ?? null },
      summary: kpiName ? `Marked missed: ${kpiName}` : "Marked KPI missed",
    });
    await logActivity({
      ...MOD,
      action_type: "kpi_entry_status_updated",
      entity_type: "kpi_entry",
      entity_id: entryId,
      target_user_id: userId,
      metadata: { old_status: "pending", new_status: "missed" },
    });
  } catch { /* non-fatal */ }
}

// ─────────────────────────────────────────────────────────────
// Scorecard

export type ScorecardPeriod = "daily" | "weekly" | "monthly" | "custom";

export function computePeriodRange(period: ScorecardPeriod, refDate: Date): { from: string; to: string } {
  if (period === "daily") {
    const s = format(refDate, "yyyy-MM-dd");
    return { from: s, to: s };
  }
  if (period === "weekly") {
    const s = startOfWeek(refDate, { weekStartsOn: 1 });
    const e = endOfWeek(refDate, { weekStartsOn: 1 });
    return { from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
  }
  if (period === "monthly") {
    return { from: format(startOfMonth(refDate), "yyyy-MM-dd"), to: format(endOfMonth(refDate), "yyyy-MM-dd") };
  }
  return { from: format(refDate, "yyyy-MM-dd"), to: format(refDate, "yyyy-MM-dd") };
}

export async function fetchEntriesForUserRange(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<EntryWithMeta[]> {
  const { data: rawEntries, error } = await sb
    .from("kpi_entries")
    .select(
      `id, user_id, kpi_id, assignment_id, period_type, period_start, period_end, due_at, target_value, status,
       kpi:kpi_definitions(id, name, cadence, weight, target_unit, proof_required, approval_required),
       assignment:kpi_assignments(id, assignment_type, template_id, custom_weight)`
    )
    .eq("user_id", userId)
    .gte("period_start", fromDate)
    .lte("period_end", toDate)
    .order("period_start", { ascending: false });
  if (error) throw error;
  const entries = (rawEntries ?? []) as any[];
  if (entries.length === 0) return [];

  // Load template item weight overrides
  const templatePairs = entries
    .filter((e) => e.assignment?.template_id && e.kpi_id)
    .map((e) => ({ tId: e.assignment.template_id as string, kId: e.kpi_id as string }));
  let templateWeightMap = new Map<string, number>();
  if (templatePairs.length > 0) {
    const templateIds = Array.from(new Set(templatePairs.map((p) => p.tId)));
    const { data: tItems } = await sb
      .from("kpi_template_items")
      .select("template_id, kpi_id, weight_override")
      .in("template_id", templateIds);
    (tItems ?? []).forEach((ti: any) => {
      if (ti.weight_override != null) {
        templateWeightMap.set(`${ti.template_id}::${ti.kpi_id}`, Number(ti.weight_override));
      }
    });
  }

  // Load submissions for these entries
  const ids = entries.map((e) => e.id);
  const { data: subs } = await sb.from("kpi_submissions").select("*").in("entry_id", ids);
  const subMap = new Map<string, ReviewSubmissionRow>();
  (subs ?? []).forEach((s: any) => subMap.set(s.entry_id, s));

  return entries.map((e) => {
    const custom = e.assignment?.custom_weight;
    const tplKey = e.assignment?.template_id ? `${e.assignment.template_id}::${e.kpi_id}` : null;
    const tplOverride = tplKey ? templateWeightMap.get(tplKey) : undefined;
    const kpiWeight = e.kpi?.weight;
    const effective = Number(custom ?? tplOverride ?? kpiWeight ?? 1) || 1;

    return {
      id: e.id,
      user_id: e.user_id,
      kpi_id: e.kpi_id,
      assignment_id: e.assignment_id,
      period_type: e.period_type,
      period_start: e.period_start,
      period_end: e.period_end,
      due_at: e.due_at,
      target_value: e.target_value,
      status: e.status as EntryStatus,
      kpi: e.kpi ?? { id: e.kpi_id, name: "KPI", cadence: e.period_type, weight: 1, target_unit: null, proof_required: false, approval_required: false },
      assignment: {
        id: e.assignment?.id ?? e.assignment_id,
        assignment_type: e.assignment?.assignment_type ?? "individual",
        template_id: e.assignment?.template_id ?? null,
        custom_weight: e.assignment?.custom_weight ?? null,
      },
      submission: subMap.get(e.id) ?? null,
      effective_weight: effective,
    } as EntryWithMeta;
  });
}

export function computeScorecard(entries: EntryWithMeta[]): Scorecard {
  let approved = 0, submitted = 0, pending = 0, rejected = 0, missed = 0, waived = 0;
  let approvedWeight = 0, requiredWeight = 0;
  entries.forEach((e) => {
    const w = e.effective_weight;
    switch (e.status) {
      case "approved": approved += 1; approvedWeight += w; requiredWeight += w; break;
      case "submitted": submitted += 1; requiredWeight += w; break;
      case "pending": pending += 1; requiredWeight += w; break;
      case "rejected": rejected += 1; requiredWeight += w; break;
      case "missed": missed += 1; requiredWeight += w; break;
      case "waived": waived += 1; break;
    }
  });
  const score_pct = requiredWeight > 0 ? Math.round((approvedWeight / requiredWeight) * 1000) / 10 : 0;
  return {
    total: entries.length,
    approved, submitted, pending, rejected, missed, waived,
    approved_weight: approvedWeight,
    required_weight: requiredWeight,
    score_pct,
  };
}

// ─────────────────────────────────────────────────────────────
// Summary cards for review page

export interface ReviewSummary {
  pending_review: number;
  approved_today: number;
  rejected_today: number;
  team_avg_daily_score: number | null;
  people_with_pending: number;
  people_with_low_score: number;
}

export async function fetchReviewSummary(refDate: Date = new Date()): Promise<ReviewSummary> {
  const day = format(refDate, "yyyy-MM-dd");
  const dayStart = `${day}T00:00:00Z`;
  const dayEnd = `${day}T23:59:59Z`;

  const [{ count: pending }, { count: approvedToday }, { count: rejectedToday }] = await Promise.all([
    sb.from("kpi_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    sb.from("kpi_submissions").select("id", { count: "exact", head: true }).eq("status", "approved").gte("reviewed_at", dayStart).lte("reviewed_at", dayEnd),
    sb.from("kpi_submissions").select("id", { count: "exact", head: true }).eq("status", "rejected").gte("reviewed_at", dayStart).lte("reviewed_at", dayEnd),
  ]);

  // Today's entries by user, for score aggregation
  const { data: todayEntries } = await sb
    .from("kpi_entries")
    .select(`id, user_id, status, kpi_id, assignment_id,
             kpi:kpi_definitions(weight),
             assignment:kpi_assignments(template_id, custom_weight)`)
    .eq("period_start", day)
    .eq("period_end", day);

  const rows = (todayEntries ?? []) as any[];
  // Fetch template weights
  const tplIds = Array.from(new Set(rows.map((r) => r.assignment?.template_id).filter(Boolean))) as string[];
  const tplMap = new Map<string, number>();
  if (tplIds.length > 0) {
    const { data: tItems } = await sb
      .from("kpi_template_items")
      .select("template_id, kpi_id, weight_override")
      .in("template_id", tplIds);
    (tItems ?? []).forEach((ti: any) => {
      if (ti.weight_override != null) tplMap.set(`${ti.template_id}::${ti.kpi_id}`, Number(ti.weight_override));
    });
  }

  const byUser = new Map<string, { app: number; req: number; hasPending: boolean }>();
  rows.forEach((r) => {
    const w = Number(r.assignment?.custom_weight ?? (r.assignment?.template_id ? tplMap.get(`${r.assignment.template_id}::${r.kpi_id}`) : undefined) ?? r.kpi?.weight ?? 1) || 1;
    const acc = byUser.get(r.user_id) ?? { app: 0, req: 0, hasPending: false };
    if (r.status === "waived") { /* skip */ }
    else if (r.status === "approved") { acc.app += w; acc.req += w; }
    else { acc.req += w; if (r.status === "pending" || r.status === "submitted") acc.hasPending = true; }
    byUser.set(r.user_id, acc);
  });

  const scores: number[] = [];
  let pendingUsers = 0;
  let lowUsers = 0;
  byUser.forEach((v) => {
    if (v.req > 0) scores.push((v.app / v.req) * 100);
    if (v.hasPending) pendingUsers += 1;
    if (v.req > 0 && (v.app / v.req) * 100 < 50) lowUsers += 1;
  });
  const avg = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

  return {
    pending_review: pending ?? 0,
    approved_today: approvedToday ?? 0,
    rejected_today: rejectedToday ?? 0,
    team_avg_daily_score: avg,
    people_with_pending: pendingUsers,
    people_with_low_score: lowUsers,
  };
}

export async function listOverduePendingEntries(): Promise<EntryWithMeta[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("kpi_entries")
    .select(
      `id, user_id, kpi_id, assignment_id, period_type, period_start, period_end, due_at, target_value, status,
       kpi:kpi_definitions(id, name, cadence, weight, target_unit, proof_required, approval_required),
       assignment:kpi_assignments(id, assignment_type, template_id, custom_weight)`
    )
    .eq("status", "pending")
    .not("due_at", "is", null)
    .lt("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((e: any) => ({
    id: e.id,
    user_id: e.user_id,
    kpi_id: e.kpi_id,
    assignment_id: e.assignment_id,
    period_type: e.period_type,
    period_start: e.period_start,
    period_end: e.period_end,
    due_at: e.due_at,
    target_value: e.target_value,
    status: e.status,
    kpi: e.kpi,
    assignment: {
      id: e.assignment?.id ?? e.assignment_id,
      assignment_type: e.assignment?.assignment_type ?? "individual",
      template_id: e.assignment?.template_id ?? null,
      custom_weight: e.assignment?.custom_weight ?? null,
    },
    submission: null,
    effective_weight: Number(e.assignment?.custom_weight ?? e.kpi?.weight ?? 1) || 1,
  }));
}

export async function listActiveTeamMembers(): Promise<Array<{ id: string; full_name: string | null; email: string | null }>> {
  const { data, error } = await sb
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("status", "active")
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchAttendanceForDate(userId: string, workDate: string) {
  const { data, error } = await sb
    .from("attendance_sessions")
    .select("id, work_date, check_in_at, check_out_at, total_minutes, status")
    .eq("user_id", userId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}
