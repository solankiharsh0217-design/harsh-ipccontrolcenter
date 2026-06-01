// Pure helpers — UI-only. Does NOT touch payment records, finance, CRM, or invoices.

export type PayStatusKey =
  | "fully_paid"
  | "overpaid"
  | "balance_pending"
  | "token_paid"
  | "token_pending"
  | "no_payment"
  | "finance_not_set";

export type PayStatusMeta = {
  key: PayStatusKey;
  label: string;
  // Tailwind class fragments
  chipBg: string;
  chipText: string;
  chipBorder: string;
  // Subtle row tint + border
  rowTint: string;
  rowBorder: string;
  dot: string;
};

const MAP: Record<PayStatusKey, PayStatusMeta> = {
  fully_paid:      { key: "fully_paid",      label: "Fully Paid",      chipBg: "bg-[#DCFCE7]", chipText: "text-[#15803D]", chipBorder: "border-[#BBF7D0]", rowTint: "bg-[#F0FDF4]", rowBorder: "border-l-[3px] border-l-[#16A34A]", dot: "#16A34A" },
  overpaid:        { key: "overpaid",        label: "Overpaid · Check",chipBg: "bg-[#F3E8FF]", chipText: "text-[#6B21A8]", chipBorder: "border-[#E9D5FF]", rowTint: "bg-[#FAF5FF]", rowBorder: "border-l-[3px] border-l-[#9333EA]", dot: "#9333EA" },
  balance_pending: { key: "balance_pending", label: "Balance Pending", chipBg: "bg-[#FEF3C7]", chipText: "text-[#92400E]", chipBorder: "border-[#FDE68A]", rowTint: "bg-[#FFFBEB]", rowBorder: "border-l-[3px] border-l-[#D97706]", dot: "#D97706" },
  token_paid:      { key: "token_paid",      label: "Token Paid",      chipBg: "bg-[#DBEAFE]", chipText: "text-[#1E40AF]", chipBorder: "border-[#BFDBFE]", rowTint: "bg-[#EFF6FF]", rowBorder: "border-l-[3px] border-l-[#2563EB]", dot: "#2563EB" },
  token_pending:   { key: "token_pending",   label: "Token Pending",   chipBg: "bg-[#FFE4E6]", chipText: "text-[#9F1239]", chipBorder: "border-[#FECDD3]", rowTint: "bg-[#FFF1F2]", rowBorder: "border-l-[3px] border-l-[#E11D48]", dot: "#E11D48" },
  no_payment:      { key: "no_payment",      label: "No Payment",      chipBg: "bg-[#F3F4F6]", chipText: "text-[#374151]", chipBorder: "border-[#E5E7EB]", rowTint: "bg-white",      rowBorder: "border-l-[3px] border-l-[#9CA3AF]", dot: "#9CA3AF" },
  finance_not_set: { key: "finance_not_set", label: "Finance Not Set", chipBg: "bg-[#F3F4F6]", chipText: "text-[#374151]", chipBorder: "border-[#E5E7EB]", rowTint: "bg-white",      rowBorder: "border-l-[3px] border-l-[#9CA3AF]", dot: "#9CA3AF" },
};

export function getPaymentStatus(lead: {
  deal_value_including_gst?: number | null;
  token_amount_collected?: number | null;
  total_collected?: number | null;
  balance_pending?: number | null;
  finance_required?: boolean | null;
}): PayStatusMeta {
  const deal = Number(lead.deal_value_including_gst || 0);
  const token = Number(lead.token_amount_collected || 0);
  const collected = Number(lead.total_collected || 0);
  const balance = Number(lead.balance_pending || 0);

  if (deal > 0 && collected > deal) return MAP.overpaid;
  if (deal > 0 && collected >= deal && balance <= 0) return MAP.fully_paid;
  if (token > 0 && balance > 0) return MAP.balance_pending;
  if (token > 0) return MAP.token_paid;
  if (collected === 0 && token === 0) {
    // Required token but missing → token_pending; else generic no payment
    if (deal > 0) return MAP.token_pending;
    return MAP.no_payment;
  }
  if (balance > 0) return MAP.balance_pending;
  return MAP.no_payment;
}

export const PAY_STATUS_META = MAP;

export type AllFormalitiesInput = {
  fullyPaid: boolean;
  cocSigned?: boolean | null;
  invoiceIssued?: boolean | null;
  accessGiven?: boolean | null;
};

// "All formalities" remains optional / admin-controlled. We only auto-derive
// when all four signals are explicitly true. Payment-only never qualifies.
export function deriveAllFormalitiesDone(i: AllFormalitiesInput): boolean {
  return !!(i.fullyPaid && i.cocSigned && i.invoiceIssued && i.accessGiven);
}
