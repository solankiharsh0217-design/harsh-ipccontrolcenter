import type { CompanySettings, InvoiceSettings, InvoiceType } from "./types";

export interface ReadinessCheck {
  ok: boolean;
  missing: string[];
  canFallbackToNonGst: boolean;
}

export function checkReadiness(
  company: CompanySettings | null,
  settings: InvoiceSettings | null,
  invoiceType: InvoiceType
): ReadinessCheck {
  const missing: string[] = [];
  if (!company?.legal_name) missing.push("Legal company name");
  if (!company?.address) missing.push("Company address");
  if (!company?.email) missing.push("Company email");
  if (!company?.bank_account_number || !company?.bank_ifsc) missing.push("Bank account details");
  if (!settings?.invoice_prefix) missing.push("Invoice prefix");
  if (settings?.require_authorized_signature && !company?.signature_url) missing.push("Authorized signature (upload in Company Settings)");

  if (invoiceType === "gst") {
    if (!company?.gstin) missing.push("GSTIN");
    if (!company?.state) missing.push("Seller state");
    if (!company?.state_code) missing.push("Seller state code");
    if (settings?.hsn_sac_required && !settings?.default_hsn_sac) missing.push("HSN/SAC");
    if (!(Number(settings?.default_gst_rate) > 0)) missing.push("GST rate");
    if (!company?.state && !settings?.default_place_of_supply) missing.push("Place of supply");
  }
  return {
    ok: missing.length === 0,
    missing,
    canFallbackToNonGst: !!settings?.allow_invoice_level_gst_choice && invoiceType === "gst",
  };
}
