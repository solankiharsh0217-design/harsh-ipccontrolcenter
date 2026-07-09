import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Plus, Search, X as XIcon, RefreshCw, GripVertical,
  Pencil, Trash2,
} from "lucide-react";
import { ensureOperationsPipeline, SERVICE_STATUS_COLORS, SERVICE_STATUS_LABELS, computeServiceCalc } from "@/lib/operationsCrm";
import { ensureSeedTemplate, listProcessTemplates } from "@/lib/operationsTemplates";
import NoTemplateBanner from "@/components/operations/NoTemplateBanner";
import AddCrmStageModal from "@/components/AddCrmStageModal";
import OperationsLeadDrawer, { type OpsLeadFull } from "@/components/OperationsLeadDrawer";
import RewardWidget from "@/components/operations/RewardWidget";
import MediaBuyerPerformancePanel from "@/components/operations/MediaBuyerPerformancePanel";
import OpsReportsTab from "@/components/operations/OpsReportsTab";
import OpsConversionsTab from "@/components/operations/OpsConversionsTab";
import OpsRewardsTab from "@/components/operations/OpsRewardsTab";
import OperationsIntakeTab from "@/components/operations/OperationsIntakeTab";
import OperationsSettingsTab from "@/components/operations/OperationsSettingsTab";
import { getMonthlyCountsByBuyer, currentMonthStr } from "@/lib/operationsConversions";
import type { Pipeline, Stage } from "@/lib/crmTypes";
import ServicePackageChip from "@/components/ServicePackageChip";
import SlaChip from "@/components/operations/SlaChip";
import {
  getOperationsSlaSettings, fetchStageChangeMap, computeStageAging,
  DEFAULT_SLA, type OperationsSlaSettings, type SlaStatus,
} from "@/lib/operationsSla";

interface OpsLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  product_name: string | null;
  batch_name: string | null;
  service_package_name: string | null;
  service_months: number | null;
  service_days_committed: number | null;
  service_status: string;
  pipeline_id: string | null;
  stage_id: string | null;
  assigned_media_buyer_id: string | null;
  assigned_media_buyer_name: string | null;
  priority: string | null;
  ad_launch_date: string | null;
  current_active_start_date: string | null;
  total_active_days: number;
  total_paused_days: number;
  last_paused_at: string | null;
  last_resumed_at: string | null;
  service_end_target_date: string | null;
  crm_lead_id: string | null;
  paid_pipeline_lead_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at?: string | null;
  sort_order: number;
}

export default function OperationsCrm() {
  const { profile, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [leads, setLeads] = useState<OpsLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [buyerFilter, setBuyerFilter] = useState<string>(params.get("assigned_to") === "me" ? "me" : (isAdmin ? "all" : "me"));
  const [statusFilter, setStatusFilter] = useState<string>(params.get("filter") || "all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [slaFilter, setSlaFilter] = useState<"all" | SlaStatus>("all");
  const [slaSortOverdue, setSlaSortOverdue] = useState(false);
  const [slaSettings, setSlaSettings] = useState<OperationsSlaSettings>(DEFAULT_SLA);
  const [stageMoveMap, setStageMoveMap] = useState<Map<string, string>>(new Map());
  const [buyers, setBuyers] = useState<{ id: string; full_name: string }[]>([]);
  const [openLead, setOpenLead] = useState<string | null>(params.get("lead"));
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [drag, setDrag] = useState<{ id: string; fromStage: string | null } | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);
  const [renameStage, setRenameStage] = useState<Stage | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [convCounts, setConvCounts] = useState<Map<string, { approved: number; pending: number; rejected: number; value: number }>>(new Map());
  const [refreshKey, setRefreshKey] = useState(0);
  const initialTab = (params.get("tab") as "intake" | "kanban" | "reports" | "conversions" | "rewards" | "settings") || "kanban";
  const [tab, setTab] = useState<"intake" | "kanban" | "reports" | "conversions" | "rewards" | "settings">(initialTab);

  const [hasTemplates, setHasTemplates] = useState<boolean | null>(null);

  const checkTemplates = async () => {
    try {
      const t = await listProcessTemplates(false);
      setHasTemplates(t.length > 0);
    } catch { setHasTemplates(null); }
  };

  useEffect(() => {
    (async () => {
      if (isAdmin) {
        await ensureSeedTemplate().catch(() => {});
      }
      await checkTemplates();
    })();
  }, [isAdmin]);

  const load = async () => {
    setLoading(true);
    try {
      const { pipelineId: pid } = await ensureOperationsPipeline();
      setPipelineId(pid);
      const [pRes, sRes, lRes, bRes] = await Promise.all([
        supabase.from("pipelines").select("*").order("position"),
        supabase.from("stages").select("*").eq("pipeline_id", pid).order("position"),
        supabase.from("operations_leads" as any).select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name").eq("can_receive_operations_leads", true as any),
      ]);
      setPipelines((pRes.data ?? []) as any);
      setStages((sRes.data ?? []) as any);
      setLeads((lRes.data ?? []) as any);
      setBuyers(((bRes.data ?? []) as any[]).map((b) => ({ id: b.id, full_name: b.full_name ?? "Unnamed" })));
    } catch (e: any) {
      toast.error(e.message || "Failed to load Operations CRM");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const c = await getMonthlyCountsByBuyer(currentMonthStr());
      if (!cancel) setConvCounts(c);
    })();
    return () => { cancel = true; };
  }, [refreshKey]);

  const myConv = useMemo(() => convCounts.get(profile?.id ?? "") ?? { approved: 0, pending: 0, rejected: 0, value: 0 }, [convCounts, profile?.id]);
  const allConv = useMemo(() => {
    let approved = 0, pending = 0, rejected = 0;
    for (const v of convCounts.values()) { approved += v.approved; pending += v.pending; rejected += v.rejected; }
    return { approved, pending, rejected };
  }, [convCounts]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const hit = [l.name, l.email, l.phone, l.product_name, l.batch_name, l.assigned_media_buyer_name]
          .some((v) => v && String(v).toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (buyerFilter === "me") {
        if (l.assigned_media_buyer_id !== profile?.id) return false;
      } else if (buyerFilter !== "all") {
        if (l.assigned_media_buyer_id !== buyerFilter) return false;
      }
      if (statusFilter !== "all" && l.service_status !== statusFilter) return false;
      if (stageFilter !== "all" && l.stage_id !== stageFilter) return false;
      return true;
    });
  }, [leads, search, buyerFilter, statusFilter, stageFilter, profile?.id]);

  const metrics = useMemo(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return {
      total: leads.length,
      active: leads.filter((l) => l.service_status === "active").length,
      notStarted: leads.filter((l) => l.service_status === "not_started").length,
      paused: leads.filter((l) => l.service_status === "paused").length,
      stopped: leads.filter((l) => l.service_status === "stopped").length,
      completed: leads.filter((l) => l.service_status === "completed").length,
      mineThisMonth: leads.filter((l) => l.assigned_media_buyer_id === profile?.id && l.created_at.startsWith(month)).length,
    };
  }, [leads, profile?.id]);

  const leadsByStage = useMemo(() => {
    const map = new Map<string, OpsLead[]>();
    stages.forEach((s) => map.set(s.id, []));
    for (const l of filtered) {
      if (l.stage_id && map.has(l.stage_id)) map.get(l.stage_id)!.push(l);
    }
    return map;
  }, [filtered, stages]);

  const onDropToStage = async (toStageId: string) => {
    if (!drag) return;
    const id = drag.id;
    const from = drag.fromStage;
    setDrag(null);
    setHoverStage(null);
    if (from === toStageId) return;

    // Optimistic update
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, stage_id: toStageId } : l));
    const { error } = await supabase.from("operations_leads" as any).update({ stage_id: toStageId }).eq("id", id);
    if (error) {
      toast.error("Failed to move card");
      load();
    }
  };

  const addStage = () => setAddStageOpen(true);

  const saveRename = async () => {
    if (!renameStage || !renameValue.trim()) return;
    const { error } = await supabase.from("stages").update({ name: renameValue.trim() }).eq("id", renameStage.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Stage renamed");
    setRenameStage(null);
    setRenameValue("");
    load();
  };

  const deleteStage = async (s: Stage) => {
    const count = leadsByStage.get(s.id)?.length ?? 0;
    if (count > 0) { toast.error(`Move ${count} card${count === 1 ? "" : "s"} out of this stage first.`); return; }
    if (!confirm(`Delete stage "${s.name}"?`)) return;
    const { error } = await supabase.from("stages").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Stage deleted");
    load();
  };

  const openCrmLink = (l: OpsLead) => {
    if (l.crm_lead_id) window.open(`/crm?lead=${l.crm_lead_id}`, "_blank");
  };

  const drawerLead = leads.find((l) => l.id === openLead) || null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-2xl text-black">Operations CRM</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Service delivery for paid clients · media buying, ads tracking, conversions, rewards.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={load} className="ipc-btn ipc-btn-ghost !h-9 !text-xs" title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
          {isAdmin && <button onClick={addStage} className="ipc-btn ipc-btn-ghost !h-9 !text-xs"><Plus className="w-3.5 h-3.5" /> Add Stage</button>}
        </div>
      </div>

      {/* Metric strip — only on Reports & Rewards tabs (keeps Active tab clean) */}
      {(tab === "reports" || tab === "rewards") && (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
        {(isAdmin ? [
          { label: "Total clients", value: metrics.total },
          { label: "Active ads", value: metrics.active },
          { label: "Paused", value: metrics.paused },
          { label: "Completed", value: metrics.completed },
          { label: "Pending approvals", value: allConv.pending, tone: allConv.pending > 0 ? "amber" : undefined },
          { label: "Approved this month", value: allConv.approved },
          { label: "Rejected this month", value: allConv.rejected },
        ] : [
          { label: "My clients", value: leads.filter((l) => l.assigned_media_buyer_id === profile?.id).length },
          { label: "Active ads", value: leads.filter((l) => l.assigned_media_buyer_id === profile?.id && l.service_status === "active").length },
          { label: "Paused", value: leads.filter((l) => l.assigned_media_buyer_id === profile?.id && l.service_status === "paused").length },
          { label: "Conversions this month", value: myConv.approved + myConv.pending + myConv.rejected },
          { label: "Approved", value: myConv.approved },
          { label: "Pending", value: myConv.pending, tone: myConv.pending > 0 ? "amber" : undefined },
          { label: "Rejected", value: myConv.rejected },
        ]).map((m: any) => (
          <div key={m.label} className="bg-white border border-line rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
            <div className={`font-serif text-xl mt-0.5 ${m.tone === "amber" ? "text-[#92400E]" : "text-black"}`}>{m.value}</div>
          </div>
        ))}
      </div>
      )}

      {hasTemplates === false && (
        <div className="mb-3">
          <NoTemplateBanner isAdmin={isAdmin} onCreated={checkTemplates} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-line mb-3">
        {([
          ["intake", "Intake"],
          ["kanban", "Active"],
          ["reports", "Reports"],
          ["conversions", "Conversions"],
          ["rewards", "Rewards"],
          ["settings", "Settings"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); const p = new URLSearchParams(params); if (k === "kanban") p.delete("tab"); else p.set("tab", k); setParams(p, { replace: true }); }}
            className={`relative px-3 py-2 text-[12px] font-sans ${tab === k ? "text-black after:absolute after:left-2 after:right-2 after:bottom-[-1px] after:h-[2px] after:bg-gold" : "text-muted-foreground hover:text-black"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "intake" && (
        <OperationsIntakeTab onOpenLead={(id) => setOpenLead(id)} />
      )}
      {tab === "settings" && (
        <OperationsSettingsTab isAdmin={isAdmin} />
      )}
      {tab === "reports" && (
        <OpsReportsTab leads={leads as any} onOpenLead={(id) => setOpenLead(id)} isAdmin={isAdmin} />
      )}
      {tab === "conversions" && (
        <OpsConversionsTab isAdmin={isAdmin} onOpenLead={(id) => setOpenLead(id)} onChanged={() => setRefreshKey((k) => k + 1)} />
      )}
      {tab === "rewards" && (
        <OpsRewardsTab isAdmin={isAdmin} selfId={profile?.id} />
      )}

      {tab !== "kanban" ? null : (
      <>
      {/* Rewards & media buyer performance moved to Rewards/Reports tabs.
          Active board stays focused on client cards + stages. */}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email…"
            className="ipc-input !h-9 !text-xs !pl-7 w-full"
          />
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-black">
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
        <select className="ipc-input !h-9 !text-xs" value={buyerFilter} onChange={(e) => { setBuyerFilter(e.target.value); const p = new URLSearchParams(params); if (e.target.value === "me") p.set("assigned_to", "me"); else p.delete("assigned_to"); setParams(p, { replace: true }); }}>
          {isAdmin && <option value="all">All media buyers</option>}
          {profile?.id && <option value="me">Assigned to me</option>}
          {isAdmin && buyers.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
        </select>
        <select className="ipc-input !h-9 !text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(SERVICE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="ipc-input !h-9 !text-xs" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="all">All stages</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {(search || buyerFilter !== "all" || statusFilter !== "all" || stageFilter !== "all") && (
          <button
            className="text-[11px] underline text-muted-foreground hover:text-black"
            onClick={() => { setSearch(""); setBuyerFilter("all"); setStatusFilter("all"); setStageFilter("all"); }}
          >Reset</button>
        )}
        <div className="ml-auto text-[11px] text-muted-foreground">
          Showing <span className="text-foreground font-medium">{filtered.length}</span> of {leads.length}
        </div>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      ) : stages.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center border border-dashed border-line rounded-lg">
          No stages yet. <button className="underline text-black" onClick={addStage}>Add the first stage</button>.
        </div>
      ) : leads.length === 0 ? (
        <div className="border border-dashed border-line rounded-xl bg-off/40 py-12 px-6 text-center">
          <div className="font-serif text-lg text-black mb-1">No clients in Operations CRM yet</div>
          <div className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
            Send paid / onboarded clients here from Calling CRM using the <span className="font-medium text-foreground">Send to Operations</span> action — in the bulk bar or inside the lead drawer.
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <a href="/crm" className="ipc-btn ipc-btn-black !h-9 !text-xs">Go to Calling CRM</a>
            {isAdmin && <a href="/master-settings" className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Master Settings</a>}
            <button onClick={load} className="ipc-btn ipc-btn-ghost !h-9 !text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((s) => {
            const items = leadsByStage.get(s.id) ?? [];
            const isHover = hoverStage === s.id;
            return (
              <div
                key={s.id}
                className={`flex-shrink-0 w-72 bg-off rounded-lg border ${isHover ? "border-gold" : "border-line"} transition-colors`}
                onDragOver={(e) => { e.preventDefault(); if (hoverStage !== s.id) setHoverStage(s.id); }}
                onDragLeave={() => setHoverStage(null)}
                onDrop={() => onDropToStage(s.id)}
              >
                <div className="px-3 py-2 flex items-center justify-between sticky top-0 bg-off rounded-t-lg z-[1]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <div className="font-serif text-sm text-black truncate">{s.name}</div>
                    <div className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-line text-muted-foreground">{items.length}</div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-0.5">
                      <button title="Rename" onClick={() => { setRenameStage(s); setRenameValue(s.name); }} className="w-5 h-5 rounded hover:bg-white flex items-center justify-center text-muted-foreground"><Pencil className="w-3 h-3" /></button>
                      <button title="Delete" onClick={() => deleteStage(s)} className="w-5 h-5 rounded hover:bg-white flex items-center justify-center text-muted-foreground"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
                <div className="px-2 pb-2 space-y-2 min-h-[100px]">
                  {items.map((l) => {
                    const calc = computeServiceCalc(l);
                    let progressLine = "";
                    if (l.service_status === "active") progressLine = `Active · ${calc.activeDaysUsed}/${calc.committedDays} days · ${calc.remainingDays} left`;
                    else if (l.service_status === "paused") progressLine = `Paused · ${calc.pausedDays} paused days · ${calc.remainingDays} left`;
                    else if (l.service_status === "completed") progressLine = `Completed · ${calc.activeDaysUsed} active days`;
                    else if (l.service_status === "stopped") progressLine = `Stopped · ${calc.activeDaysUsed}/${calc.committedDays} delivered`;
                    else progressLine = `Not started · ${calc.committedDays} days committed`;
                    return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDrag({ id: l.id, fromStage: l.stage_id })}
                      onDragEnd={() => { setDrag(null); setHoverStage(null); }}
                      onClick={() => setOpenLead(l.id)}
                      className={`bg-white border border-line rounded-md p-2.5 cursor-grab active:cursor-grabbing hover:border-[#bbb] hover:shadow-sm transition ${drag?.id === l.id ? "opacity-30" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="font-serif text-[13px] text-black truncate flex-1">{l.name}</div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${SERVICE_STATUS_COLORS[l.service_status] || ""}`}>{SERVICE_STATUS_LABELS[l.service_status] || l.service_status}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {l.phone || l.email || "—"}
                      </div>
                      <div className="flex items-center justify-between mt-1.5 gap-1">
                        <div className="text-[10px] text-muted-foreground truncate">
                          {l.assigned_media_buyer_name || "Unassigned"}
                        </div>
                        {((l as any).service_package_snapshot?.name || l.service_package_name) && (
                          <ServicePackageChip snapshot={(l as any).service_package_snapshot} fallbackName={l.service_package_name} />
                        )}
                      </div>
                      <div className="text-[10px] text-foreground/80 truncate mt-1">{progressLine}</div>
                      {l.batch_name && (
                        <div className="text-[10px] text-muted-foreground truncate mt-0.5 italic">{l.batch_name}</div>
                      )}
                    </div>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="text-[10px] text-muted-foreground text-center py-4">No cards</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}



      {/* Add stage modal — reuses Calling CRM stage modal */}
      {addStageOpen && pipelineId && (
        <AddCrmStageModal
          pipelines={pipelines}
          stages={stages}
          defaultPipelineId={pipelineId}
          onClose={() => setAddStageOpen(false)}
          onCreated={() => load()}
        />
      )}

      {/* Rename stage */}
      {renameStage && (
        <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={() => setRenameStage(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-sm p-5">
            <div className="font-serif text-base mb-2">Rename stage</div>
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenameStage(null); }}
              className="ipc-input"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRenameStage(null)} className="ipc-btn ipc-btn-ghost">Cancel</button>
              <button onClick={saveRename} className="ipc-btn ipc-btn-black">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Lead drawer — Phase B */}
      {drawerLead && (
        <OperationsLeadDrawer
          lead={drawerLead as unknown as OpsLeadFull}
          onClose={() => setOpenLead(null)}
          onSaved={() => { load(); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}
