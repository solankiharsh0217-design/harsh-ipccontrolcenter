import type { LineItem, Invoice, InvoiceType, TaxSplit } from "./types";

export function recalcLineItem(li: LineItem, taxType: InvoiceType, split: TaxSplit, taxMode: "exclusive" | "inclusive"): LineItem {
  const qty = Number(li.quantity) || 0;
  const rate = Number(li.rate) || 0;
  const taxRate = taxType === "gst" ? (Number(li.tax_rate) || 0) : 0;

  let base = qty * rate;
  let taxAmt = 0;
  if (taxType === "gst" && taxRate > 0) {
    if (taxMode === "inclusive") {
      const net = base / (1 + taxRate / 100);
      taxAmt = base - net;
      base = net;
    } else {
      taxAmt = (base * taxRate) / 100;
    }
  }
  const cgst = split === "cgst_sgst" ? taxAmt / 2 : 0;
  const sgst = split === "cgst_sgst" ? taxAmt / 2 : 0;
  const igst = split === "igst" ? taxAmt : 0;
  const amount = base + taxAmt;
  return { ...li, cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst, amount };
}

export function computeTotals(
  lineItems: LineItem[],
  taxType: InvoiceType,
  split: TaxSplit,
  taxMode: "exclusive" | "inclusive",
  discount: number,
  adjustment: number,
  paymentMade: number
): Pick<Invoice,
  "subtotal" | "discount_amount" | "taxable_amount" | "cgst_amount" | "sgst_amount" | "igst_amount" | "adjustment_amount" | "total_amount" | "payment_made" | "balance_due"
> & { lineItems: LineItem[] } {
  const recalced = lineItems.map((li) => recalcLineItem(li, taxType, split, taxMode));
  const taxable = recalced.reduce((s, li) => s + (Number(li.quantity) || 0) * (Number(li.rate) || 0) - (taxMode === "inclusive" && taxType === "gst" ? (li.cgst_amount + li.sgst_amount + li.igst_amount) : 0), 0);
  const cgst = recalced.reduce((s, li) => s + li.cgst_amount, 0);
  const sgst = recalced.reduce((s, li) => s + li.sgst_amount, 0);
  const igst = recalced.reduce((s, li) => s + li.igst_amount, 0);
  const subtotal = recalced.reduce((s, li) => s + li.amount, 0);
  const disc = Number(discount) || 0;
  const adj = Number(adjustment) || 0;
  const total = Math.max(0, subtotal - disc + adj);
  const pm = Number(paymentMade) || 0;
  const balance = Math.max(0, total - pm);
  return {
    subtotal: round2(subtotal),
    discount_amount: round2(disc),
    taxable_amount: round2(taxable),
    cgst_amount: round2(cgst),
    sgst_amount: round2(sgst),
    igst_amount: round2(igst),
    adjustment_amount: round2(adj),
    total_amount: round2(total),
    payment_made: round2(pm),
    balance_due: round2(balance),
    lineItems: recalced.map((li) => ({
      ...li,
      cgst_amount: round2(li.cgst_amount),
      sgst_amount: round2(li.sgst_amount),
      igst_amount: round2(li.igst_amount),
      amount: round2(li.amount),
    })),
  };
}

export function round2(n: number) { return Math.round((Number(n) || 0) * 100) / 100; }
