import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const inr = (n: number) => "₹" + (Math.round(n || 0)).toLocaleString("en-IN");
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

type Lead = {
  id: string;
  name: string | null; email: string | null; phone: string | null;
  business_unit: string;
  webinar_batch_id: string | null;
  product_name_snapshot: string | null;
  deal_value_including_gst: number;
  token_amount_collected: number;
  total_collected: number;
  balance_pending: number;
  payment_model: string | null;
  payment_status: string | null;
  pipeline_stage: string | null;
  finance_required: boolean;
  finance_partner: string | null;
  finance_status: string | null;
  attributed_media_buyer: string | null;
  follow_up_date: string | null;
  is_final_sale: boolean; is_dropped: boolean; is_enrolled: boolean; is_refunded: boolean;
  assigned_sales_executive: string | null;
  source_webinar: string | null;
  created_at: string;
};
type Batch = { id: string; batch_name: string; webinar_name: string; webinar_date: string | null };
type Payment = { id: string; payment_type: string; amount: number; payment_date: string; payment_mode: string | null; is_token: boolean; is_final_payment: boolean; notes: string | null };

export default function PaidPipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [batchFilter, setBatchFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    const [{ data: l }, { data: b }, { data: s }] = await Promise.all([
      supabase.from("paid_pipeline_leads").select("*").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("webinar_batches").select("id, batch_name, webinar_name, webinar_date").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("paid_pipeline_settings").select("label").eq("setting_type", "pipeline_stage").eq("is_active", true).eq("is_deleted", false).order("sort_order"),
    ]);
    setLeads((l as any) || []);
    setBatches((b as any) || []);
    setStages(((s as any) || []).map((x: any) => x.label));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (batchFilter !== "all" && l.webinar_batch_id !== batchFilter) return false;
      if (stageFilter !== "all" && l.pipeline_stage !== stageFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(`${l.name || ""} ${l.email || ""} ${l.phone || ""}`.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [leads, batchFilter, stageFilter, search]);

  const totals = useMemo(() => {
    const t = { token: 0, deal: 0, collected: 0, balance: 0, finalSales: 0, dropped: 0, financePending: 0, emiDisbursed: 0 };
    filtered.forEach(l => {
      t.token += Number(l.token_amount_collected || 0);
      t.deal += Number(l.deal_value_including_gst || 0);
      t.collected += Number(l.total_collected || 0);
      t.balance += Number(l.balance_pending || 0);
      if (l.is_final_sale) t.finalSales++;
      if (l.is_dropped) t.dropped++;
      if (l.finance_required && l.finance_status !== "Disbursed") t.financePending++;
      if (l.finance_status === "Disbursed") t.emiDisbursed += Number(l.deal_value_including_gst || 0);
    });
    return t;
  }, [filtered]);

  const openLead = leads.find(l => l.id === openId) || null;

  return (
    <div className="max-w-[1400px]">
      <h1 className="font-serif text-[28px] text-black">Paid Pipeline</h1>
      <p className="font-sans text-[13px] font-light text-muted-foreground mt-1 mb-6">
        Buyers sent from Attribution Reports. Track payment, finance/EMI, balance pending, and final sale realization.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SumCard label="Total Token Collected" value={inr(totals.token)} />
        <SumCard label="Total Deal Value" value={inr(totals.deal)} />
        <SumCard label="Total Collected" value={inr(totals.collected)} />
        <SumCard label="Balance Pending" value={inr(totals.balance)} accent />
        <SumCard label="Final Sales" value={String(totals.finalSales)} />
        <SumCard label="Dropped After Token" value={String(totals.dropped)} />
        <SumCard label="Finance Pending" value={String(totals.financePending)} />
        <SumCard label="EMI Disbursed Revenue" value={inr(totals.emiDisbursed)} />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <input className="h-9 border border-line rounded-md px-3 text-[13px] flex-1 min-w-[200px]" placeholder="Search name, email, phone…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="h-9 border border-line rounded-md px-2 text-[13px]" value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
          <option value="all">All batches</option>
          {batches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
        </select>
        <select className="h-9 border border-line rounded-md px-2 text-[13px]" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="all">All stages</option>
          {stages.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="border border-line rounded-lg overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-off">
            <tr className="text-left">
              <th className="px-3 py-2.5">Buyer</th>
              <th className="px-3 py-2.5">Batch / Product</th>
              <th className="px-3 py-2.5">Deal</th>
              <th className="px-3 py-2.5">Token</th>
              <th className="px-3 py-2.5">Collected</th>
              <th className="px-3 py-2.5">Balance</th>
              <th className="px-3 py-2.5">Stage</th>
              <th className="px-3 py-2.5">Finance</th>
              <th className="px-3 py-2.5">Media Buyer</th>
              <th className="px-3 py-2.5">Follow-up</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">
                No buyers in Paid Pipeline yet. Open an Attribution Report and click "Send to Paid Pipeline".
              </td></tr>
            )}
            {filtered.map(l => {
              const batch = batches.find(b => b.id === l.webinar_batch_id);
              return (
                <tr key={l.id} className="border-t border-line hover:bg-off/50 cursor-pointer" onClick={() => setOpenId(l.id)}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{l.name || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{l.email || l.phone || "—"}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{batch?.batch_name || l.source_webinar || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{l.product_name_snapshot || "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{inr(l.deal_value_including_gst)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{inr(l.token_amount_collected)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{inr(l.total_collected)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[#CA8A04]">{inr(l.balance_pending)}</td>
                  <td className="px-3 py-2.5"><span className="inline-block px-2 py-0.5 rounded-full bg-gold-pale text-[10.5px] text-gold-deep">{l.pipeline_stage || "—"}</span></td>
                  <td className="px-3 py-2.5 text-[11.5px]">{l.finance_required ? `${l.finance_partner || "—"} · ${l.finance_status || "—"}` : "—"}</td>
                  <td className="px-3 py-2.5 text-[11.5px]">{l.attributed_media_buyer || "—"}</td>
                  <td className="px-3 py-2.5 text-[11.5px]">{fmtDate(l.follow_up_date)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button className="text-[11px] text-gold-deep">Open</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openLead && <LeadDrawer lead={openLead} onClose={() => { setOpenId(null); load(); }} stages={stages} />}
    </div>
  );
}

function SumCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={"border border-line rounded-lg px-4 py-3 " + (accent ? "bg-gold-pale" : "bg-white")}>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className="font-serif text-[22px] mt-1">{value}</div>
    </div>
  );
}

function LeadDrawer({ lead, onClose, stages }: { lead: Lead; onClose: () => void; stages: string[] }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stage, setStage] = useState(lead.pipeline_stage || "");
  const [followUp, setFollowUp] = useState(lead.follow_up_date || "");
  const [notes, setNotes] = useState("");
  const [pType, setPType] = useState("Balance Payment");
  const [pAmount, setPAmount] = useState<number>(0);
  const [pDate, setPDate] = useState(new Date().toISOString().slice(0, 10));
  const [pMode, setPMode] = useState("Bank Transfer");
  const [busy, setBusy] = useState(false);

  const loadPayments = async () => {
    const { data } = await supabase.from("paid_pipeline_payments").select("*").eq("paid_pipeline_lead_id", lead.id).eq("is_deleted", false).order("payment_date", { ascending: false });
    setPayments((data as any) || []);
  };
  useEffect(() => { loadPayments(); }, [lead.id]);

  const recompute = async () => {
    const { data } = await supabase.from("paid_pipeline_payments").select("amount, payment_type, is_final_payment").eq("paid_pipeline_lead_id", lead.id).eq("is_deleted", false);
    const list = (data as any[]) || [];
    const total = list.reduce((sum, p) => sum + (p.payment_type === "Refund" ? -Number(p.amount) : Number(p.amount)), 0);
    const balance = Math.max(0, Number(lead.deal_value_including_gst) - total);
    const isFinal = total >= Number(lead.deal_value_including_gst) && Number(lead.deal_value_including_gst) > 0;
    await supabase.from("paid_pipeline_leads").update({
      total_collected: total,
      balance_pending: balance,
      payment_status: isFinal ? "Full Payment Received" : (total > 0 ? "Partial Received" : "No Payment"),
      is_final_sale: isFinal,
      is_enrolled: isFinal,
      final_revenue_realized: isFinal ? total : 0,
    } as any).eq("id", lead.id);
  };

  const addPayment = async () => {
    if (!pAmount) { toast.error("Amount required"); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("paid_pipeline_payments").insert({
        paid_pipeline_lead_id: lead.id,
        payment_type: pType, amount: pAmount, payment_date: pDate, payment_mode: pMode,
        is_token: pType === "Token",
        is_final_payment: pType === "Full Payment",
        notes: notes || null,
        created_by: user?.id,
      } as any);
      if (error) throw error;
      await supabase.from("paid_pipeline_activity_logs").insert({
        paid_pipeline_lead_id: lead.id, activity_type: "payment_added",
        note: `${pType}: ${inr(pAmount)}`, created_by: user?.id,
      } as any);
      await recompute();
      setPAmount(0); setNotes("");
      await loadPayments();
      toast.success("Payment added");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const saveStage = async (newStage: string) => {
    setStage(newStage);
    await supabase.from("paid_pipeline_leads").update({ pipeline_stage: newStage } as any).eq("id", lead.id);
    toast.success("Stage updated");
  };

  const saveFollowUp = async () => {
    await supabase.from("paid_pipeline_leads").update({ follow_up_date: followUp || null } as any).eq("id", lead.id);
    toast.success("Saved");
  };

  const copyWa = () => {
    const msg = `Hi ${lead.name || ""}, your token payment of ${inr(lead.token_amount_collected)} for ${lead.product_name_snapshot || "the program"} has been received. Your remaining balance is ${inr(lead.balance_pending)}. Our team will guide you for the next steps.`;
    navigator.clipboard.writeText(msg);
    toast.success("WhatsApp message copied");
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-[640px] bg-white overflow-y-auto p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="font-serif text-[24px]">{lead.name || "Untitled"}</div>
            <div className="text-[12px] text-muted-foreground">{lead.email || "—"} · {lead.phone || "—"}</div>
          </div>
          <button onClick={onClose} className="text-[20px]">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <Field label="Deal value" value={inr(lead.deal_value_including_gst)} />
          <Field label="Token collected" value={inr(lead.token_amount_collected)} />
          <Field label="Total collected" value={inr(lead.total_collected)} />
          <Field label="Balance pending" value={inr(lead.balance_pending)} accent />
          <Field label="Payment model" value={lead.payment_model || "—"} />
          <Field label="Product" value={lead.product_name_snapshot || "—"} />
          <Field label="Attributed media buyer" value={lead.attributed_media_buyer || "—"} />
          <Field label="Source webinar" value={lead.source_webinar || "—"} />
        </div>

        <div className="border border-line rounded-md p-3 mb-4">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-2">Pipeline stage</div>
          <select className="h-9 w-full border border-line rounded-md px-2 text-[13px]" value={stage} onChange={e => saveStage(e.target.value)}>
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mt-3 mb-1">Follow-up date</div>
          <div className="flex gap-2">
            <input type="date" className="h-9 flex-1 border border-line rounded-md px-2 text-[13px]" value={followUp} onChange={e => setFollowUp(e.target.value)} />
            <button onClick={saveFollowUp} className="h-9 px-3 bg-black text-white rounded-md text-[12px]">Save</button>
          </div>
        </div>

        <div className="border border-line rounded-md p-3 mb-4">
          <div className="font-sans text-[13px] mb-2 font-medium">Add payment</div>
          <div className="grid grid-cols-2 gap-2">
            <select className="h-9 border border-line rounded-md px-2 text-[12.5px]" value={pType} onChange={e => setPType(e.target.value)}>
              {["Token", "Down Payment", "Balance Payment", "Full Payment", "EMI Disbursement", "Refund", "Adjustment"].map(t => <option key={t}>{t}</option>)}
            </select>
            <input type="number" placeholder="Amount" className="h-9 border border-line rounded-md px-2 text-[12.5px]" value={pAmount || ""} onChange={e => setPAmount(Number(e.target.value))} />
            <input type="date" className="h-9 border border-line rounded-md px-2 text-[12.5px]" value={pDate} onChange={e => setPDate(e.target.value)} />
            <input className="h-9 border border-line rounded-md px-2 text-[12.5px]" placeholder="Mode" value={pMode} onChange={e => setPMode(e.target.value)} />
            <input className="h-9 border border-line rounded-md px-2 text-[12.5px] col-span-2" placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <button onClick={addPayment} disabled={busy} className="mt-2 h-9 px-4 bg-black text-white rounded-md text-[12.5px] disabled:opacity-50">{busy ? "Adding…" : "Add payment"}</button>
        </div>

        <div className="border border-line rounded-md p-3 mb-4">
          <div className="font-sans text-[13px] mb-2 font-medium">Payment history</div>
          {payments.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">No payments recorded.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1">Date</th><th>Type</th><th>Mode</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-1.5">{fmtDate(p.payment_date)}</td>
                    <td>{p.payment_type}</td>
                    <td>{p.payment_mode || "—"}</td>
                    <td className={"text-right " + (p.payment_type === "Refund" ? "text-[#DC2626]" : "")}>{inr(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <button onClick={copyWa} className="h-9 px-4 border border-line rounded-md text-[12.5px] hover:bg-off">Copy WhatsApp message</button>
      </div>
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-line rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={"text-[14px] mt-0.5 " + (accent ? "text-[#CA8A04] font-medium" : "")}>{value}</div>
    </div>
  );
}
