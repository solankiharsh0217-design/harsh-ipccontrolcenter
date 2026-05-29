import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  loadCompanySettings, loadInvoiceSettings, loadInvoice, saveDraft, issueInvoice,
  listInvoiceEvents, logEvent,
} from "@/lib/invoices/api";
import { buildDraftFromPaidLead, buildBlankManualDraft } from "@/lib/invoices/draft";
import { computeTotals } from "@/lib/invoices/totals";
import { checkReadiness, checkInvoiceBlockers } from "@/lib/invoices/readiness";
import { downloadInvoicePdf, openInvoicePdf } from "@/lib/invoices/pdf";
import { amountToWordsINR } from "@/lib/invoices/amountInWords";
import { listCatalogItems, listItemCategories } from "@/lib/invoices/catalog";
import TaxCodeFinder from "@/components/invoices/TaxCodeFinder";
import PaidClientSelector from "@/components/invoices/PaidClientSelector";
import type {
  CompanySettings, Invoice, InvoiceMode, InvoiceSettings, InvoiceType, LineItem, TaxSplit,
  InvoiceCatalogItem, InvoiceItemCategory, TaxCode,
} from "@/lib/invoices/types";

const db = supabase as any;

function hydrateDraftSellerSnapshot(inv: Invoice, company: CompanySettings | null): Invoice {
  if (inv.status !== "draft" || !company) return inv;
  const snap = (inv.seller_snapshot_json || {}) as Partial<CompanySettings>;
  return {
    ...inv,
    seller_snapshot_json: {
      ...company,
      ...snap,
      logo_url: snap.logo_url || company.logo_url || null,
      signature_url: snap.signature_url || company.signature_url || null,
      stamp_url: snap.stamp_url || company.stamp_url || null,
    },
  };
}

export default function InvoiceEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user, isAdmin } = useAuth();

  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [paidLead, setPaidLead] = useState<any>(null);
  const [crmLead, setCrmLead] = useState<any>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<InvoiceCatalogItem[]>([]);
  const [categories, setCategories] = useState<InvoiceItemCategory[]>([]);
  const [sacFinderForRow, setSacFinderForRow] = useState<number | null>(null);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, s, cat, cats] = await Promise.all([
        loadCompanySettings(), loadInvoiceSettings(),
        listCatalogItems().catch(() => []), listItemCategories().catch(() => []),
      ]);
      setCompany(c); setSettings(s); setCatalog(cat); setCategories(cats);

      if (id) {
        const inv = await loadInvoice(id);
        if (inv) {
          setInvoice(hydrateDraftSellerSnapshot(inv, c));
          if (inv.paid_pipeline_lead_id) {
            const { data: p } = await db.from("paid_pipeline_leads").select("*").eq("id", inv.paid_pipeline_lead_id).maybeSingle();
            if (p) setPaidLead(p);
          }
          const ev = await listInvoiceEvents(inv.id!);
          setEvents(ev);
        }
      } else {
        const paidLeadId = params.get("paidLeadId");
        const mode = params.get("mode");
        if (paidLeadId && s) {
          const { data: p } = await db.from("paid_pipeline_leads").select("*").eq("id", paidLeadId).maybeSingle();
          setPaidLead(p);
          let cl: any = null;
          if (p?.crm_lead_id) {
            const { data: l } = await db.from("leads").select("*").eq("id", p.crm_lead_id).maybeSingle();
            cl = l; setCrmLead(l);
          }
          const draft = buildDraftFromPaidLead({ paidLead: p, crmLead: cl, company: c, settings: s, mode: "full_deal" });
          setInvoice(draft);
        } else if (s) {
          // Manual / standalone blank draft (also fallback when no params provided)
          const draft = buildBlankManualDraft({ company: c, settings: s });
          setInvoice(draft);
          if (mode !== "manual") {
            // No mode and no paidLeadId — still start a manual draft so the editor isn't blank.
          }
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const readiness = useMemo(
    () => settings ? checkReadiness(company, settings, invoice?.invoice_type || "gst", invoice?.seller_snapshot_json) : { ok: true, missing: [], canFallbackToNonGst: false },
    [company, settings, invoice?.invoice_type, invoice?.seller_snapshot_json]
  );

  // Comprehensive issue-time blockers (invoice-level, beyond company readiness)
  const blockers = useMemo(() => checkInvoiceBlockers(invoice, settings), [invoice, settings]);

  const allBlockers = useMemo(() => Array.from(new Set([...readiness.missing, ...blockers])), [readiness.missing, blockers]);
  const canIssue = allBlockers.length === 0;

  async function refreshFromCompany() {
    if (!invoice || invoice.status !== "draft") return;
    const c = await loadCompanySettings();
    const s = await loadInvoiceSettings();
    setCompany(c); setSettings(s);
    // Update draft seller branding from the latest Company Settings; issued snapshots stay immutable.
    setInvoice((cur) => cur ? hydrateDraftSellerSnapshot({ ...cur, seller_snapshot_json: c ? { ...(cur.seller_snapshot_json || {}), ...c } : cur.seller_snapshot_json }, c) : cur);
    toast.success("Pulled latest company & invoice settings");
  }

  const recompute = (inv: Invoice, overrides?: Partial<Invoice>): Invoice => {
    const merged = { ...inv, ...(overrides || {}) };
    const split: TaxSplit = merged.invoice_type === "gst" ? (settings?.default_tax_split || "cgst_sgst") : "none";
    const taxMode = settings?.default_tax_mode || "exclusive";
    const t = computeTotals(
      merged.line_items || [],
      merged.invoice_type,
      split,
      taxMode,
      merged.discount_amount || 0,
      merged.adjustment_amount || 0,
      merged.payment_made || 0
    );
    return { ...merged, ...t, line_items: t.lineItems, amount_in_words: amountToWordsINR(t.total_amount) };
  };

  const update = (overrides: Partial<Invoice>) => setInvoice((cur) => cur ? recompute(cur, overrides) : cur);

  const changeMode = (mode: InvoiceMode) => {
    if (!invoice || !settings) return;
    if (mode === "custom") {
      update({ invoice_mode: "custom" });
      return;
    }
    if (!paidLead) { update({ invoice_mode: mode }); return; }
    const fresh = buildDraftFromPaidLead({ paidLead, crmLead, company, settings, mode });
    // Preserve user-entered billing if present
    setInvoice({
      ...fresh,
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      billing_address: invoice.billing_address || fresh.billing_address,
      place_of_supply: invoice.place_of_supply || fresh.place_of_supply,
      notes: invoice.notes || fresh.notes,
      terms_and_conditions: invoice.terms_and_conditions || fresh.terms_and_conditions,
    });
  };

  const changeType = (t: InvoiceType) => {
    if (!invoice) return;
    const items = (invoice.line_items || []).map((li) => ({
      ...li, tax_rate: t === "gst" ? (Number(settings?.default_gst_rate) || 0) : 0,
    }));
    update({ invoice_type: t, line_items: items });
  };

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    if (!invoice) return;
    const items = (invoice.line_items || []).map((li, i) => i === idx ? { ...li, ...patch } : li);
    update({ line_items: items });
  };
  const addLine = () => {
    if (!invoice) return;
    const items = [...(invoice.line_items || []), {
      item_name: "", description: "", hsn_sac: settings?.default_hsn_sac || "",
      quantity: 1, rate: 0,
      tax_rate: invoice.invoice_type === "gst" ? (Number(settings?.default_gst_rate) || 0) : 0,
      cgst_amount: 0, sgst_amount: 0, igst_amount: 0, amount: 0, sort_order: (invoice.line_items?.length || 0),
    } as LineItem];
    update({ line_items: items });
  };
  const removeLine = (idx: number) => {
    if (!invoice) return;
    update({ line_items: (invoice.line_items || []).filter((_, i) => i !== idx) });
  };

  const applyCatalogItem = (idx: number, itemId: string) => {
    const it = catalog.find((c) => c.id === itemId);
    if (!it || !invoice) return;
    updateLine(idx, {
      item_name: it.item_name,
      description: it.description || "",
      hsn_sac: it.hsn_sac || "",
      rate: Number(it.default_price ?? it.default_rate ?? 0),
      tax_rate: invoice.invoice_type === "gst" ? Number(it.default_gst_rate ?? settings?.default_gst_rate ?? 0) : 0,
    });
    if (invoice.id) { try { logEvent(invoice.id, "invoice_item_selected_from_catalog", { item_id: itemId }, user?.id); } catch { /* ignore */ } }
  };

  const applySacCode = (idx: number, code: TaxCode) => {
    if (!invoice) return;
    updateLine(idx, {
      hsn_sac: code.code,
      tax_rate: invoice.invoice_type === "gst" && code.gst_rate_default != null ? Number(code.gst_rate_default) : (invoice.line_items?.[idx]?.tax_rate || 0),
    });
    if (invoice.id) { try { logEvent(invoice.id, "invoice_sac_hsn_selected", { code: code.code }, user?.id); } catch { /* ignore */ } }
  };

  const useLeadDetails = !!(invoice && (invoice.linked_client_name || invoice.linked_client_email || invoice.linked_client_phone) &&
    (invoice.billing_name || "") === (invoice.linked_client_name || "") &&
    (invoice.billing_email || "") === (invoice.linked_client_email || "") &&
    (invoice.billing_phone || "") === (invoice.linked_client_phone || ""));

  const toggleUseLeadDetails = (on: boolean) => {
    if (!invoice) return;
    if (on) {
      update({
        billing_name: invoice.linked_client_name || invoice.billing_name,
        billing_email: invoice.linked_client_email || invoice.billing_email,
        billing_phone: invoice.linked_client_phone || invoice.billing_phone,
      });
    } else {
      if (invoice.id) { try { logEvent(invoice.id, "invoice_billing_details_overridden", {}, user?.id); } catch { /* ignore */ } }
    }
  };

  const linkToPaidClient = async (paidLeadId: string) => {
    if (!invoice || !settings) return;
    const { data: p } = await db.from("paid_pipeline_leads").select("*").eq("id", paidLeadId).maybeSingle();
    if (!p) { toast.error("Paid lead not found"); return; }
    let cl: any = null;
    if (p.crm_lead_id) {
      const { data: l } = await db.from("leads").select("*").eq("id", p.crm_lead_id).maybeSingle();
      cl = l; setCrmLead(l);
    }
    setPaidLead(p);
    update({
      paid_pipeline_lead_id: p.id,
      crm_lead_id: p.crm_lead_id || cl?.id || null,
      linked_client_name: p.name || cl?.full_name || "",
      linked_client_email: p.email || cl?.email || "",
      linked_client_phone: p.phone || cl?.phone || "",
      invoice_context_type: "later_linked",
    });
    if (invoice.id) { try { logEvent(invoice.id, "invoice_linked_to_paid_lead", { paid_lead_id: paidLeadId }, user?.id); } catch { /* ignore */ } }
    toast.success("Linked to paid client");
  };

  const unlinkPaidClient = () => {
    if (!invoice || !isAdmin) return;
    if (!confirm("Unlink this invoice from the paid client?")) return;
    setPaidLead(null);
    update({
      paid_pipeline_lead_id: null,
      crm_lead_id: null,
      linked_client_name: null,
      linked_client_email: null,
      linked_client_phone: null,
      invoice_context_type: "manual",
    });
  };

  const saveDraftClick = async () => {
    if (!invoice || !user?.id) return;
    setBusy(true);
    try {
      const saved = await saveDraft(invoice, user.id);
      setInvoice(saved);
      toast.success("Draft saved");
      if (!id && saved.id) nav(`/invoices/${saved.id}`, { replace: true });
    } catch (e: any) { toast.error(e.message || "Save failed"); }
    finally { setBusy(false); }
  };

  const issueClick = async () => {
    if (!invoice || !user?.id || !settings) return;
    if (allBlockers.length > 0) { toast.error(allBlockers[0]); return; }
    if (!confirm("Issue this invoice? Invoice number will be assigned and cannot be changed.")) return;
    setBusy(true);
    try {
      const latestCompany = await loadCompanySettings();
      const invoiceToIssue = hydrateDraftSellerSnapshot(invoice, latestCompany || company);
      setCompany(latestCompany || company);
      setInvoice(invoiceToIssue);
      const saved = await issueInvoice(invoiceToIssue, { company: latestCompany || company, settings, userId: user.id });
      setInvoice(saved);
      const ev = await listInvoiceEvents(saved.id!);
      setEvents(ev);
      toast.success(`Invoice ${saved.invoice_number} issued`);
    } catch (e: any) { toast.error(e.message || "Issue failed"); }
    finally { setBusy(false); }
  };

  const previewPdf = async () => {
    if (!invoice) return;
    await openInvoicePdf(invoice, company);
    if (invoice.id) {
      // last_generated_at update may be blocked by RLS for non-admins on issued invoices; ignore that.
      await db.from("invoices").update({ last_generated_at: new Date().toISOString() }).eq("id", invoice.id);
      try { await logEvent(invoice.id, "invoice_pdf_generated", { action: "preview" }, user?.id); } catch { /* ignore */ }
    }
  };
  const downloadPdf = async () => {
    if (!invoice) return;
    await downloadInvoicePdf(invoice, company);
    if (invoice.id) {
      await db.from("invoices").update({ last_generated_at: new Date().toISOString() }).eq("id", invoice.id);
      try { await logEvent(invoice.id, "invoice_pdf_generated", { action: "download" }, user?.id); } catch { /* ignore */ }
    }
  };

  const cancelInvoice = async () => {
    if (!invoice?.id || !isAdmin) return;
    const reason = prompt("Reason for cancelling this invoice?");
    if (!reason) return;
    setBusy(true);
    try {
      await db.from("invoices").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user?.id, cancel_reason: reason }).eq("id", invoice.id);
      await logEvent(invoice.id, "invoice_cancelled", { reason }, user?.id);
      toast.success("Invoice cancelled");
      const fresh = await loadInvoice(invoice.id);
      if (fresh) setInvoice(fresh);
    } catch (e: any) { toast.error(e.message || "Cancel failed"); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="p-8 text-sm">Loading…</div>;
  if (!settings) return <div className="p-8 text-sm">Invoice settings not configured.</div>;
  if (!invoice) return <div className="p-8 text-sm">Invoice not found. <Button variant="link" onClick={() => nav(-1)}>Back</Button></div>;

  const isLocked = invoice.status !== "draft";

  return (
    <div className="max-w-[1100px]">
      <PageHead
        title={invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : "New Invoice"}
        sub={invoice.status === "draft" ? "Draft — not yet issued. No invoice number assigned." : `Status: ${invoice.status}`}
      />

      {allBlockers.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 mb-4">
          <div className="font-medium text-amber-900 text-[13px]">Invoice cannot be issued yet</div>
          <ul className="mt-1 text-[12px] text-amber-900 list-disc ml-5">
            {allBlockers.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => nav("/admin-center/company-settings")}>Open Company Settings</Button>
            <Button size="sm" variant="outline" onClick={() => nav("/admin-center/invoice-settings")}>Open Invoice Settings</Button>
            {!isLocked && <Button size="sm" variant="outline" onClick={refreshFromCompany}>Refresh from Company Settings</Button>}
            {readiness.canFallbackToNonGst && (
              <Button size="sm" onClick={() => changeType("non_gst")}>Continue as Non-GST Invoice</Button>
            )}
          </div>
        </div>
      )}

      {canIssue && !company?.signature_url && !settings?.require_authorized_signature && (
        <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3 mb-4 text-[12.5px] text-amber-900">
          Signature missing. Invoice will show a blank signature line.
          <Button size="sm" variant="outline" className="ml-3 h-7" onClick={() => nav("/admin-center/company-settings")}>Upload signature</Button>
        </div>
      )}

      {/* Type + Mode */}
      <div className="border border-line bg-white rounded-xl p-5 mb-4">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <SectionLabel>Invoice Type</SectionLabel>
            <div className="mt-2 flex gap-2">
              <Pill active={invoice.invoice_type === "gst"} onClick={() => !isLocked && changeType("gst")}>GST Invoice</Pill>
              <Pill active={invoice.invoice_type === "non_gst"} onClick={() => !isLocked && changeType("non_gst")}>Non-GST</Pill>
            </div>
          </div>
          <div>
            <SectionLabel>Invoice Mode</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["full_deal", "token", "balance", "custom"] as InvoiceMode[]).map((m) => (
                <Pill key={m} active={invoice.invoice_mode === m} onClick={() => !isLocked && changeMode(m)}>
                  {m === "full_deal" ? "Full Deal" : m === "token" ? "Token / Advance" : m === "balance" ? "Balance" : "Custom"}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Linked Client Context */}
      <div className="border border-line bg-white rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Invoice Context</SectionLabel>
          {!isLocked && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setLinkPickerOpen(true)}>
                {invoice.paid_pipeline_lead_id ? "Change linked client" : "Link to paid client"}
              </Button>
              {invoice.paid_pipeline_lead_id && isAdmin && (
                <Button size="sm" variant="ghost" onClick={unlinkPaidClient}>Unlink</Button>
              )}
            </div>
          )}
        </div>
        {invoice.paid_pipeline_lead_id ? (
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]">
            <div><span className="text-muted-foreground">Client: </span><span className="font-medium">{invoice.linked_client_name || paidLead?.name || "—"}</span></div>
            <div><span className="text-muted-foreground">Email: </span>{invoice.linked_client_email || paidLead?.email || "—"}</div>
            <div><span className="text-muted-foreground">Phone: </span>{invoice.linked_client_phone || paidLead?.phone || "—"}</div>
            <div><span className="text-muted-foreground">Program: </span>{paidLead?.product_name_snapshot || "—"}</div>
            <div><span className="text-muted-foreground">Batch: </span>{paidLead?.paid_batch_name || "—"}</div>
            <div><span className="text-muted-foreground">Owner: </span>{paidLead?.assigned_sales_executive || "—"}</div>
          </div>
        ) : (
          <div className="mt-2 text-[12.5px] text-muted-foreground italic">
            This invoice is not linked to a paid lead / client.
          </div>
        )}
      </div>

      {/* Invoice Number + Display Toggles */}
      <div className="border border-line bg-white rounded-xl p-5 mb-4 grid grid-cols-2 gap-6">
        <div>
          <SectionLabel>Invoice Number</SectionLabel>
          <div className="mt-2 flex gap-2">
            <Pill active={(invoice.invoice_number_mode || "auto") === "auto"} onClick={() => !isLocked && update({ invoice_number_mode: "auto", manual_invoice_number: null })}>Auto</Pill>
            {isAdmin && (
              <Pill active={invoice.invoice_number_mode === "manual"} onClick={() => !isLocked && update({ invoice_number_mode: "manual" })}>Manual (admin)</Pill>
            )}
          </div>
          {invoice.invoice_number_mode === "manual" && (
            <div className="mt-3">
              <Field label="Manual invoice number">
                <Input
                  disabled={isLocked}
                  placeholder="e.g. INV-2026-001"
                  value={invoice.manual_invoice_number || ""}
                  onChange={(e) => update({ manual_invoice_number: e.target.value })}
                />
              </Field>
              <div className="mt-1 text-[11px] text-amber-700">Manual invoice number should follow your statutory invoice sequence.</div>
            </div>
          )}
        </div>
        <div>
          <SectionLabel>Display Options</SectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
            {([
              ["show_bank_details", "Show bank details"],
              ["show_payment_instructions", "Show payment instructions"],
              ["show_signature", "Show signature"],
              ["show_stamp", "Show stamp"],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isLocked}
                  checked={invoice[k] !== false}
                  onChange={(e) => {
                    update({ [k]: e.target.checked } as any);
                    if (k === "show_bank_details" && !e.target.checked && invoice.id) {
                      try { logEvent(invoice.id, "invoice_bank_details_hidden", {}, user?.id); } catch { /* ignore */ }
                    }
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Billing Details */}
      <div className="border border-line bg-white rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Billing Details</SectionLabel>
          {invoice.paid_pipeline_lead_id && !isLocked && (
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={useLeadDetails} onChange={(e) => toggleUseLeadDetails(e.target.checked)} />
              Use lead details
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <Field label="Billing name *"><Input disabled={isLocked} value={invoice.billing_name || ""} onChange={(e) => update({ billing_name: e.target.value })} /></Field>
          <Field label="Billing email"><Input disabled={isLocked} value={invoice.billing_email || ""} onChange={(e) => update({ billing_email: e.target.value })} /></Field>
          <Field label="Billing phone"><Input disabled={isLocked} value={invoice.billing_phone || ""} onChange={(e) => update({ billing_phone: e.target.value })} /></Field>
          <Field label="Customer GSTIN"><Input disabled={isLocked} value={invoice.billing_gstin || ""} onChange={(e) => update({ billing_gstin: e.target.value })} /></Field>
          <div className="col-span-2">
            <Field label="Billing address"><Textarea disabled={isLocked} rows={2} value={invoice.billing_address || ""} onChange={(e) => update({ billing_address: e.target.value })} /></Field>
          </div>
          <Field label="City"><Input disabled={isLocked} value={invoice.billing_city || ""} onChange={(e) => update({ billing_city: e.target.value })} /></Field>
          <Field label="State"><Input disabled={isLocked} value={invoice.billing_state || ""} onChange={(e) => update({ billing_state: e.target.value })} /></Field>
          <Field label="State code"><Input disabled={isLocked} value={invoice.billing_state_code || ""} onChange={(e) => update({ billing_state_code: e.target.value })} /></Field>
          <Field label="Country"><Input disabled={isLocked} value={invoice.billing_country || ""} onChange={(e) => update({ billing_country: e.target.value })} /></Field>
          <Field label="Place of supply"><Input disabled={isLocked} value={invoice.place_of_supply || ""} onChange={(e) => update({ place_of_supply: e.target.value })} /></Field>
          <Field label="Invoice date"><Input type="date" disabled={isLocked} value={invoice.invoice_date || ""} onChange={(e) => update({ invoice_date: e.target.value })} /></Field>
          <Field label="Due date"><Input type="date" disabled={isLocked} value={invoice.due_date || ""} onChange={(e) => update({ due_date: e.target.value })} /></Field>
        </div>
        {invoice.paid_pipeline_lead_id && invoice.linked_client_name && invoice.billing_name && invoice.linked_client_name !== invoice.billing_name && (
          <div className="mt-2 text-[11.5px] text-amber-700">Billing name differs from linked client ({invoice.linked_client_name}). Internal record stays linked; PDF will show billing name.</div>
        )}
      </div>

      {/* Line items */}
      <div className="border border-line bg-white rounded-xl p-5 mb-4">
        <div className="flex justify-between items-center">
          <SectionLabel>Items</SectionLabel>
          {!isLocked && <Button size="sm" variant="outline" onClick={addLine}>+ Add line</Button>}
        </div>
        <table className="w-full text-[12.5px] mt-3">
          <thead className="text-left text-muted-foreground border-b border-line">
            <tr>
              <th className="py-2 pr-2">Item</th>
              {invoice.invoice_type === "gst" && <th className="py-2 px-2 w-44">HSN/SAC</th>}
              <th className="py-2 px-2 w-16">Qty</th>
              <th className="py-2 px-2 w-24">Rate</th>
              {invoice.invoice_type === "gst" && <th className="py-2 px-2 w-16">Tax %</th>}
              <th className="py-2 pl-2 w-24 text-right">Amount</th>
              {!isLocked && <th className="w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {(invoice.line_items || []).map((li, i) => (
              <tr key={i} className="border-b border-line/50 align-top">
                <td className="py-2 pr-2">
                  {!isLocked && catalog.length > 0 && (
                    <select
                      className="w-full mb-1 h-8 text-[11.5px] border border-input rounded px-2 bg-white"
                      value=""
                      onChange={(e) => { if (e.target.value) applyCatalogItem(i, e.target.value); }}
                    >
                      <option value="">— Pick from catalog —</option>
                      {catalog.map((c) => (
                        <option key={c.id} value={c.id}>{c.item_name}</option>
                      ))}
                    </select>
                  )}
                  <Input disabled={isLocked} placeholder="Item name" value={li.item_name} onChange={(e) => updateLine(i, { item_name: e.target.value })} />
                  <Input disabled={isLocked} className="mt-1" placeholder="Description (optional)" value={li.description || ""} onChange={(e) => updateLine(i, { description: e.target.value })} />
                </td>
                {invoice.invoice_type === "gst" && (
                  <td className="py-2 px-2">
                    <Input disabled={isLocked} value={li.hsn_sac || ""} onChange={(e) => updateLine(i, { hsn_sac: e.target.value })} />
                    {!isLocked && (
                      <button onClick={() => setSacFinderForRow(i)} className="mt-1 text-[10.5px] text-blue-600 hover:underline">
                        Find SAC/HSN
                      </button>
                    )}
                  </td>
                )}
                <td className="py-2 px-2"><Input disabled={isLocked} type="number" value={li.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} /></td>
                <td className="py-2 px-2"><Input disabled={isLocked} type="number" value={li.rate} onChange={(e) => updateLine(i, { rate: Number(e.target.value) })} /></td>
                {invoice.invoice_type === "gst" && (
                  <td className="py-2 px-2"><Input disabled={isLocked} type="number" value={li.tax_rate} onChange={(e) => updateLine(i, { tax_rate: Number(e.target.value) })} /></td>
                )}
                <td className="py-2 pl-2 text-right font-mono">₹{li.amount.toFixed(2)}</td>
                {!isLocked && <td><button onClick={() => removeLine(i)} className="text-red-500 text-lg">×</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-line bg-white rounded-xl p-5">
          <SectionLabel>Notes & Terms</SectionLabel>
          <div className="mt-3 space-y-3">
            <Field label="Customer notes"><Textarea disabled={isLocked} rows={3} value={invoice.notes || ""} onChange={(e) => update({ notes: e.target.value })} /></Field>
            <Field label="Terms & Conditions"><Textarea disabled={isLocked} rows={3} value={invoice.terms_and_conditions || ""} onChange={(e) => update({ terms_and_conditions: e.target.value })} /></Field>
          </div>
        </div>
        <div className="border border-line bg-white rounded-xl p-5">
          <SectionLabel>Summary</SectionLabel>
          <div className="mt-3 text-[13px] space-y-1.5">
            <Row label="Subtotal" v={invoice.subtotal} />
            <RowEdit label="Discount" v={invoice.discount_amount} disabled={isLocked} onChange={(n) => update({ discount_amount: n })} />
            {invoice.invoice_type === "gst" && (<>
              {invoice.cgst_amount > 0 && <Row label="CGST" v={invoice.cgst_amount} />}
              {invoice.sgst_amount > 0 && <Row label="SGST" v={invoice.sgst_amount} />}
              {invoice.igst_amount > 0 && <Row label="IGST" v={invoice.igst_amount} />}
            </>)}
            <RowEdit label="Adjustment" v={invoice.adjustment_amount} disabled={isLocked} onChange={(n) => update({ adjustment_amount: n })} />
            <div className="border-t border-line pt-1.5 mt-1.5">
              <Row label="Total" v={invoice.total_amount} bold />
            </div>
            <RowEdit label="Payment made" v={invoice.payment_made} disabled={isLocked} onChange={(n) => update({ payment_made: n })} />
            <Row label="Balance due" v={invoice.balance_due} bold />
            <div className="text-[11px] text-muted-foreground italic pt-1">{invoice.amount_in_words}</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-end gap-1 mb-6">
        <div className="flex justify-end gap-2 flex-wrap">
          <Button variant="outline" onClick={() => nav(-1)}>Back</Button>
          {!isLocked && <Button variant="outline" onClick={refreshFromCompany} disabled={busy}>Refresh from Company Settings</Button>}
          {!isLocked && <Button variant="outline" onClick={saveDraftClick} disabled={busy}>Save Draft</Button>}
          <Button variant="outline" onClick={previewPdf}>Preview PDF</Button>
          <Button variant="outline" onClick={downloadPdf}>Download PDF</Button>
          {!isLocked && (
            <Button onClick={issueClick} disabled={busy || !canIssue} title={!canIssue ? "Fix the above issue(s) to issue this invoice" : undefined}>
              Issue Invoice
            </Button>
          )}
          {invoice.status === "issued" && isAdmin && (
            <Button variant="destructive" onClick={cancelInvoice} disabled={busy}>Cancel Invoice</Button>
          )}
        </div>
        {!isLocked && !canIssue && (
          <div className="text-[11.5px] text-muted-foreground">Fix the above issue(s) to issue this invoice.</div>
        )}
      </div>

      {/* Admin Debug */}
      {isAdmin && (
        <details className="mb-6 border border-line bg-white rounded-xl p-4 text-[12px]">
          <summary className="cursor-pointer font-medium">Invoice Readiness Debug (admin only)</summary>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono">
            <span>status</span><span>{invoice.status}</span>
            <span>invoice_type</span><span>{invoice.invoice_type}</span>
            <span>line_items</span><span>{invoice.line_items?.length || 0}</span>
            <span>total</span><span>{invoice.total_amount}</span>
            <span>company loaded</span><span>{company ? "yes" : "no"}</span>
            <span>company.signature_url</span><span>{company?.signature_url ? "yes" : "no"}</span>
            <span>snapshot.signature_url</span><span>{invoice.seller_snapshot_json?.signature_url ? "yes" : "no"}</span>
            <span>require_signature</span><span>{settings?.require_authorized_signature ? "yes" : "no"}</span>
            <span>readiness blockers</span><span>{readiness.missing.length}</span>
            <span>invoice blockers</span><span>{blockers.length}</span>
            <span className="font-bold">canIssue</span><span className="font-bold">{String(canIssue)}</span>
            <span>readiness.missing</span><span className="whitespace-pre-wrap">{JSON.stringify(readiness.missing)}</span>
            <span>invoice.blockers</span><span className="whitespace-pre-wrap">{JSON.stringify(blockers)}</span>
            <span>allBlockers</span><span className="whitespace-pre-wrap">{JSON.stringify(allBlockers)}</span>
          </div>
          {allBlockers.length > 0 && (
            <ul className="mt-3 list-disc ml-5 text-red-700">
              {allBlockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
        </details>
      )}

      {/* Events */}
      {events.length > 0 && (
        <div className="border border-line bg-white rounded-xl p-5 mb-6">
          <SectionLabel>Activity</SectionLabel>
          <ul className="mt-3 text-[12px] space-y-1.5">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between border-b border-line/50 py-1">
                <span>{e.event_type}</span>
                <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TaxCodeFinder
        open={sacFinderForRow !== null}
        onOpenChange={(v) => { if (!v) setSacFinderForRow(null); }}
        onSelect={(code) => { if (sacFinderForRow !== null) applySacCode(sacFinderForRow, code); setSacFinderForRow(null); }}
      />
      <PaidClientSelector
        open={linkPickerOpen}
        onOpenChange={setLinkPickerOpen}
        onSelect={(pid) => linkToPaidClient(pid)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div>
    <Label className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{label}</Label>
    <div className="mt-1">{children}</div>
  </div>);
}
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-md text-[12.5px] border transition-colors ${active ? "bg-black text-white border-black" : "bg-white text-foreground border-line hover:bg-off"}`}>
      {children}
    </button>
  );
}
function Row({ label, v, bold }: { label: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span><span className="font-mono">₹{(v || 0).toFixed(2)}</span>
    </div>
  );
}
function RowEdit({ label, v, disabled, onChange }: { label: string; v: number; disabled?: boolean; onChange: (n: number) => void }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span>{label}</span>
      <Input disabled={disabled} type="number" className="w-28 h-7 text-right font-mono" value={v || 0} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
