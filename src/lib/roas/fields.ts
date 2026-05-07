export interface FieldDef { key: string; label: string; required: boolean; }

export const LEAD_FIELDS: FieldDef[] = [
  { key: "lead_name", label: "Lead Name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email", required: true },
  { key: "created_at", label: "Created At / Lead Date", required: true },
  { key: "webinar_date", label: "Webinar Date", required: false },
  { key: "landing_page", label: "Landing Page", required: false },
  { key: "campaign_name", label: "Campaign Name", required: false },
  { key: "adset_name", label: "Ad Set Name", required: false },
  { key: "ad_name", label: "Ad Name", required: false },
  { key: "utm_source", label: "UTM Source", required: false },
  { key: "utm_campaign", label: "UTM Campaign", required: false },
  { key: "utm_content", label: "UTM Content", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "lead_status", label: "Lead Status", required: false },
  { key: "notes", label: "Notes", required: false },
];

export const ENROLLMENT_FIELDS: FieldDef[] = [
  { key: "buyer_name", label: "Buyer Name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email", required: true },
  { key: "amount_paid", label: "Amount Paid", required: true },
  { key: "payment_date", label: "Payment Date", required: true },
  { key: "payment_status", label: "Payment Status", required: true },
  { key: "webinar_date", label: "Webinar Date", required: false },
  { key: "program_price", label: "Program Price", required: false },
  { key: "gst_amount", label: "GST Amount", required: false },
  { key: "total_invoice_value", label: "Total Invoice Value", required: false },
  { key: "payment_gateway", label: "Payment Gateway", required: false },
  { key: "transaction_id", label: "Transaction ID", required: false },
  { key: "salesperson", label: "Salesperson", required: false },
  { key: "remarks", label: "Remarks", required: false },
];

export function autoMap(headers: string[], fields: FieldDef[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases: Record<string, string[]> = {
    lead_name: ["lead_name", "name", "full_name", "customer_name"],
    buyer_name: ["buyer_name", "name", "full_name", "customer_name", "student_name", "diamond_member"],
    phone: ["phone", "phone_number", "mobile", "mobile_number", "contact", "contact_number", "whatsapp", "wa_number", "number"],
    email: ["email", "email_address", "e_mail"],
    created_at: ["created_at", "lead_date", "date", "timestamp", "submitted_at", "registered_at"],
    webinar_date: ["webinar_date", "event_date", "session_date"],
    payment_date: ["payment_date", "paid_at", "txn_date", "transaction_date"],
    payment_status: ["payment_status", "status", "txn_status"],
    amount_paid: ["amount_paid", "amount", "paid_amount", "total_paid", "diamond_amount_with_gst"],
    program_price: ["program_price", "price", "course_price"],
    gst_amount: ["gst_amount", "gst", "tax"],
    total_invoice_value: ["total_invoice_value", "invoice_value", "invoice_total", "total"],
    payment_gateway: ["payment_gateway", "gateway", "where_they_paid"],
    transaction_id: ["transaction_id", "txn_id", "payment_id"],
    salesperson: ["salesperson", "sales_person", "agent"],
    remarks: ["remarks", "notes", "comment", "comments"],
    landing_page: ["landing_page", "page", "lp"],
    campaign_name: ["campaign_name", "campaign"],
    adset_name: ["adset_name", "ad_set", "adset", "ad_set_name"],
    ad_name: ["ad_name", "ad"],
    utm_source: ["utm_source"],
    utm_campaign: ["utm_campaign"],
    utm_content: ["utm_content"],
    city: ["city"], state: ["state"],
    lead_status: ["lead_status", "status"],
    notes: ["notes", "remarks", "comment"],
  };
  const headerNorms = headers.map((h) => ({ raw: h, n: norm(h) }));
  const out: Record<string, string> = {};
  for (const f of fields) {
    const candidates = aliases[f.key] || [f.key];
    const found = headerNorms.find((h) => candidates.includes(h.n));
    if (found) out[f.key] = found.raw;
  }
  return out;
}
