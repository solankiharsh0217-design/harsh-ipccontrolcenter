import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import PromisedOffersPanel from "@/components/offers/PromisedOffersPanel";
import DeliveryTrackingSection from "@/components/operations/DeliveryTrackingSection";
import {
  X as XIcon, ExternalLink, Play, Pause, Square, CheckCircle2, RotateCcw,
  ClipboardCopy,
} from "lucide-react";
import {
  SERVICE_STATUS_COLORS, SERVICE_STATUS_LABELS,
  computeServiceCalc, todayStr, daysBetween, addDays, monthsToDays, COMMS_TEMPLATES,
} from "@/lib/operationsCrm";
import { logActivity } from "@/lib/auditLog";
import { createNotification } from "@/lib/notifications";
import ConversionsSection from "@/components/operations/ConversionsSection";
import ReadinessChecklist from "@/components/operations/ReadinessChecklist";
import TeamResultSubmissionPanel from "@/components/operations/TeamResultSubmissionPanel";
import CustomFieldsPanel from "@/components/operations/CustomFieldsPanel";
import CommTemplatePickerModal from "@/components/operations/CommTemplatePickerModal";
import OperationsActivityTimeline from "@/components/operations/OperationsActivityTimeline";
import OperationsLinkedRecordsCard from "@/components/operations/OperationsLinkedRecordsCard";
import StartProcessModal from "@/components/operations/StartProcessModal";
import { listProcessTemplates, type ProcessTemplate } from "@/lib/operationsTemplates";
import { Mail, Rocket, ArrowRight, CheckCircle } from "lucide-react";
import {
  getReadinessSettings, resolveReadinessTargetStage, isAtOrAfterTarget,
  moveOperationsLeadStage, type ReadinessSettings,
} from "@/lib/operationsReadiness";
import {
  getOperationsSlaSettings, fetchStageChangeMap, computeStageAging,
  DEFAULT_SLA, type OperationsSlaSettings,
} from "@/lib/operationsSla";
import SlaChip from "@/components/operations/SlaChip";
import type { Stage } from "@/lib/crmTypes";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";


export interface OpsLeadFull {
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
  assigned_media_buyer_id: string | null;
  assigned_media_buyer_name: string | null;
  ad_launch_date: string | null;
  current_active_start_date: string | null;
  total_active_days: number;
  total_paused_days: number;
  last_paused_at: string | null;
  last_resumed_at: string | null;
  service_end_target_date: string | null;
  notes: string | null;
  crm_lead_id: string | null;
  paid_pipeline_lead_id: string | null;
  process_template_id?: string | null;
  intake_status?: string | null;
  intake_source?: string | null;
  brand_name?: string | null;
  program_name?: string | null;
  readiness_override_reason?: string | null;
  readiness_override_by?: string | null;
  readiness_override_at?: string | null;
  pipeline_id?: string | null;
  stage_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface ServiceEvent {
  id: string;
  event_type: string;
  event_date: string;
  reason: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name?: string | null;
  channel?: string | null;
  template_title?: string | null;
  message_snapshot?: string | null;
  subject_snapshot?: string | null;
  send_status?: string | null;
}

const COMMUNICATION_EVENT_TYPES = new Set([
  "communication_logged", "communication_copied", "communication_sent", "communication_failed",
]);

type ActionType = "start" | "pause" | "resume" | "stop" | "complete";

const ACTION_META: Record<ActionType, { title: string; verb: string; needsReason?: boolean; auditAction: string; notifType: string; notifTitle: string }> = {
  start:    { title: "Mark Ads Started",  verb: "Start",   auditAction: "operations_ads_started",        notifType: "ops_ads_started",      notifTitle: "Ads started" },
  pause:    { title: "Pause Service",     verb: "Pause",   needsReason: true,  auditAction: "operations_service_paused",    notifType: "ops_service_paused",    notifTitle: "Service paused" },
  resume:   { title: "Resume Service",    verb: "Resume",  auditAction: "operations_service_resumed",   notifType: "ops_service_resumed",   notifTitle: "Service resumed" },
  stop:     { title: "Stop Service",      verb: "Stop",    needsReason: true,  auditAction: "operations_service_stopped",   notifType: "ops_service_stopped",   notifTitle: "Service stopped" },
  complete: { title: "Mark Completed",    verb: "Complete", auditAction: "operations_service_completed", notifType: "ops_service_completed", notifTitle: "Service completed" },
};

export default function OperationsLeadDrawer({
  lead, onClose, onSaved,
}: {
  lead: OpsLeadFull;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [action, setAction] = useState<ActionType | null>(null);
  const [showCommModal, setShowCommModal] = useState(false);
  const [showStartProcess, setShowStartProcess] = useState(false);
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [readinessSummary, setReadinessSummary] = useState<{ pct: number; blocked: boolean } | null>(null);
  const [readinessSettings, setReadinessSettings] = useState<ReadinessSettings | null>(null);
  const [opsStages, setOpsStages] = useState<Stage[]>([]);
  const [showReadinessMove, setShowReadinessMove] = useState(false);
  const [slaSettings, setSlaSettings] = useState<OperationsSlaSettings>(DEFAULT_SLA);
  const [exactStageMovedAt, setExactStageMovedAt] = useState<string | null>(null);
  const [deliveryBuyers, setDeliveryBuyers] = useState<{ id: string; full_name: string }[]>([]);

  // ── Readiness completion / move logic ─────────────────────────
  const isReady = (readinessSummary?.pct ?? 0) >= 100 && !!lead.process_template_id;
  const currentStageObj = useMemo(
    () => opsStages.find((s) => s.id === lead.stage_id) ?? null,
    [opsStages, lead.stage_id],
  );
  const targetStageObj = useMemo(
    () => resolveReadinessTargetStage(
      opsStages,
      lead.stage_id ?? null,
      readinessSettings?.operations_readiness_target_stage_id ?? null,
    ),
    [opsStages, lead.stage_id, readinessSettings],
  );
  const alreadyAtOrAfterTarget = !!targetStageObj && isAtOrAfterTarget(
    opsStages, lead.stage_id ?? null, targetStageObj.id,
  );
  const canMoveReadiness = !!(profile?.id) && (
    isAdmin || (!!lead.assigned_media_buyer_id && lead.assigned_media_buyer_id === profile.id)
  );

  useEffect(() => {

    if (lead.service_status === "not_started" || !lead.process_template_id) {
      setActiveTab("onboarding");
    } else if (isReady && !alreadyAtOrAfterTarget) {
      setActiveTab("onboarding");
    }
  }, [lead.id, lead.service_status, lead.process_template_id, isReady, alreadyAtOrAfterTarget]);

  useEffect(() => {

    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("can_receive_operations_leads", true as any);
      if (!cancel) {
        setDeliveryBuyers(((data ?? []) as any[]).map((b) => ({ id: b.id, full_name: b.full_name ?? "Unnamed" })));
      }
    })();
    return () => { cancel = true; };
  }, []);
  const autoMovedRef = (useMemo(() => ({ current: false }), []) as { current: boolean });

  const templateName = useMemo(
    () => templates.find((t) => t.id === lead.process_template_id)?.name ?? null,
    [templates, lead.process_template_id]
  );

  useEffect(() => {
    listProcessTemplates(true).then(setTemplates).catch(() => {});
    getReadinessSettings().then(setReadinessSettings).catch(() => {});
    getOperationsSlaSettings().then(setSlaSettings).catch(() => {});
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const m = await fetchStageChangeMap([lead.id]);
      if (!cancel) setExactStageMovedAt(m.get(lead.id) ?? null);
    })();
    return () => { cancel = true; };
  }, [lead.id]);

  // Load Operations pipeline stages (needed to resolve readiness target stage).
  useEffect(() => {
    (async () => {
      if (lead.pipeline_id) {
        const { data } = await supabase
          .from("stages")
          .select("*")
          .eq("pipeline_id", lead.pipeline_id)
          .order("position");
        setOpsStages((data ?? []) as any);
      } else {
        // Fall back: look up via the operations pipeline referenced on the lead row.
        const { data: row } = await supabase
          .from("operations_leads" as any)
          .select("pipeline_id")
          .eq("id", lead.id)
          .maybeSingle();
        const pid = (row as any)?.pipeline_id;
        if (pid) {
          const { data } = await supabase.from("stages").select("*").eq("pipeline_id", pid).order("position");
          setOpsStages((data ?? []) as any);
        }
      }
    })();
  }, [lead.id, lead.pipeline_id]);

  const calc = useMemo(() => computeServiceCalc(lead), [lead]);

  const loadEvents = async () => {
    setEventsLoading(true);
    const { data } = await supabase
      .from("operations_service_events" as any)
      .select("*")
      .eq("operations_lead_id", lead.id)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as any as ServiceEvent[];
    // Enrich with creator names
    const ids = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map = new Map<string, string>();
      (profs ?? []).forEach((p: any) => map.set(p.id, p.full_name));
      rows.forEach((r) => { if (r.created_by) r.created_by_name = map.get(r.created_by) ?? null; });
    }
    setEvents(rows);
    setEventsLoading(false);
  };

  useEffect(() => { loadEvents(); }, [lead.id]);

  const serviceEvents = useMemo(
    () => events.filter((e) => !COMMUNICATION_EVENT_TYPES.has(e.event_type)),
    [events],
  );
  const commEvents = useMemo(
    () => events.filter((e) => COMMUNICATION_EVENT_TYPES.has(e.event_type)),
    [events],
  );

  const openCrmLink = () => { if (lead.crm_lead_id) window.open(`/crm?lead=${lead.crm_lead_id}`, "_blank"); };

  const status = lead.service_status;
  const showStart    = status === "not_started";
  const showPause    = status === "active";
  const showResume   = status === "paused";
  const showStop     = status === "active" || status === "paused";
  const showComplete = status === "active";
  const showRestart  = status === "stopped" || status === "completed";


  const doMove = async (kind: "readiness_manual_move" | "readiness_auto_move") => {
    if (!targetStageObj) { toast.error("No target stage configured or resolvable."); return; }
    if (alreadyAtOrAfterTarget) { toast.info("Already moved beyond readiness stage."); return; }
    try {
      await moveOperationsLeadStage({
        leadId: lead.id,
        fromStageId: lead.stage_id ?? null,
        toStageId: targetStageObj.id,
        fromStageName: currentStageObj?.name ?? null,
        toStageName: targetStageObj.name,
        kind,
        actorUserId: profile?.id ?? null,
      });
      toast.success(`Moved to ${targetStageObj.name}`);
      setShowReadinessMove(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Move failed");
    }
  };

  // Optional auto-advance: fire once per drawer session when conditions are met.
  useEffect(() => {
    if (autoMovedRef.current) return;
    if (!readinessSettings?.operations_readiness_auto_move) return;
    if (!isReady) return;
    if (!targetStageObj) return;
    if (alreadyAtOrAfterTarget) return;
    if (!canMoveReadiness) return;
    autoMovedRef.current = true;
    doMove("readiness_auto_move");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, readinessSettings, targetStageObj, alreadyAtOrAfterTarget, canMoveReadiness]);


  const primaryAction = useMemo(() => {
    if (lead.intake_status !== "active" && lead.service_status === "not_started") {
      return { label: "Start Operations Process", icon: Rocket, onClick: () => setShowStartProcess(true) };
    }
    if (isReady && !alreadyAtOrAfterTarget && targetStageObj && canMoveReadiness) {
      return { label: `Move to ${targetStageObj.name}`, icon: ArrowRight, onClick: () => setShowReadinessMove(true) };
    }
    if (showStart) {
      return { label: "Mark Ads Started", icon: Play, onClick: () => setAction("start") };
    }
    if (showResume) {
      return { label: "Resume Service", icon: Play, onClick: () => setAction("resume") };
    }
    return { label: "Log Communication", icon: Mail, onClick: () => setShowCommModal(true) };
  }, [lead, isReady, alreadyAtOrAfterTarget, targetStageObj, canMoveReadiness, showStart, showResume]);

  return (
    <div className="fixed inset-0 z-[1100] bg-black/40 flex justify-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white h-full overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between sticky top-0 bg-white z-10 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-serif text-lg text-black truncate">{lead.name}</div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${SERVICE_STATUS_COLORS[status] || ""}`}>
                {SERVICE_STATUS_LABELS[status] || status}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{lead.product_name || "—"}</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-off flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="px-2 border-b border-line rounded-none bg-transparent gap-1 shrink-0 overflow-x-auto no-scrollbar">
            {["overview", "onboarding", "delivery", "results", "activity"].map(t => (
              <TabsTrigger 
                key={t} 
                value={t} 
                className="capitalize text-[11px] py-2 data-[state=active]:border-b-2 data-[state=active]:border-gold rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {t === "onboarding" ? "Process" : t}
              </TabsTrigger>
            ))}
          </TabsList>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-6">

            <TabsContent value="overview" className="mt-0 space-y-6">
              {/* Client Profile */}
              <Section title="Client profile">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email" value={lead.email || "—"} />
                  <Field label="Phone" value={lead.phone || "—"} />
                  <Field label="Product / Program" value={lead.product_name || "—"} />
                  <Field label="Batch" value={lead.batch_name || "—"} />
                  <Field label="Media buyer" value={lead.assigned_media_buyer_name || "Unassigned"} />
                </div>
                <div className="flex gap-2 flex-wrap mt-3">
                  {lead.crm_lead_id && (
                    <button onClick={openCrmLink} className="ipc-btn ipc-btn-ghost !text-xs">
                      <ExternalLink className="w-3 h-3" /> Open in Calling CRM
                    </button>
                  )}
                  {lead.paid_pipeline_lead_id && (
                    <button onClick={() => window.open(`/paid-pipeline?lead=${lead.paid_pipeline_lead_id}`, "_blank")} className="ipc-btn ipc-btn-ghost !text-xs">
                      <ExternalLink className="w-3 h-3" /> Open in Paid Pipeline
                    </button>
                  )}
                </div>
              </Section>

              {/* Linked Records */}
              <OperationsLinkedRecordsCard
                operationsLeadId={lead.id}
                operationsLeadName={lead.name}
                operationsStatusLabel={SERVICE_STATUS_LABELS[status] || status}
                crmLeadId={lead.crm_lead_id}
                paidPipelineLeadId={lead.paid_pipeline_lead_id}
              />


            <TabsContent value="onboarding" className="mt-0 space-y-6">
              {/* Process / Intake summary */}
              <Section title="Process / Intake">
                <div className="grid grid-cols-2 gap-2">
                  <Card label="Process / Service Type" value={templateName || "Not assigned"} />
                  <Card label="Intake status" value={lead.intake_status || "—"} />
                  <Card label="Readiness" value={readinessSummary ? `${readinessSummary.pct}%${readinessSummary.blocked ? " · blocked" : ""}` : "—"} />
                  <Card label="Source" value={lead.intake_source || "—"} />
                  <Card label="Owner" value={lead.assigned_media_buyer_name || "Unassigned"} />
                  {lead.readiness_override_reason && (
                    <Card label="Override" value={lead.readiness_override_reason} />
                  )}
                </div>

                {/* Template assignment / change */}
                {isAdmin && (
                  <div className="mt-3 border border-line rounded-md p-2.5 bg-off/30">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      {lead.process_template_id ? "Change process / service type" : "Assign process / service type"}
                    </div>
                    {templates.length === 0 ? (
                      <div className="text-[11px] text-[#92400E]">
                        No process template exists.{" "}
                        <a href="/operations-crm?tab=settings" className="underline font-medium">
                          Create one in Operations CRM → Settings
                        </a>.
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={lead.process_template_id ?? ""}
                          onChange={async (e) => {
                            const v = e.target.value || null;
                            if (v === (lead.process_template_id ?? null)) return;
                            const isActive = lead.service_status === "active" || lead.service_status === "paused";
                            if (isActive) {
                              const ok = window.confirm(
                                "Changing process template may change the checklist and custom fields for this client. Existing filled values will remain but may not apply to the new template. Continue?"
                              );
                              if (!ok) return;
                            }
                            const { error } = await supabase
                              .from("operations_leads" as any)
                              .update({ process_template_id: v } as any)
                              .eq("id", lead.id);
                            if (error) { toast.error(error.message); return; }
                            toast.success(v ? "Process template updated" : "Process template removed");
                            onSaved();
                          }}
                          className="ipc-input !h-8 !text-xs max-w-xs"
                        >
                          <option value="">— Not assigned —</option>
                          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <a
                          href="/operations-crm?tab=settings"
                          className="text-[11px] underline text-muted-foreground hover:text-black"
                        >
                          + Create Custom
                        </a>
                      </div>
                    )}
                    {!lead.process_template_id && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        The selected process controls the checklist, custom fields, and communication templates.
                      </div>
                    )}
                  </div>
                )}
                {!isAdmin && !lead.process_template_id && (
                  <div className="mt-3 border border-[#FDE68A] bg-[#FFFBEB] rounded-md p-2.5">
                    <div className="text-[11px] text-[#92400E] font-medium">No process / service type assigned</div>
                    <div className="text-[10px] text-[#92400E]/80 mt-1">
                      Please contact admin to assign a process template.
                    </div>
                  </div>
                )}
              </Section>



              {/* Stage Aging / SLA */}
              {(() => {
                const aging = computeStageAging(
                  { created_at: lead.created_at ?? null, updated_at: lead.updated_at ?? null },
                  slaSettings,
                  exactStageMovedAt,
                );
                const currentStageName = opsStages.find((s) => s.id === lead.stage_id)?.name ?? "—";
                const lastMoved = new Date(aging.lastMovedAt);
                const lastMovedText = Number.isFinite(lastMoved.getTime())
                  ? lastMoved.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                  : "—";
                return (
                  <Section title="Stage aging">
                    <div className="border border-line rounded-md bg-white p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-muted-foreground">Current stage</div>
                        <div className="text-xs font-medium text-black truncate">{currentStageName}</div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-muted-foreground">In this stage</div>
                        <div className="text-xs text-black">{aging.days} day{aging.days === 1 ? "" : "s"}</div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-muted-foreground">Status</div>
                        <SlaChip status={aging.status} days={aging.days} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-muted-foreground">Last moved</div>
                        <div className="text-[11px] text-muted-foreground">
                          {lastMovedText} <span className="opacity-70">· {aging.source}</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 pt-1">
                        Watch ≥ {slaSettings.watch_days}d · Overdue ≥ {slaSettings.overdue_days}d
                      </div>
                    </div>
                  </Section>
                );
              })()}


              {/* Readiness Checklist */}
              <Section title="Readiness checklist">
                <ReadinessChecklist
                  leadId={lead.id}
                  templateId={lead.process_template_id ?? null}
                  onChange={(pct, blocked) => setReadinessSummary({ pct, blocked })}
                />
              </Section>

              {/* Start Operations Process */}
              {lead.intake_status !== "active" && lead.service_status === "not_started" && (
                <Section title="Operations process">
                  <button onClick={() => setShowStartProcess(true)} className="ipc-btn ipc-btn-black !text-xs">
                    <Rocket className="w-3.5 h-3.5" /> Start Operations Process
                  </button>
                </Section>
              )}

              {/* Readiness completion → Move to next stage */}
              {isReady && (
                <Section title="Readiness complete">
                  <div className="border border-[#BBF7D0] bg-[#F0FDF4] rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#16A34A] text-white font-medium">
                        <CheckCircle className="w-3 h-3" /> READY
                      </span>
                      <span className="text-xs text-[#166534] font-medium">All required onboarding checklist items are complete.</span>
                    </div>
                    <div className="text-[11px] text-[#166534]/80 mb-2">
                      Current stage: <span className="font-medium">{currentStageObj?.name ?? "—"}</span>
                      {targetStageObj && !alreadyAtOrAfterTarget && (<> · Next stage: <span className="font-medium">{targetStageObj.name}</span></>)}
                    </div>
                    {alreadyAtOrAfterTarget ? (
                      <div className="text-[11px] text-muted-foreground italic">Already moved beyond readiness stage.</div>
                    ) : !targetStageObj ? (
                      <div className="text-[11px] text-[#92400E]">
                        No target stage resolvable. Configure one in Operations CRM → Settings.
                      </div>
                    ) : canMoveReadiness ? (
                      <button
                        onClick={() => setShowReadinessMove(true)}
                        className="ipc-btn ipc-btn-black !text-xs"
                      >
                        <ArrowRight className="w-3.5 h-3.5" /> Move to {targetStageObj.name}
                      </button>
                    ) : (
                      <div className="text-[11px] text-muted-foreground italic">
                        Only admins or the assigned owner can move this lead.
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Custom Fields */}
              {lead.process_template_id && (
                <Section title="Custom fields">
                  <CustomFieldsPanel leadId={lead.id} templateId={lead.process_template_id ?? null} />
                </Section>
              )}
            </TabsContent>


          {/* Communication history */}
          <Section title="Communication history">
            {eventsLoading ? (
              <div className="text-[11px] text-muted-foreground">Loading…</div>
            ) : commEvents.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">No communication logged yet.</div>
            ) : (
              <div className="space-y-2">
                {commEvents.map((ev) => (
                  <div key={ev.id} className="border border-line rounded-md p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${commTone(ev.event_type)}`}>
                          {ev.channel || "note"}
                        </span>
                        <span className="text-foreground truncate" title={ev.template_title || ""}>
                          {ev.template_title || "(no template)"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{new Date(ev.created_at).toLocaleString()}</span>
                    </div>
                    {ev.subject_snapshot && (
                      <div className="mt-1 text-[11px]"><span className="text-muted-foreground">Subject:</span> {ev.subject_snapshot}</div>
                    )}
                    {ev.message_snapshot && (
                      <div className="mt-1 text-[11px] whitespace-pre-wrap line-clamp-4 text-foreground/80">
                        {ev.message_snapshot}
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between">
                      <div className="text-[10px] text-muted-foreground">
                        {ev.event_type === "communication_copied" ? "copied" : ev.event_type === "communication_sent" ? "sent" : ev.event_type === "communication_failed" ? "failed" : "logged"}
                        {" · by "}{ev.created_by_name || "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

            </TabsContent>

            <TabsContent value="activity" className="mt-0 space-y-6">
              {/* Unified activity timeline */}
              <Section title="Activity timeline">
                <OperationsActivityTimeline
                  operationsLeadId={lead.id}
                  leadCreatedAt={(lead as any).created_at ?? null}
                />
              </Section>

              {/* Timeline */}
              <Section title="Service timeline">
                {eventsLoading ? (
                  <div className="text-[11px] text-muted-foreground">Loading…</div>
                ) : serviceEvents.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground">No service events yet.</div>
                ) : (
                  <div className="space-y-2">
                    {serviceEvents.map((ev) => (
                      <div key={ev.id} className="border border-line rounded-md p-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${eventTone(ev.event_type)}`}>{ev.event_type}</span>
                            <span className="text-foreground">{ev.event_date}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</span>
                        </div>
                        {ev.reason && <div className="mt-1 text-[11px]"><span className="text-muted-foreground">Reason:</span> {ev.reason}</div>}
                        {ev.note && <div className="mt-1 text-[11px] whitespace-pre-wrap">{ev.note}</div>}
                        <div className="mt-1 text-[10px] text-muted-foreground">by {ev.created_by_name || "—"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Notes */}
              {lead.notes && (
                <Section title="Notes">
                  <div className="text-xs whitespace-pre-wrap text-foreground">{lead.notes}</div>
                </Section>
              )}
            </TabsContent>

            <TabsContent value="results" className="mt-0 space-y-6">
              {/* Promised offers / services */}
              <PromisedOffersPanel
                operationsLeadId={lead.id}
                paidPipelineLeadId={lead.paid_pipeline_lead_id}
                crmLeadId={lead.crm_lead_id}
                title="Services / Commitments"
              />

              {/* Delivery Tracking */}
              <DeliveryTrackingSection
                operationsLeadId={lead.id}
                crmLeadId={lead.crm_lead_id}
                paidPipelineLeadId={lead.paid_pipeline_lead_id}
                actor={{ id: profile?.id ?? null, name: profile?.full_name ?? null }}
                buyers={deliveryBuyers}
              />

              {/* Client Conversions (Phase C) */}
              <ConversionsSection
                leadId={lead.id}
                leadName={lead.name}
                assignedBuyerId={lead.assigned_media_buyer_id}
                onChanged={onSaved}
              />

              {/* Team Result / Reward submissions */}
              <TeamResultSubmissionPanel
                operationsLeadId={lead.id}
                crmLeadId={lead.crm_lead_id}
                paidPipelineLeadId={lead.paid_pipeline_lead_id}
                memberName={lead.name}
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-line bg-off/10 shrink-0">
          <button 
            onClick={primaryAction.onClick}
            className="w-full ipc-btn ipc-btn-black flex items-center justify-center gap-2"
          >
            <primaryAction.icon className="w-4 h-4" />
            {primaryAction.label}
          </button>
        </div>
      </div>





          {/* Start Operations Process */}
          {lead.intake_status !== "active" && lead.service_status === "not_started" && (
            <Section title="Operations process">
              <button onClick={() => setShowStartProcess(true)} className="ipc-btn ipc-btn-black !text-xs">
                <Rocket className="w-3.5 h-3.5" /> Start Operations Process
              </button>
            </Section>
          )}

              {/* Service Summary */}
              <Section title="Service summary">
                <div className="grid grid-cols-2 gap-2">
                  <Card label="Package" value={(lead as any).service_package_snapshot?.name || lead.service_package_name || "—"} />
                  <Card label="Committed" value={`${calc.committedDays} days${lead.service_months ? ` · ${lead.service_months}m` : ""}`} />
                  <Card label="Status" value={SERVICE_STATUS_LABELS[status] || status} />
                  <Card label="Ads launch date" value={lead.ad_launch_date || "—"} />
                  <Card label="Active days used" value={`${calc.activeDaysUsed} / ${calc.committedDays}`} hint={status === "active" && calc.currentActivePeriodDays > 0 ? `incl. ${calc.currentActivePeriodDays} current` : undefined} />
                  <Card label="Paused days" value={`${calc.pausedDays}`} hint={status === "paused" && calc.currentPausedPeriodDays > 0 ? `incl. ${calc.currentPausedPeriodDays} current` : undefined} />
                  <Card label="Remaining days" value={`${calc.remainingDays}`} />
                  <Card label="Est. service end" value={calc.estimatedEndDate || "—"} />
                </div>
              </Section>

              {/* Service Controls */}
              <Section title="Service controls">
                <div className="flex flex-wrap gap-2">
                  {showStart && <Btn icon={Play} onClick={() => setAction("start")}>Mark Ads Started</Btn>}
                  {showPause && <Btn icon={Pause} onClick={() => setAction("pause")}>Pause Service</Btn>}
                  {showResume && <Btn icon={Play} onClick={() => setAction("resume")}>Resume Service</Btn>}
                  {showStop && <Btn icon={Square} onClick={() => setAction("stop")} tone="danger">Stop Service</Btn>}
                  {showComplete && <Btn icon={CheckCircle2} onClick={() => setAction("complete")}>Mark Completed</Btn>}
                  {showRestart && <Btn icon={RotateCcw} onClick={() => setAction("start")}>Restart Service</Btn>}
                  {!showStart && !showPause && !showResume && !showStop && !showComplete && !showRestart && (
                    <div className="text-[11px] text-muted-foreground">No actions available for this status.</div>
                  )}
                </div>
              </Section>
            </TabsContent>


          {/* Client Conversions (Phase C) */}
          <ConversionsSection
            leadId={lead.id}
            leadName={lead.name}
            assignedBuyerId={lead.assigned_media_buyer_id}
            onChanged={onSaved}
          />

          {/* Team Result / Reward submissions */}
          <TeamResultSubmissionPanel
            operationsLeadId={lead.id}
            crmLeadId={lead.crm_lead_id}
            paidPipelineLeadId={lead.paid_pipeline_lead_id}
            memberName={lead.name}
          />

          {/* Timeline */}
          <Section title="Service timeline">
            {eventsLoading ? (
              <div className="text-[11px] text-muted-foreground">Loading…</div>
            ) : serviceEvents.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">No service events yet.</div>
            ) : (
              <div className="space-y-2">
                {serviceEvents.map((ev) => (
                  <div key={ev.id} className="border border-line rounded-md p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${eventTone(ev.event_type)}`}>{ev.event_type}</span>
                        <span className="text-foreground">{ev.event_date}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</span>
                    </div>
                    {ev.reason && <div className="mt-1 text-[11px]"><span className="text-muted-foreground">Reason:</span> {ev.reason}</div>}
                    {ev.note && <div className="mt-1 text-[11px] whitespace-pre-wrap">{ev.note}</div>}
                    <div className="mt-1 text-[10px] text-muted-foreground">by {ev.created_by_name || "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>


          {/* Promised offers / services */}
          <PromisedOffersPanel
            operationsLeadId={lead.id}
            paidPipelineLeadId={lead.paid_pipeline_lead_id}
            crmLeadId={lead.crm_lead_id}
            title="Services / Commitments"
          />

          {/* Delivery Tracking */}
          <DeliveryTrackingSection
            operationsLeadId={lead.id}
            crmLeadId={lead.crm_lead_id}
            paidPipelineLeadId={lead.paid_pipeline_lead_id}
            actor={{ id: profile?.id ?? null, name: profile?.full_name ?? null }}
            buyers={deliveryBuyers}
          />

          {/* Notes */}
          {lead.notes && (
            <Section title="Notes">
              <div className="text-xs whitespace-pre-wrap text-foreground">{lead.notes}</div>
            </Section>
          )}
        </div>
      </div>

      {action && (
        <ServiceActionModal
          action={action}
          lead={lead}
          calc={calc}
          actorId={profile?.id ?? null}
          actorName={profile?.full_name ?? null}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); loadEvents(); onSaved(); }}
        />
      )}

      {showCommModal && (
        <CommTemplatePickerModal
          lead={{
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            brand_name: lead.brand_name ?? null,
            program_name: lead.program_name ?? null,
            product_name: lead.product_name,
            assigned_media_buyer_name: lead.assigned_media_buyer_name,
            crm_lead_id: lead.crm_lead_id,
            paid_pipeline_lead_id: lead.paid_pipeline_lead_id,
          }}
          onClose={() => setShowCommModal(false)}
          onLogged={() => loadEvents()}
        />
      )}


      {showStartProcess && (
        <StartProcessModal
          lead={{
            id: lead.id,
            name: lead.name,
            process_template_id: lead.process_template_id ?? null,
            service_days_committed: lead.service_days_committed,
            service_months: lead.service_months,
            assigned_media_buyer_id: lead.assigned_media_buyer_id,
            readiness_override_reason: lead.readiness_override_reason ?? null,
          }}
          onClose={() => setShowStartProcess(false)}
          onDone={() => { setShowStartProcess(false); loadEvents(); onSaved(); }}
        />
      )}

      {showReadinessMove && targetStageObj && (
        <div className="fixed inset-0 z-[1200] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowReadinessMove(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full max-w-md p-5">
            <div className="font-serif text-base text-black mb-3">Move lead to next operations stage?</div>
            <div className="space-y-1.5 text-sm mb-4">
              <div><span className="text-muted-foreground text-xs uppercase tracking-wider">Member</span><div>{lead.name}</div></div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Current stage</div>
                  <div className="text-sm">{currentStageObj?.name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Target stage</div>
                  <div className="text-sm">{targetStageObj.name}</div>
                </div>
              </div>
              <div className="text-[11px] text-[#166534] mt-2">Readiness completion: 100%</div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowReadinessMove(false)} className="ipc-btn ipc-btn-ghost !text-xs">Cancel</button>
              <button onClick={() => doMove("readiness_manual_move")} className="ipc-btn ipc-btn-black !text-xs">
                <ArrowRight className="w-3.5 h-3.5" /> Move Lead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function eventTone(t: string) {
  switch (t) {
    case "start":
    case "resume":
    case "restart":
      return "bg-[#DCFCE7] text-[#166534]";
    case "pause":
      return "bg-[#FEF3C7] text-[#92400E]";
    case "stop":
      return "bg-[#FEE2E2] text-[#991B1B]";
    case "complete":
      return "bg-[#E0E7FF] text-[#3730A3]";
    default:
      return "bg-[#F3F4F6] text-[#6B7280]";
  }
}

function commTone(t: string) {
  switch (t) {
    case "communication_sent": return "bg-[#DCFCE7] text-[#166534]";
    case "communication_failed": return "bg-[#FEE2E2] text-[#991B1B]";
    case "communication_copied": return "bg-[#E0E7FF] text-[#3730A3]";
    case "communication_logged":
    default: return "bg-[#F3F4F6] text-[#6B7280]";
  }
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs text-foreground truncate" title={value}>{value}</div>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-line rounded-md p-2 bg-off/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm text-black mt-0.5 truncate" title={value}>{value}</div>
      {hint && <div className="text-[9px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function Btn({ children, onClick, icon: Icon, tone }: { children: React.ReactNode; onClick: () => void; icon: any; tone?: "danger" }) {
  return (
    <button
      onClick={onClick}
      className={`ipc-btn !text-xs ${tone === "danger" ? "ipc-btn-ghost border-[#FCA5A5] text-[#991B1B] hover:bg-[#FEF2F2]" : "ipc-btn-black"}`}
    >
      <Icon className="w-3.5 h-3.5" /> {children}
    </button>
  );
}

// ───────────────────────────────────────────────
// Modal for all service actions
// ───────────────────────────────────────────────

function ServiceActionModal({
  action, lead, calc, actorId, actorName, onClose, onDone,
}: {
  action: ActionType;
  lead: OpsLeadFull;
  calc: ReturnType<typeof computeServiceCalc>;
  actorId: string | null;
  actorName: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const meta = ACTION_META[action];
  const [date, setDate] = useState<string>(todayStr());
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [sendNotif, setSendNotif] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDraft, setShowDraft] = useState(false);

  const draftBody = useMemo(
    () => COMMS_TEMPLATES[action](lead.name, date),
    [action, lead.name, date]
  );

  const submit = async () => {
    if (!actorId) { toast.error("Not signed in"); return; }
    if (meta.needsReason && !reason.trim()) { toast.error("Please provide a reason"); return; }
    setSaving(true);
    try {
      // Build updates based on action
      const updates: Record<string, any> = {};
      const oldStatus = lead.service_status;
      const committedDays = calc.committedDays;

      if (action === "start") {
        updates.service_status = "active";
        updates.ad_launch_date = lead.ad_launch_date || date;
        updates.current_active_start_date = date;
        updates.last_resumed_at = date;
        updates.last_paused_at = null;
        // est end = date + remaining (committed - already used active days)
        const remaining = Math.max(0, committedDays - (lead.total_active_days ?? 0));
        updates.service_end_target_date = addDays(date, remaining);
      } else if (action === "pause") {
        const activeAdd = lead.current_active_start_date
          ? daysBetween(lead.current_active_start_date, date) : 0;
        updates.service_status = "paused";
        updates.total_active_days = (lead.total_active_days ?? 0) + activeAdd;
        updates.last_paused_at = date;
        updates.current_active_start_date = null;
        // Snapshot a "if resumed today" estimated end so UI is not stale
        const remainingAfter = Math.max(0, committedDays - updates.total_active_days);
        updates.service_end_target_date = addDays(date, remainingAfter);
      } else if (action === "resume") {
        const pausedAdd = lead.last_paused_at
          ? daysBetween(lead.last_paused_at, date) : 0;
        updates.service_status = "active";
        updates.total_paused_days = (lead.total_paused_days ?? 0) + pausedAdd;
        updates.last_resumed_at = date;
        updates.last_paused_at = null;
        updates.current_active_start_date = date;
        const remaining = Math.max(0, committedDays - (lead.total_active_days ?? 0));
        updates.service_end_target_date = addDays(date, remaining);
      } else if (action === "stop") {
        if (oldStatus === "active" && lead.current_active_start_date) {
          updates.total_active_days = (lead.total_active_days ?? 0) + daysBetween(lead.current_active_start_date, date);
        } else if (oldStatus === "paused" && lead.last_paused_at) {
          updates.total_paused_days = (lead.total_paused_days ?? 0) + daysBetween(lead.last_paused_at, date);
        }
        updates.service_status = "stopped";
        updates.current_active_start_date = null;
        updates.last_paused_at = null;
        updates.service_end_target_date = date;
      } else if (action === "complete") {
        if (oldStatus === "active" && lead.current_active_start_date) {
          updates.total_active_days = (lead.total_active_days ?? 0) + daysBetween(lead.current_active_start_date, date);
        }
        updates.service_status = "completed";
        updates.current_active_start_date = null;
        updates.last_paused_at = null;
        updates.service_end_target_date = date;
      }

      // Insert event
      const eventType = (action === "start" && (oldStatus === "stopped" || oldStatus === "completed")) ? "restart" : action;
      const { error: evErr } = await supabase.from("operations_service_events" as any).insert({
        operations_lead_id: lead.id,
        event_type: eventType,
        event_date: date,
        reason: reason.trim() || null,
        note: note.trim() || null,
        created_by: actorId,
      } as any);
      if (evErr) throw evErr;

      // Update lead
      const { error: updErr } = await supabase.from("operations_leads" as any).update(updates).eq("id", lead.id);
      if (updErr) throw updErr;

      // Audit log
      const newCalc = computeServiceCalc({ ...lead, ...updates });
      await logActivity({
        module_key: "operations_crm",
        module_label: "Operations CRM",
        action_type: meta.auditAction,
        action_label: meta.title,
        entity_type: "operations_lead",
        entity_id: lead.id,
        entity_label: lead.name,
        old_values: { service_status: oldStatus },
        new_values: { service_status: updates.service_status, event_date: date },
        metadata: {
          active_days: newCalc.activeDaysUsed,
          paused_days: newCalc.pausedDays,
          remaining_days: newCalc.remainingDays,
          assigned_media_buyer_id: lead.assigned_media_buyer_id,
          assigned_media_buyer_name: lead.assigned_media_buyer_name,
          reason: reason.trim() || null,
        },
        summary: `${meta.title} for ${lead.name} on ${date}.`,
      });

      // Notifications
      if (sendNotif) {
        const recipients = new Set<string>();
        if (lead.assigned_media_buyer_id) recipients.add(lead.assigned_media_buyer_id);
        // Notify actor too if not the same? Skip, actor knows.
        recipients.delete(actorId);
        for (const r of recipients) {
          await createNotification({
            recipient_user_id: r,
            module_key: "operations_crm",
            notification_type: meta.notifType,
            title: `${meta.notifTitle}: ${lead.name}`,
            message: `${meta.title} on ${date}${reason ? ` — ${reason}` : ""}`,
            entity_type: "operations_lead",
            entity_id: lead.id,
            entity_label: lead.name,
            priority: action === "stop" ? "high" : "normal",
            action_url: `/operations-crm?lead=${lead.id}`,
            action_label: "Open in Operations CRM",
            triggered_by_user_id: actorId,
            triggered_by_name: actorName ?? undefined,
          });
        }
      }

      if (sendEmail) {
        await logActivity({
          module_key: "operations_crm",
          module_label: "Operations CRM",
          action_type: "operations_communication_copied",
          action_label: "Client comms drafted",
          entity_type: "operations_lead",
          entity_id: lead.id,
          entity_label: lead.name,
          metadata: { template: action, date },
          summary: `Client comms drafted (${action}) for ${lead.name}.`,
        });
      }

      toast.success(`${meta.title} saved`);
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draftBody);
      toast.success("Draft copied");
    } catch { toast.error("Copy failed"); }
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="font-serif text-base mb-3">{meta.title}</div>

        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{meta.verb} date</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ipc-input !h-9 !text-xs" />
          </div>
          {meta.needsReason && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Reason</div>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client requested 2-week break" className="ipc-input !h-9 !text-xs" />
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Note (optional)</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="ipc-input !text-xs" />
          </div>

          <div className="flex items-center justify-between border border-line rounded-md p-2">
            <label className="text-xs flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={sendNotif} onChange={(e) => setSendNotif(e.target.checked)} />
              Send internal notification
            </label>
          </div>
          <div className="border border-line rounded-md p-2">
            <label className="text-xs flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Prepare client email draft
            </label>
            {sendEmail && (
              <div className="mt-2">
                <button onClick={() => setShowDraft((s) => !s)} className="text-[11px] underline text-muted-foreground">
                  {showDraft ? "Hide" : "Show"} draft
                </button>
                {showDraft && (
                  <div className="mt-2">
                    <textarea readOnly value={draftBody} rows={4} className="ipc-input !text-xs w-full" />
                    <button onClick={copyDraft} className="ipc-btn ipc-btn-ghost !text-[11px] mt-1">
                      <ClipboardCopy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost" disabled={saving}>Cancel</button>
          <button onClick={submit} className="ipc-btn ipc-btn-black" disabled={saving}>
            {saving ? "Saving…" : meta.verb}
          </button>
        </div>
      </div>
    </div>
  );
}
