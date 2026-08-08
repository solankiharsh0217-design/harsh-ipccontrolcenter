import { supabase } from "@/integrations/supabase/client";

export const TOKEN_CATEGORIES = ["Token Amount", "Second Token"];
export const REFUND_TYPES = ["Refund"];
export const FINAL_STAGES = ["Full Payment Received", "Enrolled / Activated", "Active Member"];
export const DROP_STAGES = ["Dropped After Token", "Closed Lost", "Refund / Adjustment", "Dropped / Refund"];

export const DEFAULT_STAGES = [
  "Token Paid", "Payment Follow-Up Pending", "Balance Pending",
  "Finance / EMI Documents Pending", "Finance / EMI Applied", "Finance / EMI Approved",
  "Finance / EMI Disbursed", "Full Payment Received", "Enrolled / Activated",
  "Dropped After Token", "Refund / Adjustment", "Closed Lost",
];
export const DEFAULT_PAYMENT_CATEGORIES = [
  "Token Amount","Second Token","Down Payment","Balance Payment",
  "Full Payment","EMI / Finance Disbursement","Refund","Adjustment",
];
export const DEFAULT_PAYMENT_TYPES = [
  "Token","Down Payment","Balance Payment","Full Payment","EMI Disbursement","Refund","Adjustment",
];
export const DEFAULT_PAYMENT_MODES = ["UPI","Razorpay","Cash","Bank Transfer","Card","Finance / EMI","Other"];
export const DEFAULT_BALANCE_CATEGORIES = [
  "Token Pending","Second Token Pending","Down Payment Pending","Finance / EMI Pending",
  "Balance Payment Pending","Parent Approval Pending","Documents Pending","Payment Link Sent",
  "Waiting for Salary / Funds","Dropped Risk",
];
export const DEFAULT_FOLLOWUP_REASONS = [
  "Collect Second Token","Collect Down Payment","Finance Documents Pending","Finance Approval Follow-Up",
  "Balance Payment Reminder","Parent Discussion","Payment Link Sent","Call Back Requested",
];
export const TEMPERATURES = ["Urgent","Hot","Warm","Cold","Not Interested","Dropped Risk"];
export const TEMP_COLORS: Record<string,string> = {
  "Urgent":"#DC2626","Hot":"#EA580C","Warm":"#CA8A04","Cold":"#2563EB",
  "Not Interested":"#6B7280","Dropped Risk":"#991B1B",
};
export const DEFAULT_FINANCE_PARTNERS = [
  "Bajaj Finance","EZMI","Razorpay EMI","Credit Card EMI","Liquiloans",
  "Manual Installment","Bank Transfer Installment","Other",
];
export const DEFAULT_FINANCE_STATUSES = [
  "Not Required","Interested","Documents Pending","Documents Submitted","Application Submitted",
  "Approved","Rejected","Disbursed","Failed - Trying Another Partner","Dropped",
];
export const FOLLOWUP_PRIORITIES = ["Urgent","Hot","Warm","Cold","Normal"];
export const FOLLOWUP_STATUSES = ["Pending","Done","Missed","Rescheduled","Cancelled"];

export { inr } from "@/lib/format";
export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export async function recomputePaidLead(leadId: string) {
  const { data: leadData } = await supabase
    .from("paid_pipeline_leads")
    .select("deal_value_including_gst, pipeline_stage, revenue_recognition_rule, finance_status")
    .eq("id", leadId).maybeSingle();
  if (!leadData) return;
  const { data: pays } = await supabase
    .from("paid_pipeline_payments")
    .select("amount, payment_type, payment_category, is_token")
    .eq("paid_pipeline_lead_id", leadId).eq("is_deleted", false);
  const list = (pays as any[]) || [];
  let rawTotal = 0; let token = 0;
  for (const p of list) {
    const amt = Number(p.amount || 0);
    const isRefund = REFUND_TYPES.includes(p.payment_type) || p.payment_category === "Refund";
    rawTotal += isRefund ? -amt : amt;
    const isTok = p.is_token || TOKEN_CATEGORIES.includes(p.payment_category) || p.payment_type === "Token";
    if (isTok && !isRefund) token += amt;
  }
  const deal = Number(leadData.deal_value_including_gst || 0);
  // Keep the signed accumulation above so the anomaly stays detectable, but never
  // store or derive from a negative collected total.
  const total = Math.max(0, rawTotal);
  const anomaly = rawTotal < 0
    ? { leadId, deal, rawTotal, paymentCount: list.length, reason: "negative_total_collected" as const }
    : null;
  if (anomaly) {
    console.error("[paidPipeline] data-integrity: negative total_collected", anomaly);
  }
  const balance = Math.max(0, deal - total);
  const stage = leadData.pipeline_stage || "";
  const isDropped = DROP_STAGES.includes(stage);
  const isFinanceDisbursed = leadData.finance_status === "Disbursed";
  const isFinal = (deal > 0 && total >= deal) || isFinanceDisbursed || FINAL_STAGES.includes(stage);
  const realized = (() => {
    switch (leadData.revenue_recognition_rule) {
      case "Token Collected Only": return token;
      case "Full Deal Value": return isFinal ? deal : 0;
      case "Finance Approved Amount": return isFinanceDisbursed ? deal : 0;
      case "Realized Revenue Only":
      default: return total;
    }
  })();
  await supabase.from("paid_pipeline_leads").update({
    token_amount_collected: token,
    total_collected: total,
    balance_pending: balance,
    revenue_to_be_realized: isDropped ? 0 : balance,
    final_revenue_realized: realized,
    is_final_sale: isFinal && !isDropped,
    is_enrolled: isFinal && !isDropped,
    is_dropped: isDropped,
    payment_status: isFinal ? "Full Payment Received" : (total > 0 ? "Partial Received" : "No Payment"),
  } as any).eq("id", leadId);
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
