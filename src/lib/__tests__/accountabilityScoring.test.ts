import { describe, it, expect } from "vitest";
import {
  computeAccountabilityScore,
  computeAttainment,
  gradeFromAttainment,
  earnedWeight,
  dayScore1000,
  monthAvg1000,
  bandForScore,
  nextBandGap,
} from "@/lib/accountabilityScoring";

const BANDS = [
  { min_score: 900, label: "Excellent" },
  { min_score: 750, label: "Good" },
  { min_score: 500, label: "Needs Attention" },
  { min_score: 0, label: "Critical" },
];

describe("Score A — accountability", () => {
  it("weights redistribute to 56/31/13 when all three components are present", () => {
    const r = computeAccountabilityScore({
      kpi: { achieved: 1, opportunity: 1 },
      tasks: { achieved: 1, opportunity: 1 },
      attendance: { achieved: 1, opportunity: 1 },
    });
    const w = Object.fromEntries(r.components.map((c) => [c.key, Math.round(c.effectiveWeight)]));
    expect(w).toEqual({ kpi: 56, tasks: 31, attendance: 13 });
    expect(r.score).toBe(100);
  });

  it("drops a zero-opportunity component and redistributes its weight", () => {
    const r = computeAccountabilityScore({
      kpi: { achieved: 5, opportunity: 10 },
      tasks: { achieved: 0, opportunity: 0 },
      attendance: { achieved: 10, opportunity: 10 },
    });
    const tasks = r.components.find((c) => c.key === "tasks")!;
    expect(tasks.pct).toBeNull();
    expect(tasks.effectiveWeight).toBe(0);
    // kpi 45/55 = 81.8%, attendance 10/55 = 18.2%
    expect(r.score).toBeCloseTo(50 * 0.8182 + 100 * 0.1818, 0);
  });

  it("percentages are relative to opportunity, so 3 KPIs can beat 30", () => {
    const few = computeAccountabilityScore({
      kpi: { achieved: 3, opportunity: 3 },
      tasks: { achieved: 0, opportunity: 0 },
      attendance: { achieved: 0, opportunity: 0 },
    });
    const many = computeAccountabilityScore({
      kpi: { achieved: 20, opportunity: 30 },
      tasks: { achieved: 0, opportunity: 0 },
      attendance: { achieved: 0, opportunity: 0 },
    });
    expect(few.score!).toBeGreaterThan(many.score!);
  });

  it("applies role weight overrides before redistribution", () => {
    const r = computeAccountabilityScore({
      kpi: { achieved: 1, opportunity: 1 },
      tasks: { achieved: 0, opportunity: 1 },
      attendance: { achieved: 0, opportunity: 0 },
      weightOverrides: { kpi: 50, tasks: 50 },
    });
    expect(Math.round(r.score!)).toBe(50);
  });

  it("returns not rankable with a reason instead of a silent zero", () => {
    const none = computeAccountabilityScore({
      kpi: { achieved: 0, opportunity: 0 },
      tasks: { achieved: 0, opportunity: 0 },
      attendance: { achieved: 0, opportunity: 0 },
    });
    expect(none).toMatchObject({ rankable: false, reason: "no_data", score: null });

    const unlinked = computeAccountabilityScore({
      kpi: { achieved: 1, opportunity: 1 },
      tasks: { achieved: 0, opportunity: 0 },
      attendance: { achieved: 0, opportunity: 0 },
      linked: false,
    });
    expect(unlinked.reason).toBe("not_linked");

    const short = computeAccountabilityScore({
      kpi: { achieved: 1, opportunity: 1 },
      tasks: { achieved: 0, opportunity: 0 },
      attendance: { achieved: 0, opportunity: 0 },
      daysWithData: 1,
      minDays: 5,
    });
    expect(short.reason).toBe("insufficient_days");
  });

  it("failing everything scores 0 but stays rankable", () => {
    const r = computeAccountabilityScore({
      kpi: { achieved: 0, opportunity: 4 },
      tasks: { achieved: 0, opportunity: 2 },
      attendance: { achieved: 0, opportunity: 20 },
    });
    expect(r.rankable).toBe(true);
    expect(r.score).toBe(0);
  });
});

describe("Score B — attainment and direction", () => {
  it("higher_is_better divides actual by target", () => {
    expect(computeAttainment(80, 100)).toBeCloseTo(0.8);
  });

  it("lower_is_better divides target by actual (cost per lead scores correctly)", () => {
    expect(computeAttainment(80, 100, "lower_is_better")).toBeCloseTo(1.25 > 1.2 ? 1.2 : 1.25);
    expect(computeAttainment(125, 100, "lower_is_better")).toBeCloseTo(0.8);
  });

  it("caps over-delivery at 120%", () => {
    expect(computeAttainment(500, 100)).toBe(1.2);
  });

  it("returns null when there is no target — a KPI with no target cannot be scored", () => {
    expect(computeAttainment(10, null)).toBeNull();
    expect(gradeFromAttainment(null)).toBeNull();
  });

  it("grades at the configured thresholds", () => {
    expect(gradeFromAttainment(1.0)).toBe("green");
    expect(gradeFromAttainment(0.8)).toBe("yellow");
    expect(gradeFromAttainment(0.79)).toBe("red");
  });
});

describe("Score B — day and month maths", () => {
  it("earnedWeight gives yellow half credit", () => {
    expect(earnedWeight(3, 3)).toBe(3 + 2); // round(1.5) = 2
    expect(earnedWeight(0, 0)).toBe(0);
  });

  it("dayScore1000 returns null when nothing was due", () => {
    expect(dayScore1000(0, 0)).toBeNull();
    expect(dayScore1000(4, 5)).toBe(800);
    expect(dayScore1000(9, 5)).toBe(1000); // clamped
  });

  it("a month with 20 scored days and 10 null days averages only the 20", () => {
    const days = [
      ...Array(20).fill(800) as number[],
      ...Array(10).fill(null) as (number | null)[],
    ];
    expect(monthAvg1000(days)).toBe(800);
    expect(monthAvg1000(Array(10).fill(null))).toBeNull();
  });
});

describe("bands", () => {
  it("first match wins, descending", () => {
    expect(bandForScore(910, BANDS)!.label).toBe("Excellent");
    expect(bandForScore(750, BANDS)!.label).toBe("Good");
    expect(bandForScore(0, BANDS)!.label).toBe("Critical");
    expect(bandForScore(null, BANDS)).toBeNull();
  });

  it("states the gap to the next band", () => {
    expect(nextBandGap(692, BANDS)).toEqual({ band: BANDS[1], gap: 58 });
    expect(nextBandGap(950, BANDS)).toBeNull();
  });
});
