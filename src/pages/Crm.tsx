import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { supabase } from "@/integrations/supabase/client";
import { GRADE_STYLES, STAGE_COLORS, STAGE_COLOR_OPTIONS, DEFAULT_PIPELINE_TEMPLATES, ensurePipelineExists, type Lead, type Pipeline, type Stage } from "@/lib/crmTypes";
import LeadDrawer from "@/components/LeadDrawer";
import { Plus, LayoutGrid, List, Settings2, Download, ArrowUp, ArrowDown, Trash2, Trophy, X as XIcon, Users, Upload, Pencil, Calendar, ExternalLink, GripVertical } from "lucide-react";
import ImportLeadsModal, { type ImportResult } from "@/components/ImportLeadsModal";
import AddCrmStageModal from "@/components/AddCrmStageModal";
import AddSingleLeadModal from "@/components/crm/AddSingleLeadModal";
import { toast } from "sonner";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import { logActivity } from "@/lib/auditLog";
import AssignModal from "@/components/AssignModal";
import SendToOperationsCrmModal from "@/components/SendToOperationsCrmModal";
import { createNotification } from "@/lib/notifications";
import {
  getActiveHandoffRules, findRuleForStage, isRuleAutoReady, applyAutoHandoff,
  type HandoffRule, type AutoHandoffLeadInput,
} from "@/lib/operationsCrm";
import { listAllTags, getTagsForLeads, pickTagColor, type Tag } from "@/lib/leadTags";
import MultiSelectFilter, { CANONICAL_GRADES, normalizeGradeValue, gradeLabel } from "@/components/crm/MultiSelectFilter";
import { Tag as TagIcon, Layers, Flame, FolderOpen, Clock, Activity } from "lucide-react";
import AttendanceBadge, { ATTENDANCE_GRADE_OPTIONS, ATTENDANCE_MIN_MINUTES_OPTIONS, ATTENDANCE_DATA_OPTIONS } from "@/components/crm/AttendanceBadge";
import { getHotnessForLeads, HOTNESS_LABEL, type HotnessScore, type Hotness } from "@/lib/leadAttendance";
import { ArchiveConfirmModal, PermanentDeleteModal } from "@/components/crm/ArchiveConfirmModal";
import { BatchDeleteChoicesModal } from "@/components/crm/BatchDeleteChoicesModal";
import MoveBatchModal from "@/components/crm/MoveBatchModal";
import { archiveBatch, restoreBatch, permanentlyDeleteBatch, bulkArchiveLeads, getLeadLinks, resetBatchForReimport, safePermanentDeleteBatch } from "@/lib/crmArchive";
import BatchRepairModal from "@/components/crm/BatchRepairModal";
import { bulkDeassignLeads } from "@/lib/crmRepair";
import { useAuth } from "@/context/AuthContext";
import { Archive, RotateCcw } from "lucide-react";
import UniversalSearchPanel from "@/components/crm/UniversalSearchPanel";
import { useFocusKanbanCard } from "@/hooks/useFocusKanbanCard";
import type { UniversalSearchResult } from "@/lib/universalSearch";

type View = "kanban" | "list" | "stages" | "batches";

const leadIdentityText = (lead: any) =>
  [lead?.full_name, lead?.phone, lead?.email, lead?.program_name, lead?.webinar_source]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export default function Crm() {
  const { isAdmin } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [activePipeline, setActivePipeline] = useState<string | null>(null);
  const [view, setView] = useState<View>("kanban");
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);
  const [attendanceGradeFilter, setAttendanceGradeFilter] = useState<string[]>([]);
  const [minAttendedMinutes, setMinAttendedMinutes] = useState<number>(0);
  const [attendanceDataFilter, setAttendanceDataFilter] = useState<"any" | "has" | "none">("any");
  const [hotnessMap, setHotnessMap] = useState<Record<string, HotnessScore>>({});
  const [batchFilter, setBatchFilter] = useState<string[]>([]); // webinar_source values
  const [tagFilter, setTagFilter] = useState<string[]>([]); // tag ids
  const [stageFilter, setStageFilter] = useState<string[]>([]); // stage ids
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [leadTagsMap, setLeadTagsMap] = useState<Record<string, Tag[]>>({});
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [dateField, setDateField] = useState<"webinar_date"|"created_at">("webinar_date");
  const [newPipeline, setNewPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineType, setNewPipelineType] = useState<"unpaid"|"paid"|"custom">("custom");
  const [newPipelineSeed, setNewPipelineSeed] = useState(true);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("gray");
  const [importOpen, setImportOpen] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [sendOpsOpen, setSendOpsOpen] = useState(false);
  const [editBatch, setEditBatch] = useState<{ origName: string; origDate: string | null; name: string; date: string } | null>(null);
  const [batchPipelineFilter, setBatchPipelineFilter] = useState<"all" | "unpaid" | "paid" | "custom">("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);
  const [hoverBefore, setHoverBefore] = useState<string | null>(null);
  const [stageDragId, setStageDragId] = useState<string | null>(null);
  const [stageHoverId, setStageHoverId] = useState<string | null>(null);
  const [renameStageTarget, setRenameStageTarget] = useState<Stage | null>(null);
  const [renameStageValue, setRenameStageValue] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveStageId, setBulkMoveStageId] = useState<string>("");
  const [bulkSendOpsOpen, setBulkSendOpsOpen] = useState(false);
  const [opsRules, setOpsRules] = useState<HandoffRule[]>([]);
  const [opsLeadCrmIds, setOpsLeadCrmIds] = useState<Set<string>>(new Set());
  const [opsBanner, setOpsBanner] = useState<{ rule: HandoffRule; leadIds: string[] } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<"round_robin"|"manual"|"unassign">("round_robin");
  const [assignAgentId, setAssignAgentId] = useState<string>("");
  const [assignScope, setAssignScope] = useState<"unassigned"|"all">("unassigned");
  const [assignBusy, setAssignBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [convertedFilter, setConvertedFilter] = useState<"hide" | "show" | "only">("show");
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkArchiveBusy, setBulkArchiveBusy] = useState(false);
  const [archiveBatchTarget, setArchiveBatchTarget] = useState<{ name: string; date: string | null; pipelineId: string | null; leadIds: string[]; activeCount: number } | null>(null);
  const [archiveBatchBusy, setArchiveBatchBusy] = useState(false);
  const [archiveBatchLinks, setArchiveBatchLinks] = useState<{ paid: number; ops: number } | null>(null);
  const [deleteBatchTarget, setDeleteBatchTarget] = useState<{ name: string; date: string | null; pipelineId: string | null; leadIds: string[] } | null>(null);
  const [deleteBatchBusy, setDeleteBatchBusy] = useState(false);
  const [deleteBatchBlocked, setDeleteBatchBlocked] = useState<string | null>(null);
  const [batchChoicesTarget, setBatchChoicesTarget] = useState<{ name: string; date: string | null; pipelineId: string | null; leadIds: string[]; linkedPaid: number; linkedOps: number } | null>(null);
  const [batchChoicesBusy, setBatchChoicesBusy] = useState(false);
  const [moveBatchTarget, setMoveBatchTarget] = useState<{ name: string; date: string | null; pipelineId: string | null; leadIds: string[] } | null>(null);
  const [repairPickerOpen, setRepairPickerOpen] = useState(false);
  const [repairBatchTarget, setRepairBatchTarget] = useState<{ name: string; date: string | null; pipelineId: string | null } | null>(null);
  const [bulkDeassignBusy, setBulkDeassignBusy] = useState(false);
  const openMoveBatch = (b: { name: string; date: string | null; pipelineId: string | null }) => {
    const leadIds = leads
      .filter((l: any) => (l.webinar_source || "Unsourced") === b.name && (l.webinar_date || null) === b.date)
      .map((l) => l.id);
    if (leadIds.length === 0) { toast.info("No leads in this batch"); return; }
    setMoveBatchTarget({ name: b.name, date: b.date, pipelineId: b.pipelineId, leadIds });
  };
  const toggleSelect = (id: string) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelectedIds(new Set());

  const refreshOpsState = async () => {
    try {
      const [rules, ops] = await Promise.all([
        getActiveHandoffRules().catch(() => [] as HandoffRule[]),
        (supabase as any)
          .from("operations_leads")
          .select("crm_lead_id, service_status")
          .not("crm_lead_id", "is", null)
          .then((r: any) => r, () => ({ data: [] })),
      ]);
      setOpsRules(Array.isArray(rules) ? rules : []);
      const set = new Set<string>();
      (ops?.data ?? []).forEach((r: any) => {
        if (r?.crm_lead_id && r.service_status !== "stopped" && r.service_status !== "completed") set.add(r.crm_lead_id);
      });
      setOpsLeadCrmIds(set);
    } catch (e) {
      console.warn("[crm] refreshOpsState failed", e);
      setOpsRules([]);
      setOpsLeadCrmIds(new Set());
    }
  };
  useEffect(() => { refreshOpsState().catch(() => {}); }, []);

  /** After any CRM stage change, evaluate handoff rules. Returns true if auto-handoff fired. */
  const evaluateHandoffForLeads = async (leadIds: string[], pipelineId: string | null, newStageId: string | null): Promise<boolean> => {
    try {
      const stagesById = new Map((stages || []).map((s) => [s.id, { id: s.id, name: s.name }]));
      const rule = findRuleForStage(opsRules || [], pipelineId, newStageId, stagesById);
      if (!rule) return false;
      const eligibleLeads = (leadIds || [])
        .map((id) => leads.find((l) => l.id === id))
        .filter((l): l is Lead => !!l && !opsLeadCrmIds.has(l.id));
      if (eligibleLeads.length === 0) return false;

      // Auto mode (only if ready) → send now
      if (rule.mode === "auto" && isRuleAutoReady(rule)) {
        const payload: AutoHandoffLeadInput[] = eligibleLeads.map((l) => ({
          id: l.id,
          full_name: l.full_name,
          email: l.email,
          phone: l.phone,
          program_name: (l as any).program_name ?? null,
          webinar_source: l.webinar_source,
          deal_value: (l as any).deal_value ?? null,
          paid_pipeline_lead_id: (l as any).paid_pipeline_lead_id ?? null,
        }));
        const res = await applyAutoHandoff(rule, payload, null).catch((e) => {
          console.warn("[handoff] applyAutoHandoff failed", e);
          return null;
        });
        if (!res) { toast.error("Auto-handoff failed — please try Send to Operations manually"); return false; }
        logActivity({
          module_key: "operations_crm",
          action_type: "operations_auto_handoff_completed",
          entity_type: "operations_leads",
          summary: `Auto-handoff "${rule.name}" · ${res.inserted} created · ${res.updated} updated · ${res.skipped} skipped`,
          metadata: { rule_id: rule.id, ...res, lead_ids: eligibleLeads.map((l) => l.id) },
        }).catch(() => {});
        Object.entries(res.buyerCounts || {}).forEach(([buyerId, count]) => {
          createNotification({
            recipient_user_id: buyerId,
            module_key: "operations_crm",
            notification_type: "operations_leads_assigned",
            title: `${count} new Operations CRM ${count === 1 ? "client" : "clients"} assigned to you`,
            message: `${rule.default_service_package ?? "Service"} · auto-handoff via "${rule.name}"`,
            priority: "high",
            entity_type: "operations_leads",
            entity_label: `${count} clients`,
            action_url: `/operations-crm?assigned_to=me`,
            action_label: "Open Operations CRM",
            metadata: { rule_id: rule.id, count, auto: true },
            allowDuplicate: true,
          }).catch(() => {});
        });
        toast.success(`Auto-handoff: ${res.inserted + res.updated} sent to Operations CRM`);
        refreshOpsState().catch(() => {});
        return true;
      }

      // Suggest mode (or auto-but-incomplete) → banner
      if (rule.mode === "suggest" || (rule.mode === "auto" && !isRuleAutoReady(rule))) {
        setOpsBanner({ rule, leadIds: eligibleLeads.map((l) => l.id) });
        logActivity({
          module_key: "operations_crm",
          action_type: "operations_handoff_suggested",
          summary: `${eligibleLeads.length} lead(s) eligible for Operations via "${rule.name}"`,
          metadata: { rule_id: rule.id, lead_ids: eligibleLeads.map((l) => l.id), mode: rule.mode, fallback: rule.mode === "auto" },
        }).catch(() => {});
      }
      return false;
    } catch (e) {
      console.warn("[crm] evaluateHandoffForLeads crashed (non-fatal)", e);
      return false;
    }
  };

  /** Evaluate Code of Conduct trigger rules for a CRM stage change. */
  const evaluateCoCForLeads = async (leadIds: string[], pipelineId: string | null, newStageId: string | null) => {
    if (!pipelineId || !newStageId) return;
    try {
      const { evaluateStageTrigger } = await import("@/lib/codeOfConductRules");
      let autoSent = 0, suggested = 0, failed = 0;
      for (const id of leadIds) {
        const l = leads.find((x) => x.id === id);
        if (!l) continue;
        const res = await evaluateStageTrigger({
          source: "crm", pipelineId, stageId: newStageId, crmLeadId: id, paidPipelineLeadId: (l as any).paid_pipeline_lead_id || null,
          memberName: l.full_name || "Member", memberEmail: l.email, memberPhone: l.phone,
          programName: (l as any).program_name, dealValue: (l as any).deal_value,
        });
        if (res.action === "auto_sent") autoSent++;
        else if (res.action === "suggested") suggested++;
        else if (res.action === "auto_send_failed" || res.action === "missing_email") failed++;
      }
      if (autoSent) toast.success(`Code of Conduct auto-sent to ${autoSent} lead${autoSent === 1 ? "" : "s"}`);
      if (suggested && leadIds.length === 1) toast.message("Code of Conduct suggested for this stage");
      else if (suggested) toast.message(`Code of Conduct suggested for ${suggested} lead${suggested === 1 ? "" : "s"}`);
      if (failed) toast.error(`Code of Conduct auto-send failed for ${failed} lead${failed === 1 ? "" : "s"}`);
    } catch (e) { console.warn("[crm] evaluateCoCForLeads crashed", e); }
  };




  const handleImportDone = async (result?: ImportResult) => {
    setImportOpen(false);
    await load();
    if (!result) return;
    setActivePipeline(result.pipelineId);
    setBatchFilter([result.batchName]);
    setBatchPipelineFilter(result.leadType);
    setView("batches");
    const pipelineLabel = result.leadType === "paid" ? "Paid — Onboarding" : "Sales Pipeline (Unpaid)";
    const parts: string[] = [];
    if (result.newImported) parts.push(`${result.newImported} new`);
    if (result.moved) parts.push(`${result.moved} moved`);
    if (result.updated) parts.push(`${result.updated} updated`);
    if (result.skippedDuplicates) parts.push(`${result.skippedDuplicates} skipped`);
    if (result.failed) parts.push(`${result.failed} failed`);
    const summary = parts.length ? parts.join(" · ") : `${result.imported} leads`;
    toast.success(
      `${summary} → ${pipelineLabel} · Batch "${result.batchName}"`,
      { duration: 7000 }
    );
  };

  const load = async () => {
    let { data: p } = await supabase.from("pipelines").select("*").order("position");
    // Auto-seed defaults if completely empty so the CRM is never blank
    if (!p || p.length === 0) {
      try {
        await ensurePipelineExists(supabase, "unpaid");
        await ensurePipelineExists(supabase, "paid");
      } catch {/* ignore — RLS may block non-admins */}
      const reload = await supabase.from("pipelines").select("*").order("position");
      p = reload.data || [];
    }
    const [{ data: s }, { data: l }, elig] = await Promise.all([
      supabase.from("stages").select("*").order("position"),
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      getEligibleAssignees("calling_crm"),
    ]);
    setPipelines((p || []) as any);
    setStages((s || []) as any);
    setLeads((l || []) as any);
    setAgents(elig.map((a) => ({ id: a.id, full_name: a.full_name })));
    if (!activePipeline && p && p.length) {
      const want = new URLSearchParams(window.location.search).get("pipeline");
      const paid = (p as any[]).find((x) => x.pipeline_type === "paid");
      if (want === "paid_onboarding" && paid) setActivePipeline(paid.id);
      else setActivePipeline(p[0].id);
    }
  };
  useEffect(() => { load(); }, []);
  const [searchParams, setSearchParamsCrm] = useSearchParams();
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (leadParam) setOpenLead(leadParam);
  }, [searchParams]);

  // Universal Search ↔ Jump-to-Card support
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [focusLeadId, setFocusLeadId] = useState<string | null>(null);
  useEffect(() => {
    const f = searchParams.get("focusLead");
    if (!f) return;
    // Wait for leads to load, then switch to the lead's pipeline + kanban
    const lead = leads.find((l) => l.id === f);
    if (lead) {
      if (lead.pipeline_id) setActivePipeline(lead.pipeline_id);
      setView("kanban");
      setFocusLeadId(f);
      // clear param so subsequent navigations don't re-trigger
      const sp = new URLSearchParams(searchParams);
      sp.delete("focusLead");
      setSearchParamsCrm(sp, { replace: true });
    }
  }, [searchParams, leads]);
  useFocusKanbanCard(focusLeadId, [activePipeline, view]);

  const handleJumpToCrmCard = (r: UniversalSearchResult) => {
    setSearchPanelOpen(false);
    const lead = leads.find((l) => l.id === r.id);
    if (!lead) { toast.error("Lead not visible in your current data — try Open Drawer."); return; }
    if (lead.pipeline_id && lead.pipeline_id !== activePipeline) setActivePipeline(lead.pipeline_id);
    setView("kanban");
    // also detect filtered-out
    const wouldShow =
      (batchFilter.length === 0 || batchFilter.includes(lead.webinar_source || "—")) &&
      (stageFilter.length === 0 || (lead.stage_id && stageFilter.includes(lead.stage_id)));
    if (!wouldShow) {
      toast.message("Lead is hidden by current filters.", {
        action: { label: "Clear filters", onClick: () => resetAll() },
      });
    }
    setFocusLeadId(null);
    // re-arm focus on next tick so re-render picks it up
    setTimeout(() => setFocusLeadId(r.id), 60);
  };
  const handleOpenCrmDrawerFromSearch = (leadId: string) => {
    setSearchPanelOpen(false);
    setOpenLead(leadId);
  };

  const pipelineNameLookup = useMemo(
    () => Object.fromEntries(pipelines.map((p) => [p.id, p.name])),
    [pipelines]
  );
  const stageNameLookup = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.id, s.name])),
    [stages]
  );
  const agentNameLookup = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.id, a.full_name])),
    [agents]
  );

  // Load all tags + per-lead tag assignments whenever the lead list changes
  useEffect(() => {
    (async () => {
      const tags = await listAllTags().catch(() => [] as Tag[]);
      setAllTags(tags);
      const ids = leads.map((l) => l.id);
      if (ids.length === 0) { setLeadTagsMap({}); return; }
      const map = await getTagsForLeads({ crmLeadIds: ids }).catch(() => ({}));
      setLeadTagsMap(map);
    })();
  }, [leads]);

  const pipelineStages = useMemo(() => {
    const all = stages.filter((s) => s.pipeline_id === activePipeline).sort((a, b) => a.position - b.position);
    return all.filter((s) => {
      const active = (s as any).is_active !== false;
      if (active) return true;
      // Keep inactive stages visible only if they still contain leads (so users can move them out)
      return leads.some((l) => l.stage_id === s.id);
    });
  }, [stages, activePipeline, leads]);
  const activePipelineType = useMemo(
    () => pipelines.find((p) => p.id === activePipeline)?.type as "unpaid" | "paid" | "operations" | "custom" | undefined,
    [pipelines, activePipeline]
  );
  const linkedIdentityByLeadId = useMemo(() => {
    const map = new Map<string, string[]>();
    const add = (id: string | null | undefined, text: string) => {
      if (!id || !text.trim()) return;
      const existing = map.get(id) || [];
      existing.push(text);
      map.set(id, existing);
    };
    const byPaidPipeline = new Map<string, any[]>();
    for (const l of leads as any[]) {
      if (l.paid_pipeline_lead_id) {
        const arr = byPaidPipeline.get(l.paid_pipeline_lead_id) || [];
        arr.push(l);
        byPaidPipeline.set(l.paid_pipeline_lead_id, arr);
      }
    }
    for (const l of leads as any[]) {
      const text = leadIdentityText(l);
      add(l.converted_to_crm_lead_id, text);
      if (l.paid_pipeline_lead_id) {
        for (const sibling of byPaidPipeline.get(l.paid_pipeline_lead_id) || []) {
          if (sibling.id !== l.id) add(sibling.id, text);
        }
      }
    }
    return map;
  }, [leads]);
  const pipelineLeads = useMemo(() => {
    let list = leads.filter((l) => l.pipeline_id === activePipeline);
    list = list.filter((l: any) => showArchived ? !!l.archived_at : !l.archived_at && !l.deleted_at);
    // "Converted" / "hide from sales" filter only makes sense for the Sales (unpaid) pipeline.
    // On Paid — Onboarding and Operations CRM, every lead has a paid link by definition, so this
    // filter would incorrectly hide every card (the Kanban visibility bug for Paid Onboarding).
    if (convertedFilter !== "show" && activePipelineType === "unpaid") {
      list = list.filter((l: any) => {
        const isConv = !!l.paid_pipeline_lead_id || l.conversion_status === "converted" || l.conversion_status === "linked_to_paid" || l.hide_from_sales_workload === true;
        return convertedFilter === "only" ? isConv : !isConv;
      });
    }

    if (gradeFilter.length > 0) {
      const set = new Set(gradeFilter);
      list = list.filter((l: any) => {
        if (set.has("super-hot") && l.is_super_hot) return true;
        const g = normalizeGradeValue(l.grade);
        return g && set.has(g);
      });
    }
    if (batchFilter.length > 0) list = list.filter((l) => batchFilter.includes(l.webinar_source || "—"));
    if (tagFilter.length > 0) {
      const tagSet = new Set(tagFilter);
      list = list.filter((l) => (leadTagsMap[l.id] || []).some((t) => tagSet.has(t.id)));
    }
    if (stageFilter.length > 0) list = list.filter((l) => l.stage_id && stageFilter.includes(l.stage_id));
    if (dateFrom) list = list.filter((l: any) => (l[dateField] || "") >= dateFrom);
    if (dateTo) list = list.filter((l: any) => (l[dateField] || "") <= dateTo + (dateField === "created_at" ? "T23:59:59" : ""));
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      // Build extra tokens for fuzzy email matching so a typo like
      // "vu3ge@gmail.com" still surfaces "vu3geq@gmail.com" (same logic as Universal Search).
      const tokens: string[] = [q];
      if (q.includes("@")) {
        const local = q.split("@")[0];
        if (local && local.length >= 3) tokens.push(local);
      }
      const digitsOnly = q.replace(/\D/g, "");
      if (digitsOnly.length >= 5) tokens.push(digitsOnly);
      list = list.filter((l: any) => {
        const hay = [leadIdentityText(l), ...(linkedIdentityByLeadId.get(l.id) || [])].join(" ");
        if (tokens.some((t) => hay.includes(t))) return true;
        // Local-part prefix: actual email begins with the searched local part
        if (q.includes("@") && l.email) {
          const localQ = q.split("@")[0];
          const localL = String(l.email).toLowerCase().split("@")[0];
          if (localQ && localL && (localL.startsWith(localQ) || localQ.startsWith(localL))) return true;
        }
        return false;
      });
    }
    return list.slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [leads, activePipeline, activePipelineType, gradeFilter, batchFilter, tagFilter, stageFilter, leadTagsMap, dateFrom, dateTo, dateField, searchQuery, showArchived, convertedFilter, linkedIdentityByLeadId]);

  // Group leads into webinar batches (cards on the Batches view)
  const batches = useMemo(() => {
    const filteredForBatches = leads.filter((l: any) => showArchived ? !!l.archived_at : !l.archived_at);
    const map = new Map<string, { key: string; name: string; date: string | null; pipelineId: string | null; total: number; hot: number; warm: number; cold: number; superHot: number; absentees: number; created: string | null }>();
    for (const l of filteredForBatches) {
      const key = `${l.webinar_source || "—"}__${l.webinar_date || ""}`;
      const cur = map.get(key) || { key, name: l.webinar_source || "Unsourced", date: l.webinar_date, pipelineId: l.pipeline_id, total: 0, hot: 0, warm: 0, cold: 0, superHot: 0, absentees: 0, created: l.created_at };
      cur.total++;
      if (l.is_super_hot) cur.superHot++;
      if (l.grade === "hot") cur.hot++;
      else if (l.grade === "warm") cur.warm++;
      else if (l.grade === "cold") cur.cold++;
      else if (l.grade === "non-attendee" || l.grade === "true-absentee" || l.grade === "very-cold") cur.absentees++;
      if (!cur.created || (l.created_at && l.created_at > cur.created)) cur.created = l.created_at;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  }, [leads, showArchived]);

  // Tag each batch with the pipeline type for the Batches view tabs and apply the active tab filter.
  const pipelineTypeById = useMemo(() => {
    const m = new Map<string, "unpaid" | "paid" | "custom">();
    pipelines.forEach((p) => m.set(p.id, p.type as any));
    return m;
  }, [pipelines]);
  const batchesWithType = useMemo(
    () => batches.map((b) => ({ ...b, pipelineType: (b.pipelineId && pipelineTypeById.get(b.pipelineId)) || "custom" as const })),
    [batches, pipelineTypeById]
  );
  const batchCounts = useMemo(() => {
    let unpaid = 0, paid = 0, custom = 0;
    for (const b of batchesWithType) {
      if (b.pipelineType === "unpaid") unpaid++;
      else if (b.pipelineType === "paid") paid++;
      else custom++;
    }
    return { all: batchesWithType.length, unpaid, paid, custom };
  }, [batchesWithType]);
  const visibleBatches = useMemo(() => {
    let list = batchPipelineFilter === "all" ? batchesWithType : batchesWithType.filter((b) => b.pipelineType === batchPipelineFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const matchingKeys = new Set<string>();
      for (const l of leads) {
        const hay = [l.full_name, l.phone, l.email, l.program_name, l.webinar_source].filter(Boolean).join(" ").toLowerCase();
        if (hay.includes(q)) matchingKeys.add(`${l.webinar_source || "—"}__${l.webinar_date || ""}`);
      }
      list = list.filter((b) => b.name.toLowerCase().includes(q) || matchingKeys.has(b.key));
    }
    return list;
  }, [batchesWithType, batchPipelineFilter, searchQuery, leads]);


  type BatchCategory = "all" | "super-hot" | "hot" | "warm" | "cold" | "absentees";
  const downloadBatchCsv = (batch: { name: string; date: string | null }, category: BatchCategory) => {
    const inBatch = leads.filter((l) => (l.webinar_source || "Unsourced") === batch.name && (l.webinar_date || null) === batch.date);
    const filtered = inBatch.filter((l) => {
      if (category === "all") return true;
      if (category === "super-hot") return l.is_super_hot;
      if (category === "absentees") return l.grade === "non-attendee" || l.grade === "true-absentee" || l.grade === "very-cold";
      return l.grade === category;
    });
    if (filtered.length === 0) { toast.info(`No ${category} leads in this batch`); return; }
    const rows = [["Name","Email","Phone","Country","Score","Grade","Super Hot","Attendance %","Total Minutes","Sessions","Webinar","Webinar Date","Stage","Agent","Deal Value"]];
    for (const l of filtered) {
      const stg = stages.find((s) => s.id === l.stage_id)?.name || "";
      const ag = agents.find((a) => a.id === l.assigned_agent_id)?.full_name || "";
      rows.push([l.full_name||"", l.email||"", l.phone||"", l.country||"", String(l.score), l.grade, l.is_super_hot?"Yes":"", String(l.attendance_pct||0), String(l.total_minutes||0), String(l.sessions_count||0), l.webinar_source||"", l.webinar_date||"", stg, ag, String(l.deal_value||0)]);
    }
    const csv = rows.map((r) => r.map((c) => `"${(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const slug = `${batch.name}-${batch.date||"nodate"}-${category}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.download = `crm-batch-${slug}.csv`;
    a.click();
    toast.success(`Downloaded ${filtered.length} ${category} leads`);
  };

  const onDrop = async (e: React.DragEvent, stageId: string, beforeLeadId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData("text/plain") || dragId || "";
    const id = raw.startsWith("stage:") ? "" : raw;
    setDragId(null); setHoverStage(null); setHoverBefore(null);
    if (!id) return;
    const effectiveBefore = beforeLeadId === "__end__" ? undefined : beforeLeadId;
    if (effectiveBefore === id) return; // dropped on self, no-op
    const current = leads.find(l => l.id === id);
    if (current && current.stage_id === stageId && !effectiveBefore && beforeLeadId !== "__end__") {
      // dropped on same stage's empty area with no specific target — no-op
      return;
    }
    // Compute new sort_order based on neighbors in target stage
    const targetList = leads.filter((l) => l.pipeline_id === activePipeline && l.stage_id === stageId && l.id !== id)
      .slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    let newOrder = 0;
    if (effectiveBefore) {
      const idx = targetList.findIndex((l) => l.id === effectiveBefore);
      const before: any = targetList[idx - 1];
      const after: any = targetList[idx];
      const a = before ? Number(before.sort_order || 0) : (after ? Number(after.sort_order || 0) - 1000 : 0);
      const b = after ? Number(after.sort_order || 0) : (before ? Number(before.sort_order || 0) + 1000 : 0);
      newOrder = (a + b) / 2;
    } else {
      const last: any = targetList[targetList.length - 1];
      newOrder = last ? Number(last.sort_order || 0) + 1000 : 100;
    }
    const oldStageId = leads.find(l => l.id === id)?.stage_id;
    const oldSort = (leads.find(l => l.id === id) as any)?.sort_order;
    await supabase.from("leads").update({ stage_id: stageId, sort_order: newOrder }).eq("id", id);
    const lead = leads.find(l => l.id === id);
    const oldName = stages.find(s => s.id === oldStageId)?.name ?? "—";
    const newName = stages.find(s => s.id === stageId)?.name ?? "—";
    if (oldStageId !== stageId) {
      logActivity({ module_key: "calling_crm", action_type: "crm_card_moved", entity_type: "crm_lead", entity_id: id, entity_label: lead?.full_name ?? undefined, old_values: { stage: oldName, sort_order: oldSort }, new_values: { stage: newName, sort_order: newOrder }, summary: `${lead?.full_name ?? "Lead"} moved from ${oldName} to ${newName}.` });
    } else {
      logActivity({ module_key: "calling_crm", action_type: "crm_card_reordered", entity_type: "crm_lead", entity_id: id, entity_label: lead?.full_name ?? undefined, old_values: { sort_order: oldSort }, new_values: { sort_order: newOrder }, summary: `${lead?.full_name ?? "Lead"} reordered within ${newName}.` });
    }
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, stage_id: stageId, sort_order: newOrder } as any : l));
    if (oldStageId !== stageId) {
      const lead2 = leads.find((l) => l.id === id);
      evaluateHandoffForLeads([id], lead2?.pipeline_id ?? activePipeline, stageId).catch(() => {});
      evaluateCoCForLeads([id], lead2?.pipeline_id ?? activePipeline, stageId).catch(() => {});
    }

  };

  const createPipeline = async () => {
    const name = newPipelineName.trim();
    if (!name) return;
    const dup = pipelines.find(p => p.name.trim().toLowerCase() === name.toLowerCase() && p.type === newPipelineType);
    if (dup) { toast.error(`A ${newPipelineType} pipeline named "${name}" already exists`); return; }
    const { data, error } = await supabase.from("pipelines").insert({ name, type: newPipelineType, position: pipelines.length }).select().maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (data) {
      if (newPipelineSeed) {
        const tmpl = DEFAULT_PIPELINE_TEMPLATES[newPipelineType];
        await supabase.from("stages").insert(tmpl.map((s, i) => ({
          pipeline_id: data.id, name: s.name, color: s.color, position: i,
          is_won: !!s.is_won, is_lost: !!s.is_lost, is_protected: !!s.is_protected,
        })));
      }
      setNewPipeline(false); setNewPipelineName(""); setNewPipelineType("custom"); setNewPipelineSeed(true);
      await load();
      setActivePipeline(data.id);
      setView("stages");
    }
  };

  const renamePipeline = async (id: string, name: string) => {
    if (!name.trim()) return;
    await supabase.from("pipelines").update({ name: name.trim() }).eq("id", id);
    await load();
  };
  const setPipelineType = async (id: string, type: "unpaid"|"paid"|"custom") => {
    await supabase.from("pipelines").update({ type }).eq("id", id); await load();
  };
  const deletePipeline = async (id: string) => {
    const count = leads.filter((l) => l.pipeline_id === id).length;
    if (count > 0) { toast.error(`${count} leads attached — move or delete them first`); return; }
    if (!confirm("Delete this pipeline and all its stages?")) return;
    await supabase.from("stages").delete().eq("pipeline_id", id);
    await supabase.from("pipelines").delete().eq("id", id);
    if (activePipeline === id) setActivePipeline(null);
    await load();
  };

  const addStage = async () => {
    if (!newStageName.trim() || !activePipeline) return;
    await supabase.from("stages").insert({ pipeline_id: activePipeline, name: newStageName.trim(), color: newStageColor, position: pipelineStages.length });
    setNewStageName(""); setNewStageColor("gray");
    await load();
  };

  const updateStage = async (id: string, patch: Partial<Stage>) => {
    await supabase.from("stages").update(patch as any).eq("id", id); await load();
  };
  const moveStage = async (s: Stage, dir: -1 | 1) => {
    const idx = pipelineStages.findIndex((x) => x.id === s.id);
    const swap = pipelineStages[idx + dir];
    if (!swap) return;
    await supabase.from("stages").update({ position: swap.position }).eq("id", s.id);
    await supabase.from("stages").update({ position: s.position }).eq("id", swap.id);
    logActivity({ module_key: "calling_crm", action_type: "crm_stage_reordered", entity_type: "crm_stage", entity_id: s.id, entity_label: s.name, old_values: { position: s.position }, new_values: { position: swap.position }, summary: `Stage "${s.name}" moved ${dir < 0 ? "left" : "right"}` });
    await load();
  };

  const reorderStageDrop = async (target: Stage) => {
    const drag = stages.find((x) => x.id === stageDragId);
    setStageDragId(null); setStageHoverId(null);
    if (!drag || drag.id === target.id || drag.pipeline_id !== target.pipeline_id) return;
    const ordered = pipelineStages.filter((s) => s.id !== drag.id);
    const targetIdx = ordered.findIndex((s) => s.id === target.id);
    const insertIdx = (pipelineStages.findIndex((s) => s.id === drag.id) < targetIdx) ? targetIdx + 1 : targetIdx;
    ordered.splice(insertIdx, 0, drag);
    // Rewrite positions sequentially for the active pipeline
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].position !== i) {
        await supabase.from("stages").update({ position: i }).eq("id", ordered[i].id);
      }
    }
    logActivity({ module_key: "calling_crm", action_type: "crm_stage_reordered", entity_type: "crm_stage", entity_id: drag.id, entity_label: drag.name, summary: `Stage "${drag.name}" reordered` });
    await load();
  };

  // Pipeline tab reorder (admin only, global)
  const [pipeDragId, setPipeDragId] = useState<string | null>(null);
  const [pipeHoverId, setPipeHoverId] = useState<string | null>(null);
  const reorderPipelineDrop = async (target: any) => {
    const dragId = pipeDragId;
    setPipeDragId(null); setPipeHoverId(null);
    if (!isAdmin || !dragId || dragId === target.id) return;
    const drag = pipelines.find((p) => p.id === dragId);
    if (!drag) return;
    const prevFirstId = pipelines[0]?.id;
    const ordered = pipelines.filter((p) => p.id !== dragId);
    const targetIdx = ordered.findIndex((p) => p.id === target.id);
    const dragIdx = pipelines.findIndex((p) => p.id === dragId);
    const insertIdx = dragIdx < targetIdx ? targetIdx + 1 : targetIdx;
    ordered.splice(insertIdx, 0, drag);
    try {
      for (let i = 0; i < ordered.length; i++) {
        if ((ordered[i] as any).position !== i) {
          const { error } = await supabase.from("pipelines").update({ position: i }).eq("id", ordered[i].id);
          if (error) throw error;
        }
      }
      logActivity({ module_key: "calling_crm", action_type: "pipeline_tabs_reordered", entity_type: "pipeline", entity_id: drag.id, entity_label: (drag as any).name, summary: `Pipeline tabs reordered: "${(drag as any).name}" moved.` });
      const newFirstId = ordered[0]?.id;
      if (newFirstId && newFirstId !== prevFirstId) {
        const newFirst: any = ordered[0];
        logActivity({ module_key: "calling_crm", action_type: "default_pipeline_changed", entity_type: "pipeline", entity_id: newFirst.id, entity_label: newFirst.name, new_values: { default_pipeline: newFirst.name }, summary: `Default pipeline changed to "${newFirst.name}".` });
      }
      toast.success("Pipeline order saved");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to reorder pipelines");
    }
  };

  const renameStage = async (s: Stage, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) { toast.error("Name required"); return; }
    if (trimmed.toLowerCase() === s.name.toLowerCase()) { setRenameStageTarget(null); return; }
    const duplicate = pipelineStages.some((x) => x.id !== s.id && x.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) { toast.error("Another stage in this pipeline already uses that name"); return; }
    const { error } = await supabase.from("stages").update({ name: trimmed }).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Stage renamed to "${trimmed}"`);
    logActivity({ module_key: "calling_crm", action_type: "crm_stage_renamed", entity_type: "crm_stage", entity_id: s.id, entity_label: trimmed, old_values: { name: s.name }, new_values: { name: trimmed }, summary: `Stage "${s.name}" renamed to "${trimmed}"` });
    setRenameStageTarget(null);
    await load();
  };

  const deactivateStage = async (s: Stage) => {
    const count = leads.filter((l) => l.stage_id === s.id).length;
    if (count > 0) {
      if (!confirm(`"${s.name}" still holds ${count} lead${count === 1 ? "" : "s"}. Deactivate? It stays visible until those leads move out, but it won't show in new selections.`)) return;
    } else {
      if (!confirm(`Deactivate "${s.name}"? It will be hidden from selections.`)) return;
    }
    const { error } = await supabase.from("stages").update({ is_active: false } as any).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Stage "${s.name}" deactivated`);
    logActivity({ module_key: "calling_crm", action_type: "crm_stage_deactivated", entity_type: "crm_stage", entity_id: s.id, entity_label: s.name, summary: `Stage "${s.name}" deactivated`, severity: "warning" });
    await load();
  };

  const deleteStage = async (s: Stage) => {
    if (s.is_protected) { toast.error("Protected stage — cannot delete"); return; }
    const count = leads.filter((l) => l.stage_id === s.id).length;
    if (count > 0) { toast.error(`${count} lead(s) still in "${s.name}". Move them first, or deactivate instead.`); return; }
    if (!confirm(`Delete stage "${s.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("stages").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Stage "${s.name}" deleted`);
    logActivity({ module_key: "calling_crm", action_type: "crm_stage_deleted", entity_type: "crm_stage", entity_id: s.id, entity_label: s.name, summary: `Stage "${s.name}" deleted`, severity: "warning" });
    await load();
  };

  const exportCsv = () => {
    const rows = [["Name","Email","Phone","Score","Grade","Stage","Webinar","Agent","Deal"]];
    for (const l of pipelineLeads) {
      const stg = stages.find((s) => s.id === l.stage_id)?.name || "";
      const ag = agents.find((a) => a.id === l.assigned_agent_id)?.full_name || "";
      rows.push([l.full_name||"", l.email||"", l.phone||"", String(l.score), l.grade, stg, l.webinar_source||"", ag, String(l.deal_value)]);
    }
    const csv = rows.map((r) => r.map((c) => `"${(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `crm-leads-${Date.now()}.csv`; a.click();
  };

  const runAssignment = async () => {
    setAssignBusy(true);
    try {
      const target = pipelineLeads.filter((l) => assignScope === "all" ? true : !l.assigned_agent_id);
      if (target.length === 0) { toast.info("No leads to assign in current view"); setAssignBusy(false); return; }
      const buckets = new Map<string | null, string[]>();
      if (assignMode === "unassign") {
        const ids = target.map((l) => l.id);
        await supabase.from("leads").update({ assigned_agent_id: null }).in("id", ids);
        toast.success(`Unassigned ${ids.length} leads`);
      } else if (assignMode === "manual") {
        if (!assignAgentId) { toast.error("Pick an agent"); setAssignBusy(false); return; }
        const ids = target.map((l) => l.id);
        await supabase.from("leads").update({ assigned_agent_id: assignAgentId }).in("id", ids);
        buckets.set(assignAgentId, ids);
        toast.success(`Assigned ${ids.length} leads`);
      } else {
        if (agents.length === 0) { toast.error("No active sales agents available"); setAssignBusy(false); return; }
        target.forEach((l, i) => {
          const a = agents[i % agents.length].id;
          if (!buckets.has(a)) buckets.set(a, []);
          buckets.get(a)!.push(l.id);
        });
        for (const [aid, ids] of buckets) {
          await supabase.from("leads").update({ assigned_agent_id: aid }).in("id", ids);
        }
        toast.success(`Round-robin assigned ${target.length} leads to ${buckets.size} agents`);
      }
      setAssignOpen(false);
      logActivity({ module_key: "calling_crm", action_type: assignMode === "unassign" ? "crm_bulk_unassigned" : "crm_bulk_assigned", entity_type: "crm_lead", metadata: { mode: assignMode, scope: assignScope, count: target.length, agent_id: assignAgentId || null }, summary: `${target.length} CRM leads ${assignMode === "unassign" ? "unassigned" : assignMode === "manual" ? `assigned to ${agents.find(a => a.id === assignAgentId)?.full_name ?? "agent"}` : "round-robin assigned"}.` });
      // Notifications — one grouped per assignee
      if (assignMode !== "unassign") {
        const { data: { user: actor } } = await supabase.auth.getUser();
        for (const [uid, ids] of buckets) {
          if (!uid) continue;
          try {
            await createNotification({
              recipient_user_id: uid,
              module_key: "calling_crm",
              notification_type: "leads_assigned",
              title: "New Calling CRM leads assigned",
              message: `${ids.length} Calling CRM lead(s) ${assignMode === "round_robin" ? "(round-robin) " : ""}assigned to you.`,
              priority: ids.length >= 10 ? "high" : "normal",
              action_url: "/crm?assigned_to=me",
              action_label: "Open Calling CRM",
              entity_type: "lead_assignment",
              triggered_by_user_id: actor?.id ?? null,
              allowDuplicate: true,
              metadata: {
                module_key: "calling_crm",
                lead_ids: ids,
                assignment_type: assignMode === "round_robin" ? "round_robin" : (assignScope === "all" ? "filtered" : "bulk"),
                assigned_by: actor?.id ?? null,
                assigned_to: uid,
                count: ids.length,
                deep_link: "/crm?assigned_to=me",
              },
            });
          } catch { /* ignore */ }
        }
      }
      await load();
    } catch (e: any) { toast.error(e.message || "Assignment failed"); }
    finally { setAssignBusy(false); }
  };

  // Base scope for option counts: leads in the current pipeline, archived/converted filters honored,
  // but BEFORE multi-select filters apply — so users always see the universe of options.
  const filterScopeLeads = useMemo(() => {
    let list = leads.filter((l) => l.pipeline_id === activePipeline);
    list = list.filter((l: any) => showArchived ? !!l.archived_at : !l.archived_at && !l.deleted_at);
    if (convertedFilter !== "show" && activePipelineType === "unpaid") {
      list = list.filter((l: any) => {
        const isConv = !!l.paid_pipeline_lead_id || l.conversion_status === "converted" || l.conversion_status === "linked_to_paid" || l.hide_from_sales_workload === true;
        return convertedFilter === "only" ? isConv : !isConv;
      });
    }
    return list;
  }, [leads, activePipeline, activePipelineType, showArchived, convertedFilter]);

  const batchOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of filterScopeLeads) {
      const b = l.webinar_source || "—";
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count }));
  }, [filterScopeLeads]);

  const gradeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    let superHotCount = 0;
    for (const l of filterScopeLeads as any[]) {
      if (l.is_super_hot) superHotCount++;
      const g = normalizeGradeValue(l.grade);
      if (g) counts.set(g, (counts.get(g) || 0) + 1);
    }
    const seen = new Set<string>();
    const out: { value: string; label: string; count: number }[] = [];
    for (const c of CANONICAL_GRADES) {
      const count = c.value === "super-hot" ? superHotCount : (counts.get(c.value) || 0);
      seen.add(c.value);
      out.push({ value: c.value, label: c.label, count });
    }
    // Surface any grades present in data that aren't in the canonical list.
    for (const [value, count] of counts.entries()) {
      if (!seen.has(value)) out.push({ value, label: gradeLabel(value), count });
    }
    return out;
  }, [filterScopeLeads]);

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of filterScopeLeads) {
      for (const t of leadTagsMap[l.id] || []) counts.set(t.id, (counts.get(t.id) || 0) + 1);
    }
    return allTags
      .map((t) => ({ value: t.id, label: t.name, count: counts.get(t.id) || 0, color: t.color || undefined }))
      .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
  }, [allTags, leadTagsMap, filterScopeLeads]);

  const stageOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of filterScopeLeads) {
      if (l.stage_id) counts.set(l.stage_id, (counts.get(l.stage_id) || 0) + 1);
    }
    return pipelineStages.map((s) => ({ value: s.id, label: s.name, count: counts.get(s.id) || 0 }));
  }, [pipelineStages, filterScopeLeads]);

  const tagNameLookup = useMemo(() => Object.fromEntries(allTags.map((t) => [t.id, t.name])), [allTags]);
  const stageNameLookupLocal = useMemo(() => Object.fromEntries(pipelineStages.map((s) => [s.id, s.name])), [pipelineStages]);

  const activeFilterCount =
    gradeFilter.length +
    batchFilter.length +
    tagFilter.length +
    stageFilter.length +
    (dateFrom || dateTo ? 1 : 0) +
    (searchQuery ? 1 : 0);
  const advancedActiveCount = tagFilter.length + stageFilter.length;
  const resetAll = () => { setGradeFilter([]); setBatchFilter([]); setTagFilter([]); setStageFilter([]); setDateFrom(""); setDateTo(""); setSearchQuery(""); };

  return (
    <div>
      {/* Compact header */}
      <div className="flex items-end justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-[22px] leading-tight">Calling CRM</h1>
          <div className="text-[11px] text-muted-foreground">Diamond Program sales pipeline</div>
        </div>
        <button
          onClick={() => {
            const pipe = pipelines.find((p) => p.id === activePipeline);
            const isPaid = pipe && (pipe as any).pipeline_type === "paid";
            navigate(isPaid ? "/paid-pipeline?source=crm-paid-onboarding" : "/paid-pipeline");
          }}
          className="ipc-btn !h-9 bg-gold text-black hover:opacity-90 shadow-sm font-medium"
          title="Track token, balance, finance, and revenue"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open Paid Pipeline
        </button>
      </div>

      {/* Compact toolbar */}
      <div className="sticky top-0 z-20 bg-bg pt-1 pb-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-white">
            <button onClick={() => setView("kanban")} className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 ${view === "kanban" ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}><LayoutGrid className="w-3 h-3" /> Kanban</button>
            <button onClick={() => setView("list")} className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 ${view === "list" ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}><List className="w-3 h-3" /> List</button>
            <button onClick={() => setView("batches")} className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 ${view === "batches" ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}>Batches</button>
            <button onClick={() => setView("stages")} className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 ${view === "stages" ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}><Settings2 className="w-3 h-3" /> Stages</button>
          </div>

          {(view === "kanban" || view === "list" || view === "batches") && (
            <div className="relative flex-1 min-w-[200px] max-w-[420px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchPanelOpen(true); }}
                onFocus={() => { if (searchQuery.trim()) setSearchPanelOpen(true); }}
                placeholder={view === "batches" ? "Search batches or leads…" : "Search name, phone, email — across all pipelines"}
                className="ipc-input !h-9 !text-xs !pl-7 w-full"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">⌕</span>
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchPanelOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-black" title="Clear search">
                  <XIcon className="w-3 h-3" />
                </button>
              )}
              {searchPanelOpen && (
                <UniversalSearchPanel
                  query={searchQuery}
                  currentPipelineId={activePipeline}
                  pipelineNameLookup={pipelineNameLookup}
                  stageNameLookup={stageNameLookup}
                  agentNameLookup={agentNameLookup}
                  onOpenCrmDrawer={handleOpenCrmDrawerFromSearch}
                  onJumpToCrmCard={handleJumpToCrmCard}
                  onClose={() => setSearchPanelOpen(false)}
                />
              )}
            </div>
          )}

          {(view === "kanban" || view === "list") && (
            <>
              <MultiSelectFilter
                label="Batches"
                icon={<FolderOpen className="w-3.5 h-3.5" />}
                options={batchOptions}
                selectedValues={batchFilter}
                onChange={setBatchFilter}
                placeholder="All batches"
                panelWidth={300}
              />
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-white h-9">
                <select className="!text-[11px] bg-transparent border-0 outline-none px-1" value={dateField} onChange={(e) => setDateField(e.target.value as any)} title="Date field">
                  <option value="webinar_date">Webinar</option>
                  <option value="created_at">Imported</option>
                </select>
                <input type="date" className="!text-[11px] border-0 outline-none px-0.5 w-[110px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From" />
                <span className="text-muted-foreground text-[10px]">–</span>
                <input type="date" className="!text-[11px] border-0 outline-none px-0.5 w-[110px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To" />
                {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-muted-foreground hover:text-black px-1" title="Clear"><XIcon className="w-3 h-3" /></button>}
              </div>
              <MultiSelectFilter
                label="Grades"
                icon={<Flame className="w-3.5 h-3.5" />}
                options={gradeOptions}
                selectedValues={gradeFilter}
                onChange={setGradeFilter}
                placeholder="All grades"
                panelWidth={260}
              />
              <select className="ipc-input !h-9 !text-xs" value={convertedFilter} onChange={(e) => setConvertedFilter(e.target.value as any)} title="Converted leads">
                <option value="hide">Hide converted</option>
                <option value="show">Show converted</option>
                <option value="only">Converted only</option>
              </select>
              <MultiSelectFilter
                label="Tags"
                icon={<TagIcon className="w-3.5 h-3.5" />}
                options={tagOptions}
                selectedValues={tagFilter}
                onChange={setTagFilter}
                placeholder="All tags"
                panelWidth={280}
              />
              <MultiSelectFilter
                label="Stages"
                icon={<Layers className="w-3.5 h-3.5" />}
                options={stageOptions}
                selectedValues={stageFilter}
                onChange={setStageFilter}
                placeholder="All stages"
                panelWidth={300}
              />
            </>
          )}

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={`ipc-btn !h-9 !text-xs ${showArchived ? "!bg-[#FEF3C7] !text-[#92400E] border-[#FDE68A]" : "ipc-btn-ghost"}`}
              title={showArchived ? "Showing archived — click to hide" : "Show archived leads and batches"}
            >
              <Archive className="w-3.5 h-3.5" /> {showArchived ? "Showing archived" : "Show archived"}
            </button>
            <button onClick={() => setAddLeadOpen(true)} className="ipc-btn ipc-btn-black !h-9 !text-xs" title="Add a single lead manually"><Plus className="w-3.5 h-3.5" /> Add Lead</button>
            <button onClick={() => setImportOpen(true)} className="ipc-btn ipc-btn-ghost !h-9 !text-xs"><Upload className="w-3.5 h-3.5" /> Import</button>
            <button onClick={() => setAssignOpen(true)} className="ipc-btn ipc-btn-ghost !h-9 !text-xs"><Users className="w-3.5 h-3.5" /> Assign</button>
            {(() => {
              const pipe = pipelines.find((p) => p.id === activePipeline) as any;
              if (!pipe || pipe.pipeline_type !== "paid") return null;
              return (
                <button onClick={() => setSendOpsOpen(true)} className="ipc-btn ipc-btn-ghost !h-9 !text-xs" title="Send paid clients to Operations CRM for service delivery">
                  <ExternalLink className="w-3.5 h-3.5" /> Send to Operations
                </button>
              );
            })()}
            <button onClick={() => setAddStageOpen(true)} className="ipc-btn ipc-btn-ghost !h-9 !text-xs" title="Add a new Kanban stage"><Plus className="w-3.5 h-3.5" /> Add Stage</button>
            <OverflowActionsMenu
              onExport={exportCsv}
            />
          </div>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {searchQuery && (
              <FilterChip label={`Search: ${searchQuery}`} onClear={() => setSearchQuery("")} />
            )}
            {batchFilter.map((b) => (
              <FilterChip key={`b-${b}`} label={`Batch: ${b}`} onClear={() => setBatchFilter(batchFilter.filter((x) => x !== b))} />
            ))}
            {gradeFilter.map((g) => (
              <FilterChip key={`g-${g}`} label={`Grade: ${gradeLabel(g)}`} onClear={() => setGradeFilter(gradeFilter.filter((x) => x !== g))} />
            ))}
            {(dateFrom || dateTo) && (
              <FilterChip label={`${dateField === "webinar_date" ? "Webinar" : "Imported"}: ${dateFrom || "…"} → ${dateTo || "…"}`} onClear={() => { setDateFrom(""); setDateTo(""); }} />
            )}
            {tagFilter.map((tid) => (
              <FilterChip key={`t-${tid}`} label={`Tag: ${tagNameLookup[tid] || tid}`} onClear={() => setTagFilter(tagFilter.filter((x) => x !== tid))} />
            ))}
            {stageFilter.map((sid) => (
              <FilterChip key={`s-${sid}`} label={`Stage: ${stageNameLookupLocal[sid] || sid}`} onClear={() => setStageFilter(stageFilter.filter((x) => x !== sid))} />
            ))}
            <button onClick={resetAll} className="text-[10px] text-muted-foreground hover:text-black underline underline-offset-2">Reset all</button>
          </div>
        )}
      </div>


      {(view === "kanban" || view === "list") && (
        <div className="text-[11px] text-muted-foreground mb-2">
          Showing <span className="font-medium text-foreground">{pipelineLeads.length}</span> of <span className="font-medium text-foreground">{leads.filter((l) => l.pipeline_id === activePipeline).length}</span> leads
        </div>
      )}
      {view === "batches" && (
        <div className="text-[11px] text-muted-foreground mb-2">
          Showing <span className="font-medium text-foreground">{visibleBatches.length}</span> of <span className="font-medium text-foreground">{batchesWithType.length}</span> batches
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-14 z-40 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-gold bg-gold-pale shadow-sm">
          <div className="text-xs font-medium text-black">{selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} selected</div>
          <button
            onClick={() => {
              const ids = pipelineLeads.map((l) => l.id);
              setSelectedIds((p) => {
                const allSelected = ids.every((id) => p.has(id));
                if (allSelected) { const n = new Set(p); ids.forEach((id) => n.delete(id)); return n; }
                return new Set([...p, ...ids]);
              });
            }}
            className="text-[11px] underline text-muted-foreground hover:text-black ml-2"
          >
            {pipelineLeads.every((l) => selectedIds.has(l.id)) ? "Deselect view" : "Select all in view"}
          </button>
          <div className="flex-1" />
          <button onClick={() => setBulkMoveOpen(true)} className="ipc-btn ipc-btn-ghost !h-8 !text-xs">Move Stage</button>
          <button onClick={() => setAssignOpen(true)} className="ipc-btn ipc-btn-ghost !h-8 !text-xs">Assign</button>
          <button onClick={() => setBulkSendOpsOpen(true)} className="ipc-btn ipc-btn-black !h-8 !text-xs">
            <ExternalLink className="w-3 h-3" /> Send to Operations
          </button>
          <button
            onClick={async () => {
              if (bulkDeassignBusy) return;
              const ids = Array.from(selectedIds);
              const assignedIds = pipelineLeads.filter((l) => selectedIds.has(l.id) && (l as any).assigned_agent_id).map((l) => l.id);
              if (!assignedIds.length) { toast.info("None of the selected leads are currently assigned."); return; }
              if (!confirm(`De-assign ${assignedIds.length} lead${assignedIds.length === 1 ? "" : "s"} from their owners? Leads remain in CRM but disappear from sales executive workloads.`)) return;
              setBulkDeassignBusy(true);
              try {
                await bulkDeassignLeads(assignedIds, { source: "crm_bulk_bar" });
                toast.success(`${assignedIds.length} lead${assignedIds.length === 1 ? "" : "s"} de-assigned`);
                clearSelection();
                await load();
              } catch (e: any) { toast.error(e?.message || "De-assign failed"); }
              finally { setBulkDeassignBusy(false); }
            }}
            disabled={bulkDeassignBusy}
            className="ipc-btn ipc-btn-ghost !h-8 !text-xs !text-[#92400E] hover:!bg-[#FEF3C7] disabled:opacity-50"
          >
            De-assign
          </button>
          <button onClick={() => setBulkArchiveOpen(true)} className="ipc-btn ipc-btn-ghost !h-8 !text-xs !text-[#92400E] hover:!bg-[#FEF3C7]">
            <Archive className="w-3 h-3" /> Archive Selected
          </button>
          <button onClick={clearSelection} className="ipc-btn ipc-btn-ghost !h-8 !text-xs">Clear</button>
        </div>
      )}

      {opsBanner && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-[#86EFAC] bg-[#F0FDF4]">
          <div className="text-xs text-[#166534] flex-1">
            <span className="font-medium">{opsBanner.leadIds.length}</span> lead{opsBanner.leadIds.length === 1 ? "" : "s"} are now ready for Operations CRM via <span className="font-medium">{opsBanner.rule.name}</span>.
          </div>
          <button
            onClick={() => { setSelectedIds(new Set(opsBanner.leadIds)); setBulkSendOpsOpen(true); }}
            className="ipc-btn ipc-btn-black !h-8 !text-xs"
          >Send Eligible Leads to Operations</button>
          <button onClick={() => setOpsBanner(null)} className="ipc-btn ipc-btn-ghost !h-8 !text-xs">Ignore</button>
        </div>
      )}




      {importOpen && <ImportLeadsModal onClose={() => setImportOpen(false)} onDone={handleImportDone} />}
      {addLeadOpen && (
        <AddSingleLeadModal
          pipelines={pipelines}
          stages={stages}
          defaultPipelineId={activePipeline}
          onClose={() => setAddLeadOpen(false)}
          onCreated={async (leadId, openDrawer) => {
            setAddLeadOpen(false);
            // Targeted refetch: insert just the new lead into local state for instant feedback
            try {
              const { data: newLead } = await supabase
                .from("leads")
                .select("*")
                .eq("id", leadId)
                .maybeSingle();
              if (newLead) {
                setLeads((prev) => {
                  if (prev.some((x) => x.id === leadId)) {
                    return prev.map((x) => (x.id === leadId ? { ...x, ...(newLead as any) } : x));
                  }
                  return [newLead as any, ...prev];
                });
              } else {
                await load();
              }
            } catch {
              await load();
            }
            if (openDrawer) setOpenLead(leadId);
          }}
        />
      )}
      {sendOpsOpen && (
        <SendToOperationsCrmModal
          candidateLeads={pipelineLeads.map((l) => ({
            id: l.id,
            full_name: l.full_name,
            email: l.email,
            phone: l.phone,
            program_name: (l as any).program_name ?? null,
            webinar_source: l.webinar_source,
            deal_value: (l as any).deal_value ?? null,
            stage_id: l.stage_id,
            paid_pipeline_lead_id: (l as any).paid_pipeline_lead_id ?? null,
          }))}
          sourceStages={pipelineStages.map((s) => ({ id: s.id, name: s.name }))}
          onClose={() => setSendOpsOpen(false)}
          onDone={() => { /* leads remain in Calling CRM */ }}
        />
      )}
      {addStageOpen && <AddCrmStageModal pipelines={pipelines} stages={stages} defaultPipelineId={activePipeline} onClose={() => setAddStageOpen(false)} onCreated={() => load()} />}
      {bulkSendOpsOpen && (
        <SendToOperationsCrmModal
          candidateLeads={pipelineLeads.filter((l) => selectedIds.has(l.id)).map((l) => ({
            id: l.id,
            full_name: l.full_name,
            email: l.email,
            phone: l.phone,
            program_name: (l as any).program_name ?? null,
            webinar_source: l.webinar_source,
            deal_value: (l as any).deal_value ?? null,
            stage_id: l.stage_id,
            paid_pipeline_lead_id: (l as any).paid_pipeline_lead_id ?? null,
          }))}
          sourceStages={pipelineStages.map((s) => ({ id: s.id, name: s.name }))}
          preSelectedIds={Array.from(selectedIds)}
          prefill={opsBanner ? {
            serviceDays: opsBanner.rule.default_service_days,
            packageName: opsBanner.rule.default_service_package,
            assignMethod: opsBanner.rule.default_assignment_method,
            singleBuyerId: opsBanner.rule.default_single_buyer_id,
            duplicateBehavior: opsBanner.rule.duplicate_behavior,
          } : null}
          onClose={() => { setBulkSendOpsOpen(false); setOpsBanner(null); }}
          onDone={() => { setBulkSendOpsOpen(false); clearSelection(); setOpsBanner(null); refreshOpsState(); }}
        />
      )}
      {bulkMoveOpen && (
        <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={() => setBulkMoveOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-md p-5">
            <div className="font-serif text-lg mb-1">Move {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} to a stage</div>
            <div className="text-[11px] text-muted-foreground mb-3">Pick the destination stage in the current pipeline.</div>
            <select
              className="ipc-input"
              value={bulkMoveStageId}
              onChange={(e) => setBulkMoveStageId(e.target.value)}
            >
              <option value="">Select stage…</option>
              {pipelineStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setBulkMoveOpen(false)} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Cancel</button>
              <button
                disabled={!bulkMoveStageId}
                onClick={async () => {
                  const ids = Array.from(selectedIds);
                  const stageId = bulkMoveStageId;
                  const newName = pipelineStages.find((s) => s.id === stageId)?.name ?? "—";
                  const { error } = await supabase.from("leads").update({ stage_id: stageId }).in("id", ids);
                  if (error) { toast.error(error.message); return; }
                  setLeads((prev) => prev.map((l) => ids.includes(l.id) ? { ...l, stage_id: stageId } as any : l));
                  logActivity({
                    module_key: "calling_crm",
                    action_type: "bulk_crm_stage_changed",
                    entity_type: "crm_lead",
                    summary: `Moved ${ids.length} lead${ids.length === 1 ? "" : "s"} to ${newName}.`,
                    metadata: { lead_ids: ids, new_stage: newName },
                  }).catch(() => {});
                  toast.success(`Moved ${ids.length} lead${ids.length === 1 ? "" : "s"} to ${newName}`);
                  setBulkMoveOpen(false);
                  setBulkMoveStageId("");
                  clearSelection();
                  evaluateHandoffForLeads(ids, activePipeline, stageId).catch(() => {});
                  evaluateCoCForLeads(ids, activePipeline, stageId).catch(() => {});

                }}
                className="ipc-btn ipc-btn-black !h-9 !text-xs disabled:opacity-50"
              >Move</button>
            </div>
          </div>
        </div>
      )}
      {bulkArchiveOpen && (
        <ArchiveConfirmModal
          title={`Archive ${selectedIds.size} selected lead${selectedIds.size === 1 ? "" : "s"}?`}
          description="This hides them from active CRM views but keeps reports, payment links, Operations CRM records, and history safe."
          detailLines={["Linked Paid Pipeline records are preserved.", "Linked Operations CRM records remain active.", "You can restore from Show archived."]}
          busy={bulkArchiveBusy}
          onClose={() => setBulkArchiveOpen(false)}
          onConfirm={async (reason) => {
            setBulkArchiveBusy(true);
            try {
              const ids = Array.from(selectedIds);
              await bulkArchiveLeads(ids, reason || undefined, activePipeline);
              toast.success(`Archived ${ids.length} lead${ids.length === 1 ? "" : "s"}`);
              setBulkArchiveOpen(false);
              clearSelection();
              await load();
            } catch (e: any) { toast.error(e.message || "Archive failed"); }
            finally { setBulkArchiveBusy(false); }
          }}
        />
      )}
      {archiveBatchTarget && (
        <ArchiveConfirmModal
          title={`Archive batch "${archiveBatchTarget.name}"?`}
          description={`This will hide ${archiveBatchTarget.activeCount} active lead${archiveBatchTarget.activeCount === 1 ? "" : "s"} from Calling CRM. Payment and Operations CRM records remain untouched.`}
          detailLines={archiveBatchLinks ? [
            `${archiveBatchLinks.paid} linked to Paid Pipeline (preserved).`,
            `${archiveBatchLinks.ops} linked to Operations CRM (preserved).`,
          ] : undefined}
          busy={archiveBatchBusy}
          onClose={() => { setArchiveBatchTarget(null); setArchiveBatchLinks(null); }}
          onConfirm={async (reason) => {
            setArchiveBatchBusy(true);
            try {
              await archiveBatch({
                batchName: archiveBatchTarget.name,
                batchDate: archiveBatchTarget.date,
                pipelineId: archiveBatchTarget.pipelineId,
                leadIds: archiveBatchTarget.leadIds,
                reason: reason || undefined,
              });
              toast.success(`Batch "${archiveBatchTarget.name}" archived`);
              setArchiveBatchTarget(null);
              setArchiveBatchLinks(null);
              await load();
            } catch (e: any) { toast.error(e.message || "Archive failed"); }
            finally { setArchiveBatchBusy(false); }
          }}
        />
      )}
      {deleteBatchTarget && (
        <PermanentDeleteModal
          title={`Permanently delete batch "${deleteBatchTarget.name}"?`}
          description="This cannot be undone. Only allowed when no lead in this batch is linked to Paid Pipeline or Operations CRM."
          blocked={deleteBatchBlocked}
          busy={deleteBatchBusy}
          onClose={() => { setDeleteBatchTarget(null); setDeleteBatchBlocked(null); }}
          onConfirm={async (reason) => {
            setDeleteBatchBusy(true);
            try {
              await permanentlyDeleteBatch({
                batchName: deleteBatchTarget.name,
                batchDate: deleteBatchTarget.date,
                pipelineId: deleteBatchTarget.pipelineId,
                leadIds: deleteBatchTarget.leadIds,
                reason: reason || undefined,
              });
              toast.success(`Batch "${deleteBatchTarget.name}" permanently deleted`);
              setDeleteBatchTarget(null);
              await load();
            } catch (e: any) { toast.error(e.message || "Delete failed"); }
            finally { setDeleteBatchBusy(false); }
          }}
        />
      )}
      {batchChoicesTarget && (
        <BatchDeleteChoicesModal
          batchName={batchChoicesTarget.name}
          linkedPaid={batchChoicesTarget.linkedPaid}
          linkedOps={batchChoicesTarget.linkedOps}
          totalLeads={batchChoicesTarget.leadIds.length}
          isAdmin={isAdmin}
          busy={batchChoicesBusy}
          onClose={() => setBatchChoicesTarget(null)}
          onArchive={async () => {
            const activeIds = leads
              .filter((l: any) => (l.webinar_source || "Unsourced") === batchChoicesTarget.name && (l.webinar_date || null) === batchChoicesTarget.date && !l.archived_at)
              .map((l) => l.id);
            if (!activeIds.length) { toast.info("No active leads to archive"); setBatchChoicesTarget(null); return; }
            setArchiveBatchLinks({ paid: batchChoicesTarget.linkedPaid, ops: batchChoicesTarget.linkedOps });
            setArchiveBatchTarget({
              name: batchChoicesTarget.name, date: batchChoicesTarget.date, pipelineId: batchChoicesTarget.pipelineId,
              leadIds: activeIds, activeCount: activeIds.length,
            });
            setBatchChoicesTarget(null);
          }}
          onReset={async (reason) => {
            setBatchChoicesBusy(true);
            try {
              const activeIds = leads
                .filter((l: any) => (l.webinar_source || "Unsourced") === batchChoicesTarget.name && (l.webinar_date || null) === batchChoicesTarget.date && !l.archived_at)
                .map((l) => l.id);
              const r = await resetBatchForReimport({
                batchName: batchChoicesTarget.name, batchDate: batchChoicesTarget.date,
                pipelineId: batchChoicesTarget.pipelineId, leadIds: activeIds, reason: reason || undefined,
              });
              toast.success(`Batch reset for re-import (${r.affected} leads). You can now upload fresh leads.`);
              setBatchChoicesTarget(null);
              await load();
            } catch (e: any) { toast.error(e.message || "Reset failed"); }
            finally { setBatchChoicesBusy(false); }
          }}
          onSafeDelete={async (reason) => {
            setBatchChoicesBusy(true);
            try {
              const r = await safePermanentDeleteBatch({
                batchName: batchChoicesTarget.name, batchDate: batchChoicesTarget.date,
                pipelineId: batchChoicesTarget.pipelineId, leadIds: batchChoicesTarget.leadIds, reason: reason || undefined,
              });
              toast.success(`${r.deleted} deleted permanently, ${r.archived} archived (linked), ${r.alreadyArchivedLinked} already archived.`);
              setBatchChoicesTarget(null);
              await load();
            } catch (e: any) { toast.error(e.message || "Delete failed"); }
            finally { setBatchChoicesBusy(false); }
          }}
        />
      )}
      {renameStageTarget && (
        <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={() => setRenameStageTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-sm p-5">
            <div className="font-serif text-base mb-1">Rename stage</div>
            <div className="text-[11px] text-muted-foreground mb-3">Current: {renameStageTarget.name}</div>
            <input
              autoFocus
              type="text"
              value={renameStageValue}
              onChange={(e) => setRenameStageValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") renameStage(renameStageTarget, renameStageValue); if (e.key === "Escape") setRenameStageTarget(null); }}
              className="ipc-input w-full"
              placeholder="New stage name"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRenameStageTarget(null)} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Cancel</button>
              <button onClick={() => renameStage(renameStageTarget, renameStageValue)} className="ipc-btn ipc-btn-black !h-9 !text-xs">Save</button>
            </div>
          </div>
        </div>
      )}



      {/* Kanban */}
      {view === "kanban" && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: (stageFilter.length > 0 ? stageFilter.length : pipelineStages.length) * 280 }}>
            {pipelineStages.filter((s) => stageFilter.length === 0 || stageFilter.includes(s.id)).map((s, idx, arr) => {
              const items = pipelineLeads.filter((l) => l.stage_id === s.id);
              const total = items.reduce((sum, l) => sum + Number(l.deal_value || 0), 0);
              const color = STAGE_COLORS[s.color] || "#888";
              const isInactive = (s as any).is_active === false;
              const isStageDragTarget = stageDragId && stageDragId !== s.id && stageHoverId === s.id;
              const isStageBeingDragged = stageDragId === s.id;
              return (
                <div key={s.id} className="flex items-stretch flex-shrink-0">
                  {/* Vertical placeholder shown when a stage is dragged over this column from the right side */}
                  {isStageDragTarget && (
                    <div className="w-1 my-2 mr-2 rounded-full bg-gold animate-pulse" aria-hidden />
                  )}
                  <div
                  className={`w-[270px] flex-shrink-0 rounded-xl border flex flex-col transition-colors ${hoverStage === s.id && !stageDragId ? "bg-gold-pale/60 border-gold" : "bg-off border-line"} ${isStageBeingDragged ? "opacity-40" : ""} ${isInactive ? "opacity-70" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (stageDragId) { if (stageHoverId !== s.id) setStageHoverId(s.id); return; }
                    if (hoverStage !== s.id) setHoverStage(s.id);
                  }}
                  onDragLeave={(e) => { if (e.currentTarget === e.target) { setHoverStage((h) => h === s.id ? null : h); setStageHoverId((h) => h === s.id ? null : h); } }}
                  onDrop={(e) => { if (stageDragId) { e.preventDefault(); e.stopPropagation(); reorderStageDrop(s); return; } onDrop(e, s.id, hoverBefore || undefined); }}
                >
                  <div className="px-3 pt-3 pb-2 border-b-2" style={{ borderBottomColor: color }}>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={items.length > 0 && items.every((l) => selectedIds.has(l.id))}
                          ref={(el) => { if (el) { const some = items.some((l) => selectedIds.has(l.id)); const all = items.length > 0 && items.every((l) => selectedIds.has(l.id)); el.indeterminate = some && !all; } }}
                          onChange={(e) => {
                            const ids = items.map((l) => l.id);
                            setSelectedIds((p) => {
                              const n = new Set(p);
                              if (e.target.checked) ids.forEach((id) => n.add(id));
                              else ids.forEach((id) => n.delete(id));
                              return n;
                            });
                          }}
                          title="Select all in stage"
                          className="w-3.5 h-3.5 cursor-pointer accent-black flex-shrink-0"
                        />
                        <span
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", `stage:${s.id}`); e.dataTransfer.effectAllowed = "move"; setStageDragId(s.id); }}
                          onDragEnd={() => { setStageDragId(null); setStageHoverId(null); }}
                          className="cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-black hover:bg-gold-pale rounded p-0.5 flex items-center justify-center transition-colors"
                          title="Drag to reorder stage"
                          aria-label="Drag to reorder stage"
                        ><GripVertical className="w-3.5 h-3.5" /></span>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <div className="font-sans text-[11px] uppercase tracking-wider font-medium truncate" title={s.name}>
                          {s.name}{isInactive && <span className="ml-1 text-[9px] text-muted-foreground normal-case tracking-normal">(inactive)</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="text-xs text-muted-foreground">{items.length}</div>
                        <StageHeaderMenu
                          stage={s}
                          idx={idx}
                          total={arr.length}
                          isInactive={isInactive}
                          onRename={() => { setRenameStageTarget(s); setRenameStageValue(s.name); }}
                          onMoveLeft={() => moveStage(s, -1)}
                          onMoveRight={() => moveStage(s, 1)}
                          onDeactivate={() => deactivateStage(s)}
                          onDelete={() => deleteStage(s)}
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">₹{total.toLocaleString("en-IN")}</div>
                  </div>

                  <div className="p-2 space-y-2 flex-1 min-h-[120px]">
                    {items.map((l, cardIdx) => {
                      const g = GRADE_STYLES[l.grade];
                      const ag = agents.find((a) => a.id === l.assigned_agent_id);
                      const cardBg = l.is_super_hot ? "#FDF2F8" : l.lead_type === "paid" ? "#F0FDF4" : "white";
                      const cardBorder = l.is_super_hot ? "#FBCFE8" : l.lead_type === "paid" ? "#BBF7D0" : "#E8E5DE";
                      const isDragging = dragId === l.id;
                      const showPlaceholderBefore = hoverStage === s.id && hoverBefore === l.id && dragId && dragId !== l.id;
                      return (
                        <div key={l.id}>
                          {showPlaceholderBefore && (
                            <div className="mb-2 rounded-lg border-2 border-dashed border-gold bg-gold-pale/60 h-[88px]" aria-hidden />
                          )}
                          <div
                            data-lead-card-id={l.id}
                            draggable
                            onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move"; setDragId(l.id); }}
                            onDragEnd={() => { setDragId(null); setHoverStage(null); setHoverBefore(null); }}
                            onDragOver={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              if (!dragId || dragId === l.id || stageDragId) return;
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const isLower = e.clientY > rect.top + rect.height / 2;
                              if (hoverStage !== s.id) setHoverStage(s.id);
                              if (isLower) {
                                const next = items[cardIdx + 1];
                                const target = next ? next.id : "__end__";
                                if (hoverBefore !== target) setHoverBefore(target);
                              } else {
                                if (hoverBefore !== l.id) setHoverBefore(l.id);
                              }
                            }}
                            onDrop={(e) => {
                              const beforeId = hoverBefore === "__end__" ? "__end__" : (hoverBefore || l.id);
                              onDrop(e, s.id, beforeId);
                            }}
                            onClick={(e) => {
                              if (selectedIds.size > 0) { toggleSelect(l.id); return; }
                              setOpenLead(l.id);
                            }}
                            className={`relative p-3 rounded-lg border cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${isDragging ? "opacity-30 shadow-lg" : ""} ${selectedIds.has(l.id) ? "ring-2 ring-gold" : ""}`}
                            style={{ background: cardBg, borderColor: cardBorder }}>
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(l.id)}
                                onClick={(e) => { e.stopPropagation(); toggleSelect(l.id); }}
                                onChange={() => {}}
                                className="mt-1 w-3.5 h-3.5 cursor-pointer accent-black flex-shrink-0"
                                title="Select lead"
                              />
                              <div className="flex-1 min-w-0">
                                {l.webinar_source && <div className="uppercase-label !text-[8px] mb-1">{l.webinar_source}</div>}
                                <div className="font-serif text-sm truncate">{l.full_name || "Unnamed"}</div>
                                <div className="text-[11px] text-muted-foreground truncate">{l.program_name}</div>
                                <div className="text-[11px] mt-0.5">{l.phone || "—"}</div>
                                <div className="text-[11px] mt-1">₹{Number(l.deal_value).toLocaleString("en-IN")}</div>
                                {(leadTagsMap[l.id] || []).length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
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
                                <div className="flex items-center justify-between mt-2 gap-2">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider" style={{ background: g.bg, color: g.fg, border: `1px solid ${g.border}` }}>{g.label}</span>
                                    {((l as any).paid_pipeline_lead_id || (l as any).conversion_status === "converted" || (l as any).conversion_status === "linked_to_paid") && (
                                      <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">{(l as any).paid_pipeline_lead_id ? "Paid Linked" : "Converted"}</span>
                                    )}
                                    {(() => {
                                      const cs = (l as any).code_of_conduct_status as string | null;
                                      if (!cs) return null;
                                      const map: Record<string, { l: string; cls: string }> = {
                                        signed: { l: "CoC Signed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                                        sent: { l: "CoC Sent", cls: "bg-blue-50 text-blue-700 border-blue-200" },
                                        viewed: { l: "CoC Viewed", cls: "bg-violet-50 text-violet-700 border-violet-200" },
                                        expired: { l: "CoC Expired", cls: "bg-rose-50 text-rose-700 border-rose-200" },
                                        failed: { l: "CoC Failed", cls: "bg-rose-50 text-rose-700 border-rose-200" },
                                        required: { l: "CoC Required", cls: "bg-amber-50 text-amber-800 border-amber-200" },
                                      };
                                      const m = map[cs]; if (!m) return null;
                                      return <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${m.cls}`}>{m.l}</span>;
                                    })()}
                                  </div>
                                  {ag && <div className="w-5 h-5 rounded-full bg-black text-gold font-serif text-[9px] flex items-center justify-center" title={ag.full_name}>{ag.full_name.slice(0,1)}</div>}
                                </div>

                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                    {/* End-of-column drop slot */}
                    {items.length > 0 && (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          if (!dragId || stageDragId) return;
                          if (hoverStage !== s.id) setHoverStage(s.id);
                          if (hoverBefore !== "__end__") setHoverBefore("__end__");
                        }}
                        onDrop={(e) => onDrop(e, s.id, "__end__")}
                        className={`rounded-lg transition-all ${hoverStage === s.id && hoverBefore === "__end__" && dragId ? "h-[60px] border-2 border-dashed border-gold bg-gold-pale/60" : "h-3"}`}
                        aria-hidden
                      />
                    )}
                    {items.length === 0 && (
                      <div className={`text-[10px] text-center py-6 rounded-lg border-2 border-dashed transition-colors ${hoverStage === s.id && dragId ? "border-gold bg-gold-pale/50 text-gold-deep uppercase tracking-wider" : "border-transparent text-muted-foreground"}`}>{hoverStage === s.id && dragId ? "Drop here" : "Drop leads here"}</div>
                    )}
                  </div>
                </div>
                </div>
              );
            })}
            <div className="w-[220px] flex-shrink-0 flex items-start pt-3">
              <div className="w-full bg-off rounded-xl border border-dashed border-line p-3">
                <div className="font-sans text-[11px] uppercase tracking-wider font-medium mb-2 text-muted-foreground">Add stage</div>
                <input type="text" className="ipc-input !h-9 mb-2" placeholder="New stage name" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStage()} />
                <button onClick={addStage} disabled={!newStageName.trim()} className="ipc-btn ipc-btn-black !h-9 w-full disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Add stage</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batches view — one card per webinar import */}
      {view === "batches" && (
        <div>
          {/* Pipeline-type tabs: clearly separate Sales (Unpaid) vs Paid — Onboarding batches */}
          <div className="flex items-center gap-1 p-1 mb-4 rounded-lg border border-line bg-white w-fit">
            {([
              { key: "all", label: `All batches (${batchCounts.all})` },
              { key: "unpaid", label: `Sales Pipeline (Unpaid) (${batchCounts.unpaid})` },
              { key: "paid", label: `Paid — Onboarding (${batchCounts.paid})` },
              ...(batchCounts.custom > 0 ? [{ key: "custom", label: `Custom (${batchCounts.custom})` }] : []),
            ] as { key: typeof batchPipelineFilter; label: string }[]).map((t) => (
              <button
                key={t.key}
                onClick={() => setBatchPipelineFilter(t.key)}
                className={`px-3 py-1.5 rounded-md text-xs ${batchPipelineFilter === t.key ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}
              >
                {t.label}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => setRepairPickerOpen(true)}
                className="ml-2 px-3 py-1.5 rounded-md text-xs border border-[#1D4ED8] text-[#1D4ED8] hover:bg-[#EFF6FF]"
                title="Move a wrongly uploaded batch into the correct pipeline"
              >Repair Wrong Batch</button>
            )}
          </div>
          {visibleBatches.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {batches.length === 0
                ? "No imports yet. Use Import to bring in a batch."
                : `No batches in ${batchPipelineFilter === "all" ? "this view" : batchPipelineFilter === "paid" ? "Paid — Onboarding" : batchPipelineFilter === "unpaid" ? "Sales Pipeline (Unpaid)" : "Custom pipelines"}.`}
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            {visibleBatches.map((b) => {
              const pipe = pipelines.find((p) => p.id === b.pipelineId);
              const isArchivedView = showArchived;
              return (
                <div
                  key={b.key}
                  className={`relative text-left p-5 rounded-xl border bg-white hover:shadow-md transition-all cursor-pointer ${isArchivedView ? "border-[#FDE68A] bg-[#FFFBEB]/40 opacity-80 hover:border-[#F59E0B]" : "border-line hover:border-gold"}`}
                  onClick={() => {
                    if (b.pipelineId) setActivePipeline(b.pipelineId);
                    setBatchFilter([b.name]);
                    setView("kanban");
                  }}
                >
                  <BatchActionsMenu
                    isAdmin={isAdmin}
                    archived={isArchivedView}
                    onView={() => {
                      if (b.pipelineId) setActivePipeline(b.pipelineId);
                      setBatchFilter([b.name]);
                      setView("kanban");
                    }}
                    onRename={() => setEditBatch({ origName: b.name, origDate: b.date, name: b.name, date: b.date || "" })}
                    onMove={() => openMoveBatch({ name: b.name, date: b.date, pipelineId: b.pipelineId })}
                    onArchive={async () => {
                      const leadIds = leads
                        .filter((l: any) => (l.webinar_source || "Unsourced") === b.name && (l.webinar_date || null) === b.date && !l.archived_at)
                        .map((l) => l.id);
                      if (!leadIds.length) { toast.info("No active leads to archive in this batch"); return; }
                      const links = await getLeadLinks(leadIds).catch(() => ({ paid: 0, ops: 0 }));
                      setArchiveBatchLinks(links);
                      setArchiveBatchTarget({ name: b.name, date: b.date, pipelineId: b.pipelineId, leadIds, activeCount: leadIds.length });
                    }}
                    onRestore={async () => {
                      try {
                        await restoreBatch({ batchName: b.name, batchDate: b.date, pipelineId: b.pipelineId });
                        toast.success(`Batch "${b.name}" restored`);
                        await load();
                      } catch (e: any) { toast.error(e.message || "Restore failed"); }
                    }}
                    onReset={async () => {
                      const leadIds = leads
                        .filter((l: any) => (l.webinar_source || "Unsourced") === b.name && (l.webinar_date || null) === b.date && !l.archived_at)
                        .map((l) => l.id);
                      if (!leadIds.length) { toast.info("No active leads in this batch to reset"); return; }
                      const links = await getLeadLinks(leadIds).catch(() => ({ paid: 0, ops: 0 }));
                      setBatchChoicesTarget({ name: b.name, date: b.date, pipelineId: b.pipelineId, leadIds, linkedPaid: links.paid, linkedOps: links.ops });
                    }}
                    onDelete={async () => {
                      const leadIds = leads
                        .filter((l: any) => (l.webinar_source || "Unsourced") === b.name && (l.webinar_date || null) === b.date)
                        .map((l) => l.id);
                      const links = await getLeadLinks(leadIds).catch(() => ({ paid: 0, ops: 0 }));
                      if (links.paid > 0 || links.ops > 0) {
                        setBatchChoicesTarget({ name: b.name, date: b.date, pipelineId: b.pipelineId, leadIds, linkedPaid: links.paid, linkedOps: links.ops });
                        return;
                      }
                      setDeleteBatchTarget({ name: b.name, date: b.date, pipelineId: b.pipelineId, leadIds });
                      setDeleteBatchBlocked(null);
                    }}
                    onRepair={() => setRepairBatchTarget({ name: b.name, date: b.date, pipelineId: b.pipelineId })}
                  />
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-black text-white text-[11px] font-medium tracking-wide">
                      <Calendar className="w-3 h-3" />
                      {b.date || "No date"}
                    </div>
                    {isArchivedView && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                        <Archive className="w-3 h-3" /> Archived
                      </span>
                    )}
                  </div>
                  <div className="font-serif text-lg mt-2 line-clamp-2">{b.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{pipe?.name || "—"}</div>
                  <div className="flex items-center justify-between mt-4">
                    <div className="font-serif text-3xl">{b.total}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">leads</div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3 text-[10px] flex-wrap">
                    {b.superHot > 0 && <span className="px-1.5 py-0.5 rounded-full" style={{ background: GRADE_STYLES["super-hot"].bg, color: GRADE_STYLES["super-hot"].fg, border: `1px solid ${GRADE_STYLES["super-hot"].border}` }}>★ {b.superHot}</span>}
                    <span className="px-1.5 py-0.5 rounded-full" style={{ background: GRADE_STYLES.hot.bg, color: GRADE_STYLES.hot.fg, border: `1px solid ${GRADE_STYLES.hot.border}` }}>{b.hot} hot</span>
                    <span className="px-1.5 py-0.5 rounded-full" style={{ background: GRADE_STYLES.warm.bg, color: GRADE_STYLES.warm.fg, border: `1px solid ${GRADE_STYLES.warm.border}` }}>{b.warm} warm</span>
                    <span className="px-1.5 py-0.5 rounded-full" style={{ background: GRADE_STYLES.cold.bg, color: GRADE_STYLES.cold.fg, border: `1px solid ${GRADE_STYLES.cold.border}` }}>{b.cold} cold</span>
                    {b.absentees > 0 && <span className="px-1.5 py-0.5 rounded-full" style={{ background: GRADE_STYLES["true-absentee"].bg, color: GRADE_STYLES["true-absentee"].fg, border: `1px solid ${GRADE_STYLES["true-absentee"].border}` }}>{b.absentees} absentees</span>}
                  </div>
                  <div className="mt-4 pt-3 border-t border-line" onClick={(e) => e.stopPropagation()}>
                    <div className="uppercase-label !text-[9px] mb-1.5 flex items-center gap-1"><Download className="w-3 h-3" /> Download by category</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <button onClick={() => downloadBatchCsv(b, "all")} className="px-2 py-1 rounded-md border border-line text-[10px] hover:bg-off">All ({b.total})</button>
                      {b.superHot > 0 && <button onClick={() => downloadBatchCsv(b, "super-hot")} className="px-2 py-1 rounded-md border text-[10px] hover:opacity-80" style={{ background: GRADE_STYLES["super-hot"].bg, color: GRADE_STYLES["super-hot"].fg, borderColor: GRADE_STYLES["super-hot"].border }}>★ {b.superHot}</button>}
                      {b.hot > 0 && <button onClick={() => downloadBatchCsv(b, "hot")} className="px-2 py-1 rounded-md border text-[10px] hover:opacity-80" style={{ background: GRADE_STYLES.hot.bg, color: GRADE_STYLES.hot.fg, borderColor: GRADE_STYLES.hot.border }}>Hot ({b.hot})</button>}
                      {b.warm > 0 && <button onClick={() => downloadBatchCsv(b, "warm")} className="px-2 py-1 rounded-md border text-[10px] hover:opacity-80" style={{ background: GRADE_STYLES.warm.bg, color: GRADE_STYLES.warm.fg, borderColor: GRADE_STYLES.warm.border }}>Warm ({b.warm})</button>}
                      {b.cold > 0 && <button onClick={() => downloadBatchCsv(b, "cold")} className="px-2 py-1 rounded-md border text-[10px] hover:opacity-80" style={{ background: GRADE_STYLES.cold.bg, color: GRADE_STYLES.cold.fg, borderColor: GRADE_STYLES.cold.border }}>Cold ({b.cold})</button>}
                      {b.absentees > 0 && <button onClick={() => downloadBatchCsv(b, "absentees")} className="px-2 py-1 rounded-md border text-[10px] hover:opacity-80" style={{ background: GRADE_STYLES["true-absentee"].bg, color: GRADE_STYLES["true-absentee"].fg, borderColor: GRADE_STYLES["true-absentee"].border }}>Absentees ({b.absentees})</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditBatch(null)}>
          <div className="bg-white rounded-xl border border-line w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="font-serif text-lg">Edit batch</div>
              <button onClick={() => setEditBatch(null)} className="p-1 rounded hover:bg-off"><XIcon className="w-4 h-4" /></button>
            </div>
            <label className="uppercase-label !text-[10px]">Batch label</label>
            <input className="ipc-input !h-10 w-full mt-1" value={editBatch.name} onChange={(e) => setEditBatch({ ...editBatch, name: e.target.value })} placeholder="e.g. 6 Secrets — Day 1 of 2 · 6h" />
            <label className="uppercase-label !text-[10px] mt-3 block">Webinar date</label>
            <input type="date" className="ipc-input !h-10 w-full mt-1" value={editBatch.date} onChange={(e) => setEditBatch({ ...editBatch, date: e.target.value })} />
            <div className="text-[11px] text-muted-foreground mt-3">This will update every lead in this batch.</div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button className="ipc-btn-ghost" onClick={() => setEditBatch(null)}>Cancel</button>
              <button
                className="ipc-btn-primary"
                onClick={async () => {
                  const newName = editBatch.name.trim();
                  const newDate = editBatch.date || null;
                  if (!newName) { toast.error("Label required"); return; }
                  let q = supabase.from("leads").update({ webinar_source: newName, webinar_name: newName, webinar_date: newDate }).eq("webinar_source", editBatch.origName);
                  q = editBatch.origDate ? q.eq("webinar_date", editBatch.origDate) : q.is("webinar_date", null);
                  const { error } = await q;
                  if (error) { toast.error(error.message); return; }
                  if (batchFilter.includes(editBatch.origName)) {
                    setBatchFilter(batchFilter.map((x) => x === editBatch.origName ? newName : x));
                  }
                  toast.success("Batch updated");
                  setEditBatch(null);
                  await load();
                }}
              >Save changes</button>
            </div>
          </div>
        </div>
      )}
      {moveBatchTarget && (
        <MoveBatchModal
          batch={moveBatchTarget}
          leads={leads}
          pipelines={pipelines}
          stages={stages}
          isAdmin={isAdmin}
          onClose={() => setMoveBatchTarget(null)}
          onDone={async () => { await load(); }}
          onPipelinesChanged={async () => { await load(); }}
        />
      )}
      {repairPickerOpen && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40" onClick={() => setRepairPickerOpen(false)}>
          <div className="bg-white rounded-xl border border-line w-full max-w-md p-6 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-serif text-lg">Repair Wrong Batch</div>
              <button onClick={() => setRepairPickerOpen(false)} className="p-1 rounded hover:bg-off"><XIcon className="w-4 h-4" /></button>
            </div>
            <div className="text-[12px] text-muted-foreground mb-3">Pick the batch you want to move into the correct pipeline.</div>
            <div className="space-y-1.5">
              {batchesWithType.length === 0 && <div className="text-sm text-muted-foreground">No batches available.</div>}
              {batchesWithType.map(b => {
                const pipe = pipelines.find(p => p.id === b.pipelineId);
                return (
                  <button
                    key={b.key}
                    className="w-full text-left px-3 py-2 rounded-md border border-line hover:border-gold hover:bg-off"
                    onClick={() => {
                      setRepairPickerOpen(false);
                      openMoveBatch({ name: b.name, date: b.date, pipelineId: b.pipelineId });
                    }}
                  >
                    <div className="font-medium text-[13px]">{b.name}</div>
                    <div className="text-[11px] text-muted-foreground">{pipe?.name || "—"} · {b.total} leads · {b.date || "no date"}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {view === "list" && (
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full font-sans text-sm">
            <thead className="bg-off">
              <tr className="text-left">
                {["Lead","Phone","Score","Grade","Stage","Webinar","Agent","Deal"].map((h) => <th key={h} className="px-4 py-2.5 uppercase-label !text-[10px]">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {pipelineLeads.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">No leads.</td></tr>}
              {pipelineLeads.map((l) => {
                const g = GRADE_STYLES[l.grade];
                const stg = pipelineStages.find((s) => s.id === l.stage_id);
                const ag = agents.find((a) => a.id === l.assigned_agent_id);
                return (
                  <tr key={l.id} className="border-t border-line cursor-pointer hover:bg-off" onClick={() => setOpenLead(l.id)}>
                    <td className="px-4 py-3">
                      <div className="font-serif text-sm">{l.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{l.phone || "—"}</td>
                    <td className="px-4 py-3 text-xs">{l.score}</td>
                    <td className="px-4 py-3"><span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase" style={{ background: g.bg, color: g.fg, border: `1px solid ${g.border}` }}>{g.label}</span></td>
                    <td className="px-4 py-3 text-xs">{stg?.name || "—"}</td>
                    <td className="px-4 py-3 text-xs">{l.webinar_source || "—"}</td>
                    <td className="px-4 py-3 text-xs">{ag?.full_name || "—"}</td>
                    <td className="px-4 py-3 text-xs">₹{Number(l.deal_value).toLocaleString("en-IN")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pipeline Designer */}
      {view === "stages" && (() => {
        const pipe = pipelines.find((p) => p.id === activePipeline);
        if (!pipe) return <div className="text-sm text-muted-foreground">Select or create a pipeline below.</div>;
        const attachedLeads = leads.filter((l) => l.pipeline_id === pipe.id).length;
        return (
          <div className="max-w-3xl space-y-5">
            {/* Pipeline header */}
            <div className="p-4 rounded-xl border border-line bg-white space-y-3">
              <div className="uppercase-label !text-[10px]">Pipeline</div>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[220px]">
                  <label className="form-label">Name</label>
                  <input type="text" className="ipc-input" defaultValue={pipe.name}
                    onBlur={(e) => e.target.value !== pipe.name && renamePipeline(pipe.id, e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Type</label>
                  <select className="ipc-input" value={pipe.type} onChange={(e) => setPipelineType(pipe.id, e.target.value as any)}>
                    <option value="unpaid">Unpaid (Sales)</option>
                    <option value="paid">Paid (Onboarding)</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <button onClick={() => deletePipeline(pipe.id)} className="ipc-btn ipc-btn-ghost text-[#DC2626] hover:text-[#DC2626]">
                  <Trash2 className="w-3.5 h-3.5" /> Delete pipeline
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground">{attachedLeads} leads attached · {pipelineStages.length} stages</div>
            </div>

            {/* Stages */}
            <div className="space-y-2">
              <div className="uppercase-label !text-[10px]">Stages</div>
              {pipelineStages.map((s, i) => {
                const count = leads.filter((l) => l.stage_id === s.id).length;
                return (
                  <div key={s.id} className="p-3 rounded-lg border border-line bg-white">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex flex-col">
                        <button disabled={i === 0} onClick={() => moveStage(s, -1)} className="text-muted-foreground hover:text-black disabled:opacity-20"><ArrowUp className="w-3 h-3" /></button>
                        <button disabled={i === pipelineStages.length - 1} onClick={() => moveStage(s, 1)} className="text-muted-foreground hover:text-black disabled:opacity-20"><ArrowDown className="w-3 h-3" /></button>
                      </div>
                      <input type="text" defaultValue={s.name}
                        onBlur={(e) => e.target.value !== s.name && updateStage(s.id, { name: e.target.value })}
                        className="ipc-input flex-1 min-w-[160px] !h-9" />
                      <div className="flex items-center gap-1">
                        {STAGE_COLOR_OPTIONS.map((c) => (
                          <button key={c.key} title={c.key} onClick={() => updateStage(s.id, { color: c.key })}
                            className={`w-5 h-5 rounded-full border-2 ${s.color === c.key ? "border-black" : "border-transparent"}`}
                            style={{ background: c.hex }} />
                        ))}
                      </div>
                      <span className="text-[11px] text-muted-foreground">{count} leads</span>
                      <button onClick={() => deleteStage(s)} className="text-muted-foreground hover:text-[#DC2626]" title="Delete stage"><XIcon className="w-4 h-4" /></button>
                    </div>
                    <div className="flex items-center gap-3 mt-2 ml-7 text-[11px]">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={s.is_won} onChange={(e) => updateStage(s.id, { is_won: e.target.checked, is_lost: e.target.checked ? false : s.is_lost })} />
                        <Trophy className="w-3 h-3 text-[#16A34A]" /> Won
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={s.is_lost} onChange={(e) => updateStage(s.id, { is_lost: e.target.checked, is_won: e.target.checked ? false : s.is_won })} />
                        <span className="text-[#DC2626]">✕</span> Lost
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={s.is_protected} onChange={(e) => updateStage(s.id, { is_protected: e.target.checked })} />
                        Protected
                      </label>
                    </div>
                  </div>
                );
              })}
              {pipelineStages.length === 0 && <div className="text-xs text-muted-foreground p-4 border border-dashed border-line rounded-lg text-center">No stages yet — add one below.</div>}
            </div>

            {/* Add stage */}
            <div className="p-3 rounded-lg border border-line bg-off flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="form-label">New stage name</label>
                <input type="text" className="ipc-input" placeholder="e.g. Demo Booked" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStage()} />
              </div>
              <div>
                <label className="form-label">Color</label>
                <div className="flex items-center gap-1 h-10">
                  {STAGE_COLOR_OPTIONS.map((c) => (
                    <button key={c.key} onClick={() => setNewStageColor(c.key)}
                      className={`w-6 h-6 rounded-full border-2 ${newStageColor === c.key ? "border-black" : "border-transparent"}`}
                      style={{ background: c.hex }} />
                  ))}
                </div>
              </div>
              <button onClick={addStage} className="ipc-btn ipc-btn-black"><Plus className="w-3.5 h-3.5" /> Add stage</button>
            </div>
          </div>
        );
      })()}

      {/* Pipeline tabs (bottom bar) */}
      <div className="fixed bottom-0 left-[228px] right-0 bg-white border-t border-line px-10 py-2.5 flex items-center gap-2 z-40 overflow-x-auto">
        {pipelines.map((p) => {
          const isActive = p.id === activePipeline;
          const dot = p.type === "paid" ? "#16A34A" : p.type === "unpaid" ? "#2563EB" : "#C8A84B";
          const isHover = isAdmin && pipeHoverId === p.id && pipeDragId && pipeDragId !== p.id;
          const leadCount = leads.filter((l) => l.pipeline_id === p.id).length;
          return (
            <div
              key={p.id}
              draggable={isAdmin}
              onDragStart={isAdmin ? (e) => { setPipeDragId(p.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
              onDragOver={isAdmin ? (e) => { if (pipeDragId && pipeDragId !== p.id) { e.preventDefault(); setPipeHoverId(p.id); } } : undefined}
              onDragLeave={isAdmin ? () => { if (pipeHoverId === p.id) setPipeHoverId(null); } : undefined}
              onDrop={isAdmin ? (e) => { e.preventDefault(); reorderPipelineDrop(p); } : undefined}
              onDragEnd={isAdmin ? () => { setPipeDragId(null); setPipeHoverId(null); } : undefined}
              title={isAdmin ? "Drag to reorder. First tab becomes the default pipeline for everyone." : undefined}
              className={`group flex items-center rounded-lg border ${isActive ? "bg-black text-white border-black" : "bg-white border-line hover:bg-off"} ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${isHover ? "ring-2 ring-blue-400" : ""} ${pipeDragId === p.id ? "opacity-60" : ""}`}
            >
              <button onClick={() => setActivePipeline(p.id)} className="px-3 py-1.5 text-xs flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                {p.name}
                <span className={`text-[10px] ${isActive ? "text-white/70" : "text-muted-foreground"}`}>{leadCount}</span>
              </button>
              {isActive && (
                <button onClick={() => setView("stages")} title="Design pipeline" className={`px-2 py-1.5 border-l ${isActive ? "border-white/20 hover:bg-white/10" : "border-line hover:bg-off"}`}>
                  <Settings2 className="w-3 h-3" />
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); deletePipeline(p.id); }}
                  title={leadCount > 0 ? `${leadCount} leads attached — move them first` : "Delete pipeline"}
                  className={`px-1.5 py-1.5 border-l ${isActive ? "border-white/20 hover:bg-white/10 text-white/80" : "border-line text-[#DC2626] opacity-0 group-hover:opacity-100 hover:bg-[#FEF2F2]"}`}
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        <button onClick={() => setNewPipeline(true)} className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border border-dashed border-line text-muted-foreground hover:text-black flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> New Pipeline
        </button>
      </div>

      {/* New pipeline modal */}
      {newPipeline && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={() => setNewPipeline(false)}>
          <div className="bg-white rounded-xl border border-line w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-serif text-xl">New pipeline</div>
            <div>
              <label className="form-label">Pipeline name</label>
              <input type="text" className="ipc-input" placeholder="e.g. Q3 Webinar Funnel" value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="form-label">Type</label>
              <select className="ipc-input" value={newPipelineType} onChange={(e) => setNewPipelineType(e.target.value as any)}>
                <option value="custom">Custom</option>
                <option value="unpaid">Unpaid (Sales)</option>
                <option value="paid">Paid (Onboarding)</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={newPipelineSeed} onChange={(e) => setNewPipelineSeed(e.target.checked)} />
              Seed with default stages for this type
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setNewPipeline(false)} className="ipc-btn ipc-btn-ghost">Cancel</button>
              <button onClick={createPipeline} className="ipc-btn ipc-btn-black">Create</button>
            </div>
          </div>
        </div>
      )}


      {/* Spacer for fixed bottom bar */}
      <div className="h-14" />

      {openLead && <LeadDrawer leadId={openLead} stages={stages} agents={agents} onClose={() => setOpenLead(null)} onChanged={load} onStageChanged={async (lid, stageId) => {
        // Fetch latest lead so pipeline_id is current, then route through the unified evaluator
        const { data: l } = await supabase.from("leads").select("id, pipeline_id, full_name, email, phone, program_name, webinar_source, deal_value, paid_pipeline_lead_id").eq("id", lid).maybeSingle();
        if (!l) return;
        // Ensure lead exists in local state for evaluator lookups
        setLeads((prev) => prev.some((x) => x.id === lid) ? prev.map((x) => x.id === lid ? { ...x, ...(l as any), stage_id: stageId } as any : x) : [...prev, { ...(l as any), stage_id: stageId } as any]);
        await refreshOpsState();
        await evaluateHandoffForLeads([lid], (l as any).pipeline_id, stageId);
      }} />}



      {/* Assign agents modal */}
      <AssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        moduleKey="calling_crm"
        moduleLabel="Calling CRM"
        ownerColumn="assigned_agent_id"
        tableName="leads"
        eligibilityFlag="can_receive_calling_crm_leads"
        filteredLeads={pipelineLeads.map(l => ({ id: l.id, current_owner_id: (l as any).assigned_agent_id }))}
        onAssigned={load}
      />
      {repairBatchTarget && (
        <BatchRepairModal
          batchName={repairBatchTarget.name}
          batchDate={repairBatchTarget.date}
          pipelineId={repairBatchTarget.pipelineId}
          pipelineName={pipelines.find((p) => p.id === repairBatchTarget.pipelineId)?.name || null}
          agentNames={new Map(agents.map((a) => [a.id, a.full_name]))}
          onClose={() => setRepairBatchTarget(null)}
          onApplied={load}
        />
      )}
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-off border border-line text-[10px]">
      {label}
      <button onClick={onClear} className="text-muted-foreground hover:text-black" aria-label="Remove filter">
        <XIcon className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

function MoreFiltersMenu({ tagFilter, stageFilter, count }: { tagFilter: React.ReactNode; stageFilter: React.ReactNode; count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="ipc-btn ipc-btn-ghost !h-9 !text-xs" title="Tags, stages & more filters">
          <Settings2 className="w-3.5 h-3.5" /> More filters{count > 0 ? ` (${count})` : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        collisionPadding={16}
        className="z-[1080] w-[340px] p-3 space-y-3 bg-white border border-line rounded-md shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div className="font-serif text-[13px]">Filters &amp; Manage</div>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-black text-[11px]">Close</button>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tag</div>
          {tagFilter}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Stage</div>
          {stageFilter}
        </div>
      </PopoverContent>
    </Popover>
  );
}


function OverflowActionsMenu({ onExport }: { onExport: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="ipc-btn ipc-btn-ghost !h-9 !text-xs !px-2" title="More actions" aria-label="More actions">⋯</button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-line rounded-md shadow-lg z-[1050] py-1">
          <button onClick={() => { setOpen(false); onExport(); }} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-off"><Download className="w-3 h-3 inline mr-1" /> Export CSV</button>
        </div>
      )}
    </div>
  );
}

function StageHeaderMenu({ stage, idx, total, onRename, onMoveLeft, onMoveRight, onDeactivate, onDelete, isInactive }: {
  stage: Stage; idx: number; total: number;
  onRename: () => void; onMoveLeft: () => void; onMoveRight: () => void;
  onDeactivate: () => void; onDelete: () => void;
  isInactive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const item = (label: string, fn: () => void, disabled?: boolean, accent?: string) => (
    <button disabled={disabled} onClick={() => { setOpen(false); if (!disabled) fn(); }} className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-off disabled:opacity-40 disabled:hover:bg-transparent ${accent || ""}`}>{label}</button>
  );
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-black text-[14px] leading-none px-1" title="Stage actions" aria-label="Stage actions">⋯</button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-line rounded-md shadow-lg z-[1050] py-1">
          {item("Rename stage", onRename)}
          {item("Move left", onMoveLeft, idx === 0)}
          {item("Move right", onMoveRight, idx >= total - 1)}
          <div className="h-px bg-line my-1" />
          {!isInactive && !stage.is_protected && item("Deactivate stage", onDeactivate, false, "text-[#B45309]")}
          {!stage.is_protected && item("Delete stage", onDelete, false, "text-[#DC2626]")}
          {stage.is_protected && <div className="px-3 py-1.5 text-[10px] text-muted-foreground italic">Protected stage</div>}
        </div>
      )}
    </div>
  );
}

function BatchActionsMenu({ isAdmin, archived, onView, onRename, onMove, onArchive, onRestore, onReset, onDelete, onRepair }: {
  isAdmin: boolean; archived: boolean;
  onView: () => void; onRename: () => void; onMove: () => void; onArchive: () => void; onRestore: () => void; onReset: () => void; onDelete: () => void;
  onRepair?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const item = (label: React.ReactNode, fn: () => void, accent?: string) => (
    <button onClick={(e) => { e.stopPropagation(); setOpen(false); fn(); }} className={`w-full text-left px-3 py-1.5 text-[11.5px] hover:bg-off flex items-center gap-2 ${accent || ""}`}>{label}</button>
  );
  return (
    <div ref={ref} className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="p-1.5 rounded-md text-muted-foreground hover:text-black hover:bg-off text-[14px] leading-none"
        title="Batch actions" aria-label="Batch actions"
      >⋯</button>
      {open && (
        <div className="absolute right-0 mt-1 w-60 bg-white border border-line rounded-md shadow-xl z-[1050] py-1">
          {item(<><ExternalLink className="w-3 h-3" /> View leads</>, onView)}
          {!archived && item(<><Pencil className="w-3 h-3" /> Rename batch</>, onRename)}
          {isAdmin && !archived && item(<><ArrowUp className="w-3 h-3 rotate-45" /> Move / Correct Batch</>, onMove, "text-[#1D4ED8]")}
          {isAdmin && !archived && onRepair && item(<><RotateCcw className="w-3 h-3" /> Deduplicate / Repair Batch</>, onRepair, "text-[#1D4ED8]")}
          <div className="h-px bg-line my-1" />
          {!archived
            ? <>
                {item(<><Archive className="w-3 h-3" /> Archive batch</>, onArchive, "text-[#92400E]")}
                {isAdmin && item(<><RotateCcw className="w-3 h-3" /> Reset for re-import</>, onReset, "text-[#1D4ED8]")}
              </>
            : item(<><RotateCcw className="w-3 h-3" /> Restore batch</>, onRestore, "text-[#15803D]")
          }
          {isAdmin && (
            <>
              <div className="h-px bg-line my-1" />
              {item(<><Trash2 className="w-3 h-3" /> Permanent delete</>, onDelete, "text-[#DC2626]")}
            </>
          )}
        </div>
      )}
    </div>
  );
}



