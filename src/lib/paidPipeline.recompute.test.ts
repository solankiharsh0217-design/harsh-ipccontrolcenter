/**
 * T1–T5 — financial rollup integrity for imported paid leads.
 *
 * These drive the REAL recomputePaidLead() from src/lib/paidPipeline.ts against
 * an in-memory fake of the backend client, with payment rows shaped exactly the
 * way ImportLeadsModal writes them (token row: is_token true / category
 * "Token Amount"; remainder row: is_token false / category "Balance Payment").
 * No production file was modified for these tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Lead = {
  id: string;
  deal_value_including_gst: number;
  pipeline_stage: string | null;
  revenue_recognition_rule: string | null;
  finance_status: string | null;
  token_amount_collected?: number;
  total_collected?: number;
  balance_pending?: number;
  payment_status?: string;
};
type Payment = {
  paid_pipeline_lead_id: string;
  amount: number;
  payment_type: string;
  payment_category: string;
  is_token: boolean;
  is_deleted?: boolean;
};

const db: { leads: Lead[]; payments: Payment[] } = { leads: [], payments: [] };

function match(row: any, filters: [string, any][]) {
  return filters.every(([c, v]) => (c === "is_deleted" ? !!row[c] === !!v : row[c] === v));
}

function table(name: string) {
  const rows = () => (name === "paid_pipeline_leads" ? db.leads : db.payments) as any[];
  const filters: [string, any][] = [];
  let updatePayload: any = null;
  const api: any = {
    select: () => api,
    update: (payload: any) => {
      updatePayload = payload;
      return api;
    },
    eq: (col: string, val: any) => {
      filters.push([col, val]);
      if (updatePayload) {
        // updates resolve when awaited
        return {
          then: (res: any) => {
            rows()
              .filter((r) => match(r, filters))
              .forEach((r) => Object.assign(r, updatePayload));
            return Promise.resolve({ data: null, error: null }).then(res);
          },
        };
      }
      return api;
    },
    maybeSingle: async () => ({ data: rows().find((r) => match(r, filters)) ?? null, error: null }),
    then: (res: any) =>
      Promise.resolve({ data: rows().filter((r) => match(r, filters)), error: null }).then(res),
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (name: string) => table(name) },
}));

// eslint-disable-next-line import/first
import { recomputePaidLead } from "@/lib/paidPipeline";

const seedLead = (over: Partial<Lead> = {}): Lead => {
  const lead: Lead = {
    id: over.id ?? "lead-1",
    deal_value_including_gst: 0,
    pipeline_stage: "Balance Pending",
    revenue_recognition_rule: null,
    finance_status: null,
    ...over,
  };
  db.leads.push(lead);
  return lead;
};
const tokenRow = (leadId: string, amount: number): Payment => ({
  paid_pipeline_lead_id: leadId,
  amount,
  payment_type: "Token",
  payment_category: "Token Amount",
  is_token: true,
  is_deleted: false,
});
const balanceRow = (leadId: string, amount: number): Payment => ({
  paid_pipeline_lead_id: leadId,
  amount,
  payment_type: "Balance Payment",
  payment_category: "Balance Payment",
  is_token: false,
  is_deleted: false,
});
const refundRow = (leadId: string, amount: number): Payment => ({
  paid_pipeline_lead_id: leadId,
  amount,
  payment_type: "Refund",
  payment_category: "Refund",
  is_token: false,
  is_deleted: false,
});

beforeEach(() => {
  db.leads = [];
  db.payments = [];
});

describe("T1/T2 — four distinct sheet figures land in four distinct columns", () => {
  it("deal 100000 / token 5000 / collected 5000 / balance 95000", async () => {
    const lead = seedLead({ deal_value_including_gst: 100000 });
    db.payments.push(tokenRow(lead.id, 5000));

    await recomputePaidLead(lead.id);

    // T1 — no swapping, no zeroing, no dropping
    expect(lead.deal_value_including_gst).toBe(100000);
    expect(lead.token_amount_collected).toBe(5000);
    expect(lead.token_amount_collected).not.toBe(100000);
    expect(lead.token_amount_collected).not.toBe(lead.total_collected! - 0 + 100000);
    // T2 — rollups are POPULATED, not left at 0
    expect(lead.total_collected).toBe(5000);
    expect(lead.balance_pending).toBe(95000);
    expect(lead.payment_status).toBe("Partial Received");
  });

  it("token is never the deal value even when the deal is large", async () => {
    const lead = seedLead({ id: "lead-big", deal_value_including_gst: 250000 });
    db.payments.push(tokenRow(lead.id, 10000));
    await recomputePaidLead(lead.id);
    expect(lead.token_amount_collected).toBe(10000);
    expect(lead.token_amount_collected).not.toBe(250000);
    expect(lead.balance_pending).toBe(240000);
  });
});

describe("T3 — unpaid lead: the Payment Recovery blind spot", () => {
  it("deal 118000, no token, no collected, no payment rows", async () => {
    const lead = seedLead({ id: "lead-unpaid", deal_value_including_gst: 118000 });

    await recomputePaidLead(lead.id);

    expect(lead.total_collected).toBe(0);
    expect(lead.token_amount_collected).toBe(0);
    expect(lead.balance_pending).toBe(118000);
    expect(lead.balance_pending).not.toBe(0);
    expect(lead.payment_status).toBe("No Payment");
  });
});

describe("T4 — split payment: token + remainder", () => {
  it("deal 100000, token 5000, collected 30000 → two rows, correct rollups", async () => {
    const lead = seedLead({ id: "lead-split", deal_value_including_gst: 100000 });
    db.payments.push(tokenRow(lead.id, 5000), balanceRow(lead.id, 25000));

    const rows = db.payments.filter((p) => p.paid_pipeline_lead_id === lead.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.is_token)!.amount).toBe(5000);
    expect(rows.find((r) => !r.is_token)!.amount).toBe(25000);

    await recomputePaidLead(lead.id);

    expect(lead.token_amount_collected).toBe(5000);
    expect(lead.total_collected).toBe(30000);
    expect(lead.balance_pending).toBe(70000);
    expect(lead.payment_status).toBe("Partial Received");
  });

  it("full payment closes the lead out", async () => {
    const lead = seedLead({ id: "lead-full", deal_value_including_gst: 100000 });
    db.payments.push(tokenRow(lead.id, 5000), balanceRow(lead.id, 95000));
    await recomputePaidLead(lead.id);
    expect(lead.total_collected).toBe(100000);
    expect(lead.balance_pending).toBe(0);
    expect(lead.payment_status).toBe("Full Payment Received");
  });
});

describe("T5 — refund floor and anomaly surfacing", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it("deal 118000, only payment row is a Refund of 4999", async () => {
    const lead = seedLead({ id: "lead-refund", deal_value_including_gst: 118000 });
    db.payments.push(refundRow(lead.id, 4999));

    const anomaly = await recomputePaidLead(lead.id);

    expect(lead.total_collected).toBe(0);
    expect(lead.total_collected).toBeGreaterThanOrEqual(0);
    expect(lead.balance_pending).toBe(118000);
    expect(lead.balance_pending).toBeLessThanOrEqual(lead.deal_value_including_gst);

    // the anomaly is surfaced, not swallowed
    expect(anomaly).toMatchObject({
      leadId: "lead-refund",
      rawTotal: -4999,
      reason: "negative_total_collected",
    });
    expect(spy).toHaveBeenCalledWith(
      "[paidPipeline] data-integrity: negative total_collected",
      expect.objectContaining({ rawTotal: -4999 }),
    );
  });

  it("a refund that only partially offsets a payment does not raise an anomaly", async () => {
    const lead = seedLead({ id: "lead-partial-refund", deal_value_including_gst: 118000 });
    db.payments.push(tokenRow(lead.id, 10000), refundRow(lead.id, 4999));
    const anomaly = await recomputePaidLead(lead.id);
    expect(lead.total_collected).toBe(5001);
    expect(lead.token_amount_collected).toBe(10000);
    expect(lead.balance_pending).toBe(112999);
    expect(anomaly).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
