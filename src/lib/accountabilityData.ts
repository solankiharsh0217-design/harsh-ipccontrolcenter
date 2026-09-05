import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_SCORE_SETTINGS,
  computeAccountabilityScore,
  computeAttainment,
  gradeFromAttainment,
  earnedWeight,
  dayScore1000,
  monthAvg1000,
  bandForScore,
  nextBandGap,
  type AccountabilityResult,
  type AppraisalBand,
  type ComponentKey,
  type Direction,
  type Grade,
  type ScoreSettings,
} from "@/lib/accountabilityScoring";

const sb: any = supabase;

// ── settings / bands / rules ────────────────────────────────────────

export async function fetchScoreSettings(): Promise<ScoreSettings> {
  const { data } = await sb.from("score_settings").select("key, value");
  const out: any = { ...DEFAULT_SCORE_SETTINGS };
  (data ?? []).forEach((r: any) => { out[r.key] = Number(r.value); });
  return out as ScoreSettings;
}

export async function fetchAppraisalBands(): Promise<AppraisalBand[]> {
  const { data } = await sb
    .from("appraisal_bands")
    .select("min_score, label, description")
    .eq("is_active", true)
    .order("min_score", { ascending: false });
  return (data ?? []) as AppraisalBand[];
}

export interface PointRule {
  id: string;
  rule_key: string;
  label: string;
  description: string | null;
  points: number;
  is_penalty: boolean;
  is_active: boolean;
  has_emitter: boolean;
}

export async function fetchPointRules(): Promise<PointRule[]> {
  const { data } = await sb
    .from("point_rules")
    .select("*")
    .order("points", { ascending: false });
  return (data ?? []) as PointRule[];
}

export async function fetchWeightOverrides(): Promise<Record<string, Partial<Record<ComponentKey, number>>>> {
  const { data } = await sb.from("score_weight_overrides").select("role, component, weight");
  const map: Record<string, Partial<Record<ComponentKey, number>>> = {};
  (data ?? []).forEach((r: any) => {
    map[r.role] = { ...(map[r.role] ?? {}), [r.component as ComponentKey]: Number(r.weight) };
  });
  return map;
}

// ── month helpers ───────────────────────────────────────────────────

export function monthRange(ref: Date = new Date()): { start: string; end: string } {
  const y = ref.getFullYear(), m = ref.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(y, m + 1, 0).getDate();
  return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}` };
}

function weekdaysElapsed(ref: Date = new Date()): number {
  const y = ref.getFullYear(), m = ref.getMonth();
  let n = 0;
  for (let d = 1; d <= ref.getDate(); d++) {
    const day = new Date(y, m, d).getDay();
    if (day !== 0) n++; // Sunday off
  }
  return n;
}

// ── grading entries ─────────────────────────────────────────────────

export interface GradedEntry {
  id: string;
  user_id: string;
  day: string;
  grade: Grade | null;   // null = not scoreable (no target) or waived
  counted: boolean;      // included in "due"
  kpiName: string;
}

function gradeEntry(e: any, sub: any, settings: ScoreSettings): Grade | null {
  if (e.status === "waived") return null;
  if (e.grade) return e.grade as Grade;
  const target = e.target_value ?? e.kpi?.target_default ?? null;
  const direction: Direction = (e.direction_snapshot ?? e.kpi?.direction ?? "higher_is_better") as Direction;
  const actual = sub?.submitted_value ?? null;
  if (target != null && actual != null) {
    return gradeFromAttainment(
      computeAttainment(Number(actual), Number(target), direction, settings.attainment_cap),
      settings,
    );
  }
  if (e.status === "approved") return "green";
  if (e.status === "missed" || e.status === "rejected") return "red";
  return null; // pending / submitted without a value yet — no target to score against
}

export async function fetchGradedEntries(
  userIds: string[] | null,
  start: string,
  end: string,
  settings: ScoreSettings,
): Promise<GradedEntry[]> {
  let q = sb
    .from("kpi_entries")
    .select("id, user_id, period_start, status, target_value, grade, direction_snapshot, kpi_id, kpi:kpi_definitions(name, target_default, direction)")
    .gte("period_start", start)
    .lte("period_start", end);
  if (userIds) q = q.in("user_id", userIds);
  const { data: entries } = await q;
  const rows = (entries ?? []) as any[];
  if (rows.length === 0) return [];

  const subMap = new Map<string, any>();
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { data: subs } = await sb
      .from("kpi_submissions")
      .select("entry_id, submitted_value, status")
      .in("id_placeholder_removed" in {} ? "entry_id" : "entry_id", ids.slice(i, i + 500));
    (subs ?? []).forEach((s: any) => subMap.set(s.entry_id, s));
  }

  return rows.map((e) => ({
    id: e.id,
    user_id: e.user_id,
    day: e.period_start,
    grade: gradeEntry(e, subMap.get(e.id), settings),
    counted: e.status !== "waived",
    kpiName: e.kpi?.name ?? "KPI",
  }));
}

// ── SCORE B for one person ──────────────────────────────────────────

export interface AppraisalSummary {
  score: number | null;          // 0..1000
  band: AppraisalBand | null;
  next: { band: AppraisalBand; gap: number } | null;
  scoredDays: number;
  earnedPoints: number;          // ledger, this month
  lostPoints: number;            // ledger, this month
  todayDelta: number;
}

export function buildAppraisal(
  graded: GradedEntry[],
  settings: ScoreSettings,
  bands: AppraisalBand[],
): Pick<AppraisalSummary, "score" | "band" | "next" | "scoredDays"> {
  const byDay = new Map<string, GradedEntry[]>();
  graded.forEach((g) => {
    if (!g.counted) return;
    byDay.set(g.day, [...(byDay.get(g.day) ?? []), g]);
  });
  const dayScores: (number | null)[] = [];
  byDay.forEach((list) => {
    const scoreable = list.filter((g) => g.grade != null);
    const green = scoreable.filter((g) => g.grade === "green").length;
    const yellow = scoreable.filter((g) => g.grade === "yellow").length;
    dayScores.push(dayScore1000(earnedWeight(green, yellow, settings.yellow_credit), scoreable.length));
  });
  const score = monthAvg1000(dayScores);
  return {
    score,
    band: bandForScore(score, bands),
    next: nextBandGap(score, bands),
    scoredDays: dayScores.filter((d) => d != null).length,
  };
}

export interface LedgerRow {
  id: string;
  rule_key: string;
  points: number;
  reason: string | null;
  occurred_on: string;
  label?: string;
}

export async function fetchLedger(userId: string, start: string, end: string): Promise<LedgerRow[]> {
  const { data } = await sb
    .from("points_ledger")
    .select("id, rule_key, points, reason, occurred_on")
    .eq("user_id", userId)
    .gte("occurred_on", start)
    .lte("occurred_on", end)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as LedgerRow[];
}

export async function fetchMyAppraisal(userId: string, ref: Date = new Date()): Promise<AppraisalSummary> {
  const { start, end } = monthRange(ref);
  const [settings, bands] = await Promise.all([fetchScoreSettings(), fetchAppraisalBands()]);
  const graded = await fetchGradedEntries([userId], start, end, settings);
  const base = buildAppraisal(graded, settings, bands);
  const ledger = await fetchLedger(userId, start, end);
  const todayIso = new Date().toISOString().slice(0, 10);
  return {
    ...base,
    earnedPoints: ledger.filter((l) => l.points > 0).reduce((a, b) => a + b.points, 0),
    lostPoints: ledger.filter((l) => l.points < 0).reduce((a, b) => a + b.points, 0),
    todayDelta: ledger.filter((l) => l.occurred_on === todayIso).reduce((a, b) => a + b.points, 0),
  };
}

// ── SCORE A for everyone ────────────────────────────────────────────

export interface BoardRow {
  user_id: string;
  full_name: string;
  role: string | null;
  result: AccountabilityResult;
}

export async function fetchAccountabilityBoard(ref: Date = new Date()): Promise<BoardRow[]> {
  const { start, end } = monthRange(ref);
  const [settings, overrides] = await Promise.all([fetchScoreSettings(), fetchWeightOverrides()]);

  const { data: profiles } = await sb.from("profiles").select("id, full_name, role");
  const people = (profiles ?? []) as any[];
  const ids = people.map((p) => p.id);
  if (ids.length === 0) return [];

  const graded = await fetchGradedEntries(ids, start, end, settings);

  const { data: tasks } = await sb
    .from("tasks")
    .select("id, assigned_to, status, due_date, updated_at")
    .in("assigned_to", ids)
    .gte("due_date", start)
    .lte("due_date", end);

  const { data: sessions } = await sb
    .from("attendance_sessions")
    .select("user_id, work_date, check_in_at")
    .in("user_id", ids)
    .gte("work_date", start)
    .lte("work_date", end);

  const workingDays = weekdaysElapsed(ref);

  const rows: BoardRow[] = people.map((p) => {
    const myEntries = graded.filter((g) => g.user_id === p.id && g.counted);
    const myTasks = (tasks ?? []).filter((t: any) => t.assigned_to === p.id);
    const mySessions = (sessions ?? []).filter((s: any) => s.user_id === p.id && s.check_in_at);

    const onTimeTasks = myTasks.filter(
      (t: any) => t.status === "done" && (!t.due_date || (t.updated_at ?? "").slice(0, 10) <= t.due_date),
    ).length;

    const result = computeAccountabilityScore({
      kpi: { achieved: myEntries.filter((e) => e.grade === "green").length, opportunity: myEntries.length },
      tasks: { achieved: onTimeTasks, opportunity: myTasks.length },
      attendance: { achieved: mySessions.length, opportunity: mySessions.length > 0 ? workingDays : 0 },
      settings,
      weightOverrides: overrides[p.role ?? ""] ?? undefined,
    });

    return { user_id: p.id, full_name: p.full_name ?? "—", role: p.role ?? null, result };
  });

  return rows.sort((a, b) => (b.result.score ?? -1) - (a.result.score ?? -1));
}

// ── points emission (idempotent) ────────────────────────────────────

export async function awardPoints(args: {
  userId: string;
  ruleKey: string;
  sourceTable: string;
  sourceRowId: string;
  reason?: string;
  awardedBy?: string | null;
  occurredOn?: string;
}): Promise<boolean> {
  const { data: rule } = await sb
    .from("point_rules")
    .select("points, is_active, is_penalty")
    .eq("rule_key", args.ruleKey)
    .maybeSingle();
  if (!rule || !rule.is_active) return false;
  const points = Number(rule.points);
  if (points === 0) return false;                       // 0 points = off, write nothing

  if (rule.is_penalty) {
    const { data: sw } = await sb
      .from("score_settings").select("value").eq("key", "enforcement_enabled").maybeSingle();
    if (Number(sw?.value ?? 0) !== 1) return false;     // penalties only when enforcement is on
  }

  const { error } = await sb.from("points_ledger").insert({
    user_id: args.userId,
    rule_key: args.ruleKey,
    points: rule.is_penalty ? -Math.abs(points) : points,
    source_table: args.sourceTable,
    source_row_id: args.sourceRowId,
    reason: args.reason ?? null,
    awarded_by: args.awardedBy ?? null,
    occurred_on: args.occurredOn ?? new Date().toISOString().slice(0, 10),
  });
  // Duplicate = already paid for this source event; that is success, not failure.
  if (error && error.code !== "23505") return false;
  return !error;
}
