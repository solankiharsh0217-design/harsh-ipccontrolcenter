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
import { buildDraftFromPaidLead } from "@/lib/invoices/draft";
import { computeTotals } from "@/lib/invoices/totals";
import { checkReadiness } from "@/lib/invoices/readiness";
import { downloadInvoicePdf, openInvoicePdf } from "@/lib/invoices/pdf";
import { amountToWordsINR } from "@/lib/invoices/amountInWords";
import type {
  CompanySettings, Invoice, InvoiceMode, InvoiceSettings, InvoiceType, LineItem, TaxSplit,
} from "@/lib/invoices/types";

const db = supabase as any;

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

  useEffect(() => {
    (async () => {
      const [c, s] = await Promise.all([loadCompanySettings(), loadInvoiceSettings()]);
      setCompany(c); setSettings(s);

      if (id) {
        const inv = await loadInvoice(id);
        if (inv) {
          setInvoice(inv);
          if (inv.paid_pipeline_lead_id) {
            const { data: p } = await db.from("paid_pipeline_leads").select("*").eq("id", inv.paid_pipeline_lead_id).maybeSingle();
            if (p) setPaidLead(p);
          }
          const ev = await listInvoiceEvents(inv.id!);
          setEvents(ev);
        }
      } else {
        const paidLeadId = params.get("paidLeadId");
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
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const readiness = useMemo(
    () => settings ? checkReadiness(company, settings, invoice?.invoice_type || "gst") : { ok: true, missing: [], canFallbackToNonGst: false },
    [company, settings, invoice?.invoice_type]
  );

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
    if (!readiness.ok) { toast.error("Invoice setup incomplete"); return; }
    if (!isAdmin) { toast.error("Only admin can issue invoices"); return; }
    if (!confirm("Issue this invoice? Invoice number will be assigned and cannot be changed.")) return;
    setBusy(true);
    try {
      const saved = await issueInvoice(invoice, { company, settings, userId: user.id });
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
      await db.from("invoices").update({ last_generated_at: new Date().toISOString() }).eq("id", invoice.id);
      await logEvent(invoice.id, "invoice_pdf_generated", { action: "preview" }, user?.id);
    }
  };
  const downloadPdf = async () => {
    if (!invoice) return;
    await downloadInvoicePdf(invoice, company);
    if (invoice.id) {
      await db.from("invoices").update({ last_generated_at: new Date().toISOString() }).eq("id", invoice.id);
      await logEvent(invoice.id, "invoice_pdf_generated", { action: "download" }, user?.id);
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

      {!readiness.ok && (
        <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 mb-4">
          <div className="font-medium text-amber-900 text-[13px]">Invoice setup incomplete</div>
          <ul className="mt-1 text-[12px] text-amber-900 list-disc ml-5">
            {readiness.missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => nav("/admin-center/company-settings")}>Open Company Settings</Button>
            <Button size="sm" variant="outline" onClick={() => nav("/admin-center/invoice-settings")}>Open Invoice Settings</Button>
            {readiness.canFallbackToNonGst && (
              <Button size="sm" onClick={() => changeType("non_gst")}>Continue as Non-GST Invoice</Button>
            )}
          </div>
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

      {/* Buyer */}
      <div className="border border-line bg-white rounded-xl p-5 mb-4">
        <SectionLabel>Bill To</SectionLabel>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <Field label="Member name"><Input disabled={isLocked} value={invoice.member_name || ""} onChange={(e) => update({ member_name: e.target.value })} /></Field>
          <Field label="Email"><Input disabled={isLocked} value={invoice.member_email || ""} onChange={(e) => update({ member_email: e.target.value })} /></Field>
          <Field label="Phone"><Input disabled={isLocked} value={invoice.member_phone || ""} onChange={(e) => update({ member_phone: e.target.value })} /></Field>
          <Field label="Place of supply"><Input disabled={isLocked} value={invoice.place_of_supply || ""} onChange={(e) => update({ place_of_supply: e.target.value })} /></Field>
          <div className="col-span-2">
            <Field label="Billing address"><Textarea disabled={isLocked} rows={2} value={invoice.billing_address || ""} onChange={(e) => update({ billing_address: e.target.value })} /></Field>
          </div>
          <Field label="Invoice date"><Input type="date" disabled={isLocked} value={invoice.invoice_date || ""} onChange={(e) => update({ invoice_date: e.target.value })} /></Field>
          <Field label="Due date"><Input type="date" disabled={isLocked} value={invoice.due_date || ""} onChange={(e) => update({ due_date: e.target.value })} /></Field>
        </div>
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
              {invoice.invoice_type === "gst" && <th className="py-2 px-2">HSN/SAC</th>}
              <th className="py-2 px-2 w-16">Qty</th>
              <th className="py-2 px-2 w-28">Rate</th>
              {invoice.invoice_type === "gst" && <th className="py-2 px-2 w-20">Tax %</th>}
              <th className="py-2 pl-2 w-28 text-right">Amount</th>
              {!isLocked && <th className="w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {(invoice.line_items || []).map((li, i) => (
              <tr key={i} className="border-b border-line/50 align-top">
                <td className="py-2 pr-2">
                  <Input disabled={isLocked} placeholder="Item name" value={li.item_name} onChange={(e) => updateLine(i, { item_name: e.target.value })} />
                  <Input disabled={isLocked} className="mt-1" placeholder="Description (optional)" value={li.description || ""} onChange={(e) => updateLine(i, { description: e.target.value })} />
                </td>
                {invoice.invoice_type === "gst" && (
                  <td className="py-2 px-2"><Input disabled={isLocked} value={li.hsn_sac || ""} onChange={(e) => updateLine(i, { hsn_sac: e.target.value })} /></td>
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
      <div className="flex justify-end gap-2 mb-6">
        <Button variant="outline" onClick={() => nav(-1)}>Back</Button>
        {!isLocked && <Button variant="outline" onClick={saveDraftClick} disabled={busy}>Save Draft</Button>}
        <Button variant="outline" onClick={previewPdf}>Preview PDF</Button>
        <Button variant="outline" onClick={downloadPdf}>Download PDF</Button>
        {!isLocked && (
          <Button onClick={issueClick} disabled={busy || !readiness.ok || !isAdmin}>
            Issue Invoice
          </Button>
        )}
        {invoice.status === "issued" && isAdmin && (
          <Button variant="destructive" onClick={cancelInvoice} disabled={busy}>Cancel Invoice</Button>
        )}
      </div>

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
