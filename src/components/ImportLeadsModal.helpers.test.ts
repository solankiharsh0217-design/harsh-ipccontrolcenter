/* @vitest-environment node */
/**
 * T6 / T7 — import-mapper regressions on the REAL helpers inside
 * src/components/ImportLeadsModal.tsx (loaded verbatim from source; no
 * production file was modified to make these testable).
 *
 * T6: "Total Amount Received" must never be claimed by deal_value, and
 *     parseAmount must refuse multi-number cells instead of guessing.
 * T7: GST mode detection + gross-up contract.
 */
import { describe, it, expect } from "vitest";
import { loadModalHelpers, MODAL_SOURCE } from "@/test/importModalHelpers";

const H = loadModalHelpers();

describe("T6 — deal_value alias must not swallow payment headers", () => {
  it('does not map "Total Amount Received" to deal_value', () => {
    const m = H.autoMap(["Name", "Total Amount Received"]);
    expect(m.deal_value).toBe("");
    expect(m.collected).toBe("Total Amount Received");
  });

  it.each([
    "Amount Received",
    "Total Paid",
    "Token Amount",
    "Balance Amount",
    "Fees Paid",
    "Total Amount Collected",
  ])('payment-ish header "%s" is never deal_value', (header) => {
    expect(H.autoMap([header]).deal_value).toBe("");
  });

  it.each([
    ["Deal Value", "Deal Value"],
    ["Total Fee", "Total Fee"],
    ["Product Price", "Product Price"],
    ["Course Fees", "Course Fees"],
  ])('genuine deal header "%s" still maps to deal_value', (header, expected) => {
    expect(H.autoMap([header]).deal_value).toBe(expected);
  });

  it("keeps four distinct money headers on four distinct fields", () => {
    const m = H.autoMap(["Name", "Deal Value", "Token Amount", "Total Amount Received", "Balance Amount"]);
    expect(m.deal_value).toBe("Deal Value");
    expect(m.token).toBe("Token Amount");
    expect(m.collected).toBe("Total Amount Received");
    expect(m.balance).toBe("Balance Amount");
  });
});

describe("T6 — parseAmount rejects ambiguous multi-number cells", () => {
  it.each(["50000 of 125700", "2 EMI 60000", "30000 + 70000", "5000/95000"])(
    'refuses "%s": returns 0 and flags ambiguous',
    (cell) => {
      const d = H.parseAmountDetailed(cell);
      expect(d.ambiguous).toBe(true);
      expect(d.value).toBe(0);
      expect(d.raw).toBe(cell);
      expect(H.parseAmount(cell)).toBe(0);
      // it must never silently take the first numeric run
      expect(H.parseAmount(cell)).not.toBe(50000);
      expect(H.parseAmount(cell)).not.toBe(2);
    },
  );

  it.each([
    ["₹1,18,000", 118000],
    ["1,18,000.50", 118000.5],
    ["Rs. 100000/-", 100000],
    ["125700 OTP", 125700],
    ["100,000", 100000],
    ["1.18L", 118000],
  ])('single-number cell "%s" still parses to %s', (cell, expected) => {
    const d = H.parseAmountDetailed(cell);
    expect(d.ambiguous).toBe(false);
    expect(d.value).toBe(expected);
  });

  it.each(["", "-", "—", "N/A", null, undefined])("empty-ish cell %s → 0, not ambiguous", (cell) => {
    const d = H.parseAmountDetailed(cell as any);
    expect(d.value).toBe(0);
    expect(d.ambiguous).toBe(false);
  });

  it("a repeated number is not ambiguous (one distinct value)", () => {
    expect(H.parseAmount("5000 (5,000)")).toBe(5000);
  });
});

describe("T7 — GST mode detection and gross-up", () => {
  it.each([
    ["Deal Value", "unknown"],
    ["Course Fee", "unknown"],
    ["Deal Value (Incl GST)", "inclusive"],
    ["Total Fee including GST", "inclusive"],
    ["Deal Value Excluding GST", "exclusive"],
    ["Fees (ex GST)", "exclusive"],
    ["Total Fee + GST", "exclusive"],
    ["Fee (GST extra)", "exclusive"],
  ])('header "%s" → mode %s', (header, mode) => {
    expect(H.detectGstMode(header)).toBe(mode);
  });

  it('"excluding" is never read as "including"', () => {
    expect(H.detectGstMode("Deal Value Excluding GST")).not.toBe("inclusive");
  });

  // The production guard: gross up ONLY when mode === "exclusive" AND a rate resolved.
  const store = (header: string, raw: number, rate: number | null) =>
    H.detectGstMode(header) === "exclusive" && rate && raw > 0
      ? H.grossUpToInclusive(raw, rate)
      : raw;

  it("exclusive header at 18% stores 118000 for a raw 100000", () => {
    expect(store("Deal Value Excluding GST", 100000, 18)).toBe(118000);
    expect(store("Fees (ex GST)", 100000, 18)).toBe(118000);
  });

  it("inclusive or unknown header stores 100000 unchanged", () => {
    expect(store("Deal Value (Incl GST)", 100000, 18)).toBe(100000);
    expect(store("Deal Value", 100000, 18)).toBe(100000);
    expect(store("Course Fee", 100000, 18)).toBe(100000);
  });

  it("exclusive with NO resolvable rate stores 100000 and never assumes 18", () => {
    const out = store("Deal Value Excluding GST", 100000, null);
    expect(out).toBe(100000);
    expect(out).not.toBe(118000);
  });

  it("the shipped component applies that exact guard and flags unresolved rates", () => {
    expect(MODAL_SOURCE).toContain('dealValueGstMode === "exclusive" && gstRateInfo.rate && value > 0');
    expect(MODAL_SOURCE).toContain("rowsGstRateUnresolved++");
    // no hard-coded 18% fallback anywhere in the GST resolution path
    expect(MODAL_SOURCE).not.toMatch(/default_gst_rate[^\n]*\|\|\s*18/);
  });

  it("gross-up is money-rounded to 2 decimals", () => {
    expect(H.grossUpToInclusive(99999.99, 18)).toBe(117999.99);
  });
});
