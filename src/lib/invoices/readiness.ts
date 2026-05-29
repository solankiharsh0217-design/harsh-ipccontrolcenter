import type { CompanySettings, Invoice, InvoiceSettings, InvoiceType } from "./types";

export interface ReadinessCheck {
  ok: boolean;
  missing: string[];
  canFallbackToNonGst: boolean;
}

export function checkReadiness(
  company: CompanySettings | null,
  settings: InvoiceSettings | null,
  invoiceType: InvoiceType,
  sellerSnapshot?: Partial<CompanySettings> | null
): ReadinessCheck {
  const missing: string[] = [];
  const has = (v: unknown) => typeof v === "string" ? v.trim().length > 0 : v != null;
  const value = (key: keyof CompanySettings) => has(sellerSnapshot?.[key]) ? sellerSnapshot?.[key] : company?.[key];
  const signatureUrl = has(sellerSnapshot?.signature_url) ? sellerSnapshot?.signature_url : company?.signature_url;

  if (!has(value("legal_name"))) missing.push("Legal company name");
  if (!has(value("address"))) missing.push("Company address");
  if (!has(value("email"))) missing.push("Company email");
  if (!settings?.invoice_prefix) missing.push("Invoice prefix");
  if (settings?.require_authorized_signature && !has(signatureUrl)) missing.push("Authorized signature (upload in Company Settings)");

  if (invoiceType === "gst") {
    if (!has(value("gstin"))) missing.push("GSTIN");
    if (!has(value("state"))) missing.push("Seller state");
    if (!has(value("state_code"))) missing.push("Seller state code");
    if (settings?.hsn_sac_required && !settings?.default_hsn_sac) missing.push("HSN/SAC");
    if (!(Number(settings?.default_gst_rate) > 0)) missing.push("GST rate");
    if (!has(value("state")) && !settings?.default_place_of_supply) missing.push("Place of supply");
  }
  return {
    ok: missing.length === 0,
    missing,
    canFallbackToNonGst: !!settings?.allow_invoice_level_gst_choice && invoiceType === "gst",
  };
}

/**
 * Invoice-level blockers — independent of company readiness.
 * Returns the list of human-readable reasons the invoice can't be issued.
 */
export function checkInvoiceBlockers(invoice: Invoice | null, settings: InvoiceSettings | null): string[] {
  const list: string[] = [];
  if (!invoice) return list;
  const items = invoice.line_items || [];
  if (!items.length) list.push("Add at least one line item");
  else if (items.some((li) => !li.item_name?.trim())) list.push("Every line item needs a name");
  else if (items.every((li) => (Number(li.amount) || 0) === 0)) list.push("Line item amounts are zero");

  const billingName = invoice.billing_name || invoice.member_name;
  if (!billingName?.trim()) list.push("Billing name is required");

  if ((Number(invoice.total_amount) || 0) <= 0) list.push("Invoice total must be greater than zero");
  if (invoice.invoice_type === "gst" && settings?.hsn_sac_required) {
    const missing = items.some((li) => !li.hsn_sac || !String(li.hsn_sac).trim());
    if (missing) list.push("HSN/SAC is required on every line item");
  }

  if (invoice.invoice_context_type === "manual" || !invoice.paid_pipeline_lead_id) {
    const hasContact = (invoice.billing_email || invoice.member_email || invoice.billing_phone || invoice.member_phone || "").toString().trim().length > 0;
    if (!hasContact) list.push("Standalone invoice requires billing email or phone");
  }

  if (invoice.invoice_number_mode === "manual") {
    if (!invoice.manual_invoice_number?.trim()) list.push("Manual invoice number is required when manual numbering is selected");
  }
  return list;
}
