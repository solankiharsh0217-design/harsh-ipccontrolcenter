import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import QuickAddPaymentModal from "@/components/paid-pipeline/QuickAddPaymentModal";
import QuickFollowUpModal from "@/components/paid-pipeline/QuickFollowUpModal";
import QuickFinanceModal from "@/components/paid-pipeline/QuickFinanceModal";
import InlineManagedSelect from "@/components/paid-pipeline/InlineManagedSelect";
import SendToCrmBulkModal from "@/components/paid-pipeline/SendToCrmBulkModal";
import NewPaidBatchModal from "@/components/paid-pipeline/NewPaidBatchModal";
import AddPaidStageModal from "@/components/paid-pipeline/AddPaidStageModal";
import PaidBatchesView from "@/components/paid-pipeline/PaidBatchesView";
import {
  inr, fmtDate, recomputePaidLead, downloadCsv,
  TEMPERATURES, TEMP_COLORS, FOLLOWUP_PRIORITIES, DEFAULT_FINANCE_PARTNERS,
} from "@/lib/paidPipeline";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import { logActivity, logPaidLeadDiff, logBulkPaidLeadDiff } from "@/lib/auditLog";
import AssignModal from "@/components/AssignModal";
import TagPicker from "@/components/TagPicker";
import FastFollowUpComposer from "@/components/FastFollowUpComposer";
import SuggestedNextActions from "@/components/SuggestedNextActions";
import { listAllTags, getTagsForLeads, pickTagColor, type Tag } from "@/lib/leadTags";
import { archivePaidBuyer, restorePaidBuyer } from "@/lib/crmArchive";
import { ArchiveConfirmModal } from "@/components/crm/ArchiveConfirmModal";
import { stageChip } from "@/lib/stageColors";
import { getActiveHandoffRules, findRuleForStage, isRuleAutoReady, applyAutoHandoff } from "@/lib/operationsCrm";
import CrmStagePicker, { type CrmStagePickerStage } from "@/components/crm/CrmStagePicker";

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
  finance_amount_approved: number | null;
  finance_amount_disbursed: number | null;
  finance_disbursement_date: string | null;
  finance_count_as_collected: boolean | null;
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
  const [quickFinanceId, setQuickFinanceId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string | null } | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [bulkSend, setBulkSend] = useState(false);
  const [bulkSendIdsOverride, setBulkSendIdsOverride] = useState<string[] | null>(null);
  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [insightFilter, setInsightFilter] = useState<string | null>(null);
  const [showMoreMetrics, setShowMoreMetrics] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const HIGH_BAL_THRESHOLD = 50000;

  const load = async () => {
    const archivedFilter = (q: any) => showArchived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    const [{ data: l }, { data: b }, { data: pb }, { data: s }, elig] = await Promise.all([
      archivedFilter(supabase.from("paid_pipeline_leads").select("*").eq("is_deleted", false)).order("created_at", { ascending: false }),
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
  useEffect(() => { load(); }, [showArchived]);

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
    setTagFilter("all"); setOwnerFilter("all"); setInsightFilter(null);
  };
  const anyFilterActive = !!search || !!insightFilter || [batchFilter, paidBatchFilter, onboardingBatchFilter, stageFilter, tempFilter, financePartnerFilter, financeStatusFilter, followUpFilter, revenueStatusFilter, tagFilter, ownerFilter].some(v => v !== "all");

  const financePartnerOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_FINANCE_PARTNERS);
    leads.forEach(l => { if (l.finance_partner) set.add(l.finance_partner); });
    return Array.from(set);
  }, [leads]);

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
      if (ownerFilter !== "all") {
        if (ownerFilter === "unassigned" ? !!l.assigned_sales_executive : l.assigned_sales_executive !== ownerFilter) return false;
      }
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
      if (insightFilter) {
        const bal = Number(l.balance_pending || 0);
        const fu2 = l.next_follow_up_date || l.follow_up_date;
        if (insightFilter === "high_balance" && !(bal >= HIGH_BAL_THRESHOLD)) return false;
        if (insightFilter === "approved_not_disbursed" && !(l.finance_status === "Approved" && Number(l.finance_amount_disbursed || 0) <= 0)) return false;
        if (insightFilter === "no_followup" && fu2) return false;
        if (insightFilter === "urgent_balance" && !(["Hot","Urgent"].includes(l.lead_temperature || "") && bal > 0)) return false;
        if (insightFilter === "token_no_second") {
          const total = Number(l.total_collected || 0);
          const tok = Number(l.token_amount_collected || 0);
          if (!(tok > 0 && total <= tok && bal > 0)) return false;
        }
      }
      if (search) {
        const q = search.toLowerCase();
        if (!(`${l.name || ""} ${l.email || ""} ${l.phone || ""}`.toLowerCase().includes(q))) return false;
      }
      if (tagFilter !== "all" && !(leadTagsMap[l.id] || []).some((t) => t.id === tagFilter)) return false;
      return true;
    });
  }, [leads, batchFilter, paidBatchFilter, onboardingBatchFilter, stageFilter, tempFilter, financePartnerFilter, financeStatusFilter, ownerFilter, followUpFilter, revenueStatusFilter, search, tagFilter, leadTagsMap, insightFilter]);

  const insights = useMemo(() => {
    let highBalCount = 0, highBalAmt = 0;
    let approvedNotDisbCount = 0, approvedNotDisbAmt = 0;
    let noFu = 0;
    let urgentBalCount = 0, urgentBalAmt = 0;
    let tokenNoSecond = 0;
    leads.forEach(l => {
      const bal = Number(l.balance_pending || 0);
      const fu = l.next_follow_up_date || l.follow_up_date;
      if (bal >= HIGH_BAL_THRESHOLD) { highBalCount++; highBalAmt += bal; }
      if (l.finance_status === "Approved" && Number(l.finance_amount_disbursed || 0) <= 0) {
        approvedNotDisbCount++; approvedNotDisbAmt += Number(l.finance_amount_approved || 0);
      }
      if (!fu && !l.is_dropped) noFu++;
      if (["Hot","Urgent"].includes(l.lead_temperature || "") && bal > 0) { urgentBalCount++; urgentBalAmt += bal; }
      const total = Number(l.total_collected || 0);
      const tok = Number(l.token_amount_collected || 0);
      if (tok > 0 && total <= tok && bal > 0) tokenNoSecond++;
    });
    return { highBalCount, highBalAmt, approvedNotDisbCount, approvedNotDisbAmt, noFu, urgentBalCount, urgentBalAmt, tokenNoSecond };
  }, [leads]);

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
          <div className="w-px h-6 bg-line mx-1" aria-hidden />
          <Link
            to="/crm?pipeline=paid_onboarding"
            className="ipc-btn !h-9 bg-gold text-black hover:opacity-90 shadow-sm font-medium inline-flex"
            title="Open Paid Onboarding in Calling CRM"
          >
            Open Paid Onboarding CRM
          </Link>
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



      {/* Primary metric strip (5 cards) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
        <SumCard label="Total Paid Leads" value={String(filtered.length)} accent="blue" />
        <SumCard label="Total Collected" value={inr(totals.collectedTotal)} accent="green" />
        <SumCard label="Balance Pending" value={inr(totals.balance)} accent="gold" />
        <SumCard label="Revenue To Be Realized" value={inr(totals.toBeRealized)} />
        <SumCard label="Follow-Ups Due Today" value={String(totals.dueToday)} accent="blue" />
      </div>

      <div className="mb-4">
        <button
          onClick={() => setShowMoreMetrics(v => !v)}
          className="text-[11.5px] text-muted-foreground hover:text-black inline-flex items-center gap-1"
        >
          {showMoreMetrics ? "▾" : "▸"} {showMoreMetrics ? "Hide" : "More"} revenue metrics
        </button>
        {showMoreMetrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 mt-2">
            <SumCard label="Total Deal Value" value={inr(totals.dealTotal)} />
            <SumCard label="Token Collected" value={inr(totals.token)} />
            <SumCard label="Revenue Realized" value={inr(totals.realized)} accent="green" />
            <SumCard label="Finance Pending" value={String(totals.financePending)} />
            <SumCard label="EMI / Finance Disbursed" value={inr(totals.emiDisbursed)} />
            <SumCard label="Final Sales" value={String(totals.finalSales)} />
            <SumCard label="Dropped After Token" value={String(totals.dropped)} />
            <SumCard label="Hot/Urgent Bal Pending" value={String(totals.hotPending)} accent="red" />
          </div>
        )}
      </div>

      {/* Operational insight chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <InsightChip
          label={`${insights.highBalCount} · High balance (${inr(insights.highBalAmt)})`}
          active={insightFilter === "high_balance"}
          onClick={() => setInsightFilter(insightFilter === "high_balance" ? null : "high_balance")}
          accent="gold"
        />
        <InsightChip
          label={`${insights.approvedNotDisbCount} · Approved · not disbursed`}
          active={insightFilter === "approved_not_disbursed"}
          onClick={() => setInsightFilter(insightFilter === "approved_not_disbursed" ? null : "approved_not_disbursed")}
          accent="blue"
        />
        <InsightChip
          label={`${insights.noFu} · No follow-up`}
          active={insightFilter === "no_followup"}
          onClick={() => setInsightFilter(insightFilter === "no_followup" ? null : "no_followup")}
          accent="muted"
        />
        <InsightChip
          label={`${insights.urgentBalCount} · Urgent balance`}
          active={insightFilter === "urgent_balance"}
          onClick={() => setInsightFilter(insightFilter === "urgent_balance" ? null : "urgent_balance")}
          accent="red"
        />
        <InsightChip
          label={`${insights.tokenNoSecond} · Token only`}
          active={insightFilter === "token_no_second"}
          onClick={() => setInsightFilter(insightFilter === "token_no_second" ? null : "token_no_second")}
          accent="gold"
        />
      </div>

      {/* Filters — compact: 2 rows, more behind popover */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
        <input
          className="h-9 border border-line rounded-md px-3 text-[13px] col-span-2"
          placeholder="Search name, email, phone…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") setSearch(searchInput); }}
        />
        <FilterSelect value={stageFilter} onChange={setStageFilter} label="All stages" options={stages.map(s => ({ v: s, l: s }))} />
        <FilterSelect value={tempFilter} onChange={setTempFilter} label="All priorities" options={TEMPERATURES.map(t => ({ v: t, l: t }))} />
        <FilterSelect value={ownerFilter} onChange={setOwnerFilter} label="All owners" options={[{ v: "unassigned", l: "— Unassigned —" }, ...agents.map(a => ({ v: a.id, l: a.full_name }))]} />
        <FilterSelect value={financeStatusFilter} onChange={setFinanceStatusFilter} label="All finance status" options={["Not Required","Documents Pending","Documents Received","Application Submitted","Approved","Rejected","Disbursed","Alternate Partner Needed"].map(t => ({ v: t, l: t }))} />
        <FilterSelect value={tagFilter} onChange={setTagFilter} label="All tags" options={allTags.map(t => ({ v: t.id, l: t.name }))} />
        <FilterSelect value={followUpFilter} onChange={setFollowUpFilter} label="All follow-ups" options={[
          { v: "today", l: "Due today" }, { v: "overdue", l: "Overdue" }, { v: "upcoming", l: "Upcoming" }, { v: "none", l: "No follow-up" }, { v: "urgent", l: "Hot/Urgent" },
        ]} />
        <button
          onClick={() => setShowMoreFilters(v => !v)}
          className="h-9 border border-line rounded-md px-3 text-[12.5px] hover:bg-off text-left"
        >{showMoreFilters ? "▾" : "▸"} More filters</button>
      </div>
      {showMoreFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2 p-2 border border-line rounded-md bg-off/30">
          <FilterSelect value={batchFilter} onChange={setBatchFilter} label="All webinar batches" options={batches.map(b => ({ v: b.id, l: b.batch_name }))} />
          <FilterSelect value={paidBatchFilter} onChange={setPaidBatchFilter} label="All paid batches" options={paidBatches.map(b => ({ v: b.id, l: b.batch_name }))} />
          <FilterSelect value={onboardingBatchFilter} onChange={setOnboardingBatchFilter} label="All onboarding batches" options={onboardingBatches.map(o => ({ v: o, l: o }))} />
          <FilterSelect value={financePartnerFilter} onChange={setFinancePartnerFilter} label="All finance partners" options={financePartnerOptions.map(p => ({ v: p, l: p }))} />
          <FilterSelect value={revenueStatusFilter} onChange={setRevenueStatusFilter} label="All revenue status" options={[
            { v: "token", l: "Token only" }, { v: "partial", l: "Partially collected" }, { v: "full", l: "Fully collected" },
            { v: "finance_pending", l: "Finance pending" }, { v: "finance_disbursed", l: "Finance disbursed" },
            { v: "balance_pending", l: "Balance pending" }, { v: "dropped", l: "Dropped" },
          ]} />
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="text-[12.5px] text-muted-foreground">
          Showing <span className="font-medium text-black">{filtered.length}</span> of <span className="font-medium text-black">{leads.length}</span> paid leads
          {anyFilterActive && <span className="ml-2 text-[11px] uppercase tracking-wider text-[#2563EB]">Filters active</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`ipc-btn !h-9 !text-xs ${showArchived ? "!bg-[#FEF3C7] !text-[#92400E] border border-[#FDE68A]" : "ipc-btn-ghost"}`}
            title={showArchived ? "Viewing archived buyers" : "Show archived buyers"}
          >{showArchived ? "Showing archived" : "Show archived"}</button>
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
              <th className="px-3 py-2.5 sticky right-0 bg-off text-right">Actions</th>
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
                    <InlineManagedSelect
                      settingType="pipeline_stage"
                      value={l.pipeline_stage || ""}
                      onChange={async (v) => { await updateLead(l.id, { pipeline_stage: v }); recomputePaidLead(l.id); }}
                      width={150}
                      onListChanged={load}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <InlineManagedSelect
                      settingType="lead_priority"
                      value={l.lead_temperature || ""}
                      onChange={(v) => updateLead(l.id, { lead_temperature: v })}
                      width={130}
                      colorize
                      onListChanged={load}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px]" style={{ color: fuColor }}>
                    {fu ? fmtDate(fu) : "—"}
                    {l.follow_up_reason && <div className="text-[10px] text-muted-foreground">{l.follow_up_reason}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <FinanceCell lead={l} onClick={() => setQuickFinanceId(l.id)} />
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px] max-w-[120px] truncate" title={agents.find(a => a.id === l.assigned_sales_executive)?.full_name || ""}>
                    {agents.find(a => a.id === l.assigned_sales_executive)?.full_name || "—"}
                  </td>
                  <td className="px-3 py-2.5 sticky right-0 bg-white">
                    <div className="flex items-center justify-end">
                      <RowActionsMenu
                        archived={!!(l as any).archived_at}
                        onAddPayment={() => setQuickPayId(l.id)}
                        onUpdateFinance={() => setQuickFinanceId(l.id)}
                        onSetFollowUp={() => setQuickFuId(l.id)}
                        onOpen={() => setOpenId(l.id)}
                        onArchive={() => setArchiveTarget({ id: l.id, name: l.name })}
                        onRestore={async () => {
                          try {
                            await restorePaidBuyer({ id: l.id, name: l.name });
                            toast.success("Buyer restored");
                            await load();
                          } catch (e: any) { toast.error(e.message || "Restore failed"); }
                        }}
                      />
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
      {quickFinanceId && (() => {
        const l = leads.find(x => x.id === quickFinanceId);
        if (!l) return null;
        return <QuickFinanceModal lead={l as any} onClose={() => setQuickFinanceId(null)} onSaved={load} />;
      })()}
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
      {archiveTarget && (
        <ArchiveConfirmModal
          title={`Archive "${archiveTarget.name || "buyer"}"?`}
          description="The buyer will be hidden from the active table. Payment history, finance, and activity are preserved."
          detailLines={["You can restore later from Show archived.", "Reports and conversions remain unaffected."]}
          busy={archiveBusy}
          onClose={() => setArchiveTarget(null)}
          onConfirm={async (reason) => {
            setArchiveBusy(true);
            try {
              await archivePaidBuyer({ id: archiveTarget.id, name: archiveTarget.name }, reason || undefined);
              toast.success("Buyer archived");
              setArchiveTarget(null);
              await load();
            } catch (e: any) { toast.error(e.message || "Archive failed"); }
            finally { setArchiveBusy(false); }
          }}
        />
      )}
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

function InsightChip({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent: "gold" | "red" | "blue" | "muted" }) {
  const colors: Record<string, string> = {
    gold: active ? "bg-gold text-black border-gold" : "bg-gold-pale text-[#92400E] border-[#F5D78A] hover:bg-gold/40",
    red: active ? "bg-[#DC2626] text-white border-[#DC2626]" : "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5] hover:bg-[#FECACA]",
    blue: active ? "bg-[#2563EB] text-white border-[#2563EB]" : "bg-[#DBEAFE] text-[#1E40AF] border-[#93C5FD] hover:bg-[#BFDBFE]",
    muted: active ? "bg-black text-white border-black" : "bg-off text-foreground border-line hover:bg-[#EAEAEA]",
  };
  return (
    <button onClick={onClick} className={`text-[11.5px] px-2.5 py-1.5 rounded-full border font-medium transition-colors ${colors[accent]}`}>
      {label}
    </button>
  );
}

function FinanceCell({ lead, onClick }: { lead: any; onClick: () => void }) {
  const required = lead.finance_required;
  const status = lead.finance_status || "";
  const partner = lead.finance_partner || "";
  const disbursed = Number(lead.finance_amount_disbursed || 0);
  const approved = Number(lead.finance_amount_approved || 0);
  let dot = "#9CA3AF";
  if (status === "Approved" || status === "Disbursed") dot = "#15803D";
  else if (status === "Rejected" || status === "Alternate Partner Needed") dot = "#DC2626";
  else if (required && status && status !== "Not Required") dot = "#CA8A04";
  let line2 = "";
  if (status === "Disbursed" && disbursed > 0) line2 = `₹${disbursed.toLocaleString("en-IN")} disbursed`;
  else if (status === "Approved" && approved > 0) line2 = `₹${approved.toLocaleString("en-IN")} approved`;
  return (
    <button onClick={onClick} className="text-left w-full px-1.5 py-1 rounded hover:bg-off text-[11px] leading-tight">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
        <span className="truncate">{!required ? (status === "Not Required" ? "Not Required" : "Not set") : (partner ? `${partner} · ${status || "—"}` : (status || "Set partner"))}</span>
      </div>
      {line2 && <div className="text-[10px] text-muted-foreground pl-3">{line2}</div>}
    </button>
  );
}

function RowActionsMenu({ onAddPayment, onUpdateFinance, onSetFollowUp, onOpen, onArchive, onRestore, archived }: {
  onAddPayment: () => void; onUpdateFinance: () => void; onSetFollowUp: () => void; onOpen: () => void;
  onArchive: () => void; onRestore: () => void; archived: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_W = 260;
  const MENU_H = 260;

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const spaceBelow = window.innerHeight - b.bottom;
    const openUp = spaceBelow < MENU_H + 16;
    const top = openUp ? Math.max(8, b.top - MENU_H - 8) : b.bottom + 6;
    const left = Math.min(window.innerWidth - MENU_W - 12, Math.max(8, b.right - MENU_W));
    setCoords({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const Row = ({
    onClick, dotColor, tint, title, subtitle, icon,
  }: { onClick: () => void; dotColor: string; tint: string; title: string; subtitle: string; icon: string }) => (
    <button
      onClick={() => { setOpen(false); onClick(); }}
      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-off text-left transition-colors"
    >
      <span className="w-7 h-7 rounded-md flex items-center justify-center text-[14px] shrink-0" style={{ background: tint, color: dotColor }}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12.5px] font-medium text-black">{title}</span>
        <span className="block text-[10.5px] text-muted-foreground truncate">{subtitle}</span>
      </span>
    </button>
  );

  const menu = open && coords ? createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: coords.top, left: coords.left, width: MENU_W, zIndex: 9999 }}
      className="bg-white border border-line rounded-lg shadow-2xl py-1 overflow-hidden"
      role="menu"
    >
      <Row onClick={onOpen} dotColor="#111827" tint="#F3F4F6" title="Open Details" subtitle="Full lead drawer" icon="↗" />
      <div className="h-px bg-line my-0.5" />
      <Row onClick={onAddPayment} dotColor="#15803D" tint="#DCFCE7" title="Add Payment" subtitle="Record token / balance / EMI" icon="₹" />
      <Row onClick={onUpdateFinance} dotColor="#1E40AF" tint="#DBEAFE" title="Update Finance" subtitle="Partner, status, disbursal" icon="◈" />
      <Row onClick={onSetFollowUp} dotColor="#92400E" tint="#FEF3C7" title="Set Follow-up" subtitle="Schedule next call / message" icon="⏰" />
      <div className="h-px bg-line my-0.5" />
      {!archived ? (
        <Row onClick={onArchive} dotColor="#92400E" tint="#FEF3C7" title="Archive Buyer" subtitle="Hide from active table — payments preserved" icon="📦" />
      ) : (
        <Row onClick={onRestore} dotColor="#166534" tint="#DCFCE7" title="Restore Buyer" subtitle="Move back into active table" icon="↺" />
      )}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className="text-[14px] px-2.5 py-1 rounded border border-line hover:bg-off leading-none text-muted-foreground"
        title="Actions"
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >⋯</button>
      {menu}
    </>
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
  const [payPrefill, setPayPrefill] = useState<any | null>(null);
  const [payHeaderNote, setPayHeaderNote] = useState<string | undefined>(undefined);
  const [postPayAction, setPostPayAction] = useState<null | "setTokenPaid">(null);
  const [openFu, setOpenFu] = useState(false);
  const [openFin, setOpenFin] = useState(false);
  const [editBatch, setEditBatch] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedTpl, setCopiedTpl] = useState<string | null>(null);
  const [crmStages, setCrmStages] = useState<CrmStagePickerStage[]>([]);
  const [crmStageId, setCrmStageId] = useState<string | null>(null);
  const [crmPipelineId, setCrmPipelineId] = useState<string | null>(null);
  const [crmPickerOpen, setCrmPickerOpen] = useState(false);
  const [linkingCrm, setLinkingCrm] = useState(false);
  const [newCrmStageName, setNewCrmStageName] = useState("");
  const [addingStage, setAddingStage] = useState(false);

  const loadInner = async () => {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from("paid_pipeline_payments").select("*").eq("paid_pipeline_lead_id", lead.id).eq("is_deleted", false).order("payment_date", { ascending: false }),
      supabase.from("paid_pipeline_activity_logs").select("*").eq("paid_pipeline_lead_id", lead.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setPayments((p as any) || []);
    setActivity((a as any) || []);

    // Resolve CRM pipeline: prefer linked lead's pipeline, else fall back to Paid — Onboarding pipeline.
    let resolvedPipelineId: string | null = null;
    let currentCrmStageId: string | null = null;
    if (lead.crm_lead_id) {
      const { data: crmLead } = await supabase
        .from("leads").select("id, stage_id, pipeline_id").eq("id", lead.crm_lead_id).maybeSingle();
      currentCrmStageId = (crmLead as any)?.stage_id || null;
      setCrmStageId(currentCrmStageId);
      resolvedPipelineId = (crmLead as any)?.pipeline_id || null;
    } else {
      setCrmStageId(null);
    }
    if (!resolvedPipelineId) {
      const { data: paidPipe } = await supabase
        .from("pipelines").select("id").eq("type", "paid").order("position").limit(1).maybeSingle();
      resolvedPipelineId = (paidPipe as any)?.id || null;
    }
    setCrmPipelineId(resolvedPipelineId);
    if (resolvedPipelineId) {
      const { data: stagesData } = await supabase
        .from("stages")
        .select("id, name, pipeline_id, color, position, is_active, is_protected")
        .eq("pipeline_id", resolvedPipelineId)
        .order("position", { ascending: true });
      setCrmStages(((stagesData as any[]) || []).filter((s) => s.is_active !== false || s.id === currentCrmStageId));
    } else {
      setCrmStages([]);
    }
  };
  useEffect(() => { loadInner(); }, [lead.id]);

  const hasToken = Number(lead.token_amount_collected || 0) > 0 ||
    payments.some((p: any) => p.is_token || /token/i.test(p.payment_type || "") || /token/i.test(p.payment_category || ""));
  const lastPaymentDate = payments[0]?.payment_date || null;

  const openTokenPayment = () => {
    setPayPrefill({ type: "First Token", category: "Token Amount", description: "Token payment", isToken: true });
    setPayHeaderNote("Please record the token amount before moving this buyer to Token Paid.");
    setPostPayAction("setTokenPaid");
    setOpenPay(true);
  };
  const openAddPayment = () => {
    setPayPrefill(null);
    setPayHeaderNote(undefined);
    setPostPayAction(null);
    setOpenPay(true);
  };
  const openRecordTokenSimple = () => {
    setPayPrefill({ type: "First Token", category: "Token Amount", description: "Token payment", isToken: true });
    setPayHeaderNote(undefined);
    setPostPayAction(null);
    setOpenPay(true);
  };

  const handlePaymentSaved = async () => {
    await loadInner();
    if (postPayAction === "setTokenPaid") {
      await supabase.from("paid_pipeline_leads").update({ pipeline_stage: "Token Paid" } as any).eq("id", lead.id);
      setStage("Token Paid");
      await recomputePaidLead(lead.id);
      logActivity({
        module_key: "paid_pipeline", module_label: "Paid Pipeline",
        action_type: "paid_pipeline_stage_changed", action_label: "Stage changed via suggestion",
        entity_type: "paid_pipeline_lead", entity_id: lead.id, entity_label: lead.name || undefined,
        old_values: { pipeline_stage: lead.pipeline_stage },
        new_values: { pipeline_stage: "Token Paid" },
        metadata: { paid_pipeline_lead_id: lead.id, crm_lead_id: lead.crm_lead_id, source: "suggested_action" },
        summary: `Paid Pipeline stage set to 'Token Paid' after token recorded.`,
      });
      toast.success("Token recorded and stage set to Token Paid");
    }
    setPostPayAction(null);
    onChanged();
  };

  const changePaidStage = async (newStage: string) => {
    if (!newStage || newStage === stage) { setStage(newStage); return; }
    const tokenMissing = /token paid/i.test(newStage) && !hasToken;
    if (tokenMissing) {
      const ok = confirm("Token amount is not recorded. Move stage to 'Token Paid' anyway?");
      if (!ok) return;
      logActivity({
        module_key: "paid_pipeline", module_label: "Paid Pipeline",
        action_type: "paid_pipeline_stage_change_without_payment_confirmed",
        entity_type: "paid_pipeline_lead", entity_id: lead.id, entity_label: lead.name || undefined,
        metadata: { paid_pipeline_lead_id: lead.id, attempted_stage: newStage },
        severity: "warning",
        summary: `User moved to '${newStage}' without recorded token.`,
      });
    }
    const oldStage = stage;
    setStage(newStage);
    await supabase.from("paid_pipeline_leads").update({ pipeline_stage: newStage } as any).eq("id", lead.id);
    await recomputePaidLead(lead.id);
    logActivity({
      module_key: "paid_pipeline", module_label: "Paid Pipeline",
      action_type: "paid_pipeline_stage_changed", action_label: "Stage changed",
      entity_type: "paid_pipeline_lead", entity_id: lead.id, entity_label: lead.name || undefined,
      old_values: { pipeline_stage: oldStage },
      new_values: { pipeline_stage: newStage },
      metadata: { paid_pipeline_lead_id: lead.id, crm_lead_id: lead.crm_lead_id },
      summary: `Paid Pipeline stage changed from '${oldStage || "—"}' to '${newStage}'.`,
    });
    toast.success(`Stage → ${newStage}`);
    onChanged();
  };

  const changeCrmStage = async (newStageId: string) => {
    if (!lead.crm_lead_id || !newStageId || newStageId === crmStageId) { setCrmPickerOpen(false); return; }
    const oldName = crmStages.find(s => s.id === crmStageId)?.name || "—";
    const newName = crmStages.find(s => s.id === newStageId)?.name || "—";
    const prevId = crmStageId;
    setCrmStageId(newStageId);
    setCrmPickerOpen(false);
    const { error } = await supabase.from("leads").update({ stage_id: newStageId }).eq("id", lead.crm_lead_id);
    if (error) {
      setCrmStageId(prevId);
      toast.error("Failed to update CRM stage");
      return;
    }
    logActivity({
      module_key: "paid_pipeline", module_label: "Paid Pipeline",
      action_type: "paid_pipeline_updated_linked_crm_stage",
      entity_type: "lead", entity_id: lead.crm_lead_id, entity_label: lead.name || undefined,
      old_values: { stage: oldName },
      new_values: { stage: newName },
      metadata: { paid_pipeline_lead_id: lead.id, crm_lead_id: lead.crm_lead_id, old_stage: oldName, new_stage: newName, changed_by: user?.id || null },
      summary: `Linked CRM stage changed from '${oldName}' to '${newName}' from Paid Pipeline drawer.`,
    });
    toast.success("Calling CRM stage updated.");

    // Trigger Operations handoff evaluation for this stage change
    try {
      const rules = await getActiveHandoffRules();
      const stagesById = new Map(crmStages.map(s => [s.id, { id: s.id, name: s.name }]));
      const rule = findRuleForStage(rules, crmPipelineId, newStageId, stagesById as any);
      if (rule) {
        if (rule.mode === "auto" && isRuleAutoReady(rule)) {
          const res = await applyAutoHandoff(rule, [{
            id: lead.crm_lead_id, full_name: lead.name, email: lead.email, phone: lead.phone,
            program_name: lead.product_name_snapshot || null, paid_pipeline_lead_id: lead.id,
          }], user?.id || null);
          if (res.inserted > 0) toast.success("Auto-sent to Operations CRM");
          else if (res.updated > 0) toast.info("Operations CRM record updated");
        } else if (rule.mode === "suggest") {
          toast.info(`Operations handoff suggested: ${rule.name}`);
        }
      }
    } catch (e) { /* non-fatal */ }

    onChanged();
  };

  // Backfill: try to link this paid buyer to a Calling CRM lead via email/phone.
  const linkToCrm = async () => {
    setLinkingCrm(true);
    try {
      const filters: string[] = [];
      if (lead.email) filters.push(`email.ilike.${lead.email}`);
      if (lead.phone) filters.push(`phone.eq.${lead.phone}`);
      if (filters.length === 0) { toast.error("No email/phone on this buyer to match."); return; }
      const { data: match } = await supabase.from("leads").select("id, full_name").or(filters.join(",")).limit(1).maybeSingle();
      if (!match) { toast.error("No matching Calling CRM lead found."); return; }
      await supabase.from("paid_pipeline_leads").update({ crm_lead_id: (match as any).id } as any).eq("id", lead.id);
      logActivity({
        module_key: "paid_pipeline", action_type: "paid_buyer_linked_to_crm",
        entity_type: "paid_pipeline_lead", entity_id: lead.id, entity_label: lead.name || undefined,
        metadata: { crm_lead_id: (match as any).id }, summary: `Linked paid buyer to Calling CRM lead ${(match as any).full_name || ""}.`,
      });
      toast.success("Linked to Calling CRM lead");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed to link");
    } finally { setLinkingCrm(false); }
  };

  // Add a new Calling CRM stage (in the linked pipeline) from inside the Paid Pipeline drawer.
  const addCrmStageInline = async () => {
    const name = newCrmStageName.trim();
    if (!name) return;
    if (!crmPipelineId) { toast.error("No linked Calling CRM pipeline"); return; }
    if (crmStages.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Stage already exists in this pipeline"); return;
    }
    setAddingStage(true);
    try {
      const { data, error } = await supabase.from("stages").insert({
        pipeline_id: crmPipelineId, name, color: "gray", position: crmStages.length,
      } as any).select("id, name, pipeline_id, color, position, is_active, is_protected").maybeSingle();
      if (error) { toast.error(error.message); return; }
      setNewCrmStageName("");
      toast.success("Stage added to Calling CRM");
      if (data) setCrmStages([...crmStages, data as any]);
      logActivity({
        module_key: "paid_pipeline", module_label: "Paid Pipeline",
        action_type: "crm_stage_created_from_paid_pipeline_drawer",
        entity_type: "stage", entity_id: (data as any)?.id, entity_label: name,
        metadata: { paid_pipeline_lead_id: lead.id, crm_lead_id: lead.crm_lead_id, pipeline_id: crmPipelineId, stage_name: name, changed_by: user?.id || null },
        summary: `Created Calling CRM stage '${name}' from Paid Pipeline drawer.`,
      });
    } finally { setAddingStage(false); }
  };

  // Delete/deactivate a stage with lead-safety guard.
  const deleteCrmStageInline = async (s: CrmStagePickerStage) => {
    // Check usage in leads table
    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("stage_id", s.id);
    const used = (count ?? 0) > 0;
    if (used || s.is_protected) {
      // Soft-deactivate
      const reason = used ? `has ${count} lead(s)` : "is protected";
      const ok = confirm(`Stage "${s.name}" ${reason}. Deactivate (hide from selectors) instead?`);
      if (!ok) return;
      const { error } = await supabase.from("stages").update({ is_active: false } as any).eq("id", s.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Stage deactivated");
      setCrmStages(crmStages.filter((x) => x.id !== s.id));
      logActivity({
        module_key: "paid_pipeline", module_label: "Paid Pipeline",
        action_type: "crm_stage_deactivated_from_paid_pipeline_drawer",
        entity_type: "stage", entity_id: s.id, entity_label: s.name,
        metadata: { paid_pipeline_lead_id: lead.id, crm_lead_id: lead.crm_lead_id, pipeline_id: crmPipelineId, stage_id: s.id, stage_name: s.name, used_count: count, changed_by: user?.id || null },
        summary: `Deactivated Calling CRM stage '${s.name}' (had ${count} leads) from Paid Pipeline drawer.`,
      });
      return;
    }
    if (!confirm(`Delete stage "${s.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("stages").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Stage deleted");
    setCrmStages(crmStages.filter((x) => x.id !== s.id));
    logActivity({
      module_key: "paid_pipeline", module_label: "Paid Pipeline",
      action_type: "crm_stage_deleted_from_paid_pipeline_drawer",
      entity_type: "stage", entity_id: s.id, entity_label: s.name,
      metadata: { paid_pipeline_lead_id: lead.id, crm_lead_id: lead.crm_lead_id, pipeline_id: crmPipelineId, stage_id: s.id, stage_name: s.name, changed_by: user?.id || null },
      summary: `Deleted Calling CRM stage '${s.name}' from Paid Pipeline drawer.`,
    });
  };




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
      <div className="w-full max-w-[720px] bg-white overflow-y-auto pb-44 relative">
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
              <button onClick={() => setOpenFin(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-[#15803D] text-white hover:opacity-90">
                Update Finance
              </button>
              <button onClick={openAddPayment} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-black text-white hover:opacity-90">
                + Add Payment
              </button>
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
          <SuggestedNextActions
            paidLeadId={lead.id}
            crmLeadId={lead.crm_lead_id || null}
            onApplied={() => { loadInner(); onChanged(); }}
            onOpenFollowUp={() => setOpenFu(true)}
            onOpenTokenPayment={openTokenPayment}
          />
        </div>

        <div className="p-6 space-y-5">

          {/* 1. Payment Summary — top priority */}
          <Section title="Revenue snapshot">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Deal value" value={inr(lead.deal_value_including_gst)} />
              <Field label="Token collected" value={inr(lead.token_amount_collected)} tone="green" />
              <Field label="Total collected" value={inr(lead.total_collected)} tone="green" />
              <Field label="Balance pending" value={inr(lead.balance_pending)} tone={Number(lead.balance_pending) > 50000 ? "red" : "amber"} />
              <Field label="Realized revenue" value={inr(lead.final_revenue_realized || 0)} tone="green" />
              <Field label="To be realized" value={inr(lead.revenue_to_be_realized ?? lead.balance_pending)} />
            </div>
          </Section>

          {/* 1b. Token / Payment Recording */}
          <Section title="Token / Payment Recording">
            <div className="grid grid-cols-4 gap-2 mb-3">
              <Field label="Token collected" value={inr(lead.token_amount_collected)} tone={hasToken ? "green" : undefined} />
              <Field label="Total collected" value={inr(lead.total_collected)} tone={Number(lead.total_collected) > 0 ? "green" : undefined} />
              <Field label="Balance pending" value={inr(lead.balance_pending)} tone={Number(lead.balance_pending) > 0 ? "amber" : "green"} />
              <Field label="Last payment" value={lastPaymentDate ? fmtDate(lastPaymentDate) : "—"} />
            </div>
            {!hasToken ? (
              <div className="rounded-md border border-[#F5D78A] bg-gold-pale px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="text-[12.5px]">
                  <div className="font-medium">No token recorded yet</div>
                  <div className="text-[11.5px] text-muted-foreground">Record the token payment before moving this buyer to Token Paid.</div>
                </div>
                <button onClick={openRecordTokenSimple} className="ipc-btn ipc-btn-black !h-9 whitespace-nowrap">Record Token Payment</button>
              </div>
            ) : (
              <div className="rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="text-[12.5px] text-[#15803D]">
                  Token recorded: <b>{inr(lead.token_amount_collected)}</b>
                </div>
                <button onClick={openAddPayment} className="ipc-btn ipc-btn-ghost !h-9 whitespace-nowrap">+ Add Another Payment</button>
              </div>
            )}
          </Section>


          {/* 1c. Linked Calling CRM Stage — high in drawer for quick stage sync */}
          {(() => {
            const current = crmStages.find(s => s.id === crmStageId) || null;
            const chip = current ? stageChip(current.name, current.color) : null;
            return (
              <div className="rounded-xl border border-[#C7D2FE] bg-gradient-to-br from-[#EEF2FF] to-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#3730A3]">🔗 Linked Calling CRM Stage</div>
                    {!lead.crm_lead_id && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]">Not linked</span>
                    )}
                  </div>
                  {lead.crm_lead_id && (
                    <Link to={`/crm?lead=${lead.crm_lead_id}`} className="text-[11px] text-[#3730A3] hover:underline">Open in CRM ↗</Link>
                  )}
                </div>

                {!lead.crm_lead_id ? (
                  <div className="space-y-2">
                    <div className="text-[12px] text-[#3730A3]">No linked Calling CRM lead found. Link this buyer so stage changes sync across both pipelines.</div>
                    <button onClick={linkToCrm} disabled={linkingCrm} className="ipc-btn ipc-btn-black !h-9">
                      {linkingCrm ? "Linking…" : "Link to Calling CRM lead"}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Current</span>
                    {chip ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border" style={{ background: chip.bg, color: chip.text, borderColor: chip.border }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: chip.dot }} />
                        {current!.name}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs bg-off border border-line">—</span>
                    )}
                    <CrmStagePicker
                      stages={crmStages}
                      currentStageId={crmStageId}
                      open={crmPickerOpen}
                      onOpenChange={(v) => { setCrmPickerOpen(v); if (!v) setNewCrmStageName(""); }}
                      newStageName={newCrmStageName}
                      onNewStageNameChange={setNewCrmStageName}
                      onChangeStage={changeCrmStage}
                      onAddStage={addCrmStageInline}
                      onDeleteStage={deleteCrmStageInline}
                      addingStage={addingStage}
                    />
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground mt-2">
                  Changes here update the linked Calling CRM lead and trigger Operations handoff rules if matched.
                </div>
              </div>
            );
          })()}

          {/* 2. Next Follow-up — high-visibility, daily-use card */}
          {(() => {
            const todayStr = new Date().toISOString().slice(0, 10);
            const fu = lead.next_follow_up_date || lead.follow_up_date || lead.next_balance_follow_up_date || lead.finance_follow_up_date || null;
            let status = { label: "No follow-up set", cls: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" };
            if (fu) {
              if (fu < todayStr) status = { label: "Overdue", cls: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]" };
              else if (fu === todayStr) status = { label: "Due today", cls: "bg-[#FEF3C7] text-[#92400E] border-[#FBBF24]" };
              else status = { label: "Upcoming", cls: "bg-[#DBEAFE] text-[#1E3A8A] border-[#93C5FD]" };
            }
            return (
              <div className="rounded-xl border border-[#FDE68A] bg-gradient-to-br from-[#FFFBEB] to-[#FEF3C7]/40 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#78350F]">⏰ Next Follow-up</div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${status.cls}`}>{status.label}</span>
                  </div>
                  <div className="text-[11.5px] text-[#78350F]">
                    {fu ? <b>{fmtDate(fu)}</b> : "—"} {lead.follow_up_reason ? <span>· {lead.follow_up_reason}</span> : null}
                  </div>
                </div>
                <div className="text-[11.5px] text-[#78350F] mb-2">
                  Owner: {agents.find(a => a.id === lead.assigned_sales_executive)?.full_name || "—"}
                </div>
                <FastFollowUpComposer
                  paidLeadId={lead.id}
                  crmLeadId={lead.crm_lead_id || null}
                  leadName={lead.name || undefined}
                  defaultPriority={temperature || "Normal"}
                  ownerId={lead.assigned_sales_executive || user?.id || null}
                  source="paid_pipeline_drawer"
                  onSaved={() => { loadInner(); onChanged(); }}
                />
              </div>
            );
          })()}

          {/* 3. Quick status — managed dropdowns */}
          <Section title="Quick status">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="qsi-label">Pipeline stage</label>
                <InlineManagedSelect settingType="pipeline_stage" value={stage} onChange={(v) => changePaidStage(v)} width="100%"
                  triggerClassName="w-full h-10 border border-input rounded-md px-3 text-[13px] text-left bg-background truncate flex items-center justify-between gap-1 hover:bg-off" />
              </div>
              <div>
                <label className="qsi-label">Lead temperature</label>
                <InlineManagedSelect settingType="lead_priority" value={temperature} onChange={setTemperature} width="100%" colorize
                  triggerClassName="w-full h-10 border border-input rounded-md px-3 text-[13px] text-left bg-background truncate flex items-center justify-between gap-1 hover:bg-off" />
              </div>
              <div>
                <label className="qsi-label">Finance partner</label>
                <InlineManagedSelect settingType="finance_partner" value={financePartner} onChange={setFinancePartner} width="100%"
                  triggerClassName="w-full h-10 border border-input rounded-md px-3 text-[13px] text-left bg-background truncate flex items-center justify-between gap-1 hover:bg-off" />
              </div>
              <div>
                <label className="qsi-label">Finance status</label>
                <InlineManagedSelect settingType="finance_status" value={financeStatus} onChange={setFinanceStatus} width="100%"
                  triggerClassName="w-full h-10 border border-input rounded-md px-3 text-[13px] text-left bg-background truncate flex items-center justify-between gap-1 hover:bg-off" />
              </div>
              <div>
                <label className="qsi-label">Balance category</label>
                <QuickSaveInput fieldKey="balance_category" value={balCat} onChange={setBalCat} placeholder="Second Token Pending" />
              </div>
            </div>
          </Section>


          {/* 4. Batch information — read-only by default */}
          <Section title="Batch information">
            {!editBatch ? (
              <div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Paid batch" value={lead.paid_batch_name || "—"} />
                  <Field label="Onboarding batch" value={lead.onboarding_batch_name || "—"} />
                  <Field label="Product / Program" value={lead.product_name_snapshot || "—"} />
                  <Field label="Revenue recognition" value={lead.revenue_recognition_rule || "Realized Revenue Only"} />
                </div>
                {(!lead.paid_batch_name || !lead.onboarding_batch_name) && (
                  <div className="text-[11px] text-muted-foreground mt-2">Some batch fields are missing from import.</div>
                )}
                <button onClick={() => setEditBatch(true)} className="text-[11.5px] mt-2 text-[#2563EB] hover:underline">Edit batch details</button>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-2 gap-3">
                  <QuickSaveInput fieldKey="paid_batch_name" label="Paid batch" value={paidBatch} onChange={setPaidBatch} placeholder="Diamond Token Buyers - May" />
                  <QuickSaveInput fieldKey="onboarding_batch_name" label="Onboarding batch" value={onboardingBatch} onChange={setOnboardingBatch} placeholder="Diamond May 2026 Batch 1" />
                  <QuickSaveInput fieldKey="revenue_recognition_rule" label="Revenue recognition rule" value={revRule} onChange={setRevRule} placeholder="Realized Revenue Only" />
                </div>
                <button onClick={() => setEditBatch(false)} className="text-[11.5px] mt-2 text-muted-foreground hover:text-black">Done editing</button>
              </div>
            )}
          </Section>

          {/* 5. Finance / EMI — compact */}
          <Section title="Finance / EMI">
            <div className="grid grid-cols-3 gap-2 mb-2">
              <Field label="Required" value={lead.finance_required ? "Yes" : "No"} />
              <Field label="Approved" value={inr(lead.finance_amount_approved || 0)} />
              <Field label="Disbursed" value={inr(lead.finance_amount_disbursed || 0)} tone={(lead.finance_amount_disbursed || 0) > 0 ? "green" : undefined} />
            </div>
            <button onClick={() => setOpenFin(true)} className="ipc-btn ipc-btn-ghost !h-9">Open finance editor</button>
          </Section>

          {/* 6. Payment history */}
          <Section title={`Payment history (${payments.length})`}>
            {payments.length === 0 ? (
              <div className="text-[12px] text-muted-foreground">No payments yet. Click "+ Add Payment" above.</div>
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

          {/* 7. WhatsApp templates — friendly cards */}
          <Section title="WhatsApp templates">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {tpls.map(t => (
                <div key={t.label} className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#25D366] text-white text-[10px] flex items-center justify-center">W</span>
                    <span className="text-[12.5px] font-medium text-[#15803D]">{t.label}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground line-clamp-2">{t.msg}</div>
                  <div className="flex gap-1.5 mt-1">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(t.msg);
                        setCopiedTpl(t.label);
                        setTimeout(() => setCopiedTpl(null), 1200);
                      }}
                      className="flex-1 text-[11px] h-7 rounded border border-[#BBF7D0] bg-white hover:bg-[#DCFCE7] text-[#15803D]"
                    >{copiedTpl === t.label ? "✓ Copied" : "Copy"}</button>
                    <a href={waLink(t.msg)} target="_blank" rel="noreferrer" className="flex-1 text-[11px] h-7 rounded bg-[#25D366] text-white hover:opacity-90 flex items-center justify-center">Send</a>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 8. Activity — collapsed */}
          <Section
            title="Activity"
            right={<button onClick={() => setShowActivity(v => !v)} className="text-[11px] text-muted-foreground hover:text-black">{showActivity ? "Hide" : "Show"}</button>}
          >
            {!showActivity ? (
              <div className="text-[12px] text-muted-foreground">{activity.length} entries · click Show to view.</div>
            ) : activity.length === 0 ? (
              <div className="text-[12px] text-muted-foreground">No activity yet.</div>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {activity.map(a => (
                  <div key={a.id} className="text-[11.5px] border-l-2 border-line pl-2">
                    <div className="text-muted-foreground text-[10px]">{new Date(a.created_at).toLocaleString()} · {a.activity_type}</div>
                    <div>{a.note}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 9. Advanced — collapsed */}
          <Section
            title="Advanced · balance notes"
            right={<button onClick={() => setShowAdvanced(v => !v)} className="text-[11px] text-muted-foreground hover:text-black">{showAdvanced ? "Hide" : "Show"}</button>}
          >
            {showAdvanced && (
              <div className="space-y-3">
                <div>
                  <label className="qsi-label">Next balance follow-up</label>
                  <input type="date" className="qsi-input" value={balDate} onChange={(e) => setBalDate(e.target.value)} />
                </div>
                <div>
                  <label className="qsi-label">Balance description</label>
                  <textarea className="qsi-input !h-auto py-2" rows={2} value={balDesc} onChange={(e) => setBalDesc(e.target.value)} placeholder="e.g. Student paid ₹1,000. Promised ₹6,000 by tomorrow." />
                </div>
                <div>
                  <label className="qsi-label">Finance follow-up date</label>
                  <input type="date" className="qsi-input" value={financeFu} onChange={(e) => setFinanceFu(e.target.value)} />
                </div>
                <div>
                  <label className="qsi-label">Finance notes</label>
                  <textarea className="qsi-input !h-auto py-2" rows={2} value={financeNotes} onChange={(e) => setFinanceNotes(e.target.value)} />
                </div>
              </div>
            )}
          </Section>
        </div>

        {/* Sticky footer */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-line px-6 py-3 flex justify-end gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Close</button>
          <button onClick={saveAll} className="ipc-btn ipc-btn-ghost">Save</button>
          <button
            onClick={async () => { await saveAll(); onClose(); }}
            className="ipc-btn !bg-[#16A34A] hover:!bg-[#15803D] !text-white"
          >
            Save & Close
          </button>
        </div>
      </div>

      {openPay && <QuickAddPaymentModal leadId={lead.id} leadName={lead.name || undefined} prefill={payPrefill || undefined} headerNote={payHeaderNote} onClose={() => { setOpenPay(false); setPostPayAction(null); }} onSaved={handlePaymentSaved} />}
      {openFu && <QuickFollowUpModal leadId={lead.id} leadName={lead.name || undefined} crmLeadId={lead.crm_lead_id || null} defaults={{ priority: temperature || "Normal" }} onClose={() => setOpenFu(false)} onSaved={() => { loadInner(); onChanged(); }} />}
      {openFin && <QuickFinanceModal lead={lead as any} onClose={() => setOpenFin(false)} onSaved={() => { loadInner(); onChanged(); }} />}
    </div>
  );
}

function Section({ title, children, right }: { title: string; children: any; right?: any }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{title}</div>
        {right}
      </div>
      <div className="border border-line rounded-md p-3">{children}</div>
    </div>
  );
}

function Field({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: "green" | "amber" | "red" }) {
  const toneBg = tone === "green" ? "bg-[#F0FDF4] border-[#BBF7D0]"
    : tone === "amber" ? "bg-gold-pale border-[#F5D78A]"
    : tone === "red" ? "bg-[#FEF2F2] border-[#FCA5A5]"
    : (accent ? "bg-gold-pale" : "");
  return (
    <div className={"border border-line rounded-md px-3 py-2 " + toneBg}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="font-serif text-[16px] mt-0.5">{value}</div>
    </div>
  );
}
