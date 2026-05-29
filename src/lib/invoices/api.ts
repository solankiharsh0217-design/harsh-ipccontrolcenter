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

export async function listAllInvoices(opts?: { search?: string; status?: string; type?: string; linked?: "linked" | "unlinked" | "all"; from?: string; to?: string; limit?: number }): Promise<Invoice[]> {
  let q = db.from("invoices").select("*").order("created_at", { ascending: false }).limit(opts?.limit ?? 500);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.type) q = q.eq("invoice_type", opts.type);
  if (opts?.linked === "linked") q = q.not("paid_pipeline_lead_id", "is", null);
  if (opts?.linked === "unlinked") q = q.is("paid_pipeline_lead_id", null);
  if (opts?.from) q = q.gte("invoice_date", opts.from);
  if (opts?.to) q = q.lte("invoice_date", opts.to);
  if (opts?.search) {
    const t = opts.search.trim();
    q = q.or(`invoice_number.ilike.%${t}%,billing_name.ilike.%${t}%,member_name.ilike.%${t}%,member_email.ilike.%${t}%,member_phone.ilike.%${t}%`);
  }
  const { data } = await q;
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

const IMMUTABLE_ON_UPDATE = [
  "id", "created_at", "updated_at", "created_by",
  "invoice_number", "issued_at",
  "seller_snapshot_json", "buyer_snapshot_json", "tax_snapshot_json",
  "cancelled_at", "cancelled_by", "cancel_reason",
];

export async function saveDraft(inv: Invoice, userId: string): Promise<Invoice> {
  const base: any = stripLineItems(inv);
  // Mirror billing_* into legacy member_* fields so existing code/PDF still works
  if (base.billing_name) base.member_name = base.member_name || base.billing_name;
  if (base.billing_email) base.member_email = base.member_email || base.billing_email;
  if (base.billing_phone) base.member_phone = base.member_phone || base.billing_phone;
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
    delete insertBody.invoice_number;
    delete insertBody.issued_at;
    const { data, error } = await db.from("invoices").insert(insertBody).select().maybeSingle();
    if (error) throw error;
    saved = data;
    await logEvent(saved.id, "invoice_draft_created", {
      mode: inv.invoice_mode,
      context: inv.invoice_context_type,
    }, userId);
    if (!inv.paid_pipeline_lead_id) {
      await logEvent(saved.id, "standalone_invoice_created", {}, userId);
    } else {
      await logEvent(saved.id, "invoice_created_from_paid_lead", { paid_lead_id: inv.paid_pipeline_lead_id }, userId);
    }
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
  const saved = await saveDraft(inv, opts.userId);

  let invoiceNumber: string;
  if (inv.invoice_number_mode === "manual") {
    const num = (inv.manual_invoice_number || "").trim();
    if (!num) throw new Error("Manual invoice number is required");
    const { data, error } = await db.rpc("assign_manual_invoice_number", { _invoice_id: saved.id, _number: num });
    if (error) throw error;
    invoiceNumber = data as string;
    await logEvent(saved.id!, "invoice_number_manually_overridden", { invoice_number: invoiceNumber }, opts.userId);
  } else {
    const { data: numData, error: numErr } = await db.rpc("assign_next_invoice_number");
    if (numErr) throw numErr;
    invoiceNumber = numData as string;
    await logEvent(saved.id!, "invoice_number_auto_assigned", { invoice_number: invoiceNumber }, opts.userId);
  }

  const draftSeller = (inv.seller_snapshot_json || {}) as Partial<CompanySettings>;
  const sellerSnap = {
    ...(opts.company || {}),
    ...draftSeller,
    logo_url: draftSeller.logo_url || opts.company?.logo_url || null,
    logo_path: draftSeller.logo_path || opts.company?.logo_path || null,
    signature_url: draftSeller.signature_url || opts.company?.signature_url || null,
    signature_path: draftSeller.signature_path || opts.company?.signature_path || null,
    stamp_url: draftSeller.stamp_url || opts.company?.stamp_url || null,
    stamp_path: draftSeller.stamp_path || opts.company?.stamp_path || null,
  };
  const buyerSnap = {
    name: inv.billing_name || inv.member_name,
    email: inv.billing_email || inv.member_email,
    phone: inv.billing_phone || inv.member_phone,
    billing_address: inv.billing_address,
    place_of_supply: inv.place_of_supply,
    gstin: inv.billing_gstin || null,
    city: inv.billing_city || null,
    state: inv.billing_state || null,
    state_code: inv.billing_state_code || null,
    country: inv.billing_country || null,
    linked_client_name: inv.linked_client_name || inv.member_name,
    linked_client_email: inv.linked_client_email || inv.member_email,
    linked_client_phone: inv.linked_client_phone || inv.member_phone,
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
    line_tax_rates: (inv.line_items || []).map((li) => ({
      item_name: li.item_name, hsn_sac: li.hsn_sac || null, tax_rate: li.tax_rate,
    })),
  };

  const updateBody: any = {
    status: "issued",
    issued_at: new Date().toISOString(),
    seller_snapshot_json: sellerSnap,
    buyer_snapshot_json: buyerSnap,
    tax_snapshot_json: taxSnap,
  };
  // For auto mode set invoice_number now; for manual mode the RPC already set it
  if (inv.invoice_number_mode !== "manual") updateBody.invoice_number = invoiceNumber;

  const { error: updErr } = await db.from("invoices").update(updateBody).eq("id", saved.id);
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

export async function searchPaidClients(query: string, limit = 25) {
  let q = db.from("paid_pipeline_leads")
    .select("id,name,email,phone,product_name_snapshot,paid_batch_name,crm_lead_id,assigned_sales_executive,deal_value_including_gst,total_collected,balance_pending")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  const t = (query || "").trim();
  if (t.length >= 2) {
    q = q.or(`name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%,product_name_snapshot.ilike.%${t}%,paid_batch_name.ilike.%${t}%`);
  }
  const { data } = await q;
  return data || [];
}
