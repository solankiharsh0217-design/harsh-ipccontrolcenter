import { supabase } from "@/integrations/supabase/client";
import { awardPoints, fetchScoreSettings } from "@/lib/accountabilityData";
import {
  computeAttainment,
  gradeFromAttainment,
  type Direction,
  type Grade,
} from "@/lib/accountabilityScoring";

const sb: any = supabase;

export const POINTS_BUDGET = 1000;

// ── KRAs ────────────────────────────────────────────────────────────

export interface Kra {
  id: string;
  name: string;
  description: string | null;
  owner_role: string | null;
  assigned_user_id: string | null;
  weight: number;
  sort_order: number;
  is_active: boolean;
}

export async function listKras(): Promise<Kra[]> {
  const { data, error } = await sb
    .from("kras")
    .select("id, name, description, owner_role, assigned_user_id, weight, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Kra[];
}

export async function saveKra(kra: Partial<Kra> & { name: string }): Promise<void> {
  const payload = {
    name: kra.name.trim(),
    description: kra.description?.trim() || null,
    owner_role: kra.owner_role || null,
    assigned_user_id: kra.assigned_user_id || null,
    weight: Number(kra.weight ?? 1),
    sort_order: Number(kra.sort_order ?? 0),
    is_active: kra.is_active ?? true,
  };
  const { error } = kra.id
    ? await sb.from("kras").update(payload).eq("id", kra.id)
    : await sb.from("kras").insert(payload);
  if (error) throw error;
}

export async function deactivateKra(id: string): Promise<void> {
  const { error } = await sb.from("kras").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

// ── KPI definitions ─────────────────────────────────────────────────

export interface KpiDefinition {
  id: string;
  name: string;
  description: string | null;
  kra_id: string | null;
  cadence: string;
  measurement_type: string;
  target_default: number | null;
  target_unit: string | null;
  direction: Direction;
  weight: number;
  points_allocation: number | null;
  ai_check_enabled: boolean;
  owner_role: string | null;
  is_active: boolean;
  version: number;
  parent_definition_id: string | null;
  superseded_by: string | null;
  effective_from: string;
}

const KPI_FIELDS =
  "id, name, description, kra_id, cadence, measurement_type, target_default, target_unit, direction, weight, points_allocation, ai_check_enabled, owner_role, is_active, version, parent_definition_id, superseded_by, effective_from";

export async function listKpiDefinitions(includeRetired = false): Promise<KpiDefinition[]> {
  let q = sb.from("kpi_definitions").select(KPI_FIELDS).order("name", { ascending: true });
  if (!includeRetired) q = q.is("superseded_by", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as KpiDefinition[];
}

/** Total points allocated across live (non-superseded, active) KPIs. */
export function totalAllocated(kpis: KpiDefinition[]): number {
  return kpis
    .filter((k) => k.is_active && !k.superseded_by)
    .reduce((sum, k) => sum + Number(k.points_allocation ?? 0), 0);
}

/** KPIs that carry no target at all — flagged once, in one place. */
export function kpisMissingTarget(kpis: KpiDefinition[]): KpiDefinition[] {
  return kpis.filter((k) => k.is_active && !k.superseded_by && k.target_default == null);
}

export async function createKpiDefinition(input: Partial<KpiDefinition> & { name: string }): Promise<void> {
  const { error } = await sb.from("kpi_definitions").insert(buildKpiPayload(input));
  if (error) throw error;
}

function buildKpiPayload(input: Partial<KpiDefinition> & { name: string }) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    kra_id: input.kra_id || null,
    cadence: input.cadence || "daily",
    measurement_type: input.measurement_type || "number",
    target_default: input.target_default ?? null,
    target_unit: input.target_unit?.trim() || null,
    direction: (input.direction ?? "higher_is_better") as Direction,
    weight: Number(input.weight ?? 1),
    points_allocation: Number(input.points_allocation ?? 0),
    ai_check_enabled: !!input.ai_check_enabled,
    owner_role: input.owner_role || null,
    is_active: input.is_active ?? true,
  };
}

/** The AI-check toggle is the deliberate exception: it takes effect immediately. */
export async function setAiCheck(kpiId: string, enabled: boolean): Promise<void> {
  const { error } = await sb.from("kpi_definitions").update({ ai_check_enabled: enabled }).eq("id", kpiId);
  if (error) throw error;
}

export function needsNewVersion(current: KpiDefinition, next: Partial<KpiDefinition>): boolean {
  const targetChanged =
    next.target_default !== undefined && Number(next.target_default ?? NaN) !== Number(current.target_default ?? NaN)
    && !(next.target_default == null && current.target_default == null);
  const weightChanged = next.weight !== undefined && Number(next.weight) !== Number(current.weight);
  return targetChanged || weightChanged;
}

/**
 * Save an edit to a KPI definition.
 * Changing target or weight retires the current row and writes a new version,
 * so historic entries keep scoring against the numbers they were set under.
 * Everything else (name, unit, cadence, points, AI check) edits in place.
 */
export async function saveKpiDefinition(
  current: KpiDefinition,
  next: Partial<KpiDefinition> & { name: string },
): Promise<{ versioned: boolean }> {
  if (!needsNewVersion(current, next)) {
    const { error } = await sb.from("kpi_definitions").update(buildKpiPayload(next)).eq("id", current.id);
    if (error) throw error;
    return { versioned: false };
  }

  const payload = {
    ...buildKpiPayload(next),
    version: Number(current.version ?? 1) + 1,
    parent_definition_id: current.parent_definition_id ?? current.id,
    effective_from: new Date().toISOString().slice(0, 10),
  };
  const { data: created, error } = await sb.from("kpi_definitions").insert(payload).select("id").single();
  if (error) throw error;

  const { error: e2 } = await sb
    .from("kpi_definitions")
    .update({ superseded_by: created.id, is_active: false })
    .eq("id", current.id);
  if (e2) throw e2;

  // Point live assignments at the new version so tomorrow's entries use it.
  await sb.from("kpi_assignments").update({ kpi_id: created.id }).eq("kpi_id", current.id).eq("is_active", true);

  return { versioned: true };
}

// ── Graded review queue ─────────────────────────────────────────────

export interface ReviewRow {
  submissionId: string;
  entryId: string;
  userId: string;
  userName: string;
  kpiName: string;
  unit: string | null;
  direction: Direction;
  target: number | null;
  actual: number | null;
  attainment: number | null;
  suggested: Grade | null;
  grade: Grade | null;
  proofUrl: string | null;
  notes: string | null;
  submittedAt: string;
  periodStart: string;
}

export async function listGradedQueue(onlyPending = true): Promise<ReviewRow[]> {
  const settings = await fetchScoreSettings();
  let q = sb
    .from("kpi_submissions")
    .select(
      `id, entry_id, user_id, submitted_value, proof_url, notes, submitted_at, status,
       entry:kpi_entries!inner(id, period_start, target_value, grade, direction_snapshot,
         kpi:kpi_definitions(name, target_unit, direction))`,
    )
    .order("submitted_at", { ascending: false })
    .limit(300);
  if (onlyPending) q = q.eq("status", "submitted");
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as any[];

  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  const nameMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", ids);
    (profs ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name ?? "—"));
  }

  return rows.map((r) => {
    const direction = (r.entry?.direction_snapshot ?? r.entry?.kpi?.direction ?? "higher_is_better") as Direction;
    const target = r.entry?.target_value ?? null;
    const actual = r.submitted_value ?? null;
    const attainment =
      target != null && actual != null
        ? computeAttainment(Number(actual), Number(target), direction, settings.attainment_cap)
        : null;
    return {
      submissionId: r.id,
      entryId: r.entry_id,
      userId: r.user_id,
      userName: nameMap.get(r.user_id) ?? "—",
      kpiName: r.entry?.kpi?.name ?? "KPI",
      unit: r.entry?.kpi?.target_unit ?? null,
      direction,
      target: target == null ? null : Number(target),
      actual: actual == null ? null : Number(actual),
      attainment,
      suggested: attainment == null ? null : gradeFromAttainment(attainment, settings),
      grade: (r.entry?.grade ?? null) as Grade | null,
      proofUrl: r.proof_url ?? null,
      notes: r.notes ?? null,
      submittedAt: r.submitted_at,
      periodStart: r.entry?.period_start ?? "",
    };
  });
}

/** Grade a submission green / yellow / red and emit the matching points. */
export async function gradeSubmission(args: {
  row: ReviewRow;
  grade: Grade;
  reviewNotes?: string;
  actorId: string;
}): Promise<void> {
  const { row, grade, reviewNotes, actorId } = args;
  const nowIso = new Date().toISOString();

  const { error: e1 } = await sb
    .from("kpi_submissions")
    .update({
      status: grade === "red" ? "rejected" : "approved",
      reviewed_by: actorId,
      reviewed_at: nowIso,
      review_notes: reviewNotes?.trim() || null,
    })
    .eq("id", row.submissionId);
  if (e1) throw e1;

  const { error: e2 } = await sb
    .from("kpi_entries")
    .update({ grade, status: grade === "red" ? "rejected" : "approved" })
    .eq("id", row.entryId);
  if (e2) throw e2;

  const ruleKey = grade === "green" ? "kpi_green" : grade === "yellow" ? "kpi_yellow" : "kpi_missed";
  await awardPoints({
    userId: row.userId,
    ruleKey,
    sourceTable: "kpi_entries",
    sourceRowId: row.entryId,
    reason: row.kpiName,
    awardedBy: actorId,
    occurredOn: row.periodStart || undefined,
  });
}

// ── Point rules ─────────────────────────────────────────────────────

export async function updatePointRule(
  id: string,
  patch: { points?: number; label?: string; description?: string | null; is_active?: boolean },
): Promise<void> {
  const { error } = await sb.from("point_rules").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setEnforcement(enabled: boolean, actorId?: string | null): Promise<void> {
  const { error } = await sb
    .from("score_settings")
    .update({ value: enabled ? 1 : 0, updated_by: actorId ?? null, updated_at: new Date().toISOString() })
    .eq("key", "enforcement_enabled");
  if (error) throw error;
}

// ── Appraisal bands ─────────────────────────────────────────────────

export interface BandRow {
  id: string;
  min_score: number;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export async function listBands(): Promise<BandRow[]> {
  const { data, error } = await sb
    .from("appraisal_bands")
    .select("id, min_score, label, description, sort_order, is_active")
    .order("min_score", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BandRow[];
}

export async function updateBand(id: string, patch: Partial<BandRow>): Promise<void> {
  const { error } = await sb.from("appraisal_bands").update(patch).eq("id", id);
  if (error) throw error;
}

// ── Recognition ─────────────────────────────────────────────────────

export async function giveRecognition(args: {
  userId: string;
  reason: string;
  actorId: string;
}): Promise<void> {
  const reason = args.reason.trim();
  if (!reason) throw new Error("A reason is required.");

  const { data: rec, error } = await sb
    .from("recognitions")
    .insert({ user_id: args.userId, given_by: args.actorId, reason })
    .select("id")
    .single();
  if (error) throw error;

  await awardPoints({
    userId: args.userId,
    ruleKey: "manager_recognition",
    sourceTable: "recognitions",
    sourceRowId: rec.id,
    reason,
    awardedBy: args.actorId,
  });
}

export interface RecognitionRow {
  id: string;
  user_id: string;
  given_by: string;
  reason: string;
  created_at: string;
  userName?: string;
  giverName?: string;
}

export async function listRecognitions(limit = 30): Promise<RecognitionRow[]> {
  const { data, error } = await sb
    .from("recognitions")
    .select("id, user_id, given_by, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as RecognitionRow[];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.user_id, r.given_by])));
  if (ids.length > 0) {
    const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", ids);
    const map = new Map<string, string>((profs ?? []).map((p: any) => [p.id, p.full_name ?? "—"]));
    rows.forEach((r) => {
      r.userName = map.get(r.user_id) ?? "—";
      r.giverName = map.get(r.given_by) ?? "—";
    });
  }
  return rows;
}

export async function listPeople(): Promise<Array<{ id: string; full_name: string; role: string | null }>> {
  const { data } = await sb.from("profiles").select("id, full_name, role").order("full_name");
  return (data ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name ?? "—", role: p.role ?? null }));
}
