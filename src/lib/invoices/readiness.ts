import type { CompanySettings, InvoiceSettings, InvoiceType } from "./types";

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
  if (!has(value("bank_account_number")) || !has(value("bank_ifsc"))) missing.push("Bank account details");
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
