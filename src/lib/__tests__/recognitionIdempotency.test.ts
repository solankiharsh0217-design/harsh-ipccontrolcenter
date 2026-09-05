import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A stand-in for the recognitions + points_ledger tables that enforces the same
 * unique indexes the migration creates, so a duplicate here fails the way
 * Postgres would rather than silently passing.
 */
const db = {
  recognitions: [] as Array<{
    id: string; user_id: string; given_by: string; reason: string;
    reason_key: string; recognized_on: string; created_at: string;
  }>,
  ledger: [] as Array<{ user_id: string; source_table: string; source_row_id: string; points: number }>,
};

let nextId = 1;
/** Set >0 to make the next N inserts lose the race, as a concurrent submit would. */
let raceInserts = 0;

const key = (r: string) => r.trim().replace(/\s+/g, " ").toLowerCase();

type RecognitionInsert = { user_id: string; given_by: string; reason: string; recognized_on: string };
type LedgerInsert = { user_id: string; source_table: string; source_row_id: string; points: number };
type QueryBuilder = {
  select: () => QueryBuilder;
  eq: (col: string, val: string) => QueryBuilder;
  maybeSingle: () => Promise<{ data: { id: string } | null; error: null }>;
  order: () => QueryBuilder;
  limit: () => Promise<{ data: unknown[]; error: null }>;
  insert: (row: RecognitionInsert) => {
    select: () => { single: () => Promise<{ data: { id: string } | null; error: { code: string } | null }> };
  };
};

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    if (table === "recognitions") {
      const filters: Record<string, string> = {};
      const api: QueryBuilder = {
        select: () => api,
        eq: (col: string, val: string) => { filters[col] = val; return api; },
        maybeSingle: async () => {
          const hit = db.recognitions.find((r) =>
            Object.entries(filters).every(([c, v]) => (r as Record<string, string>)[c] === v));
          return { data: hit ? { id: hit.id } : null, error: null };
        },
        order: () => api,
        limit: async () => ({ data: db.recognitions, error: null }),
        insert: (row: RecognitionInsert) => ({
          select: () => ({
            single: async () => {
              const reason_key = key(row.reason);
              if (raceInserts > 0) {
                // A racing submit landed first: write it, then reject ours.
                raceInserts -= 1;
                db.recognitions.push({
                  id: `rec-${nextId++}`, created_at: new Date().toISOString(),
                  ...row, reason_key,
                });
                return { data: null, error: { code: "23505" } };
              }
              const clash = db.recognitions.some((r) =>
                r.user_id === row.user_id && r.given_by === row.given_by &&
                r.reason_key === reason_key && r.recognized_on === row.recognized_on);
              if (clash) return { data: null, error: { code: "23505" } };
              const created = {
                id: `rec-${nextId++}`, created_at: new Date().toISOString(),
                ...row, reason_key,
              };
              db.recognitions.push(created);
              return { data: { id: created.id }, error: null };
            },
          }),
        }),
      };
      return api;
    }

    if (table === "point_rules") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { points: 5, is_active: true, is_penalty: false } }) }) }) };
    }

    if (table === "points_ledger") {
      return {
        insert: async (row: LedgerInsert) => {
          const clash = db.ledger.some((l) =>
            l.source_table === row.source_table && l.source_row_id === row.source_row_id);
          if (clash) return { error: { code: "23505" } };   // uq_points_ledger_source
          db.ledger.push(row);
          return { error: null };
        },
      };
    }

    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
  };
  return { supabase: { from } };
});

const { giveRecognition, recognitionReasonKey } = await import("@/lib/accountabilityAdmin");

const give = (reason: string, onDate = "2026-09-05", userId = "u1", actorId = "boss") =>
  giveRecognition({ userId, reason, actorId, onDate });

beforeEach(() => {
  db.recognitions.length = 0;
  db.ledger.length = 0;
  nextId = 1;
  raceInserts = 0;
});

describe("recognition idempotency", () => {
  it("awards once and writes a single ledger row", async () => {
    const r = await give("Closed the Mehta account");
    expect(r.duplicate).toBe(false);
    expect(db.recognitions).toHaveLength(1);
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0].points).toBe(5);
  });

  it("a second identical award adds no row — the double-click case", async () => {
    const first = await give("Closed the Mehta account");
    const second = await give("Closed the Mehta account");

    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(db.recognitions).toHaveLength(1);
    expect(db.ledger).toHaveLength(1);   // +5, not +10
  });

  it("ignores casing and stray whitespace when matching", async () => {
    await give("Closed the Mehta account");
    const again = await give("  closed   the MEHTA account ");

    expect(again.duplicate).toBe(true);
    expect(db.recognitions).toHaveLength(1);
    expect(db.ledger).toHaveLength(1);
  });

  it("survives a concurrent submit that wins the insert race", async () => {
    raceInserts = 1;
    const r = await give("Covered reception all week");

    expect(r.duplicate).toBe(true);
    expect(db.recognitions).toHaveLength(1);
    expect(db.ledger).toHaveLength(1);
  });

  it("still allows the same reason on a different day", async () => {
    await give("Perfect attendance", "2026-09-05");
    const later = await give("Perfect attendance", "2026-09-12");

    expect(later.duplicate).toBe(false);
    expect(db.recognitions).toHaveLength(2);
    expect(db.ledger).toHaveLength(2);
  });

  it("keeps different people and different givers separate", async () => {
    await give("Great week", "2026-09-05", "u1", "boss");
    await give("Great week", "2026-09-05", "u2", "boss");
    await give("Great week", "2026-09-05", "u1", "other-boss");

    expect(db.recognitions).toHaveLength(3);
    expect(db.ledger).toHaveLength(3);
  });

  it("rejects an empty reason before touching the database", async () => {
    await expect(give("   ")).rejects.toThrow(/reason is required/i);
    expect(db.recognitions).toHaveLength(0);
    expect(db.ledger).toHaveLength(0);
  });

  it("normalises reasons the same way the generated column does", () => {
    expect(recognitionReasonKey("  Closed   the MEHTA account ")).toBe("closed the mehta account");
  });
});
