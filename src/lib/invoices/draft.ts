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
  const buyerEmail = paidLead?.email || crmLead?.email || "";
  const buyerPhone = paidLead?.phone || crmLead?.phone || "";
  const addr = crmLead?.address || crmLead?.city || "";

  return {
    status: "draft",
    invoice_type: invoiceType,
    invoice_mode: mode,
    paid_pipeline_lead_id: paidLead?.id || null,
    crm_lead_id: paidLead?.crm_lead_id || crmLead?.id || null,
    linked_client_name: buyerName,
    linked_client_email: buyerEmail,
    linked_client_phone: buyerPhone,
    member_name: buyerName,
    member_email: buyerEmail,
    member_phone: buyerPhone,
    billing_name: buyerName,
    billing_email: buyerEmail,
    billing_phone: buyerPhone,
    billing_address: addr,
    place_of_supply: settings.default_place_of_supply || (company?.state || ""),
    invoice_date: today,
    due_date: today,
    terms: settings.default_terms || "",
    notes: settings.default_notes || "",
    terms_and_conditions: settings.default_terms || "",
    invoice_number_mode: "auto",
    invoice_context_type: "linked_paid_lead",
    show_bank_details: true,
    show_payment_instructions: true,
    show_signature: true,
    show_stamp: true,
    ...totals,
    line_items: totals.lineItems,
    amount_in_words: amountToWordsINR(totals.total_amount),
  };
}

export function buildBlankManualDraft(opts: { company: CompanySettings | null; settings: InvoiceSettings }): Invoice {
  const { company, settings } = opts;
  const invoiceType = settings.default_invoice_type;
  const item: LineItem = {
    item_name: "",
    description: null,
    hsn_sac: settings.default_hsn_sac || null,
    quantity: 1,
    rate: 0,
    tax_rate: invoiceType === "gst" ? Number(settings.default_gst_rate) || 0 : 0,
    cgst_amount: 0, sgst_amount: 0, igst_amount: 0, amount: 0, sort_order: 0,
  };
  const totals = computeTotals([item], invoiceType, settings.default_tax_split, settings.default_tax_mode, 0, 0, 0);
  const today = new Date().toISOString().slice(0, 10);
  return {
    status: "draft",
    invoice_type: invoiceType,
    invoice_mode: "custom",
    invoice_date: today,
    due_date: today,
    place_of_supply: settings.default_place_of_supply || (company?.state || ""),
    terms: settings.default_terms || "",
    notes: settings.default_notes || "",
    terms_and_conditions: settings.default_terms || "",
    invoice_number_mode: "auto",
    invoice_context_type: "manual",
    show_bank_details: true,
    show_payment_instructions: true,
    show_signature: true,
    show_stamp: true,
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
  const vars: Record<string, string> = {
    member_name: i.billing_name || i.member_name || "",
    invoice_number: i.invoice_number || "",
    invoice_date: i.invoice_date || "",
    program_name: ctx.programName || (i.line_items?.[0]?.item_name ?? ""),
    total_amount: `₹${(i.total_amount || 0).toFixed(2)}`,
    balance_due: `₹${(i.balance_due || 0).toFixed(2)}`,
    company_name: c.legal_name || "",
    brand_name: c.brand_name || c.legal_name || "",
    support_email: c.support_email || c.email || "",
  };
  return (text || "").replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ""));
}
