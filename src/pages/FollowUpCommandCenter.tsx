import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import QuickAddPaymentModal from "@/components/paid-pipeline/QuickAddPaymentModal";
import { inr, fmtDate, downloadCsv } from "@/lib/paidPipeline";
import { useNavigate } from "react-router-dom";

type FollowUp = {
  id: string;
  paid_pipeline_lead_id: string | null;
  follow_up_date: string;
  follow_up_time: string | null;
  follow_up_type: string | null;
  follow_up_reason: string | null;
  priority: string | null;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  source_module: string | null;
  related_payment_id: string | null;
  related_crm_lead_id: string | null;
  completed_at: string | null;
  created_at: string;
  // Synthetic / display-only metadata
  isSynthetic?: boolean;
  syntheticKind?: "payment_expected" | "crm_reminder";
  syntheticContext?: string;
  crmLeadName?: string | null;
  crmLeadPhone?: string | null;
  crmProgram?: string | null;
  crmPipelineId?: string | null;
  crmStageId?: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  paid_pipeline: "Paid Pipeline",
  payment_expected: "Payment Expected Date",
  finance: "Finance / EMI",
  crm: "Calling CRM",
  onboarding: "Onboarding",
  manual: "Manual Follow-Up",
};
const SOURCE_BADGE: Record<string, string> = {
  paid_pipeline: "bg-slate-50 border-slate-200 text-slate-700",
  payment_expected: "bg-amber-50 border-amber-200 text-amber-800",
  finance: "bg-violet-50 border-violet-200 text-violet-800",
  crm: "bg-blue-50 border-blue-200 text-blue-800",
  onboarding: "bg-emerald-50 border-emerald-200 text-emerald-800",
  manual: "bg-gray-50 border-gray-200 text-gray-700",
};

type Lead = {
  id: string; name: string | null; email: string | null; phone: string | null;
  product_name_snapshot: string | null; paid_batch_name: string | null;
  deal_value_including_gst: number; token_amount_collected: number;
  total_collected: number; balance_pending: number;
  revenue_to_be_realized: number | null;
  balance_category: string | null; balance_description: string | null;
  lead_temperature: string | null; pipeline_stage: string | null;
  assigned_sales_executive: string | null;
  next_follow_up_date: string | null; next_follow_up_time: string | null;
  finance_required: boolean; finance_partner: string | null; finance_status: string | null;
  finance_follow_up_date: string | null; finance_notes: string | null;
  follow_up_reason: string | null; follow_up_priority: string | null; follow_up_status: string | null;
  onboarding_batch_name: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT_TYPES = [
  "Payment Follow-Up","Token Follow-Up","Second Token Follow-Up","Balance Payment Follow-Up",
  "Finance / EMI Follow-Up","Document Follow-Up","Welcome Call","Onboarding Follow-Up",
  "CRM Callback","Parent Discussion","Re-Engagement","Custom",
];
const DEFAULT_REASONS = [
  "Collect Token","Collect Second Token","Collect Down Payment","Collect Balance Payment",
  "Payment Link Sent","Finance Documents Pending","Finance Approval Follow-Up",
  "Finance Disbursement Follow-Up","Bajaj Failed - Try Other Partner",
  "Welcome Call Pending","Onboarding Documents Pending","Access Pending",
  "Call Back Requested","Parent Approval Pending","Custom",
];
const PRIORITIES = ["Urgent","Hot","Warm","Normal","Cold","Low"];
const STATUSES = ["Pending","Done","Missed","Rescheduled","Cancelled"];

const WA_TEMPLATES: { label: string; body: string }[] = [
  { label: "Payment Follow-Up", body: "Hi {Name}, gentle reminder for your pending payment of ₹{BalanceAmount} for {Program}. Could you confirm by {FollowUpDate}?" },
  { label: "Token Reminder", body: "Hi {Name}, please confirm your token of ₹{TokenAmount} for {Program} so we can block your seat." },
  { label: "Second Token Reminder", body: "Hi {Name}, kindly share the second token to confirm enrolment in {Program}." },
  { label: "Balance Payment Reminder", body: "Hi {Name}, balance ₹{BalanceAmount} for {Program} is due. Payment link: {PaymentLink}" },
  { label: "Finance Documents Reminder", body: "Hi {Name}, please share the pending finance documents for {FinancePartner} so we can move ahead." },
  { label: "Finance Approval Follow-Up", body: "Hi {Name}, checking on {FinancePartner} approval status for {Program}." },
  { label: "Welcome Call Reminder", body: "Hi {Name}, welcome to {Program}! Sharing your welcome call time on {FollowUpDate} at {FollowUpTime}." },
  { label: "Onboarding Reminder", body: "Hi {Name}, your onboarding for {Program} is pending. Please complete it at the earliest." },
  { label: "Missed Call Follow-Up", body: "Hi {Name}, we tried reaching you regarding {Program}. Please share a good time to connect." },
];

export default function FollowUpCommandCenter() {
  const { user, isAdmin, hasModule } = useAuth();
  const nav = useNavigate();
  const allowed = isAdmin || hasModule("follow_up_command_center");

  const [fus, setFus] = useState<FollowUp[]>([]);
  const [leadMap, setLeadMap] = useState<Record<string, Lead>>({});
  const [loading, setLoading] = useState(true);

  const [quickPreset, setQuickPreset] = useState<string>("due_today");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusBulkOpen, setStatusBulkOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [waFor, setWaFor] = useState<FollowUp | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [financeFor, setFinanceFor] = useState<string | null>(null);

  const load = async () => {
    if (!allowed) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: fdata } = await (supabase as any)
        .from("paid_pipeline_followups")
        .select("*")
        .eq("is_deleted", false)
        .order("follow_up_date", { ascending: true });
      const list = (fdata as any as FollowUp[]) || [];
      setFus(list);

      // Pull all referenced leads (and add synthetic from paid pipeline with no FU)
      const ids = Array.from(new Set(list.map(f => f.paid_pipeline_lead_id).filter(Boolean))) as string[];
      let leadsArr: Lead[] = [];
      if (ids.length > 0) {
        const { data: ld } = await supabase
          .from("paid_pipeline_leads")
          .select("id,name,email,phone,product_name_snapshot,paid_batch_name,deal_value_including_gst,token_amount_collected,total_collected,balance_pending,revenue_to_be_realized,balance_category,balance_description,lead_temperature,pipeline_stage,assigned_sales_executive,next_follow_up_date,next_follow_up_time,finance_required,finance_partner,finance_status,finance_follow_up_date,finance_notes,follow_up_reason,follow_up_priority,follow_up_status,onboarding_batch_name")
          .in("id", ids);
        leadsArr = (ld as any as Lead[]) || [];
      }
      const map: Record<string, Lead> = {};
      leadsArr.forEach(l => { map[l.id] = l; });
      setLeadMap(map);
    } catch (e: any) {
      toast.error(e.message || "Failed to load follow-ups");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [allowed]);

  // Derive synthetic follow-ups from lead fields when no row exists
  const allFollowUps = useMemo(() => {
    return fus;
  }, [fus]);

  const ymd = today();

  // ---- Counts ----
  const counts = useMemo(() => {
    const isOpen = (s: string) => s !== "Done" && s !== "Cancelled";
    const due = allFollowUps.filter(f => isOpen(f.status) && f.follow_up_date === ymd).length;
    const overdue = allFollowUps.filter(f => isOpen(f.status) && f.follow_up_date < ymd).length;
    const hot = allFollowUps.filter(f => isOpen(f.status) && ["Hot","Urgent"].includes(f.priority || "")).length;
    const pay = allFollowUps.filter(f => isOpen(f.status) && (f.follow_up_type || "").toLowerCase().includes("payment")).length;
    const fin = allFollowUps.filter(f => isOpen(f.status) && ((f.follow_up_type || "").toLowerCase().includes("finance") || (f.follow_up_type || "").toLowerCase().includes("emi"))).length;
    const onb = allFollowUps.filter(f => isOpen(f.status) && ((f.follow_up_type || "").toLowerCase().includes("onboarding") || (f.follow_up_type || "").toLowerCase().includes("welcome"))).length;
    const missed = allFollowUps.filter(f => f.status === "Missed").length;

    // No Follow-Up Set: paid leads with balance pending and no next FU. Compute from leadMap (best-effort) + scan distinct.
    const leadsWithBalanceNoFu = Object.values(leadMap).filter(l => (l.balance_pending || 0) > 0 && !l.next_follow_up_date).length;
    return { due, overdue, hot, pay, fin, onb, missed, noFu: leadsWithBalanceNoFu };
  }, [allFollowUps, leadMap, ymd]);

  // ---- Filtering ----
  const filtered = useMemo(() => {
    const isOpen = (s: string) => s !== "Done" && s !== "Cancelled";
    return allFollowUps.filter(f => {
      // quick preset
      if (quickPreset === "due_today" && !(f.follow_up_date === ymd && isOpen(f.status))) return false;
      if (quickPreset === "overdue" && !(f.follow_up_date < ymd && isOpen(f.status))) return false;
      if (quickPreset === "upcoming" && !(f.follow_up_date > ymd && isOpen(f.status))) return false;
      if (quickPreset === "missed" && f.status !== "Missed") return false;
      if (quickPreset === "hot" && !(["Hot","Urgent"].includes(f.priority || "") && isOpen(f.status))) return false;
      if (quickPreset === "payment" && !((f.follow_up_type || "").toLowerCase().includes("payment") && isOpen(f.status))) return false;
      if (quickPreset === "finance" && !(((f.follow_up_type || "").toLowerCase().includes("finance") || (f.follow_up_type || "").toLowerCase().includes("emi")) && isOpen(f.status))) return false;
      if (quickPreset === "onboarding" && !(((f.follow_up_type || "").toLowerCase().includes("onboarding") || (f.follow_up_type || "").toLowerCase().includes("welcome")) && isOpen(f.status))) return false;

      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (typeFilter !== "all" && (f.follow_up_type || "") !== typeFilter) return false;
      if (priorityFilter !== "all" && (f.priority || "") !== priorityFilter) return false;
      if (ownerFilter !== "all" && (f.assigned_to || "") !== ownerFilter) return false;
      if (sourceFilter !== "all" && (f.source_module || "paid_pipeline") !== sourceFilter) return false;

      if (search) {
        const s = search.toLowerCase();
        const lead = f.paid_pipeline_lead_id ? leadMap[f.paid_pipeline_lead_id] : undefined;
        const hay = [
          lead?.name, lead?.email, lead?.phone, lead?.product_name_snapshot,
          f.follow_up_reason, f.follow_up_type, f.notes,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [allFollowUps, quickPreset, statusFilter, typeFilter, priorityFilter, ownerFilter, sourceFilter, search, leadMap, ymd]);

  const owners = useMemo(() => Array.from(new Set(allFollowUps.map(f => f.assigned_to).filter(Boolean) as string[])), [allFollowUps]);
  const types = useMemo(() => Array.from(new Set([...DEFAULT_TYPES, ...allFollowUps.map(f => f.follow_up_type || "").filter(Boolean)])), [allFollowUps]);

  // ---- Actions ----
  const toggleSelect = (id: string) => {
    const ns = new Set(selected);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setSelected(ns);
  };
  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(f => f.id)));
  };
  const requireSelection = () => {
    if (selected.size === 0) { toast("Please select at least one follow-up."); return false; }
    return true;
  };

  const markDone = async (ids: string[]) => {
    if (ids.length === 0) return;
    await supabase.from("paid_pipeline_followups")
      .update({ status: "Done", completed_at: new Date().toISOString(), completed_by: user?.id } as any)
      .in("id", ids);
    toast.success(`${ids.length} marked done`);
    setSelected(new Set());
    load();
  };

  const exportCsv = () => {
    const rows: any[][] = [[
      "Lead","Phone","Product","Paid Batch","Type","Reason","Amount Pending","Priority","Date","Time","Assigned To","Status","Source",
    ]];
    filtered.forEach(f => {
      const l = f.paid_pipeline_lead_id ? leadMap[f.paid_pipeline_lead_id] : undefined;
      rows.push([
        l?.name || "", l?.phone || "", l?.product_name_snapshot || "", l?.paid_batch_name || "",
        f.follow_up_type || "", f.follow_up_reason || "",
        l?.balance_pending ?? "", f.priority || "", f.follow_up_date,
        f.follow_up_time || "", f.assigned_to || "", f.status, f.source_module || "paid_pipeline",
      ]);
    });
    downloadCsv(`follow-ups-${ymd}.csv`, rows);
  };

  const copyWa = (tpl: string, f: FollowUp) => {
    const l = f.paid_pipeline_lead_id ? leadMap[f.paid_pipeline_lead_id] : undefined;
    const rep = (s: string, k: string, v: string) => s.split(k).join(v);
    let txt = tpl;
    txt = rep(txt, "{Name}", l?.name || "there");
    txt = rep(txt, "{Program}", l?.product_name_snapshot || "your program");
    txt = rep(txt, "{TokenAmount}", String(l?.token_amount_collected || ""));
    txt = rep(txt, "{BalanceAmount}", String(l?.balance_pending || ""));
    txt = rep(txt, "{FollowUpDate}", fmtDate(f.follow_up_date));
    txt = rep(txt, "{FollowUpTime}", f.follow_up_time || "");
    txt = rep(txt, "{FinancePartner}", l?.finance_partner || "the finance partner");
    txt = rep(txt, "{PaymentLink}", "");
    navigator.clipboard.writeText(txt);
    toast.success("WhatsApp message copied");
  };

  // ---- Red flags ----
  const redFlags = useMemo(() => {
    const isOpen = (s: string) => s !== "Done" && s !== "Cancelled";
    const leadsArr = Object.values(leadMap);
    return [
      { title: "Token paid but no follow-up date", count: leadsArr.filter(l => (l.token_amount_collected || 0) > 0 && (l.balance_pending || 0) > 0 && !l.next_follow_up_date).length },
      { title: "Balance pending but no owner assigned", count: leadsArr.filter(l => (l.balance_pending || 0) > 0 && !l.assigned_sales_executive).length },
      { title: "Hot/Urgent lead overdue", count: allFollowUps.filter(f => ["Hot","Urgent"].includes(f.priority || "") && isOpen(f.status) && f.follow_up_date < ymd).length },
      { title: "Finance pending overdue", count: allFollowUps.filter(f => isOpen(f.status) && f.follow_up_date < ymd && ((f.follow_up_type || "").toLowerCase().includes("finance") || (f.follow_up_type || "").toLowerCase().includes("emi"))).length },
      { title: "Missed follow-up not rescheduled", count: allFollowUps.filter(f => f.status === "Missed").length },
      { title: "Onboarding pending after payment", count: leadsArr.filter(l => l.pipeline_stage === "Full Payment Received" && !l.onboarding_batch_name).length },
    ];
  }, [leadMap, allFollowUps, ymd]);

  if (!allowed) {
    return (
      <div className="max-w-md mx-auto text-center mt-24">
        <div className="font-serif text-2xl mb-3">Access restricted</div>
        <p className="font-sans text-sm text-muted-foreground">You do not have access to Follow-Up Command Center.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-serif text-[26px] leading-tight">Follow-Up Command Center</div>
          <div className="text-[13px] text-muted-foreground mt-1 max-w-2xl">
            A daily action board for payment recovery, finance/EMI follow-ups, callbacks, onboarding tasks, and urgent lead actions.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="ipc-btn ipc-btn-ghost">Export CSV</button>
          <button onClick={() => setAddOpen(true)} className="ipc-btn ipc-btn-black">+ Add Follow-Up</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { k: "due_today", label: "Due Today", n: counts.due },
          { k: "overdue", label: "Overdue", n: counts.overdue },
          { k: "hot", label: "Hot/Urgent Pending", n: counts.hot },
          { k: "payment", label: "Payment Follow-Ups", n: counts.pay },
          { k: "finance", label: "Finance / EMI", n: counts.fin },
          { k: "onboarding", label: "Onboarding", n: counts.onb },
          { k: "no_fu", label: "No Follow-Up Set", n: counts.noFu },
          { k: "missed", label: "Missed", n: counts.missed },
        ].map(c => (
          <button
            key={c.k}
            onClick={() => setQuickPreset(c.k)}
            className={`text-left rounded-lg border p-4 transition ${quickPreset === c.k ? "border-black bg-off" : "border-line bg-white hover:border-[#bbb]"}`}
          >
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="font-serif text-[28px] mt-1">{c.n}</div>
          </button>
        ))}
      </div>

      {/* Quick filter chips */}
      <div className="flex flex-wrap gap-2">
        {[
          ["all","All"],["due_today","Due Today"],["overdue","Overdue"],["upcoming","Upcoming"],
          ["missed","Missed"],["hot","Hot/Urgent"],["payment","Payment"],["finance","Finance"],["onboarding","Onboarding"],
        ].map(([k,l]) => (
          <button key={k} onClick={() => setQuickPreset(k)}
            className={`px-3 py-1.5 rounded-full text-[12px] border ${quickPreset===k?"bg-black text-white border-black":"bg-white border-line hover:border-[#bbb]"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid md:grid-cols-6 gap-2">
        <input className="qsi-input" placeholder="Search name/email/phone" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="qsi-input" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map(s=> <option key={s}>{s}</option>)}
        </select>
        <select className="qsi-input" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {types.map(t=> <option key={t}>{t}</option>)}
        </select>
        <select className="qsi-input" value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}>
          <option value="all">All priorities</option>
          {PRIORITIES.map(p=> <option key={p}>{p}</option>)}
        </select>
        <select className="qsi-input" value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}>
          <option value="all">All owners</option>
          {owners.map(o=> <option key={o}>{o}</option>)}
        </select>
        <select className="qsi-input" value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}>
          <option value="all">All sources</option>
          <option value="paid_pipeline">Paid Pipeline</option>
          <option value="finance">Finance / EMI</option>
          <option value="crm">Calling CRM</option>
          <option value="onboarding">Onboarding</option>
        </select>
      </div>

      {/* Quick action bar */}
      <div className="flex flex-wrap gap-2 items-center border-t border-b border-line py-2">
        <div className="text-[12px] text-muted-foreground mr-2">{selected.size} selected</div>
        <button onClick={() => requireSelection() && markDone(Array.from(selected))} className="ipc-btn ipc-btn-ghost">Mark Done</button>
        <button onClick={() => requireSelection() && setRescheduleOpen(true)} className="ipc-btn ipc-btn-ghost">Reschedule</button>
        <button onClick={() => requireSelection() && setAssignOpen(true)} className="ipc-btn ipc-btn-ghost">Assign Owner</button>
        <button onClick={() => requireSelection() && setStatusBulkOpen(true)} className="ipc-btn ipc-btn-ghost">Update Status</button>
        <button onClick={exportCsv} className="ipc-btn ipc-btn-ghost ml-auto">Export CSV</button>
      </div>

      {/* Table */}
      <div className="border border-line rounded-lg overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-off text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-2 w-8"><input type="checkbox" checked={filtered.length>0 && selected.size===filtered.length} onChange={selectAll}/></th>
              <th className="p-2">Lead</th>
              <th className="p-2">Phone</th>
              <th className="p-2">Program</th>
              <th className="p-2">Type / Reason</th>
              <th className="p-2">Amount Pending</th>
              <th className="p-2">Priority</th>
              <th className="p-2">Date / Time</th>
              <th className="p-2">Assigned</th>
              <th className="p-2">Status</th>
              <th className="p-2">Source</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">No follow-ups match.</td></tr>}
            {filtered.map(f => {
              const l = f.paid_pipeline_lead_id ? leadMap[f.paid_pipeline_lead_id] : undefined;
              const overdue = f.status !== "Done" && f.status !== "Cancelled" && f.follow_up_date < ymd;
              return (
                <tr key={f.id} className="border-t border-line hover:bg-off/40">
                  <td className="p-2"><input type="checkbox" checked={selected.has(f.id)} onChange={()=>toggleSelect(f.id)}/></td>
                  <td className="p-2">
                    <div className="font-medium">{l?.name || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{l?.email || ""}</div>
                  </td>
                  <td className="p-2">{l?.phone || "—"}</td>
                  <td className="p-2">
                    <div>{l?.product_name_snapshot || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{l?.paid_batch_name || ""}</div>
                  </td>
                  <td className="p-2">
                    <div>{f.follow_up_type || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{f.follow_up_reason || ""}</div>
                  </td>
                  <td className="p-2">{l ? inr(l.balance_pending || 0) : "—"}</td>
                  <td className="p-2">
                    {f.priority ? <span className="px-2 py-0.5 rounded-full text-[11px] border border-line">{f.priority}</span> : "—"}
                  </td>
                  <td className="p-2">
                    <div className={overdue ? "text-red-600 font-medium" : ""}>{fmtDate(f.follow_up_date)}</div>
                    <div className="text-[11px] text-muted-foreground">{f.follow_up_time || ""}</div>
                  </td>
                  <td className="p-2">{f.assigned_to || "—"}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] border ${f.status==="Done"?"border-green-300 bg-green-50 text-green-700":f.status==="Missed"?"border-red-300 bg-red-50 text-red-700":"border-line"}`}>{f.status}</span>
                  </td>
                  <td className="p-2 text-[11px] text-muted-foreground">{f.source_module || "paid_pipeline"}</td>
                  <td className="p-2 whitespace-nowrap">
                    <button title="Mark done" onClick={()=>markDone([f.id])} className="text-[11px] underline mr-2">Done</button>
                    <button title="Add payment" onClick={()=>f.paid_pipeline_lead_id && setPayFor(f.paid_pipeline_lead_id)} className="text-[11px] underline mr-2">Pay</button>
                    <button title="Finance" onClick={()=>f.paid_pipeline_lead_id && setFinanceFor(f.paid_pipeline_lead_id)} className="text-[11px] underline mr-2">Finance</button>
                    <button title="Note" onClick={()=>setNoteFor(f.id)} className="text-[11px] underline mr-2">Note</button>
                    <button title="WhatsApp" onClick={()=>setWaFor(f)} className="text-[11px] underline mr-2">WA</button>
                    <button title="Open lead" onClick={()=>nav("/paid-pipeline")} className="text-[11px] underline">Open</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Red flags */}
      <div>
        <div className="font-serif text-[18px] mb-2">Follow-Up Red Flags</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {redFlags.map((r,i) => (
            <div key={i} className="rounded-lg border border-line p-4 bg-white">
              <div className="text-[12px] text-muted-foreground">{r.title}</div>
              <div className="font-serif text-[22px] mt-1">{r.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {addOpen && <AddFollowUpModal onClose={()=>setAddOpen(false)} onSaved={load} />}
      {rescheduleOpen && <BulkRescheduleModal ids={Array.from(selected)} onClose={()=>setRescheduleOpen(false)} onSaved={()=>{ setSelected(new Set()); load(); }} />}
      {assignOpen && <BulkAssignModal ids={Array.from(selected)} onClose={()=>setAssignOpen(false)} onSaved={()=>{ setSelected(new Set()); load(); }} />}
      {statusBulkOpen && <BulkStatusModal ids={Array.from(selected)} onClose={()=>setStatusBulkOpen(false)} onSaved={()=>{ setSelected(new Set()); load(); }} />}
      {noteFor && <AddNoteModal id={noteFor} onClose={()=>setNoteFor(null)} onSaved={load} />}
      {waFor && <WhatsAppModal fu={waFor} onCopy={copyWa} onClose={()=>setWaFor(null)} />}
      {payFor && <QuickAddPaymentModal leadId={payFor} onClose={()=>setPayFor(null)} onSaved={()=>{ setPayFor(null); load(); }} />}
      {financeFor && <FinanceQuickUpdateModal leadId={financeFor} lead={leadMap[financeFor]} onClose={()=>setFinanceFor(null)} onSaved={load} />}
    </div>
  );
}

/* ============================ Sub-Modals ============================ */

function AddFollowUpModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [leadSearch, setLeadSearch] = useState("");
  const [leadOptions, setLeadOptions] = useState<{id:string; name:string|null; phone:string|null}[]>([]);
  const [leadId, setLeadId] = useState<string>("");
  const [source, setSource] = useState("paid_pipeline");
  const [type, setType] = useState("Payment Follow-Up");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("11:00");
  const [priority, setPriority] = useState("Normal");
  const [assignee, setAssignee] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!leadSearch.trim()) { setLeadOptions([]); return; }
      const { data } = await supabase.from("paid_pipeline_leads")
        .select("id,name,phone,email").eq("is_deleted", false)
        .or(`name.ilike.%${leadSearch}%,phone.ilike.%${leadSearch}%,email.ilike.%${leadSearch}%`)
        .limit(10);
      setLeadOptions((data as any) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [leadSearch]);

  const save = async () => {
    if (!date) { toast.error("Date required"); return; }
    setBusy(true);
    try {
      await supabase.from("paid_pipeline_followups").insert({
        paid_pipeline_lead_id: leadId || null,
        follow_up_date: date, follow_up_time: time,
        follow_up_type: type, follow_up_reason: reason || null,
        priority, status: "Pending",
        assigned_to: assignee || null, notes: notes || null,
        source_module: source, created_by: user?.id,
      } as any);
      if (leadId) {
        await supabase.from("paid_pipeline_leads").update({
          next_follow_up_date: date, next_follow_up_time: time,
          follow_up_reason: reason || null, follow_up_priority: priority, follow_up_status: "Pending",
        } as any).eq("id", leadId);
      }
      toast.success("Follow-up created");
      onSaved(); onClose();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Shell title="Add follow-up" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="qsi-label">Select lead (search Paid Pipeline)</label>
          <input className="qsi-input" placeholder="Type name, phone or email" value={leadSearch} onChange={e=>setLeadSearch(e.target.value)} />
          {leadOptions.length > 0 && (
            <div className="border border-line rounded mt-1 max-h-40 overflow-y-auto">
              {leadOptions.map(o => (
                <div key={o.id} className={`p-2 cursor-pointer text-[13px] hover:bg-off ${leadId===o.id?"bg-off":""}`} onClick={()=>{ setLeadId(o.id); setLeadSearch(o.name || o.phone || ""); setLeadOptions([]); }}>
                  {o.name || "—"} <span className="text-muted-foreground">· {o.phone || ""}</span>
                </div>
              ))}
            </div>
          )}
          {leadId && <div className="text-[11px] text-muted-foreground mt-1">Linked to lead. Leave blank to create a generic follow-up.</div>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="qsi-label">Source module</label>
            <select className="qsi-input" value={source} onChange={e=>setSource(e.target.value)}>
              <option value="paid_pipeline">Paid Pipeline</option>
              <option value="finance">Finance / EMI</option>
              <option value="crm">Calling CRM</option>
              <option value="onboarding">Onboarding</option>
            </select>
          </div>
          <QuickSaveInput fieldKey="follow_up_type" label="Type" value={type} onChange={setType} placeholder="Payment Follow-Up" />
          <QuickSaveInput fieldKey="follow_up_reason" label="Reason" value={reason} onChange={setReason} placeholder="Collect Balance Payment" />
          <QuickSaveInput fieldKey="follow_up_priority" label="Priority" value={priority} onChange={setPriority} placeholder="Hot" />
          <div>
            <label className="qsi-label">Date</label>
            <input type="date" className="qsi-input" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div>
            <label className="qsi-label">Time</label>
            <input type="time" className="qsi-input" value={time} onChange={e=>setTime(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="qsi-label">Assigned to</label>
            <input className="qsi-input" value={assignee} onChange={e=>setAssignee(e.target.value)} placeholder="Owner name" />
          </div>
        </div>
        <div>
          <label className="qsi-label">Notes</label>
          <textarea className="qsi-input !h-auto py-2" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} />
        </div>
      </div>
      <Footer onClose={onClose} onSave={save} busy={busy} />
    </Shell>
  );
}

function BulkRescheduleModal({ ids, onClose, onSaved }: { ids: string[]; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("11:00");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await supabase.from("paid_pipeline_followups")
        .update({ follow_up_date: date, follow_up_time: time, follow_up_reason: reason || null, notes: notes || null, status: "Rescheduled" } as any)
        .in("id", ids);
      toast.success("Rescheduled");
      onSaved(); onClose();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Shell title={`Reschedule ${ids.length}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="qsi-label">New date</label><input type="date" className="qsi-input" value={date} onChange={e=>setDate(e.target.value)} /></div>
        <div><label className="qsi-label">New time</label><input type="time" className="qsi-input" value={time} onChange={e=>setTime(e.target.value)} /></div>
        <QuickSaveInput fieldKey="follow_up_reason" label="Reason" value={reason} onChange={setReason} />
        <div className="col-span-2"><label className="qsi-label">Notes</label><textarea className="qsi-input !h-auto py-2" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} /></div>
      </div>
      <Footer onClose={onClose} onSave={save} busy={busy} />
    </Shell>
  );
}

function BulkAssignModal({ ids, onClose, onSaved }: { ids: string[]; onClose: () => void; onSaved: () => void }) {
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await supabase.from("paid_pipeline_followups").update({ assigned_to: owner || null } as any).in("id", ids);
      toast.success("Assigned");
      onSaved(); onClose();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Shell title={`Assign owner (${ids.length})`} onClose={onClose}>
      <div><label className="qsi-label">Owner</label><input className="qsi-input" value={owner} onChange={e=>setOwner(e.target.value)} placeholder="Owner name" /></div>
      <Footer onClose={onClose} onSave={save} busy={busy} />
    </Shell>
  );
}

function BulkStatusModal({ ids, onClose, onSaved }: { ids: string[]; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState("Done");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const patch: any = { status };
      if (status === "Done") patch.completed_at = new Date().toISOString();
      await supabase.from("paid_pipeline_followups").update(patch).in("id", ids);
      toast.success("Status updated");
      onSaved(); onClose();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Shell title={`Update status (${ids.length})`} onClose={onClose}>
      <div>
        <label className="qsi-label">Status</label>
        <select className="qsi-input" value={status} onChange={e=>setStatus(e.target.value)}>{STATUSES.map(s=> <option key={s}>{s}</option>)}</select>
      </div>
      <Footer onClose={onClose} onSave={save} busy={busy} />
    </Shell>
  );
}

function AddNoteModal({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.from("paid_pipeline_followups").select("notes").eq("id", id).maybeSingle();
      const prev = (data as any)?.notes || "";
      const next = prev ? `${prev}\n— ${new Date().toLocaleString("en-IN")}: ${notes}` : notes;
      await supabase.from("paid_pipeline_followups").update({ notes: next } as any).eq("id", id);
      toast.success("Note added");
      onSaved(); onClose();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Shell title="Add note" onClose={onClose}>
      <textarea className="qsi-input !h-auto py-2" rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What happened on this follow-up?" />
      <Footer onClose={onClose} onSave={save} busy={busy} />
    </Shell>
  );
}

function WhatsAppModal({ fu, onCopy, onClose }: { fu: FollowUp; onCopy: (tpl: string, f: FollowUp) => void; onClose: () => void }) {
  return (
    <Shell title="Copy WhatsApp Message" onClose={onClose}>
      <div className="space-y-2">
        {WA_TEMPLATES.map(t => (
          <div key={t.label} className="border border-line rounded p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-[13px]">{t.label}</div>
              <button onClick={()=>{ onCopy(t.body, fu); }} className="ipc-btn ipc-btn-ghost">Copy</button>
            </div>
            <div className="text-[12px] text-muted-foreground mt-1 whitespace-pre-wrap">{t.body}</div>
          </div>
        ))}
      </div>
      <Footer onClose={onClose} hideSave />
    </Shell>
  );
}

function FinanceQuickUpdateModal({ leadId, lead, onClose, onSaved }: { leadId: string; lead?: Lead; onClose: () => void; onSaved: () => void }) {
  const [partner, setPartner] = useState(lead?.finance_partner || "");
  const [status, setStatus] = useState(lead?.finance_status || "");
  const [followUp, setFollowUp] = useState(lead?.finance_follow_up_date || "");
  const [notes, setNotes] = useState(lead?.finance_notes || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await supabase.from("paid_pipeline_leads").update({
        finance_partner: partner || null, finance_status: status || null,
        finance_follow_up_date: followUp || null, finance_notes: notes || null,
      } as any).eq("id", leadId);
      toast.success("Finance updated");
      onSaved(); onClose();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Shell title="Update finance status" onClose={onClose}>
      {lead && (
        <div className="text-[12px] text-muted-foreground mb-3 grid grid-cols-2 gap-1">
          <div>Loan req: {lead.finance_required ? "Yes" : "No"}</div>
          <div>Balance: {inr(lead.balance_pending || 0)}</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <QuickSaveInput fieldKey="finance_partner" label="Finance partner" value={partner} onChange={setPartner} />
        <QuickSaveInput fieldKey="finance_status" label="Status" value={status} onChange={setStatus} />
        <div><label className="qsi-label">Follow-up date</label><input type="date" className="qsi-input" value={followUp} onChange={e=>setFollowUp(e.target.value)} /></div>
        <div className="col-span-2"><label className="qsi-label">Notes</label><textarea className="qsi-input !h-auto py-2" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} /></div>
      </div>
      <Footer onClose={onClose} onSave={save} busy={busy} />
    </Shell>
  );
}

/* ---------- Shell + Footer ---------- */
function Shell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line sticky top-0 bg-white z-10"><div className="font-serif text-[20px]">{title}</div></div>
        <div className="p-6 space-y-3">{children}</div>
      </div>
    </div>
  );
}
function Footer({ onClose, onSave, busy, hideSave }: { onClose: () => void; onSave?: () => void; busy?: boolean; hideSave?: boolean }) {
  return (
    <div className="px-6 py-3 border-t border-line flex justify-end gap-2 sticky bottom-0 bg-white">
      <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Close</button>
      {!hideSave && <button onClick={onSave} disabled={busy} className="ipc-btn ipc-btn-black">{busy ? "Saving…" : "Save"}</button>}
    </div>
  );
}
