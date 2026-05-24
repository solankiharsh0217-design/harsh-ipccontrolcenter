import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import QuickAddPaymentModal from "@/components/paid-pipeline/QuickAddPaymentModal";
import QuickFollowUpModal from "@/components/paid-pipeline/QuickFollowUpModal";
import SendToCrmBulkModal from "@/components/paid-pipeline/SendToCrmBulkModal";
import NewPaidBatchModal from "@/components/paid-pipeline/NewPaidBatchModal";
import AddPaidStageModal from "@/components/paid-pipeline/AddPaidStageModal";
import PaidBatchesView from "@/components/paid-pipeline/PaidBatchesView";
import {
  inr, fmtDate, recomputePaidLead, downloadCsv,
  TEMPERATURES, TEMP_COLORS, FOLLOWUP_PRIORITIES,
} from "@/lib/paidPipeline";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import { logActivity, logPaidLeadDiff, logBulkPaidLeadDiff } from "@/lib/auditLog";
import AssignModal from "@/components/AssignModal";
import TagPicker from "@/components/TagPicker";
import FastFollowUpComposer from "@/components/FastFollowUpComposer";
import SuggestedNextActions from "@/components/SuggestedNextActions";
import { listAllTags, getTagsForLeads, pickTagColor, type Tag } from "@/lib/leadTags";

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
  revenue_to_be_realized: number | null;
  final_revenue_realized: number | null;
  payment_model: string | null;
  payment_status: string | null;
  pipeline_stage: string | null;
  finance_required: boolean;
  finance_partner: string | null;
  finance_status: string | null;
  finance_notes: string | null;
  finance_follow_up_date: string | null;
  attributed_media_buyer: string | null;
  follow_up_date: string | null;
  next_follow_up_date: string | null;
  next_follow_up_time: string | null;
  follow_up_reason: string | null;
  follow_up_priority: string | null;
  follow_up_status: string | null;
  lead_temperature: string | null;
  balance_category: string | null;
  balance_description: string | null;
  next_balance_follow_up_date: string | null;
  paid_batch_name: string | null;
  paid_batch_id: string | null;
  source_webinar_batch_id: string | null;
  onboarding_batch_name: string | null;
  sent_to_crm: boolean | null;
  is_final_sale: boolean; is_dropped: boolean; is_enrolled: boolean; is_refunded: boolean;
  assigned_sales_executive: string | null;
  source_webinar: string | null;
  revenue_recognition_rule: string | null;
  notes: string | null;
  created_at: string;
  crm_lead_id?: string | null;
};
type Batch = { id: string; batch_name: string; webinar_name: string; webinar_date: string | null };
type PaidBatch = { id: string; batch_name: string; batch_status: string };
type OnboardingOpt = { name: string };
type Payment = { id: string; payment_type: string; payment_category: string | null; amount: number; payment_date: string; payment_mode: string | null; is_token: boolean; is_final_payment: boolean; payment_description: string | null; notes: string | null; next_payment_expected_date: string | null };

const today = () => new Date().toISOString().slice(0, 10);

export default function PaidPipeline() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [paidBatches, setPaidBatches] = useState<PaidBatch[]>([]);
  const [onboardingBatches, setOnboardingBatches] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [view, setView] = useState<"leads"|"batches">("leads");
  const [showBatches, setShowBatches] = useState(false);
  const [tagFilter, setTagFilter] = useState("all");
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [leadTagsMap, setLeadTagsMap] = useState<Record<string, Tag[]>>({});
  const [batchFilter, setBatchFilter] = useState("all"); // source webinar batch
  const [paidBatchFilter, setPaidBatchFilter] = useState("all");
  const [onboardingBatchFilter, setOnboardingBatchFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [tempFilter, setTempFilter] = useState("all");
  const [financePartnerFilter, setFinancePartnerFilter] = useState("all");
  const [financeStatusFilter, setFinanceStatusFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const [revenueStatusFilter, setRevenueStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quickPayId, setQuickPayId] = useState<string | null>(null);
  const [quickFuId, setQuickFuId] = useState<string | null>(null);
  const [bulkSend, setBulkSend] = useState(false);
  const [bulkSendIdsOverride, setBulkSendIdsOverride] = useState<string[] | null>(null);
  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = async () => {
    const [{ data: l }, { data: b }, { data: pb }, { data: s }, elig] = await Promise.all([
      supabase.from("paid_pipeline_leads").select("*").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("webinar_batches").select("id, batch_name, webinar_name, webinar_date").eq("is_deleted", false).order("created_at", { ascending: false }),
      (supabase as any).from("paid_pipeline_batches").select("id, batch_name, batch_status").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("paid_pipeline_settings").select("label").eq("setting_type", "pipeline_stage").eq("is_active", true).eq("is_deleted", false).order("sort_order"),
      getEligibleAssignees("paid_pipeline"),
    ]);
    setLeads((l as any) || []);
    setBatches((b as any) || []);
    setPaidBatches((pb as any) || []);
    setStages(((s as any) || []).map((x: any) => x.label));
    setAgents(elig.map((a) => ({ id: a.id, full_name: a.full_name })) as any);
    const obSet = new Set<string>();
    ((l as any[]) || []).forEach(x => { if (x.onboarding_batch_name) obSet.add(x.onboarding_batch_name); });
    setOnboardingBatches(Array.from(obSet).sort());
  };
  useEffect(() => { load(); }, []);

  // Load tag catalog + per-lead tag map (batched)
  useEffect(() => {
    (async () => {
      const tags = await listAllTags().catch(() => [] as Tag[]);
      setAllTags(tags);
      const ids = leads.map((l) => l.id);
      const crmIds = leads.map((l) => l.crm_lead_id).filter(Boolean) as string[];
      if (ids.length === 0) { setLeadTagsMap({}); return; }
      const map = await getTagsForLeads({ paidLeadIds: ids, crmLeadIds: crmIds }).catch(() => ({}));
      // merge: a paid lead inherits tags assigned to its linked crm lead too
      const merged: Record<string, Tag[]> = {};
      leads.forEach((l) => {
        const a = (map as any)[l.id] || [];
        const b = l.crm_lead_id ? ((map as any)[l.crm_lead_id] || []) : [];
        const seen = new Set<string>();
        merged[l.id] = [...a, ...b].filter((t) => seen.has(t.id) ? false : (seen.add(t.id), true));
      });
      setLeadTagsMap(merged);
    })();
  }, [leads]);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (leadParam) { setOpenId(leadParam); setView("leads"); }
  }, [searchParams]);

  const resetFilters = () => {
    setSearch(""); setSearchInput("");
    setBatchFilter("all"); setPaidBatchFilter("all"); setOnboardingBatchFilter("all");
    setStageFilter("all"); setTempFilter("all");
    setFinancePartnerFilter("all"); setFinanceStatusFilter("all");
    setFollowUpFilter("all"); setRevenueStatusFilter("all");
    setTagFilter("all");
  };
  const anyFilterActive = !!search || [batchFilter, paidBatchFilter, onboardingBatchFilter, stageFilter, tempFilter, financePartnerFilter, financeStatusFilter, followUpFilter, revenueStatusFilter, tagFilter].some(v => v !== "all");



  const filtered = useMemo(() => {
    const td = today();
    return leads.filter(l => {
      if (batchFilter !== "all" && l.webinar_batch_id !== batchFilter && l.source_webinar_batch_id !== batchFilter) return false;
      if (paidBatchFilter !== "all" && l.paid_batch_id !== paidBatchFilter) return false;
      if (onboardingBatchFilter !== "all" && (l.onboarding_batch_name || "") !== onboardingBatchFilter) return false;
      if (stageFilter !== "all" && l.pipeline_stage !== stageFilter) return false;
      if (tempFilter !== "all" && (l.lead_temperature || "") !== tempFilter) return false;
      if (financePartnerFilter !== "all" && (l.finance_partner || "") !== financePartnerFilter) return false;
      if (financeStatusFilter !== "all" && (l.finance_status || "") !== financeStatusFilter) return false;
      const fu = l.next_follow_up_date || l.follow_up_date;
      if (followUpFilter === "today" && fu !== td) return false;
      if (followUpFilter === "overdue" && !(fu && fu < td)) return false;
      if (followUpFilter === "upcoming" && !(fu && fu > td)) return false;
      if (followUpFilter === "none" && fu) return false;
      if (followUpFilter === "urgent" && !(["Hot","Urgent"].includes(l.lead_temperature || "") || ["Hot","Urgent"].includes(l.follow_up_priority || ""))) return false;
      if (revenueStatusFilter !== "all") {
        const total = Number(l.total_collected || 0);
        const deal = Number(l.deal_value_including_gst || 0);
        const map: Record<string, boolean> = {
          "token": total > 0 && total <= Number(l.token_amount_collected || 0),
          "partial": total > 0 && total < deal,
          "full": deal > 0 && total >= deal,
          "finance_pending": l.finance_required && l.finance_status !== "Disbursed" && l.finance_status !== "Rejected",
          "finance_disbursed": l.finance_status === "Disbursed",
          "balance_pending": Number(l.balance_pending || 0) > 0,
          "dropped": l.is_dropped,
        };
        if (!map[revenueStatusFilter]) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!(`${l.name || ""} ${l.email || ""} ${l.phone || ""}`.toLowerCase().includes(q))) return false;
      }
      if (tagFilter !== "all" && !(leadTagsMap[l.id] || []).some((t) => t.id === tagFilter)) return false;
      return true;
    });
  }, [leads, batchFilter, paidBatchFilter, onboardingBatchFilter, stageFilter, tempFilter, financePartnerFilter, financeStatusFilter, followUpFilter, revenueStatusFilter, search, tagFilter, leadTagsMap]);

  const totals = useMemo(() => {
    const td = today();
    const t = {
      dealTotal: 0, collectedTotal: 0,
      realized: 0, toBeRealized: 0, token: 0, balance: 0,
      finalSales: 0, dropped: 0, financePending: 0, emiDisbursed: 0,
      hotPending: 0, dueToday: 0,
    };
    filtered.forEach(l => {
      t.dealTotal += Number(l.deal_value_including_gst || 0);
      t.collectedTotal += Number(l.total_collected || 0);
      t.realized += Number(l.final_revenue_realized || 0);
      t.toBeRealized += l.is_dropped ? 0 : Number(l.balance_pending || 0);
      t.token += Number(l.token_amount_collected || 0);
      t.balance += Number(l.balance_pending || 0);
      if (l.is_final_sale) t.finalSales++;
      if (l.is_dropped) t.dropped++;
      if (l.finance_required && l.finance_status !== "Disbursed" && l.finance_status !== "Rejected" && l.finance_status !== "Dropped") t.financePending++;
      if (l.finance_status === "Disbursed") t.emiDisbursed += Number(l.deal_value_including_gst || 0);
      if (["Hot","Urgent"].includes(l.lead_temperature || "") && Number(l.balance_pending || 0) > 0) t.hotPending++;
      const fu = l.next_follow_up_date || l.follow_up_date;
      if (fu === td) t.dueToday++;
    });
    return t;
  }, [filtered]);

  const allChecked = filtered.length > 0 && filtered.every(l => selected.has(l.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map(l => l.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const updateLead = async (id: string, patch: Partial<Lead>) => {
    const oldLead = leads.find(l => l.id === id) as any;
    await supabase.from("paid_pipeline_leads").update(patch as any).eq("id", id);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } as Lead : l));
    logPaidLeadDiff(oldLead, patch as any, { leadId: id, leadName: oldLead?.name });
  };

  const bulkUpdate = async (patch: Partial<Lead>) => {
    if (selected.size === 0) { toast.error("Select at least one lead"); return; }
    const ids = Array.from(selected);
    const oldSnapshots = leads.filter(l => selected.has(l.id)) as any[];
    await supabase.from("paid_pipeline_leads").update(patch as any).in("id", ids);
    toast.success(`Updated ${ids.length} lead(s)`);
    logBulkPaidLeadDiff(oldSnapshots, patch as any, { ids });
    setSelected(new Set());
    await load();
  };

  const exportSelectedCsv = () => {
    const rows: any[] = [["Name","Phone","Email","Batch","Product","Deal Value","Token Collected","Total Collected","Balance Pending","Revenue Realized","Revenue To Be Realized","Stage","Balance Category","Lead Temperature","Finance Partner","Finance Status","Follow-Up Date","Media Buyer","Assigned Owner"]];
    const target = selected.size > 0 ? filtered.filter(l => selected.has(l.id)) : filtered;
    for (const l of target) {
      const batch = batches.find(b => b.id === l.webinar_batch_id);
      const ag = agents.find(a => a.id === l.assigned_sales_executive);
      rows.push([
        l.name, l.phone, l.email, batch?.batch_name || l.source_webinar, l.product_name_snapshot,
        l.deal_value_including_gst, l.token_amount_collected, l.total_collected, l.balance_pending,
        l.final_revenue_realized || 0, l.revenue_to_be_realized ?? l.balance_pending,
        l.pipeline_stage, l.balance_category, l.lead_temperature, l.finance_partner, l.finance_status,
        l.next_follow_up_date || l.follow_up_date, l.attributed_media_buyer, ag?.full_name || "",
      ]);
    }
    downloadCsv(`paid-pipeline-${Date.now()}.csv`, rows);
    toast.success(`Exported ${target.length} row(s)`);
    logActivity({ module_key: "paid_pipeline", module_label: "Paid Pipeline", action_type: "report_exported", action_label: "Paid Pipeline exported", summary: `Exported ${target.length} paid pipeline row(s).`, metadata: { count: target.length } });
  };

  const softDeleteSelected = async () => {
    if (selected.size === 0) { toast.error("Select at least one lead"); return; }
    if (!confirm(`Soft-delete ${selected.size} lead(s)?`)) return;
    const ids = Array.from(selected);
    const snaps = leads.filter(l => selected.has(l.id));
    await supabase.from("paid_pipeline_leads").update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id } as any).in("id", ids);
    for (const s of snaps) {
      logActivity({ module_key: "paid_pipeline", module_label: "Paid Pipeline", action_type: "soft_deleted", action_label: "Lead soft-deleted", entity_type: "paid_pipeline_lead", entity_id: s.id, entity_label: s.name || undefined, severity: "warning", summary: `${s.name || "Lead"} soft-deleted.` });
    }
    setSelected(new Set());
    toast.success("Deleted");
    await load();
  };

  const openLead = leads.find(l => l.id === openId) || null;

  return (
    <div className="max-w-[1500px]">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-[28px] text-black">Paid Pipeline</h1>
          <p className="font-sans text-[13px] font-light text-muted-foreground mt-1 mb-3">
            Track token payments, balance recovery, finance/EMI, and final revenue realization.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setNewBatchOpen(true)} className="ipc-btn ipc-btn-ghost !h-9">+ New Paid Batch</button>
          <button onClick={() => setAddStageOpen(true)} className="ipc-btn ipc-btn-ghost !h-9">+ Add Stage</button>
          <button onClick={() => setShowBatches((v) => !v)} className="ipc-btn ipc-btn-ghost !h-9" title="Toggle batch summary">
            {showBatches ? "Hide" : "View"} Batch Summary
          </button>
        </div>
      </div>

      {showBatches && (
        <div className="mb-4 border border-line rounded-lg p-3 bg-off/40">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Paid batch summary</div>
            <button onClick={() => setShowBatches(false)} className="text-[11px] text-muted-foreground hover:text-black">Close</button>
          </div>
          <PaidBatchesView
            onOpenBatch={(id) => { setPaidBatchFilter(id); setShowBatches(false); }}
            onBulkSend={(ids) => { setBulkSendIdsOverride(ids); setBulkSend(true); }}
          />
        </div>
      )}

      {true && (<>



      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
        <SumCard label="Total Paid Leads" value={String(filtered.length)} accent="blue" />
        <SumCard label="Total Deal Value" value={inr(totals.dealTotal)} />
        <SumCard label="Token Collected" value={inr(totals.token)} />
        <SumCard label="Total Collected" value={inr(totals.collectedTotal)} accent="green" />
        <SumCard label="Balance Pending" value={inr(totals.balance)} accent="gold" />
        <SumCard label="Revenue Realized" value={inr(totals.realized)} accent="green" />
        <SumCard label="Revenue To Be Realized" value={inr(totals.toBeRealized)} />
        <SumCard label="Finance Pending" value={String(totals.financePending)} />
        <SumCard label="EMI / Finance Disbursed" value={inr(totals.emiDisbursed)} />
        <SumCard label="Final Sales" value={String(totals.finalSales)} />
        <SumCard label="Dropped After Token" value={String(totals.dropped)} />
        <SumCard label="Hot/Urgent Bal Pending" value={String(totals.hotPending)} accent="red" />
        <SumCard label="Follow-Ups Due Today" value={String(totals.dueToday)} accent="blue" />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-2">
        <input
          className="h-9 border border-line rounded-md px-3 text-[13px] col-span-2"
          placeholder="Search name, email, phone…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") setSearch(searchInput); }}
        />
        <FilterSelect value={batchFilter} onChange={setBatchFilter} label="All webinar batches" options={batches.map(b => ({ v: b.id, l: b.batch_name }))} />
        <FilterSelect value={paidBatchFilter} onChange={setPaidBatchFilter} label="All paid batches" options={paidBatches.map(b => ({ v: b.id, l: b.batch_name }))} />
        <FilterSelect value={onboardingBatchFilter} onChange={setOnboardingBatchFilter} label="All onboarding batches" options={onboardingBatches.map(o => ({ v: o, l: o }))} />
        <FilterSelect value={stageFilter} onChange={setStageFilter} label="All stages" options={stages.map(s => ({ v: s, l: s }))} />
        <FilterSelect value={tempFilter} onChange={setTempFilter} label="All priorities" options={TEMPERATURES.map(t => ({ v: t, l: t }))} />
        <FilterSelect value={financeStatusFilter} onChange={setFinanceStatusFilter} label="All finance status" options={["Not Required","Documents Pending","Application Submitted","Approved","Rejected","Disbursed"].map(t => ({ v: t, l: t }))} />
        <FilterSelect value={followUpFilter} onChange={setFollowUpFilter} label="All follow-ups" options={[
          { v: "today", l: "Due today" }, { v: "overdue", l: "Overdue" }, { v: "upcoming", l: "Upcoming" }, { v: "none", l: "No follow-up" }, { v: "urgent", l: "Hot/Urgent" },
        ]} />
        <FilterSelect value={revenueStatusFilter} onChange={setRevenueStatusFilter} label="All revenue status" options={[
          { v: "token", l: "Token only" }, { v: "partial", l: "Partially collected" }, { v: "full", l: "Fully collected" },
          { v: "finance_pending", l: "Finance pending" }, { v: "finance_disbursed", l: "Finance disbursed" },
          { v: "balance_pending", l: "Balance pending" }, { v: "dropped", l: "Dropped" },
        ]} />
        <FilterSelect value={tagFilter} onChange={setTagFilter} label="All tags" options={allTags.map(t => ({ v: t.id, l: t.name }))} />
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="text-[12.5px] text-muted-foreground">
          Showing <span className="font-medium text-black">{filtered.length}</span> of <span className="font-medium text-black">{leads.length}</span> paid leads
          {anyFilterActive && <span className="ml-2 text-[11px] uppercase tracking-wider text-[#2563EB]">Filters active</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSearch(searchInput)} className="ipc-btn ipc-btn-black !h-9">Search</button>
          <button onClick={resetFilters} className="ipc-btn ipc-btn-ghost !h-9">Reset Filters</button>
        </div>
      </div>


      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-line bg-off flex flex-wrap gap-2 items-center text-[12.5px]">
          <div className="font-medium">{selected.size} selected</div>
          <button onClick={() => setBulkSend(true)} className="ipc-btn ipc-btn-black !h-8">Send to CRM / Paid Onboarding</button>
          <BulkStageMenu onPick={(stage) => bulkUpdate({ pipeline_stage: stage } as any)} stages={stages} />
          <BulkTempMenu onPick={(t) => bulkUpdate({ lead_temperature: t } as any)} />
          <button onClick={() => setAssignOpen(true)} className="ipc-btn ipc-btn-ghost !h-8">Assign</button>
          <button onClick={exportSelectedCsv} className="ipc-btn ipc-btn-ghost !h-8">Export CSV</button>
          <button onClick={softDeleteSelected} className="ipc-btn ipc-btn-ghost !h-8 text-[#DC2626]">Delete</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-[12px] text-muted-foreground hover:text-black">Clear</button>
        </div>
      )}
      {selected.size === 0 && (
        <div className="mb-3 flex justify-end gap-2">
          <button onClick={() => setAssignOpen(true)} className="ipc-btn ipc-btn-ghost !h-8">Assign filtered</button>
          <button onClick={exportSelectedCsv} className="ipc-btn ipc-btn-ghost !h-8">Export filtered CSV</button>
        </div>
      )}

      <div className="border border-line rounded-lg overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-off">
            <tr className="text-left">
              <th className="px-3 py-2.5 w-8"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
              <th className="px-3 py-2.5">Buyer</th>
              <th className="px-3 py-2.5">Phone</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Batch / Product</th>
              <th className="px-3 py-2.5">Deal</th>
              <th className="px-3 py-2.5">Token</th>
              <th className="px-3 py-2.5">Collected</th>
              <th className="px-3 py-2.5">Balance</th>
              <th className="px-3 py-2.5">Stage</th>
              <th className="px-3 py-2.5">Lead Priority</th>
              <th className="px-3 py-2.5">Follow-up</th>
              <th className="px-3 py-2.5">Finance</th>
              <th className="px-3 py-2.5">Owner</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={15} className="px-3 py-10 text-center text-muted-foreground">
                <div>No paid leads match these filters.</div>
                <button onClick={resetFilters} className="ipc-btn ipc-btn-ghost !h-8 mt-3">Reset Filters</button>
              </td></tr>
            )}
            {filtered.map(l => {
              const batch = batches.find(b => b.id === l.webinar_batch_id);
              const fu = l.next_follow_up_date || l.follow_up_date;
              const td = today();
              const fuColor = fu === td ? "#CA8A04" : (fu && fu < td) ? "#DC2626" : (fu && fu > td) ? "#2563EB" : "#9CA3AF";
              return (
                <tr key={l.id} className="border-t border-line hover:bg-off/50">
                  <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} /></td>
                  <td className="px-3 py-2.5 cursor-pointer" onClick={() => setOpenId(l.id)}>
                    <div className="font-medium flex items-center gap-1">
                      {l.name || "—"}
                      {l.sent_to_crm && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]">CRM</span>}
                    </div>
                    {(leadTagsMap[l.id] || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(leadTagsMap[l.id] || []).slice(0, 2).map((tg) => {
                          const tc = tg.color || pickTagColor(tg.name);
                          return (
                            <span key={tg.id} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border" style={{ background: tc + "1A", color: tc, borderColor: tc + "55" }}>{tg.name}</span>
                          );
                        })}
                        {(leadTagsMap[l.id] || []).length > 2 && (
                          <span className="text-[9px] text-muted-foreground">+{(leadTagsMap[l.id] || []).length - 2}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px] whitespace-nowrap">{l.phone || "—"}</td>
                  <td className="px-3 py-2.5 text-[11.5px] max-w-[180px] truncate" title={l.email || ""}>{l.email || "—"}</td>
                  <td className="px-3 py-2.5 cursor-pointer" onClick={() => setOpenId(l.id)}>
                    <div>{batch?.batch_name || l.source_webinar || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{l.product_name_snapshot || "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{inr(l.deal_value_including_gst)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{inr(l.token_amount_collected)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{inr(l.total_collected)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[#CA8A04]">{inr(l.balance_pending)}</td>
                  <td className="px-3 py-2.5">
                    <select className="h-7 border border-line rounded px-1 text-[11px] max-w-[140px]"
                      value={l.pipeline_stage || ""}
                      onChange={async (e) => { await updateLead(l.id, { pipeline_stage: e.target.value }); recomputePaidLead(l.id); }}>
                      <option value="">—</option>
                      {stages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <select className="h-7 border border-line rounded px-1 text-[11px]"
                      style={{ color: TEMP_COLORS[l.lead_temperature || ""] || undefined }}
                      value={l.lead_temperature || ""}
                      onChange={(e) => updateLead(l.id, { lead_temperature: e.target.value })}>
                      <option value="">—</option>
                      {TEMPERATURES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px]" style={{ color: fuColor }}>
                    {fu ? fmtDate(fu) : "—"}
                    {l.follow_up_reason && <div className="text-[10px] text-muted-foreground">{l.follow_up_reason}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-[11px]">{l.finance_required ? `${l.finance_partner || "—"} · ${l.finance_status || "—"}` : "—"}</td>
                  <td className="px-3 py-2.5 text-[11.5px] max-w-[120px] truncate" title={agents.find(a => a.id === l.assigned_sales_executive)?.full_name || ""}>
                    {agents.find(a => a.id === l.assigned_sales_executive)?.full_name || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setQuickPayId(l.id)} className="text-[10.5px] px-1.5 py-1 rounded border border-line hover:bg-off" title="Add payment">+ ₹</button>
                      <button onClick={() => setQuickFuId(l.id)} className="text-[10.5px] px-1.5 py-1 rounded border border-line hover:bg-off" title="Set follow-up">Follow</button>
                      <button onClick={() => setOpenId(l.id)} className="text-[10.5px] px-1.5 py-1 rounded bg-black text-white">Open</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>)}

      {openLead && <LeadDrawer lead={openLead} agents={agents} onClose={() => { setOpenId(null); load(); }} stages={stages} onChanged={load} />}
      {quickPayId && <QuickAddPaymentModal leadId={quickPayId} leadName={leads.find(l => l.id === quickPayId)?.name || undefined} onClose={() => setQuickPayId(null)} onSaved={load} />}
      {quickFuId && <QuickFollowUpModal leadId={quickFuId} leadName={leads.find(l => l.id === quickFuId)?.name || undefined}
        crmLeadId={leads.find(l => l.id === quickFuId)?.crm_lead_id || null}
        defaults={{ priority: leads.find(l => l.id === quickFuId)?.lead_temperature || "Normal" }}
        onClose={() => setQuickFuId(null)} onSaved={load} />}
      {bulkSend && <SendToCrmBulkModal
        leadIds={bulkSendIdsOverride && bulkSendIdsOverride.length > 0 ? bulkSendIdsOverride : Array.from(selected)}
        leads={leads}
        paidBatches={paidBatches}
        onClose={() => { setBulkSend(false); setBulkSendIdsOverride(null); }}
        onDone={() => { setSelected(new Set()); setBulkSendIdsOverride(null); load(); }} />}
      {newBatchOpen && <NewPaidBatchModal onClose={() => setNewBatchOpen(false)} onCreated={() => load()} />}
      {addStageOpen && <AddPaidStageModal existingStages={stages} onClose={() => setAddStageOpen(false)} onCreated={() => load()} />}
      <AssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        moduleKey="paid_pipeline"
        moduleLabel="Paid Pipeline"
        ownerColumn="assigned_sales_executive"
        tableName="paid_pipeline_leads"
        eligibilityFlag="can_receive_paid_pipeline_leads"
        filteredLeads={filtered.map(l => ({ id: l.id, current_owner_id: l.assigned_sales_executive }))}
        selectedIds={Array.from(selected)}
        onAssigned={() => { setSelected(new Set()); load(); }}
      />
    </div>
  );
}

function SumCard({ label, value, accent }: { label: string; value: string; accent?: "green" | "gold" | "red" | "blue" }) {
  const bg = accent === "green" ? "bg-[#DCFCE7]" : accent === "gold" ? "bg-gold-pale" : accent === "red" ? "bg-[#FEE2E2]" : accent === "blue" ? "bg-[#DBEAFE]" : "bg-white";
  return (
    <div className={"border border-line rounded-lg px-3 py-2.5 " + bg}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="font-serif text-[19px] mt-0.5">{value}</div>
    </div>
  );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { v: string; l: string }[] }) {
  return (
    <select className="h-9 border border-line rounded-md px-2 text-[12.5px]" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">{label}</option>
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function BulkStageMenu({ onPick, stages }: { onPick: (s: string) => void; stages: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="ipc-btn ipc-btn-ghost !h-8">Update Stage ▾</button>
      {open && (
        <div className="absolute left-0 top-9 z-30 bg-white border border-line rounded-md shadow-md min-w-[200px] max-h-[300px] overflow-y-auto">
          {stages.map(s => (
            <button key={s} onClick={() => { onPick(s); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-off">{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkTempMenu({ onPick }: { onPick: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="ipc-btn ipc-btn-ghost !h-8">Update Temperature ▾</button>
      {open && (
        <div className="absolute left-0 top-9 z-30 bg-white border border-line rounded-md shadow-md min-w-[160px]">
          {TEMPERATURES.map(t => (
            <button key={t} onClick={() => { onPick(t); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-off" style={{ color: TEMP_COLORS[t] }}>{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadDrawer({ lead, onClose, stages, agents, onChanged }: { lead: Lead; onClose: () => void; stages: string[]; agents: { id: string; full_name: string }[]; onChanged: () => void }) {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [stage, setStage] = useState(lead.pipeline_stage || "");
  const [temperature, setTemperature] = useState(lead.lead_temperature || "");
  const [paidBatch, setPaidBatch] = useState(lead.paid_batch_name || "");
  const [onboardingBatch, setOnboardingBatch] = useState(lead.onboarding_batch_name || "");
  const [revRule, setRevRule] = useState(lead.revenue_recognition_rule || "Realized Revenue Only");
  const [balCat, setBalCat] = useState(lead.balance_category || "");
  const [balDesc, setBalDesc] = useState(lead.balance_description || "");
  const [balDate, setBalDate] = useState(lead.next_balance_follow_up_date || "");
  const [financePartner, setFinancePartner] = useState(lead.finance_partner || "");
  const [financeStatus, setFinanceStatus] = useState(lead.finance_status || "");
  const [financeNotes, setFinanceNotes] = useState(lead.finance_notes || "");
  const [financeFu, setFinanceFu] = useState(lead.finance_follow_up_date || "");
  const [openPay, setOpenPay] = useState(false);
  const [openFu, setOpenFu] = useState(false);

  const loadInner = async () => {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from("paid_pipeline_payments").select("*").eq("paid_pipeline_lead_id", lead.id).eq("is_deleted", false).order("payment_date", { ascending: false }),
      supabase.from("paid_pipeline_activity_logs").select("*").eq("paid_pipeline_lead_id", lead.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setPayments((p as any) || []);
    setActivity((a as any) || []);
  };
  useEffect(() => { loadInner(); }, [lead.id]);

  const save = async (patch: Partial<Lead>) => {
    await supabase.from("paid_pipeline_leads").update(patch as any).eq("id", lead.id);
  };
  const saveAll = async () => {
    const patch: any = {
      pipeline_stage: stage, lead_temperature: temperature, paid_batch_name: paidBatch,
      onboarding_batch_name: onboardingBatch, revenue_recognition_rule: revRule,
      balance_category: balCat, balance_description: balDesc, next_balance_follow_up_date: balDate || null,
      finance_partner: financePartner, finance_status: financeStatus, finance_notes: financeNotes,
      finance_follow_up_date: financeFu || null,
      finance_required: !!financePartner || lead.finance_required,
    };
    await save(patch);
    logPaidLeadDiff(lead as any, patch, { leadId: lead.id, leadName: lead.name || undefined });
    await recomputePaidLead(lead.id);
    toast.success("Saved");
    onChanged();
  };

  const deletePayment = async (id: string) => {
    if (!confirm("Delete this payment?")) return;
    const pay = payments.find((p: any) => p.id === id);
    await supabase.from("paid_pipeline_payments").update({ is_deleted: true } as any).eq("id", id);
    logActivity({
      module_key: "paid_pipeline", module_label: "Paid Pipeline",
      action_type: "payment_deleted", action_label: "Payment deleted",
      entity_type: "paid_pipeline_lead", entity_id: lead.id, entity_label: lead.name || undefined,
      old_values: pay ? { amount: pay.amount, type: pay.payment_type, category: pay.payment_category } : null,
      severity: "warning",
      summary: pay ? `Payment of ₹${Number(pay.amount).toLocaleString("en-IN")} (${pay.payment_category}) deleted for ${lead.name || "lead"}.` : "Payment deleted.",
    });
    await recomputePaidLead(lead.id);
    await loadInner();
    onChanged();
  };

  const waLink = (msg: string) => `https://wa.me/${(lead.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
  const tpls = [
    { label: "Token Received", msg: `Hi ${lead.name || ""}, we have received your token of ${inr(lead.token_amount_collected)} for ${lead.product_name_snapshot || "the program"}. Balance pending: ${inr(lead.balance_pending)}.` },
    { label: "Balance Reminder", msg: `Hi ${lead.name || ""}, gentle reminder: balance of ${inr(lead.balance_pending)} is pending for ${lead.product_name_snapshot || "your enrollment"}. Please complete the payment to confirm your seat.` },
    { label: "EMI Documents", msg: `Hi ${lead.name || ""}, please share the documents required for ${lead.finance_partner || "finance"} EMI processing so we can move forward.` },
    { label: "Welcome / Onboarding", msg: `Welcome to the ${lead.product_name_snapshot || "program"}, ${lead.name || ""}! Our onboarding team will reach out shortly with next steps.` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-[720px] bg-white overflow-y-auto pb-24">
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-line flex justify-between items-start">
          <div>
            <div className="font-serif text-[22px]">{lead.name || "Untitled"}</div>
            <div className="text-[12px] text-muted-foreground">{lead.email || "—"} · {lead.phone || "—"}</div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {lead.crm_lead_id && (
                <Link to={`/crm?lead=${lead.crm_lead_id}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-black text-white hover:opacity-90">
                  Open in Calling CRM
                </Link>
              )}
              <button onClick={() => setOpenFu(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] border border-line hover:bg-off">
                Set Follow-up
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-[20px] leading-none">×</button>
        </div>

        <div className="px-6 pt-4">
          <div className="rounded-lg border border-line bg-off/40 px-3 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Lead Tags</div>
            </div>
            <TagPicker
              paidLeadId={lead.id}
              crmLeadId={lead.crm_lead_id || null}
              leadName={lead.name || undefined}
            />
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Timeline & Follow-up */}
          <Section title="Timeline & Follow-up">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Created / Imported" value={lead.created_at ? fmtDate(lead.created_at) : "—"} />
              <Field label="Paid Batch" value={lead.paid_batch_name || "—"} />
              <Field label="Onboarding Batch" value={lead.onboarding_batch_name || "—"} />
              <Field label="Last Payment Date" value={payments[0]?.payment_date ? fmtDate(payments[0].payment_date) : "—"} />
              <Field label="Last Contacted" value={activity[0]?.created_at ? fmtDate(activity[0].created_at) : "—"} />
              <Field label="Next Follow-up Date" value={lead.next_follow_up_date ? fmtDate(lead.next_follow_up_date) : "—"} />
              <Field label="Next Follow-up Time" value={lead.next_follow_up_time ? String(lead.next_follow_up_time).slice(0,5) : "—"} />
              <Field label="Follow-up Type" value={lead.follow_up_reason || "—"} />
              <Field label="Assigned Owner" value={agents.find(a => a.id === lead.assigned_sales_executive)?.full_name || "—"} />
            </div>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Fast Follow-up</div>
              <FastFollowUpComposer
                paidLeadId={lead.id}
                crmLeadId={lead.crm_lead_id || null}
                leadName={lead.name || undefined}
                defaultPriority={temperature || "Normal"}
                onSaved={() => { loadInner(); onChanged(); }}
              />
            </div>
          </Section>

          {/* Payment Summary */}
          <Section title="Payment summary">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Deal value" value={inr(lead.deal_value_including_gst)} />
              <Field label="Token collected" value={inr(lead.token_amount_collected)} />
              <Field label="Total collected" value={inr(lead.total_collected)} />
              <Field label="Balance pending" value={inr(lead.balance_pending)} accent />
              <Field label="Realized revenue" value={inr(lead.final_revenue_realized || 0)} />
              <Field label="To be realized" value={inr(lead.revenue_to_be_realized ?? lead.balance_pending)} />
            </div>
          </Section>

          {/* Quick Status */}
          <Section title="Quick status">
            <div className="grid grid-cols-2 gap-3">
              <QuickSaveInput fieldKey="paid_pipeline_stage" label="Pipeline stage" value={stage} onChange={setStage} placeholder="Token Paid" />
              <QuickSaveInput fieldKey="lead_temperature" label="Lead temperature" value={temperature} onChange={setTemperature} placeholder="Hot" />
              <QuickSaveInput fieldKey="paid_batch_name" label="Paid batch" value={paidBatch} onChange={setPaidBatch} placeholder="Diamond Token Buyers - May" />
              <QuickSaveInput fieldKey="onboarding_batch_name" label="Onboarding batch" value={onboardingBatch} onChange={setOnboardingBatch} placeholder="Diamond May 2026 Batch 1" />
              <QuickSaveInput fieldKey="revenue_recognition_rule" label="Revenue recognition rule" value={revRule} onChange={setRevRule} placeholder="Realized Revenue Only" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setOpenPay(true)} className="ipc-btn ipc-btn-black !h-9">+ Add payment</button>
              <button onClick={() => setOpenFu(true)} className="ipc-btn ipc-btn-ghost !h-9">Set follow-up</button>
            </div>
          </Section>

          {/* Balance */}
          <Section title="Balance tracking">
            <div className="grid grid-cols-2 gap-3">
              <QuickSaveInput fieldKey="balance_category" label="Balance category" value={balCat} onChange={setBalCat} placeholder="Second Token Pending" />
              <div>
                <label className="qsi-label">Next balance follow-up</label>
                <input type="date" className="qsi-input" value={balDate} onChange={(e) => setBalDate(e.target.value)} />
              </div>
            </div>
            <div className="mt-2">
              <label className="qsi-label">Balance description</label>
              <textarea className="qsi-input !h-auto py-2" rows={2} value={balDesc} onChange={(e) => setBalDesc(e.target.value)} placeholder="e.g. Student paid ₹1,000. Promised ₹6,000 by tomorrow evening." />
            </div>
          </Section>

          {/* Finance */}
          <Section title="Finance / EMI">
            <div className="grid grid-cols-2 gap-3">
              <QuickSaveInput fieldKey="finance_partner" label="Finance partner" value={financePartner} onChange={setFinancePartner} placeholder="Bajaj Finance" />
              <QuickSaveInput fieldKey="finance_status" label="Finance status" value={financeStatus} onChange={setFinanceStatus} placeholder="Documents Pending" />
              <div>
                <label className="qsi-label">Finance follow-up</label>
                <input type="date" className="qsi-input" value={financeFu} onChange={(e) => setFinanceFu(e.target.value)} />
              </div>
            </div>
            <div className="mt-2">
              <label className="qsi-label">Finance notes</label>
              <textarea className="qsi-input !h-auto py-2" rows={2} value={financeNotes} onChange={(e) => setFinanceNotes(e.target.value)} placeholder="e.g. Bajaj failed — trying EZMI." />
            </div>
          </Section>

          {/* Payment history */}
          <Section title={`Payment history (${payments.length})`}>
            {payments.length === 0 ? (
              <div className="text-[12px] text-muted-foreground">No payments yet. Click "+ Add payment" above.</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Date</th><th>Category / Type</th><th>Mode</th><th>Description</th><th className="text-right">Amount</th><th></th></tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-t border-line align-top">
                      <td className="py-1.5 whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                      <td>{p.payment_category || p.payment_type}<div className="text-[10px] text-muted-foreground">{p.payment_type}</div></td>
                      <td>{p.payment_mode || "—"}</td>
                      <td className="text-[11px]">{p.payment_description || p.notes || "—"}{p.next_payment_expected_date && <div className="text-[10px] text-muted-foreground">Next: {fmtDate(p.next_payment_expected_date)}</div>}</td>
                      <td className={"text-right whitespace-nowrap " + (p.payment_type === "Refund" ? "text-[#DC2626]" : "")}>{inr(p.amount)}</td>
                      <td className="text-right"><button onClick={() => deletePayment(p.id)} className="text-[10px] text-muted-foreground hover:text-[#DC2626]">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Activity */}
          <Section title="Activity">
            {activity.length === 0 ? (
              <div className="text-[12px] text-muted-foreground">No activity yet.</div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {activity.map(a => (
                  <div key={a.id} className="text-[11.5px] border-l-2 border-line pl-2">
                    <div className="text-muted-foreground text-[10px]">{new Date(a.created_at).toLocaleString()} · {a.activity_type}</div>
                    <div>{a.note}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* WhatsApp templates */}
          <Section title="WhatsApp templates">
            <div className="grid grid-cols-2 gap-2">
              {tpls.map(t => (
                <a key={t.label} href={waLink(t.msg)} target="_blank" rel="noreferrer" className="border border-line rounded-md px-3 py-2 text-[12px] hover:bg-off">
                  <div className="font-medium">{t.label}</div>
                  <div className="text-[10.5px] text-muted-foreground line-clamp-2 mt-0.5">{t.msg}</div>
                </a>
              ))}
            </div>
          </Section>
        </div>

        {/* Sticky footer */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-line px-6 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Close</button>
          <button onClick={saveAll} className="ipc-btn ipc-btn-black">Save</button>
        </div>
      </div>

      {openPay && <QuickAddPaymentModal leadId={lead.id} leadName={lead.name || undefined} onClose={() => setOpenPay(false)} onSaved={() => { loadInner(); onChanged(); }} />}
      {openFu && <QuickFollowUpModal leadId={lead.id} leadName={lead.name || undefined} crmLeadId={lead.crm_lead_id || null} defaults={{ priority: temperature || "Normal" }} onClose={() => setOpenFu(false)} onSaved={() => { loadInner(); onChanged(); }} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-2">{title}</div>
      <div className="border border-line rounded-md p-3">{children}</div>
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={"border border-line rounded-md px-3 py-2 " + (accent ? "bg-gold-pale" : "")}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="font-serif text-[16px] mt-0.5">{value}</div>
    </div>
  );
}
