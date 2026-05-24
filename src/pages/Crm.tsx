import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { GRADE_STYLES, STAGE_COLORS, STAGE_COLOR_OPTIONS, DEFAULT_PIPELINE_TEMPLATES, ensurePipelineExists, type Lead, type Pipeline, type Stage } from "@/lib/crmTypes";
import LeadDrawer from "@/components/LeadDrawer";
import { Plus, LayoutGrid, List, Settings2, Download, ArrowUp, ArrowDown, Trash2, Trophy, X as XIcon, Users, Upload, Pencil, Calendar, ExternalLink } from "lucide-react";
import ImportLeadsModal, { type ImportResult } from "@/components/ImportLeadsModal";
import AddCrmStageModal from "@/components/AddCrmStageModal";
import { toast } from "sonner";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import { logActivity } from "@/lib/auditLog";
import AssignModal from "@/components/AssignModal";
import { listAllTags, getTagsForLeads, pickTagColor, type Tag } from "@/lib/leadTags";
import ManagedTagFilter from "@/components/crm/ManagedTagFilter";
import ManagedStageFilter from "@/components/crm/ManagedStageFilter";

type View = "kanban" | "list" | "stages" | "batches";

export default function Crm() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [activePipeline, setActivePipeline] = useState<string | null>(null);
  const [view, setView] = useState<View>("kanban");
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all"|"super-hot"|"hot"|"warm"|"cold">("all");
  const [batchFilter, setBatchFilter] = useState<string>("all"); // webinar_source value or "all"
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
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
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [editBatch, setEditBatch] = useState<{ origName: string; origDate: string | null; name: string; date: string } | null>(null);
  const [batchPipelineFilter, setBatchPipelineFilter] = useState<"all" | "unpaid" | "paid" | "custom">("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);
  const [hoverBefore, setHoverBefore] = useState<string | null>(null);

  const handleImportDone = async (result?: ImportResult) => {
    setImportOpen(false);
    await load();
    if (!result) return;
    setActivePipeline(result.pipelineId);
    setBatchFilter(result.batchName);
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
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (leadParam) setOpenLead(leadParam);
  }, [searchParams]);

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

  const pipelineStages = useMemo(() => stages.filter((s) => s.pipeline_id === activePipeline).sort((a, b) => a.position - b.position), [stages, activePipeline]);
  const pipelineLeads = useMemo(() => {
    let list = leads.filter((l) => l.pipeline_id === activePipeline);
    if (filter !== "all") list = list.filter((l) => filter === "super-hot" ? l.is_super_hot : l.grade === filter);
    if (batchFilter !== "all") list = list.filter((l) => (l.webinar_source || "—") === batchFilter);
    if (tagFilter !== "all") list = list.filter((l) => (leadTagsMap[l.id] || []).some((t) => t.id === tagFilter));
    if (stageFilter !== "all") list = list.filter((l) => l.stage_id === stageFilter);
    if (dateFrom) list = list.filter((l: any) => (l[dateField] || "") >= dateFrom);
    if (dateTo) list = list.filter((l: any) => (l[dateField] || "") <= dateTo + (dateField === "created_at" ? "T23:59:59" : ""));
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((l: any) => {
      const hay = [l.full_name, l.phone, l.email, l.program_name, l.webinar_source].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
    return list.slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [leads, activePipeline, filter, batchFilter, tagFilter, stageFilter, leadTagsMap, dateFrom, dateTo, dateField, searchQuery]);

  // Group leads into webinar batches (cards on the Batches view)
  const batches = useMemo(() => {
    const map = new Map<string, { key: string; name: string; date: string | null; pipelineId: string | null; total: number; hot: number; warm: number; cold: number; superHot: number; absentees: number; created: string | null }>();
    for (const l of leads) {
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
  }, [leads]);

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
  const visibleBatches = useMemo(
    () => batchPipelineFilter === "all" ? batchesWithType : batchesWithType.filter((b) => b.pipelineType === batchPipelineFilter),
    [batchesWithType, batchPipelineFilter]
  );


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
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null); setHoverStage(null); setHoverBefore(null);
    if (!id) return;
    if (beforeLeadId === id) return; // dropped on self, no-op
    const current = leads.find(l => l.id === id);
    if (current && current.stage_id === stageId && !beforeLeadId) {
      // dropped on same stage's empty area — no-op
      return;
    }
    // Compute new sort_order based on neighbors in target stage
    const targetList = leads.filter((l) => l.pipeline_id === activePipeline && l.stage_id === stageId && l.id !== id)
      .slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    let newOrder = 0;
    if (beforeLeadId) {
      const idx = targetList.findIndex((l) => l.id === beforeLeadId);
      const before: any = targetList[idx - 1];
      const after: any = targetList[idx];
      const a = before ? Number(before.sort_order || 0) : (after ? Number(after.sort_order || 0) - 1000 : 0);
      const b = after ? Number(after.sort_order || 0) : (before ? Number(before.sort_order || 0) + 1000 : 0);
      newOrder = (a + b) / 2;
    } else {
      const last: any = targetList[targetList.length - 1];
      newOrder = last ? Number(last.sort_order || 0) + 1000 : 0;
    }
    const oldStageId = leads.find(l => l.id === id)?.stage_id;
    await supabase.from("leads").update({ stage_id: stageId, sort_order: newOrder }).eq("id", id);
    const lead = leads.find(l => l.id === id);
    const oldName = stages.find(s => s.id === oldStageId)?.name ?? "—";
    const newName = stages.find(s => s.id === stageId)?.name ?? "—";
    if (oldStageId !== stageId) logActivity({ module_key: "calling_crm", action_type: "crm_stage_changed", entity_type: "crm_lead", entity_id: id, entity_label: lead?.full_name ?? undefined, old_values: { stage: oldName }, new_values: { stage: newName }, summary: `${lead?.full_name ?? "Lead"} moved from ${oldName} to ${newName}.` });
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, stage_id: stageId, sort_order: newOrder } as any : l));
  };

  const createPipeline = async () => {
    if (!newPipelineName.trim()) return;
    const { data, error } = await supabase.from("pipelines").insert({ name: newPipelineName.trim(), type: newPipelineType, position: pipelines.length }).select().maybeSingle();
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
    await load();
  };

  const deleteStage = async (s: Stage) => {
    if (s.is_protected) { toast.error("Protected stage — untoggle Protected first"); return; }
    const count = leads.filter((l) => l.stage_id === s.id).length;
    if (count > 0) { toast.error(`${count} leads in this stage`); return; }
    await supabase.from("stages").delete().eq("id", s.id);
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

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<"round_robin"|"manual"|"unassign">("round_robin");
  const [assignAgentId, setAssignAgentId] = useState<string>("");
  const [assignScope, setAssignScope] = useState<"unassigned"|"all">("unassigned");
  const [assignBusy, setAssignBusy] = useState(false);

  const runAssignment = async () => {
    setAssignBusy(true);
    try {
      const target = pipelineLeads.filter((l) => assignScope === "all" ? true : !l.assigned_agent_id);
      if (target.length === 0) { toast.info("No leads to assign in current view"); setAssignBusy(false); return; }
      if (assignMode === "unassign") {
        const ids = target.map((l) => l.id);
        await supabase.from("leads").update({ assigned_agent_id: null }).in("id", ids);
        toast.success(`Unassigned ${ids.length} leads`);
      } else if (assignMode === "manual") {
        if (!assignAgentId) { toast.error("Pick an agent"); setAssignBusy(false); return; }
        const ids = target.map((l) => l.id);
        await supabase.from("leads").update({ assigned_agent_id: assignAgentId }).in("id", ids);
        toast.success(`Assigned ${ids.length} leads`);
      } else {
        if (agents.length === 0) { toast.error("No active sales agents available"); setAssignBusy(false); return; }
        const buckets = new Map<string, string[]>();
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
      await load();
    } catch (e: any) { toast.error(e.message || "Assignment failed"); }
    finally { setAssignBusy(false); }
  };

  const activeFilterCount =
    (filter !== "all" ? 1 : 0) +
    (batchFilter !== "all" ? 1 : 0) +
    (tagFilter !== "all" ? 1 : 0) +
    (stageFilter !== "all" ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0) +
    (searchQuery ? 1 : 0);
  const advancedActiveCount = (tagFilter !== "all" ? 1 : 0) + (stageFilter !== "all" ? 1 : 0);
  const activeTag = allTags.find((t) => t.id === tagFilter);
  const activeStage = pipelineStages.find((s) => s.id === stageFilter);
  const resetAll = () => { setFilter("all"); setBatchFilter("all"); setTagFilter("all"); setStageFilter("all"); setDateFrom(""); setDateTo(""); setSearchQuery(""); };

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

          {(view === "kanban" || view === "list") && (
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, phone, email…"
                className="ipc-input !h-9 !text-xs !pl-7 w-full"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">⌕</span>
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-black" title="Clear search">
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {(view === "kanban" || view === "list") && (
            <>
              <select className="ipc-input !h-9 !text-xs max-w-[180px]" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} title="Webinar batch">
                <option value="all">All batches</option>
                {Array.from(new Set(leads.filter((l) => l.pipeline_id === activePipeline).map((l) => l.webinar_source || "—"))).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
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
              <select className="ipc-input !h-9 !text-xs" value={filter} onChange={(e) => setFilter(e.target.value as any)} title="Grade">
                <option value="all">All grades</option>
                <option value="super-hot">★ Super Hot</option>
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
              </select>
              <MoreFiltersMenu
                tagFilter={
                  <ManagedTagFilter
                    value={tagFilter}
                    onChange={setTagFilter}
                    tags={allTags}
                    onChanged={async () => { const tags = await listAllTags().catch(() => [] as Tag[]); setAllTags(tags); }}
                  />
                }
                stageFilter={
                  <ManagedStageFilter
                    value={stageFilter}
                    onChange={setStageFilter}
                    stages={pipelineStages}
                    pipelineId={activePipeline}
                    leadsCountByStage={pipelineLeads.reduce((acc: Record<string, number>, l) => { if (l.stage_id) acc[l.stage_id] = (acc[l.stage_id] || 0) + 1; return acc; }, {})}
                    onChanged={load}
                  />
                }
                count={advancedActiveCount}
              />
            </>
          )}

          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => setImportOpen(true)} className="ipc-btn ipc-btn-black !h-9 !text-xs"><Upload className="w-3.5 h-3.5" /> Import</button>
            <button onClick={() => setAssignOpen(true)} className="ipc-btn ipc-btn-ghost !h-9 !text-xs"><Users className="w-3.5 h-3.5" /> Assign</button>
            <OverflowActionsMenu
              onAddStage={() => setAddStageOpen(true)}
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
            {batchFilter !== "all" && (
              <FilterChip label={`Batch: ${batchFilter}`} onClear={() => setBatchFilter("all")} />
            )}
            {filter !== "all" && (
              <FilterChip label={`Grade: ${filter}`} onClear={() => setFilter("all")} />
            )}
            {(dateFrom || dateTo) && (
              <FilterChip label={`${dateField === "webinar_date" ? "Webinar" : "Imported"}: ${dateFrom || "…"} → ${dateTo || "…"}`} onClear={() => { setDateFrom(""); setDateTo(""); }} />
            )}
            {tagFilter !== "all" && activeTag && (
              <FilterChip label={`Tag: ${activeTag.name}`} onClear={() => setTagFilter("all")} />
            )}
            {stageFilter !== "all" && activeStage && (
              <FilterChip label={`Stage: ${activeStage.name}`} onClear={() => setStageFilter("all")} />
            )}
            <button onClick={resetAll} className="text-[10px] text-muted-foreground hover:text-black underline underline-offset-2">Reset all</button>
          </div>
        )}
      </div>

      {(view === "kanban" || view === "list") && (
        <div className="text-[11px] text-muted-foreground mb-2">
          Showing <span className="font-medium text-foreground">{pipelineLeads.length}</span> of <span className="font-medium text-foreground">{leads.filter((l) => l.pipeline_id === activePipeline).length}</span> leads
        </div>
      )}

      {importOpen && <ImportLeadsModal onClose={() => setImportOpen(false)} onDone={handleImportDone} />}
      {addStageOpen && <AddCrmStageModal pipelines={pipelines} stages={stages} defaultPipelineId={activePipeline} onClose={() => setAddStageOpen(false)} onCreated={() => load()} />}



      {/* Kanban */}
      {view === "kanban" && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: (stageFilter !== "all" ? 1 : pipelineStages.length) * 280 }}>
            {pipelineStages.filter((s) => stageFilter === "all" || s.id === stageFilter).map((s) => {
              const items = pipelineLeads.filter((l) => l.stage_id === s.id);
              const total = items.reduce((sum, l) => sum + Number(l.deal_value || 0), 0);
              const color = STAGE_COLORS[s.color] || "#888";
              return (
                <div
                  key={s.id}
                  className={`w-[270px] flex-shrink-0 rounded-xl border flex flex-col transition-colors ${hoverStage === s.id ? "bg-gold-pale border-gold" : "bg-off border-line"}`}
                  onDragOver={(e) => { e.preventDefault(); if (hoverStage !== s.id) setHoverStage(s.id); if (hoverBefore !== null) setHoverBefore(null); }}
                  onDragLeave={(e) => { if (e.currentTarget === e.target) { setHoverStage((h) => h === s.id ? null : h); } }}
                  onDrop={(e) => onDrop(e, s.id)}
                >
                  <div className="px-3 pt-3 pb-2 border-b-2" style={{ borderBottomColor: color }}>
                    <div className="flex items-center justify-between">
                      <div className="font-sans text-[11px] uppercase tracking-wider font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        {s.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{items.length}</div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">₹{total.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="p-2 space-y-2 flex-1 min-h-[120px]">
                    {items.map((l) => {
                      const g = GRADE_STYLES[l.grade];
                      const ag = agents.find((a) => a.id === l.assigned_agent_id);
                      const cardBg = l.is_super_hot ? "#FDF2F8" : l.lead_type === "paid" ? "#F0FDF4" : "white";
                      const cardBorder = l.is_super_hot ? "#FBCFE8" : l.lead_type === "paid" ? "#BBF7D0" : "#E8E5DE";
                      const isDragging = dragId === l.id;
                      const showPlaceholderBefore = hoverStage === s.id && hoverBefore === l.id && dragId && dragId !== l.id;
                      return (
                        <div key={l.id}>
                          {showPlaceholderBefore && (
                            <div className="mb-2 rounded-lg border-2 border-dashed border-gold bg-gold-pale/50 h-[88px] flex items-center justify-center text-[10px] uppercase tracking-wider text-gold-deep">Drop here</div>
                          )}
                          <div
                            draggable
                            onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move"; setDragId(l.id); }}
                            onDragEnd={() => { setDragId(null); setHoverStage(null); setHoverBefore(null); }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragId === l.id) return; if (hoverStage !== s.id) setHoverStage(s.id); if (hoverBefore !== l.id) setHoverBefore(l.id); }}
                            onDrop={(e) => onDrop(e, s.id, l.id)}
                            onClick={() => setOpenLead(l.id)}
                            className={`p-3 rounded-lg border cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${isDragging ? "opacity-40 scale-95 shadow-lg rotate-1" : ""}`}
                            style={{ background: cardBg, borderColor: cardBorder }}>
                            {l.webinar_source && <div className="uppercase-label !text-[8px] mb-1">{l.webinar_source}</div>}
                            <div className="font-serif text-sm">{l.full_name || "Unnamed"}</div>
                            <div className="text-[11px] text-muted-foreground">{l.program_name}</div>
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
                              <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider" style={{ background: g.bg, color: g.fg, border: `1px solid ${g.border}` }}>{g.label}</span>
                              {ag && <div className="w-5 h-5 rounded-full bg-black text-gold font-serif text-[9px] flex items-center justify-center" title={ag.full_name}>{ag.full_name.slice(0,1)}</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {items.length === 0 && (
                      <div className={`text-[10px] text-center py-6 rounded-lg border-2 border-dashed transition-colors ${hoverStage === s.id ? "border-gold bg-gold-pale/50 text-gold-deep uppercase tracking-wider" : "border-transparent text-muted-foreground"}`}>{hoverStage === s.id ? "Drop here" : "Drop leads here"}</div>
                    )}
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
              return (
                <div
                  key={b.key}
                  className="relative text-left p-5 rounded-xl border border-line bg-white hover:shadow-md hover:border-gold transition-all cursor-pointer"
                  onClick={() => {
                    if (b.pipelineId) setActivePipeline(b.pipelineId);
                    setBatchFilter(b.name);
                    setView("kanban");
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditBatch({ origName: b.name, origDate: b.date, name: b.name, date: b.date || "" }); }}
                    className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-black hover:bg-off"
                    title="Edit batch"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-black text-white text-[11px] font-medium tracking-wide">
                    <Calendar className="w-3 h-3" />
                    {b.date || "No date"}
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
                  if (batchFilter === editBatch.origName) setBatchFilter(newName);
                  toast.success("Batch updated");
                  setEditBatch(null);
                  await load();
                }}
              >Save changes</button>
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
          return (
            <div key={p.id} className={`flex items-center rounded-lg border ${isActive ? "bg-black text-white border-black" : "bg-white border-line hover:bg-off"}`}>
              <button onClick={() => setActivePipeline(p.id)} className="px-3 py-1.5 text-xs flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                {p.name}
                <span className={`text-[10px] ${isActive ? "text-white/70" : "text-muted-foreground"}`}>{leads.filter((l) => l.pipeline_id === p.id).length}</span>
              </button>
              {isActive && (
                <button onClick={() => setView("stages")} title="Design pipeline" className="px-2 py-1.5 border-l border-white/20 hover:bg-white/10">
                  <Settings2 className="w-3 h-3" />
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

      {openLead && <LeadDrawer leadId={openLead} stages={stages} agents={agents} onClose={() => setOpenLead(null)} onChanged={load} />}

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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="ipc-btn ipc-btn-ghost !h-9 !text-xs" title="Tags, stages & more filters">
        <Settings2 className="w-3.5 h-3.5" /> More filters{count > 0 ? ` (${count})` : ""}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[320px] bg-white border border-line rounded-md shadow-lg z-[1050] p-3 space-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tag</div>
            {tagFilter}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Stage</div>
            {stageFilter}
          </div>
        </div>
      )}
    </div>
  );
}

function OverflowActionsMenu({ onAddStage, onExport }: { onAddStage: () => void; onExport: () => void }) {
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
          <button onClick={() => { setOpen(false); onAddStage(); }} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-off">+ Add Stage</button>
          <button onClick={() => { setOpen(false); onExport(); }} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-off"><Download className="w-3 h-3 inline mr-1" /> Export CSV</button>
        </div>
      )}
    </div>
  );
}
