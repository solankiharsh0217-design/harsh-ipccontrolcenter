import { describe, it, expect, vi, beforeEach } from "vitest";
import { inr, num, pct, rel } from "../format";

describe("format helpers (src/lib/format.ts)", () => {
  describe("inr()", () => {
    it("returns ₹0 for null, undefined, or NaN", () => {
      expect(inr(null)).toBe("₹0");
      expect(inr(undefined)).toBe("₹0");
      expect(inr(NaN)).toBe("₹0");
    });

    it("formats 0 as ₹0", () => {
      expect(inr(0)).toBe("₹0");
    });

    it("formats negative numbers", () => {
      // Intl.NumberFormat "en-IN" with ₹ prefix
      // Note: check if it uses minus sign correctly.
      // Expected for -1234: -₹1,234 (depending on implementation)
      // Actually, src/lib/format.ts does: .format(num).replace(/^/, "₹")
      // So -1234 -> "-1,234" -> "₹-1,234"
      expect(inr(-1234)).toBe("₹-1,234");
    });

    it("formats whole numbers with commas", () => {
      expect(inr(1234567)).toBe("₹12,34,567");
    });

    it("rounds decimals to nearest whole number", () => {
      expect(inr(1234.56)).toBe("₹1,235");
      expect(inr(1234.44)).toBe("₹1,234");
    });

    it("handles compact option for Lakhs and Crores", () => {
      // 1 Lakh = 100,000
      expect(inr(100000, { compact: true })).toBe("₹1.00L");
      expect(inr(123456, { compact: true })).toBe("₹1.23L");
      // 1 Crore = 10,000,000
      expect(inr(10000000, { compact: true })).toBe("₹1.00Cr");
      expect(inr(12345678, { compact: true })).toBe("₹1.23Cr");
      // Below 1 Lakh should not be compact
      expect(inr(99999, { compact: true })).toBe("₹99,999");
    });
  });

  describe("num()", () => {
    it("returns '0' for null or undefined", () => {
      expect(num(null)).toBe("0");
      expect(num(undefined)).toBe("0");
    });

    it("formats 0 as '0'", () => {
      expect(num(0)).toBe("0");
    });

    it("formats numbers with Indian commas", () => {
      expect(num(1234567)).toBe("12,34,567");
    });
  });

  describe("pct()", () => {
    it("returns '0%' for null, undefined, or NaN", () => {
      expect(pct(null)).toBe("0%");
      expect(pct(undefined)).toBe("0%");
      expect(pct(NaN)).toBe("0%");
    });

    it("formats 0 as '0.0%' (default 1 digit)", () => {
      expect(pct(0)).toBe("0.0%");
    });

    it("formats numbers with default 1 digit", () => {
      expect(pct(12.345)).toBe("12.3%");
    });

    it("respects custom digit count", () => {
      expect(pct(12.345, 2)).toBe("12.35%");
      expect(pct(12.345, 0)).toBe("12%");
    });
  });

  describe("rel()", () => {
    it("returns 'Never' for empty input", () => {
      expect(rel(null)).toBe("Never");
      expect(rel(undefined)).toBe("Never");
      expect(rel("")).toBe("Never");
    });

    it("returns 'Xs ago' for recent dates", () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 5000); // 5s ago
      expect(rel(recent)).toMatch(/^[0-5][0-9]s ago$/);
    });

    it("returns 'Xm ago' for dates from minutes ago", () => {
      const now = new Date();
      const minutesAgo = new Date(now.getTime() - 125000); // ~2m ago
      expect(rel(minutesAgo)).toBe("2m ago");
    });

    it("returns 'Xh ago' for dates from hours ago", () => {
      const now = new Date();
      const hoursAgo = new Date(now.getTime() - 7200000); // 2h ago
      expect(rel(hoursAgo)).toBe("2h ago");
    });

    it("returns locale string for dates older than 1 day", () => {
      const oldDate = new Date("2020-01-01T10:00:00Z");
      // The implementation uses d.toLocaleString("en-IN")
      // We don't want to assert the exact string because locale might vary in CI,
      // but we expect it to NOT contain "ago"
      expect(rel(oldDate)).not.toContain("ago");
      expect(rel(oldDate)).not.toBe("Never");
    });
  });
});
