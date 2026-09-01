import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import PromisedOffersPanel from "@/components/offers/PromisedOffersPanel";
import FastFollowUpComposer from "@/components/FastFollowUpComposer";
import SuggestedNextActions from "@/components/SuggestedNextActions";
import { listAllTags, getTagsForLeads, pickTagColor, type Tag } from "@/lib/leadTags";
import { archivePaidBuyer, restorePaidBuyer } from "@/lib/crmArchive";
import { ArchiveConfirmModal } from "@/components/crm/ArchiveConfirmModal";
import { stageChip } from "@/lib/stageColors";
import { getActiveHandoffRules, findRuleForStage, isRuleAutoReady, applyAutoHandoff } from "@/lib/operationsCrm";
import { auditPaidPipelineVisibility, type VisibilityAudit } from "@/lib/paidPipelineVisibility";
import CrmStagePicker, { type CrmStagePickerStage } from "@/components/crm/CrmStagePicker";
import CodeOfConductPanel from "@/components/paid-pipeline/CodeOfConductPanel";
import AccessVerificationPanel from "@/components/access-followup/AccessVerificationPanel";
import { ensurePaidPipelineCrmLead } from "@/lib/paidCrmMirror";
import CompactPaidRow from "@/components/paid-pipeline/CompactPaidRow";
import { getPaymentStatus, type PayStatusKey } from "@/lib/paidPaymentStatus";
import ServicePackageChip from "@/components/ServicePackageChip";
import SendPaidToOpsModal from "@/components/paid-pipeline/SendPaidToOpsModal";
import MultiSelectFilter from "@/components/crm/MultiSelectFilter";
import PaymentDateRangeFilter from "@/components/paid-pipeline/PaymentDateRangeFilter";
import PaidPipelineLeadDrawer from "@/components/paid-pipeline/PaidPipelineLeadDrawer";
import { resolvePaidPipelineCoc, type PaidCocInfo } from "@/lib/paidPipelineEligibility";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePinnedFilters, type PinnedFilterKey } from "@/components/paid-pipeline/pinnedFilters";
import {
  InlineDateRangeFilter, InlineSelectFilter, InlineMultiFilter, CustomizeFilterBar,
} from "@/components/paid-pipeline/InlineFilterControls";

export type Lead = {
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
export type Batch = { id: string; batch_name: string; webinar_name: string; webinar_date: string | null };
type PaidBatch = { id: string; batch_name: string; batch_status: string };
type OnboardingOpt = { name: string };
export type Payment = { id: string; payment_type: string; payment_category: string | null; amount: number; payment_date: string; payment_mode: string | null; is_token: boolean; is_final_payment: boolean; payment_description: string | null; notes: string | null; next_payment_expected_date: string | null };

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
  const [batchFilter, setBatchFilter] = useState<string[]>([]); // source webinar batches (multi)
  const [paidBatchFilter, setPaidBatchFilter] = useState<string[]>([]);
  const [onboardingBatchFilter, setOnboardingBatchFilter] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState("all");
  const [tempFilter, setTempFilter] = useState("all");
  const [financePartnerFilter, setFinancePartnerFilter] = useState("all");
  const [financeStatusFilter, setFinanceStatusFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const [revenueStatusFilter, setRevenueStatusFilter] = useState<string[]>([]);
  const [payDateFrom, setPayDateFrom] = useState("");
  const [payDateTo, setPayDateTo] = useState("");
  
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
  const [payStatusFilter, setPayStatusFilter] = useState<PayStatusKey | "all">("all");
  const HIGH_BAL_THRESHOLD = 50000;
  const [cocByLeadId, setCocByLeadId] = useState<Map<string, PaidCocInfo>>(new Map());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { pinned, isPinned, toggle: togglePinned, reset: resetPinned } = usePinnedFilters();


  const load = async () => {
    const archivedFilter = (q: any) => showArchived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    const [{ data: l }, { data: b }, { data: pb }, { data: s }, elig] = await Promise.all([
      archivedFilter(supabase.from("paid_pipeline_leads").select("*").eq("is_deleted", false)).order("created_at", { ascending: false }),
      supabase.from("webinar_batches").select("id, batch_name, webinar_name, webinar_date").eq("is_deleted", false).order("created_at", { ascending: false }),
      (supabase as any).from("paid_pipeline_batches").select("id, batch_name, batch_status").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("paid_pipeline_settings").select("label").eq("setting_type", "pipeline_stage").eq("is_active", true).eq("is_deleted", false).order("sort_order"),
      getEligibleAssignees("paid_pipeline"),
    ]);
    const rawLeads: Lead[] = (l as any) || [];
    // Gate: only members with a successfully sent Code of Conduct belong in the Paid Pipeline.
    // This reuses the same CoC resolver as Access Follow-up.
    const cocMap = await resolvePaidPipelineCoc(rawLeads);
    const eligibleLeads = rawLeads.filter((lead) => cocMap.get(lead.id)?.eligible);
    setCocByLeadId(cocMap);
    setLeads(eligibleLeads);
    setBatches((b as any) || []);
    setPaidBatches((pb as any) || []);
    setStages(((s as any) || []).map((x: any) => x.label));
    setAgents(elig.map((a) => ({ id: a.id, full_name: a.full_name })) as any);
    const obSet = new Set<string>();
    eligibleLeads.forEach(x => { if (x.onboarding_batch_name) obSet.add(x.onboarding_batch_name); });
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
  const navigate = useNavigate();
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (leadParam) { setOpenId(leadParam); setView("leads"); }
  }, [searchParams]);

  const resetFilters = () => {
    setSearch(""); setSearchInput("");
    setBatchFilter([]); setPaidBatchFilter([]); setOnboardingBatchFilter([]);
    setStageFilter("all"); setTempFilter("all");
    setFinancePartnerFilter("all"); setFinanceStatusFilter("all");
    setFollowUpFilter("all"); setRevenueStatusFilter([]);
    setTagFilter("all"); setOwnerFilter("all"); setInsightFilter(null);
    setPayStatusFilter("all");
    setPayDateFrom(""); setPayDateTo("");
  };
  const anyFilterActive = !!search || !!insightFilter || payStatusFilter !== "all"
    || !!payDateFrom || !!payDateTo
    || batchFilter.length > 0 || paidBatchFilter.length > 0 || onboardingBatchFilter.length > 0
    || revenueStatusFilter.length > 0
    || [stageFilter, tempFilter, financePartnerFilter, financeStatusFilter, followUpFilter, tagFilter, ownerFilter].some(v => v !== "all");

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (search) chips.push({ key: "search", label: `Search: ${search}`, clear: () => { setSearch(""); setSearchInput(""); } });
    if (stageFilter !== "all") chips.push({ key: "stage", label: `Stage: ${stageFilter}`, clear: () => setStageFilter("all") });
    if (tempFilter !== "all") chips.push({ key: "temp", label: `Priority: ${tempFilter}`, clear: () => setTempFilter("all") });
    if (ownerFilter !== "all") chips.push({ key: "owner", label: "Owner filter", clear: () => setOwnerFilter("all") });
    if (financeStatusFilter !== "all") chips.push({ key: "fin", label: `Finance: ${financeStatusFilter || "Not set"}`, clear: () => setFinanceStatusFilter("all") });
    if (financePartnerFilter !== "all") chips.push({ key: "finp", label: `Partner: ${financePartnerFilter}`, clear: () => setFinancePartnerFilter("all") });
    if (tagFilter !== "all") chips.push({ key: "tag", label: "Tag filter", clear: () => setTagFilter("all") });
    if (followUpFilter !== "all") chips.push({ key: "fu", label: `Follow-up: ${followUpFilter}`, clear: () => setFollowUpFilter("all") });
    if (payStatusFilter !== "all") chips.push({ key: "pay", label: `Payment: ${payStatusFilter.replace(/_/g, " ")}`, clear: () => setPayStatusFilter("all") });
    if (insightFilter) chips.push({ key: "insight", label: insightFilter.replace(/_/g, " "), clear: () => setInsightFilter(null) });
    if (payDateFrom || payDateTo) chips.push({ key: "dates", label: `Date: ${payDateFrom || "…"} → ${payDateTo || "…"}`, clear: () => { setPayDateFrom(""); setPayDateTo(""); } });
    if (batchFilter.length) chips.push({ key: "batch", label: `Webinar batches (${batchFilter.length})`, clear: () => setBatchFilter([]) });
    if (paidBatchFilter.length) chips.push({ key: "pbatch", label: `Paid batches (${paidBatchFilter.length})`, clear: () => setPaidBatchFilter([]) });
    if (onboardingBatchFilter.length) chips.push({ key: "obatch", label: `Onboarding (${onboardingBatchFilter.length})`, clear: () => setOnboardingBatchFilter([]) });
    if (revenueStatusFilter.length) chips.push({ key: "rev", label: `Revenue status (${revenueStatusFilter.length})`, clear: () => setRevenueStatusFilter([]) });
    if (showArchived) chips.push({ key: "arch", label: "Archived shown", clear: () => setShowArchived(false) });
    return chips;
  }, [search, stageFilter, tempFilter, ownerFilter, financeStatusFilter, financePartnerFilter, tagFilter, followUpFilter, payStatusFilter, insightFilter, payDateFrom, payDateTo, batchFilter, paidBatchFilter, onboardingBatchFilter, revenueStatusFilter, showArchived]);


  const financePartnerOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_FINANCE_PARTNERS);
    leads.forEach(l => { if (l.finance_partner) set.add(l.finance_partner); });
    return Array.from(set);
  }, [leads]);

  // Normalize batch labels for forgiving cross-source matching.
  const normalizeName = (s: string | null | undefined): string =>
    String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

  // Build the set of normalized batch names for the currently selected webinar batch ids,
  // so a row whose batch chip falls back to paid_batch_name / onboarding_batch_name /
  // source_webinar still matches when its label equals the selected webinar batch.
  const selectedBatchNames = useMemo(() => {
    if (batchFilter.length === 0) return new Set<string>();
    const names = new Set<string>();
    batchFilter.forEach((id) => {
      const b = batches.find((x) => x.id === id);
      if (b?.batch_name) names.add(normalizeName(b.batch_name));
    });
    return names;
  }, [batchFilter, batches]);

  // Resolve a "webinar date" per lead from the linked source webinar batch.
  // Priority: webinar_batch_id → source_webinar_batch_id → fallback by normalized batch name
  // (source_webinar / paid_batch_name / onboarding_batch_name). Never uses payment dates.
  const batchDateById = useMemo(() => {
    const m: Record<string, string> = {};
    batches.forEach((b) => { if (b.id && b.webinar_date) m[b.id] = String(b.webinar_date).slice(0, 10); });
    return m;
  }, [batches]);
  const batchDateByName = useMemo(() => {
    const m: Record<string, string> = {};
    batches.forEach((b) => {
      if (b.batch_name && b.webinar_date) m[normalizeName(b.batch_name)] = String(b.webinar_date).slice(0, 10);
    });
    return m;
  }, [batches]);
  const webinarDateForLead = (l: Lead): string => {
    if (l.webinar_batch_id && batchDateById[l.webinar_batch_id]) return batchDateById[l.webinar_batch_id];
    if (l.source_webinar_batch_id && batchDateById[l.source_webinar_batch_id]) return batchDateById[l.source_webinar_batch_id];
    for (const n of [l.source_webinar, l.paid_batch_name, l.onboarding_batch_name]) {
      if (n) {
        const hit = batchDateByName[normalizeName(n)];
        if (hit) return hit;
      }
    }
    return "";
  };

  // ---- Paid Pipeline eligibility gate (shared CoC resolver with Access Follow-up) ----
  // Members without a successfully sent Code of Conduct are not loaded into this page.
  // `leads` already contains only eligible members after `load()` resolves CoC status.

  const filtered = useMemo(() => {
    const td = today();
    return leads.filter(l => {
      // Webinar batch multi (OR): id match OR normalized-name fallback match
      if (batchFilter.length > 0) {
        const idHit =
          (l.webinar_batch_id && batchFilter.includes(l.webinar_batch_id)) ||
          (l.source_webinar_batch_id && batchFilter.includes(l.source_webinar_batch_id));
        const nameHit = selectedBatchNames.size > 0 && [
          l.paid_batch_name, l.onboarding_batch_name, l.source_webinar,
        ].some((n) => n && selectedBatchNames.has(normalizeName(n)));
        if (!idHit && !nameHit) return false;
      }
      if (paidBatchFilter.length > 0 && !(l.paid_batch_id && paidBatchFilter.includes(l.paid_batch_id))) return false;
      if (onboardingBatchFilter.length > 0 && !onboardingBatchFilter.includes(l.onboarding_batch_name || "")) return false;
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
      if (revenueStatusFilter.length > 0) {
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
        if (!revenueStatusFilter.some((k) => map[k])) return false;
      }
      if (payDateFrom || payDateTo) {
        const d = webinarDateForLead(l);
        if (!d) return false;
        if (payDateFrom && d < payDateFrom) return false;
        if (payDateTo && d > payDateTo) return false;
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
      if (payStatusFilter !== "all") {
        if (getPaymentStatus(l as any).key !== payStatusFilter) return false;
      }
    return true;
    });
  }, [leads, batches, batchFilter, selectedBatchNames, paidBatchFilter, onboardingBatchFilter, stageFilter, tempFilter, financePartnerFilter, financeStatusFilter, ownerFilter, followUpFilter, revenueStatusFilter, search, tagFilter, leadTagsMap, insightFilter, payStatusFilter, payDateFrom, payDateTo, batchDateById, batchDateByName]);

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

  // ── Filter controls: same filtering logic, rendered either pinned (front) or in the slide-over ──
  const stageOptions = stages.map(s => ({ v: s, l: s }));
  const priorityOptions = TEMPERATURES.map(t => ({ v: t, l: t }));
  const ownerOptions = [{ v: "unassigned", l: "— Unassigned —" }, ...agents.map(a => ({ v: a.id, l: a.full_name }))];
  const financeStatusOptions = ["Not Required","Documents Pending","Documents Received","Application Submitted","Approved","Rejected","Disbursed","Alternate Partner Needed"].map(t => ({ v: t, l: t }));
  const tagOptions = allTags.map(t => ({ v: t.id, l: t.name }));
  const followUpOptions = [
    { v: "today", l: "Due today" }, { v: "overdue", l: "Overdue" }, { v: "upcoming", l: "Upcoming" }, { v: "none", l: "No follow-up" }, { v: "urgent", l: "Hot/Urgent" },
  ];
  const revenueStatusOptions = [
    { value: "token", label: "Token only" },
    { value: "partial", label: "Partially collected" },
    { value: "full", label: "Fully collected" },
    { value: "finance_pending", label: "Finance pending" },
    { value: "finance_disbursed", label: "Finance disbursed" },
    { value: "balance_pending", label: "Balance pending" },
    { value: "dropped", label: "Dropped" },
  ];
  const paymentStatusOptions = [
    { v: "fully_paid", l: "Fully Paid" }, { v: "overpaid", l: "Overpaid · Check" }, { v: "balance_pending", l: "Balance Pending" },
    { v: "token_paid", l: "Token Paid" }, { v: "token_pending", l: "Token Pending" }, { v: "no_payment", l: "No Payment" },
  ];

  const filterControls: Record<PinnedFilterKey, { label: string; inline: React.ReactNode; panel: React.ReactNode }> = {
    dateRange: {
      label: "Date range",
      inline: <InlineDateRangeFilter from={payDateFrom} to={payDateTo} onChange={(f, t) => { setPayDateFrom(f); setPayDateTo(t); }} />,
      panel: <PaymentDateRangeFilter dateFrom={payDateFrom} dateTo={payDateTo} onChange={(f, t) => { setPayDateFrom(f); setPayDateTo(t); }} label="Webinar Date" />,
    },
    stage: {
      label: "Stage",
      inline: <InlineSelectFilter label="Stage" allLabel="All stages" value={stageFilter} onChange={setStageFilter} options={stageOptions} />,
      panel: <FilterSelect value={stageFilter} onChange={setStageFilter} label="All stages" options={stageOptions} />,
    },
    priority: {
      label: "Priority",
      inline: <InlineSelectFilter label="Priority" allLabel="All priorities" value={tempFilter} onChange={setTempFilter} options={priorityOptions} />,
      panel: <FilterSelect value={tempFilter} onChange={setTempFilter} label="All priorities" options={priorityOptions} />,
    },
    owner: {
      label: "Owner",
      inline: <InlineSelectFilter label="Owner" allLabel="All owners" value={ownerFilter} onChange={setOwnerFilter} options={ownerOptions} />,
      panel: <FilterSelect value={ownerFilter} onChange={setOwnerFilter} label="All owners" options={ownerOptions} />,
    },
    financeStatus: {
      label: "Finance status",
      inline: <InlineSelectFilter label="Finance status" allLabel="All finance status" value={financeStatusFilter} onChange={setFinanceStatusFilter} options={financeStatusOptions} />,
      panel: <FilterSelect value={financeStatusFilter} onChange={setFinanceStatusFilter} label="All finance status" options={financeStatusOptions} />,
    },
    financePartner: {
      label: "Finance partner",
      inline: <InlineSelectFilter label="Finance partner" allLabel="All finance partners" value={financePartnerFilter} onChange={setFinancePartnerFilter} options={financePartnerOptions.map(p => ({ v: p, l: p }))} />,
      panel: <FilterSelect value={financePartnerFilter} onChange={setFinancePartnerFilter} label="All finance partners" options={financePartnerOptions.map(p => ({ v: p, l: p }))} />,
    },
    tags: {
      label: "Tags",
      inline: <InlineSelectFilter label="Tags" allLabel="All tags" value={tagFilter} onChange={setTagFilter} options={tagOptions} />,
      panel: <FilterSelect value={tagFilter} onChange={setTagFilter} label="All tags" options={tagOptions} />,
    },
    followUp: {
      label: "Follow-up",
      inline: <InlineSelectFilter label="Follow-up" allLabel="All follow-ups" value={followUpFilter} onChange={setFollowUpFilter} options={followUpOptions} />,
      panel: <FilterSelect value={followUpFilter} onChange={setFollowUpFilter} label="All follow-ups" options={followUpOptions} />,
    },
    webinarBatches: {
      label: "Webinar batches",
      inline: <InlineMultiFilter label="Webinar batches" selectedValues={batchFilter} onChange={setBatchFilter} options={batches.map(b => ({ value: b.id, label: b.batch_name }))} />,
      panel: <MultiSelectFilter label="Webinar batches" selectedValues={batchFilter} onChange={setBatchFilter} options={batches.map(b => ({ value: b.id, label: b.batch_name }))} />,
    },
    paidBatches: {
      label: "Paid batches",
      inline: <InlineMultiFilter label="Paid batches" selectedValues={paidBatchFilter} onChange={setPaidBatchFilter} options={paidBatches.map(b => ({ value: b.id, label: b.batch_name }))} />,
      panel: <MultiSelectFilter label="Paid batches" selectedValues={paidBatchFilter} onChange={setPaidBatchFilter} options={paidBatches.map(b => ({ value: b.id, label: b.batch_name }))} />,
    },
    onboardingBatches: {
      label: "Onboarding batches",
      inline: <InlineMultiFilter label="Onboarding batches" selectedValues={onboardingBatchFilter} onChange={setOnboardingBatchFilter} options={onboardingBatches.map(o => ({ value: o, label: o }))} />,
      panel: <MultiSelectFilter label="Onboarding batches" selectedValues={onboardingBatchFilter} onChange={setOnboardingBatchFilter} options={onboardingBatches.map(o => ({ value: o, label: o }))} />,
    },
    revenueStatus: {
      label: "Revenue status",
      inline: <InlineMultiFilter label="Revenue status" selectedValues={revenueStatusFilter} onChange={setRevenueStatusFilter} options={revenueStatusOptions} />,
      panel: <MultiSelectFilter label="Revenue status" selectedValues={revenueStatusFilter} onChange={setRevenueStatusFilter} options={revenueStatusOptions} />,
    },
    paymentStatus: {
      label: "Payment status",
      inline: <InlineSelectFilter label="Payment status" allLabel="All payment status" value={payStatusFilter} onChange={(v) => setPayStatusFilter(v as PayStatusKey | "all")} options={paymentStatusOptions} />,
      panel: <FilterSelect value={payStatusFilter} onChange={(v) => setPayStatusFilter(v as PayStatusKey | "all")} label="All payment status" options={paymentStatusOptions} />,
    },
  };
  const pinnedOrder = pinned;
  const unpinnedKeys = (Object.keys(filterControls) as PinnedFilterKey[]).filter(k => !isPinned(k));


  return (
    <div className="w-full min-w-0">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-serif text-[28px] text-black">Paid Pipeline</h1>
            <span className="text-[13px] text-muted-foreground font-medium">{leads.length} paid members</span>
          </div>
          <p className="font-sans text-[13px] font-light text-muted-foreground mt-1">
            Track token payments, balance recovery, finance/EMI, and final revenue realization.
          </p>
          <p className="font-sans text-[11.5px] text-muted-foreground/80 mt-1 mb-3">
            Members appear here once a Code of Conduct has been sent. Members still awaiting finance completion are managed in the Calling CRM.
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
            onOpenBatch={(id) => { setPaidBatchFilter([id]); setShowBatches(false); }}
            onBulkSend={(ids) => { setBulkSendIdsOverride(ids); setBulkSend(true); }}
          />
        </div>
      )}

      {true && (<>



      {/* Row 1 — Primary metric strip (4 cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <SumCard label="Total Paid Members" value={String(filtered.length)} accent="blue" />
        <SumCard label="Total Collected" value={inr(totals.collectedTotal)} accent="green" />
        <SumCard label="Balance Pending" value={inr(totals.balance)} accent="gold" />
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
            <SumCard label="Revenue To Be Realized" value={inr(totals.toBeRealized)} />
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

      {/* Row 2 — search */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <input
          className="h-9 border border-line px-3 text-[13px] flex-1 min-w-[220px]"
          style={{ borderRadius: 8 }}
          placeholder="Search name, email, phone…"
          value={searchInput}
          onChange={e => { setSearchInput(e.target.value); if (e.target.value === "") setSearch(""); }}
          onKeyDown={e => { if (e.key === "Enter") setSearch(searchInput); }}
        />
        <button onClick={() => setSearch(searchInput)} className="ipc-btn ipc-btn-black !h-9">Search</button>
      </div>

      {/* Row 2b — pinned (customizable) filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {pinnedOrder.map(k => <div key={k}>{filterControls[k].inline}</div>)}
        <button
          onClick={() => setFiltersOpen(true)}
          className="h-[34px] px-3 border border-line bg-white hover:bg-off text-[12px]"
          style={{ borderRadius: 8 }}
        >Filters{activeFilterChips.length > 0 ? ` (${activeFilterChips.length})` : ""}</button>
        <CustomizeFilterBar pinned={pinned} onToggle={togglePinned} onReset={resetPinned} />
      </div>

      {/* Row 3 — payment-status chips (deduplicated) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {([
          { k: "fully_paid", label: "Fully Paid", cls: "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]" },
          { k: "balance_pending", label: "Balance Pending", cls: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" },
        ] as { k: PayStatusKey; label: string; cls: string }[]).map(c => {
          const active = payStatusFilter === c.k;
          return (
            <button
              key={c.k}
              onClick={() => setPayStatusFilter(active ? "all" : c.k)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${c.cls} ${active ? "ring-2 ring-offset-1 ring-black/50" : "opacity-90 hover:opacity-100"}`}
            >{c.label}</button>
          );
        })}
        {([
          { k: "token_no_second", label: "Token Only", cls: "bg-gold-pale text-[#92400E] border-[#F5D78A]" },
          { k: "urgent_balance", label: "Urgent Balance", cls: "bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]" },
          { k: "no_followup", label: "No Follow-up", cls: "bg-[#F3F4F6] text-[#374151] border-[#E5E7EB]" },
        ]).map(c => {
          const active = insightFilter === c.k;
          return (
            <button
              key={c.k}
              onClick={() => setInsightFilter(active ? null : c.k)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${c.cls} ${active ? "ring-2 ring-offset-1 ring-black/50" : "opacity-90 hover:opacity-100"}`}
            >{c.label}</button>
          );
        })}
      </div>

      {/* Row 4 — result count + active filter chips */}
      <div className="flex items-center justify-end flex-wrap gap-2 mb-2">
        <div className="text-[12.5px] text-muted-foreground">
          Showing <span className="font-medium text-black">{filtered.length}</span> of <span className="font-medium text-black">{leads.length}</span> members
        </div>
      </div>
      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {activeFilterChips.map(c => (
            <span key={c.key} className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-line bg-off text-foreground">
              {c.label}
              <button onClick={c.clear} className="text-muted-foreground hover:text-black leading-none" aria-label={`Remove ${c.label}`}>×</button>
            </span>
          ))}
          <button onClick={resetFilters} className="text-[11px] text-muted-foreground hover:text-black underline ml-1">Clear all</button>
        </div>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[420px] overflow-y-auto flex flex-col !z-[1200]">
          <SheetHeader><SheetTitle className="font-serif text-[20px]">Filters</SheetTitle></SheetHeader>
          <div className="flex-1 space-y-3 mt-4 pb-6">
            {unpinnedKeys.length === 0 && (
              <div className="text-[12px] text-muted-foreground">
                All filters are pinned to the front of the page.
              </div>
            )}
            {unpinnedKeys.map(k => (
              <FilterField key={k} label={filterControls[k].label}>{filterControls[k].panel}</FilterField>
            ))}
            <FilterField label="Advanced">
              <label className="flex items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={insightFilter === "approved_not_disbursed"}
                  onChange={(e) => setInsightFilter(e.target.checked ? "approved_not_disbursed" : null)}
                />
                Approved · not disbursed
              </label>
              <label className="flex items-center gap-2 text-[12.5px] mt-2">
                <input type="checkbox" checked={insightFilter === "high_balance"} onChange={(e) => setInsightFilter(e.target.checked ? "high_balance" : null)} />
                High balance (≥ {inr(HIGH_BAL_THRESHOLD)})
              </label>
              <label className="flex items-center gap-2 text-[12.5px] mt-2">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Show archived buyers
              </label>
            </FilterField>
          </div>
          <div className="sticky bottom-0 bg-white border-t border-line pt-3 mt-4 flex items-center gap-2">
            <button onClick={() => setFiltersOpen(false)} className="ipc-btn ipc-btn-black !h-9 flex-1">Apply</button>
            <button onClick={() => { resetFilters(); setShowArchived(false); }} className="ipc-btn ipc-btn-ghost !h-9">Reset all</button>
          </div>
        </SheetContent>
      </Sheet>



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

      {true && (
        <div className="flex flex-col gap-1">
          {filtered.length === 0 && (
            <div className="border border-dashed border-line rounded-lg p-10 text-center text-muted-foreground text-[13px]">
              <div>No paid leads match these filters.</div>
              <button onClick={resetFilters} className="ipc-btn ipc-btn-ghost !h-8 mt-3">Reset Filters</button>
            </div>
          )}
          {filtered.map(l => {
            const batch = batches.find(b => b.id === l.webinar_batch_id);
            return (
              <CompactPaidRow
                key={l.id}
                lead={l}
                webinarBatchName={batch?.batch_name || null}
                ownerName={agents.find(a => a.id === l.assigned_sales_executive)?.full_name || null}
                tags={leadTagsMap[l.id] || []}
                selected={selected.has(l.id)}
                cocStatus={cocByLeadId.get(l.id)?.status ?? null}
                cocHasCrmLink={cocByLeadId.get(l.id)?.hasCrmLink !== false}
                onToggleSelect={() => toggleOne(l.id)}
                onOpen={() => setOpenId(l.id)}
                onAddPayment={() => setQuickPayId(l.id)}
                onSetFollowUp={() => setQuickFuId(l.id)}
                onUpdateFinance={() => setQuickFinanceId(l.id)}
                stageSlot={
                  <InlineManagedSelect
                    settingType="pipeline_stage"
                    value={l.pipeline_stage || ""}
                    onChange={async (v) => { await updateLead(l.id, { pipeline_stage: v }); recomputePaidLead(l.id); }}
                    width={140}
                    onListChanged={load}
                  />
                }
                prioritySlot={
                  <InlineManagedSelect
                    settingType="lead_priority"
                    value={l.lead_temperature || ""}
                    onChange={(v) => updateLead(l.id, { lead_temperature: v })}
                    width={120}
                    colorize
                    onListChanged={load}
                  />
                }
                financeSlot={<FinanceCell lead={l} onClick={() => setQuickFinanceId(l.id)} />}
                actionsSlot={
                  <RowActionsMenu
                    archived={!!(l as any).archived_at}
                    onAddPayment={() => setQuickPayId(l.id)}
                    onUpdateFinance={() => setQuickFinanceId(l.id)}
                    onSetFollowUp={() => setQuickFuId(l.id)}
                    onOpen={() => setOpenId(l.id)}
                    onCreateInvoice={() => navigate(`/invoices/new?paidLeadId=${l.id}`)}
                    onViewInvoices={() => navigate(`/paid-pipeline/${l.id}/invoices`)}
                    onArchive={() => setArchiveTarget({ id: l.id, name: l.name })}
                    onRestore={async () => {
                      try {
                        await restorePaidBuyer({ id: l.id, name: l.name });
                        toast.success("Buyer restored");
                        await load();
                      } catch (e: any) { toast.error(e.message || "Restore failed"); }
                    }}
                  />
                }
              />
            );
          })}
        </div>
      )}

      </>)}

      {openLead && <PaidPipelineLeadDrawer lead={openLead} agents={agents} onClose={() => { setOpenId(null); load(); }} stages={stages} onChanged={load} />}
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

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="[&_select]:w-full [&>button]:w-full">{children}</div>
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

function RowActionsMenu({ onAddPayment, onUpdateFinance, onSetFollowUp, onOpen, onArchive, onRestore, archived, onCreateInvoice, onViewInvoices }: {
  onAddPayment: () => void; onUpdateFinance: () => void; onSetFollowUp: () => void; onOpen: () => void;
  onArchive: () => void; onRestore: () => void; archived: boolean;
  onCreateInvoice: () => void; onViewInvoices: () => void;
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
      <div className="h-px bg-line my-0.5" />
      <Row onClick={onCreateInvoice} dotColor="#7C3AED" tint="#EDE9FE" title="Create Invoice" subtitle="Auto-fill from paid lead" icon="🧾" />
      <Row onClick={onViewInvoices} dotColor="#4338CA" tint="#E0E7FF" title="View Invoices" subtitle="All invoices for this buyer" icon="📑" />
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
