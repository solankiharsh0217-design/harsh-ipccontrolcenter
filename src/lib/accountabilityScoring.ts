/**
 * Accountability + Appraisal scoring — PURE FUNCTIONS ONLY.
 * No Supabase calls in this file. Data fetching lives in accountabilityData.ts.
 *
 * SCORE A — Accountability, 0..100 (leaderboard rank)
 * SCORE B — Appraisal, 0..1000 (personal dashboard headline). Never a salary figure.
 */

export type Direction = "higher_is_better" | "lower_is_better";
export type Grade = "green" | "yellow" | "red";
export type ComponentKey = "kpi" | "tasks" | "attendance";
export type NotRankableReason = "not_linked" | "insufficient_days" | "no_data";

export interface ScoreSettings {
  green_threshold: number;   // 1.00
  yellow_threshold: number;  // 0.80
  attainment_cap: number;    // 1.20
  yellow_credit: number;     // 0.50
  weight_kpi: number;        // 45
  weight_tasks: number;      // 25
  weight_attendance: number; // 10
  enforcement_enabled: number; // 0 | 1
}

export const DEFAULT_SCORE_SETTINGS: ScoreSettings = {
  green_threshold: 1,
  yellow_threshold: 0.8,
  attainment_cap: 1.2,
  yellow_credit: 0.5,
  weight_kpi: 45,
  weight_tasks: 25,
  weight_attendance: 10,
  enforcement_enabled: 0,
};

export interface AppraisalBand {
  min_score: number;
  label: string;
  description?: string | null;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// ── SCORE A ──────────────────────────────────────────────────────────

export interface ComponentInput {
  /** Achieved units (approved KPIs, on-time tasks, on-time check-ins). */
  achieved: number;
  /** Total opportunity (KPIs due, tasks assigned, working days). 0 = no opportunity. */
  opportunity: number;
}

export interface ComponentResult {
  key: ComponentKey;
  pct: number | null;        // 0..100, null when no opportunity
  baseWeight: number;
  effectiveWeight: number;   // after redistribution; 0 when dropped
  achieved: number;
  opportunity: number;
}

export interface AccountabilityResult {
  rankable: boolean;
  reason?: NotRankableReason;
  score: number | null;      // 0..100
  components: ComponentResult[];
}

export interface AccountabilityInput {
  kpi: ComponentInput;
  tasks: ComponentInput;
  attendance: ComponentInput;
  settings?: Partial<ScoreSettings>;
  /** Per-role overrides applied BEFORE redistribution. */
  weightOverrides?: Partial<Record<ComponentKey, number>>;
  /** False when the person has no linked app account / profile. */
  linked?: boolean;
  /** Days of data present in the period; below minDays => insufficient_days. */
  daysWithData?: number;
  minDays?: number;
}

/**
 * RULE 1 — each component is a percentage of its own opportunity.
 * RULE 2 — zero-opportunity components are dropped, weight redistributed pro-rata.
 * RULE 3 — role overrides apply before redistribution.
 * RULE 4 — no data at all => not rankable, with a reason (never a silent zero).
 */
export function computeAccountabilityScore(input: AccountabilityInput): AccountabilityResult {
  const s = { ...DEFAULT_SCORE_SETTINGS, ...(input.settings ?? {}) };
  const ov = input.weightOverrides ?? {};

  const base: Record<ComponentKey, number> = {
    kpi: ov.kpi ?? s.weight_kpi,
    tasks: ov.tasks ?? s.weight_tasks,
    attendance: ov.attendance ?? s.weight_attendance,
  };

  const raw: Record<ComponentKey, ComponentInput> = {
    kpi: input.kpi,
    tasks: input.tasks,
    attendance: input.attendance,
  };

  const keys: ComponentKey[] = ["kpi", "tasks", "attendance"];
  const active = keys.filter((k) => (raw[k]?.opportunity ?? 0) > 0);
  const activeBase = active.reduce((sum, k) => sum + base[k], 0);

  const components: ComponentResult[] = keys.map((k) => {
    const c = raw[k] ?? { achieved: 0, opportunity: 0 };
    const hasOpp = c.opportunity > 0;
    return {
      key: k,
      pct: hasOpp ? clamp((c.achieved / c.opportunity) * 100, 0, 100) : null,
      baseWeight: base[k],
      effectiveWeight: hasOpp && activeBase > 0 ? (base[k] / activeBase) * 100 : 0,
      achieved: c.achieved,
      opportunity: c.opportunity,
    };
  });

  if (input.linked === false) {
    return { rankable: false, reason: "not_linked", score: null, components };
  }
  if (active.length === 0) {
    return { rankable: false, reason: "no_data", score: null, components };
  }
  if (input.minDays != null && (input.daysWithData ?? 0) < input.minDays) {
    return { rankable: false, reason: "insufficient_days", score: null, components };
  }

  const score = components.reduce(
    (sum, c) => sum + (c.pct == null ? 0 : (c.pct * c.effectiveWeight) / 100),
    0,
  );

  return { rankable: true, score: Math.round(score * 10) / 10, components };
}

// ── SCORE B ──────────────────────────────────────────────────────────

/** Attainment respecting direction, capped. Returns null when unscoreable. */
export function computeAttainment(
  actual: number | null | undefined,
  target: number | null | undefined,
  direction: Direction = "higher_is_better",
  cap: number = DEFAULT_SCORE_SETTINGS.attainment_cap,
): number | null {
  if (target == null || actual == null) return null;      // no target => cannot be scored
  if (direction === "lower_is_better") {
    if (actual <= 0) return cap;                          // zero cost = best possible
    if (target < 0) return null;
    return Math.min(target / actual, cap);
  }
  if (target <= 0) return null;
  return Math.min(actual / target, cap);
}

export function gradeFromAttainment(
  attainment: number | null,
  settings: Partial<ScoreSettings> = {},
): Grade | null {
  if (attainment == null) return null;
  const s = { ...DEFAULT_SCORE_SETTINGS, ...settings };
  if (attainment >= s.green_threshold) return "green";
  if (attainment >= s.yellow_threshold) return "yellow";
  return "red";
}

/** earnedWeight = green + round(yellow × yellowCredit) */
export function earnedWeight(
  green: number,
  yellow: number,
  yellowCredit: number = DEFAULT_SCORE_SETTINGS.yellow_credit,
): number {
  return green + Math.round(yellow * yellowCredit);
}

/** dayScore1000 = due <= 0 ? null : round(clamp(earned/due × 100, 0, 100) × 10) */
export function dayScore1000(earned: number, due: number): number | null {
  if (due <= 0) return null;
  return Math.round(clamp((earned / due) * 100, 0, 100) * 10);
}

/** Mean of NON-NULL day scores, rounded. null when every day was null. */
export function monthAvg1000(dayScores: (number | null)[]): number | null {
  const scored = dayScores.filter((d): d is number => d != null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
}

/** Band lookup — bands come from the database, never hardcoded here. */
export function bandForScore(
  score: number | null,
  bands: AppraisalBand[],
): AppraisalBand | null {
  if (score == null) return null;
  const sorted = [...bands].sort((a, b) => b.min_score - a.min_score);
  return sorted.find((b) => score >= b.min_score) ?? null;
}

export interface NextBandGap {
  band: AppraisalBand;
  gap: number;
}

/** The next band up and how many points away it is: "58 points to Good". */
export function nextBandGap(score: number | null, bands: AppraisalBand[]): NextBandGap | null {
  if (score == null) return null;
  const above = bands
    .filter((b) => b.min_score > score)
    .sort((a, b) => a.min_score - b.min_score);
  if (above.length === 0) return null;
  return { band: above[0], gap: Math.round(above[0].min_score - score) };
}
