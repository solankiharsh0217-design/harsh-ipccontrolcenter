export type InvoiceType = "gst" | "non_gst";
export type InvoiceMode = "full_deal" | "token" | "balance" | "custom";
export type InvoiceStatus = "draft" | "issued" | "sent" | "paid" | "cancelled" | "void";
export type TaxSplit = "cgst_sgst" | "igst" | "none";

export interface CompanySettings {
  id?: string;
  workspace: string;
  legal_name?: string | null;
  brand_name?: string | null;
  business_type?: string | null;
  company_id?: string | null;
  gstin?: string | null;
  pan?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  state_code?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  accent_color?: string | null;
  signature_url?: string | null;
  stamp_url?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_account_type?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  upi_id?: string | null;
  sender_name?: string | null;
  sender_email?: string | null;
  reply_to_email?: string | null;
  support_email?: string | null;
}

export interface InvoiceSettings {
  id?: string;
  workspace: string;
  invoice_prefix: string;
  next_invoice_number: number;
  number_padding: number;
  fy_format?: string | null;
  reset_yearly: boolean;
  last_reset_fy?: string | null;
  gst_enabled_default: boolean;
  allow_invoice_level_gst_choice: boolean;
  default_invoice_type: InvoiceType;
  default_gst_rate: number;
  default_tax_mode: "exclusive" | "inclusive";
  default_tax_split: TaxSplit;
  default_place_of_supply?: string | null;
  hsn_sac_required: boolean;
  default_hsn_sac?: string | null;
  default_notes?: string | null;
  default_terms?: string | null;
  default_email_subject?: string | null;
  default_email_body?: string | null;
}

export interface LineItem {
  id?: string;
  item_name: string;
  description?: string | null;
  hsn_sac?: string | null;
  quantity: number;
  rate: number;
  tax_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  amount: number;
  sort_order: number;
}

export interface Invoice {
  id?: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  terms?: string | null;
  status: InvoiceStatus;
  invoice_type: InvoiceType;
  invoice_mode: InvoiceMode;
  paid_pipeline_lead_id?: string | null;
  crm_lead_id?: string | null;
  member_name?: string | null;
  member_email?: string | null;
  member_phone?: string | null;
  billing_address?: string | null;
  place_of_supply?: string | null;
  seller_snapshot_json?: any;
  buyer_snapshot_json?: any;
  tax_snapshot_json?: any;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  adjustment_amount: number;
  total_amount: number;
  payment_made: number;
  balance_due: number;
  amount_in_words?: string | null;
  notes?: string | null;
  terms_and_conditions?: string | null;
  created_by?: string | null;
  issued_at?: string | null;
  sent_at?: string | null;
  sent_to?: string | null;
  last_generated_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  created_at?: string;
  line_items?: LineItem[];
}
