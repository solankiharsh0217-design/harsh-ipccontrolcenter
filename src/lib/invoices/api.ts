import { supabase } from "@/integrations/supabase/client";
import type { CompanySettings, Invoice, InvoiceSettings, LineItem } from "./types";

const db = supabase as any;

export async function loadCompanySettings(): Promise<CompanySettings | null> {
  const { data } = await db.from("company_settings").select("*").eq("workspace", "default").maybeSingle();
  return data || null;
}
export async function saveCompanySettings(values: Partial<CompanySettings>, userId: string) {
  const existing = await loadCompanySettings();
  const payload = { ...values, workspace: "default", updated_by: userId };
  if (existing?.id) {
    const { data, error } = await db.from("company_settings").update(payload).eq("id", existing.id).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("company_settings").insert(payload).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadInvoiceSettings(): Promise<InvoiceSettings | null> {
  const { data } = await db.from("invoice_settings").select("*").eq("workspace", "default").maybeSingle();
  return data || null;
}
export async function saveInvoiceSettings(values: Partial<InvoiceSettings>, userId: string) {
  const existing = await loadInvoiceSettings();
  const payload = { ...values, workspace: "default", updated_by: userId };
  if (existing?.id) {
    const { data, error } = await db.from("invoice_settings").update(payload).eq("id", existing.id).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("invoice_settings").insert(payload).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function listInvoicesForLead(paidLeadId: string): Promise<Invoice[]> {
  const { data } = await db.from("invoices").select("*").eq("paid_pipeline_lead_id", paidLeadId).order("created_at", { ascending: false });
  return (data || []) as Invoice[];
}

export async function loadInvoice(id: string): Promise<Invoice | null> {
  const { data: inv } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!inv) return null;
  const { data: items } = await db.from("invoice_line_items").select("*").eq("invoice_id", id).order("sort_order");
  return { ...inv, line_items: (items || []) as LineItem[] };
}

function stripLineItems(inv: Invoice): Omit<Invoice, "line_items"> {
  const { line_items, ...rest } = inv;
  return rest;
}

// Fields that must never be set from client on UPDATE (managed by DB / immutable post-issue)
const IMMUTABLE_ON_UPDATE = [
  "id", "created_at", "updated_at", "created_by",
  "invoice_number", "issued_at",
  "seller_snapshot_json", "buyer_snapshot_json", "tax_snapshot_json",
  "cancelled_at", "cancelled_by", "cancel_reason",
];

export async function saveDraft(inv: Invoice, userId: string): Promise<Invoice> {
  const base: any = stripLineItems(inv);
  let saved: any;
  if (inv.id) {
    const updateBody: any = { ...base };
    for (const k of IMMUTABLE_ON_UPDATE) delete updateBody[k];
    updateBody.status = "draft";
    const { data, error } = await db.from("invoices").update(updateBody).eq("id", inv.id).select().maybeSingle();
    if (error) throw error;
    saved = data;
    await db.from("invoice_line_items").delete().eq("invoice_id", inv.id);
  } else {
    const insertBody: any = { ...base, status: "draft", created_by: userId };
    delete insertBody.id;
    delete insertBody.created_at;
    delete insertBody.updated_at;
    // Drafts must not have an invoice_number — only assigned on issue.
    delete insertBody.invoice_number;
    delete insertBody.issued_at;
    const { data, error } = await db.from("invoices").insert(insertBody).select().maybeSingle();
    if (error) throw error;
    saved = data;
    await logEvent(saved.id, "invoice_draft_created", { mode: inv.invoice_mode }, userId);
  }
  if (inv.line_items?.length) {
    const items = inv.line_items.map((li, idx) => ({
      invoice_id: saved.id,
      item_name: li.item_name, description: li.description, hsn_sac: li.hsn_sac,
      quantity: li.quantity, rate: li.rate, tax_rate: li.tax_rate,
      cgst_amount: li.cgst_amount, sgst_amount: li.sgst_amount, igst_amount: li.igst_amount,
      amount: li.amount, sort_order: idx,
    }));
    const { error: liErr } = await db.from("invoice_line_items").insert(items);
    if (liErr) throw liErr;
  }
  return loadInvoice(saved.id) as Promise<Invoice>;
}

export async function issueInvoice(inv: Invoice, opts: { company: CompanySettings | null; settings: InvoiceSettings; userId: string }): Promise<Invoice> {
  // Save current draft first
  const saved = await saveDraft(inv, opts.userId);
  // Get next invoice number atomically
  const { data: numData, error: numErr } = await db.rpc("assign_next_invoice_number");
  if (numErr) throw numErr;
  const invoiceNumber = numData as string;

  const sellerSnap = opts.company ? { ...opts.company } : {};
  const buyerSnap = {
    name: inv.member_name, email: inv.member_email, phone: inv.member_phone,
    billing_address: inv.billing_address, place_of_supply: inv.place_of_supply,
  };
  const taxSnap = {
    invoice_type: inv.invoice_type,
    gst_rate: opts.settings.default_gst_rate,
    tax_mode: opts.settings.default_tax_mode,
    tax_split: opts.settings.default_tax_split,
    hsn_sac: opts.settings.default_hsn_sac,
    seller_gstin: opts.company?.gstin || null,
    seller_state: opts.company?.state || null,
    seller_state_code: opts.company?.state_code || null,
  };

  const { error: updErr } = await db.from("invoices").update({
    status: "issued",
    invoice_number: invoiceNumber,
    issued_at: new Date().toISOString(),
    seller_snapshot_json: sellerSnap,
    buyer_snapshot_json: buyerSnap,
    tax_snapshot_json: taxSnap,
  }).eq("id", saved.id);
  if (updErr) throw updErr;

  await logEvent(saved.id!, "invoice_issued", { invoice_number: invoiceNumber }, opts.userId);
  return loadInvoice(saved.id!) as Promise<Invoice>;
}

export async function logEvent(invoiceId: string, type: string, metadata: any, userId?: string | null) {
  await db.from("invoice_events").insert({ invoice_id: invoiceId, event_type: type, metadata_json: metadata, created_by: userId || null });
}

export async function listInvoiceEvents(invoiceId: string) {
  const { data } = await db.from("invoice_events").select("*").eq("invoice_id", invoiceId).order("created_at", { ascending: false });
  return data || [];
}
