import type { CompanySettings, Invoice, InvoiceMode, InvoiceSettings, LineItem } from "./types";
import { computeTotals } from "./totals";
import { amountToWordsINR } from "./amountInWords";

export function buildDraftFromPaidLead(opts: {
  paidLead: any;
  crmLead?: any | null;
  company: CompanySettings | null;
  settings: InvoiceSettings;
  mode: InvoiceMode;
}): Invoice {
  const { paidLead, crmLead, company, settings, mode } = opts;
  const invoiceType = settings.default_invoice_type;
  const dealValue = Number(paidLead?.deal_value_including_gst) || 0;
  const tokenCollected = Number(paidLead?.token_amount_collected) || 0;
  const totalCollected = Number(paidLead?.total_collected) || 0;
  const balancePending = Number(paidLead?.balance_pending) || Math.max(0, dealValue - totalCollected);

  let lineRate = 0;
  let payment = 0;
  switch (mode) {
    case "token": lineRate = tokenCollected || 0; payment = tokenCollected; break;
    case "balance": lineRate = balancePending; payment = 0; break;
    case "custom": lineRate = 0; payment = 0; break;
    case "full_deal":
    default: lineRate = dealValue; payment = totalCollected; break;
  }

  const itemName = paidLead?.product_name_snapshot || paidLead?.paid_batch_name || "Coaching Program";
  const item: LineItem = {
    item_name: itemName,
    description: paidLead?.paid_batch_name || null,
    hsn_sac: settings.default_hsn_sac || null,
    quantity: 1,
    rate: lineRate,
    tax_rate: invoiceType === "gst" ? Number(settings.default_gst_rate) || 0 : 0,
    cgst_amount: 0, sgst_amount: 0, igst_amount: 0, amount: 0, sort_order: 0,
  };

  const totals = computeTotals(
    [item],
    invoiceType,
    settings.default_tax_split,
    settings.default_tax_mode,
    0, 0, payment
  );

  const today = new Date().toISOString().slice(0, 10);
  const buyerName = paidLead?.name || crmLead?.full_name || "";

  return {
    status: "draft",
    invoice_type: invoiceType,
    invoice_mode: mode,
    paid_pipeline_lead_id: paidLead?.id || null,
    crm_lead_id: paidLead?.crm_lead_id || crmLead?.id || null,
    member_name: buyerName,
    member_email: paidLead?.email || crmLead?.email || "",
    member_phone: paidLead?.phone || crmLead?.phone || "",
    billing_address: crmLead?.address || crmLead?.city || "",
    place_of_supply: settings.default_place_of_supply || (company?.state || ""),
    invoice_date: today,
    due_date: today,
    terms: settings.default_terms || "",
    notes: settings.default_notes || "",
    terms_and_conditions: settings.default_terms || "",
    ...totals,
    line_items: totals.lineItems,
    amount_in_words: amountToWordsINR(totals.total_amount),
  };
}

export function applyTemplateVars(
  text: string,
  ctx: { invoice: Invoice; company: CompanySettings | null; programName?: string }
): string {
  const c = ctx.company || ({} as CompanySettings);
  const i = ctx.invoice;
  return (text || "")
    .replaceAll("{{member_name}}", i.member_name || "")
    .replaceAll("{{invoice_number}}", i.invoice_number || "")
    .replaceAll("{{invoice_date}}", i.invoice_date || "")
    .replaceAll("{{program_name}}", ctx.programName || (i.line_items?.[0]?.item_name ?? ""))
    .replaceAll("{{total_amount}}", `₹${(i.total_amount || 0).toFixed(2)}`)
    .replaceAll("{{balance_due}}", `₹${(i.balance_due || 0).toFixed(2)}`)
    .replaceAll("{{company_name}}", c.legal_name || "")
    .replaceAll("{{brand_name}}", c.brand_name || c.legal_name || "")
    .replaceAll("{{support_email}}", c.support_email || c.email || "");
}
