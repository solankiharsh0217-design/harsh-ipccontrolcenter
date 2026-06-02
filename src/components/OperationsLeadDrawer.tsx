import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
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
import CustomFieldsPanel from "@/components/operations/CustomFieldsPanel";
import CommTemplatePickerModal from "@/components/operations/CommTemplatePickerModal";
import StartProcessModal from "@/components/operations/StartProcessModal";
import { listProcessTemplates, type ProcessTemplate } from "@/lib/operationsTemplates";
import { Mail, Rocket } from "lucide-react";

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
}

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
  const { profile } = useAuth();
  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [action, setAction] = useState<ActionType | null>(null);

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

  const openCrmLink = () => { if (lead.crm_lead_id) window.open(`/crm?lead=${lead.crm_lead_id}`, "_blank"); };

  const status = lead.service_status;
  const showStart    = status === "not_started";
  const showPause    = status === "active";
  const showResume   = status === "paused";
  const showStop     = status === "active" || status === "paused";
  const showComplete = status === "active";
  const showRestart  = status === "stopped" || status === "completed";

  return (
    <div className="fixed inset-0 z-[1100] bg-black/40 flex justify-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white h-full overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between sticky top-0 bg-white z-10">
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

        <div className="p-5 space-y-5">
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

          {/* Service Summary */}
          <Section title="Service summary">
            <div className="grid grid-cols-2 gap-2">
              <Card label="Package" value={lead.service_package_name || "—"} />
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

          {/* Client Conversions (Phase C) */}
          <ConversionsSection
            leadId={lead.id}
            leadName={lead.name}
            assignedBuyerId={lead.assigned_media_buyer_id}
            onChanged={onSaved}
          />

          {/* Timeline */}
          <Section title="Service timeline">
            {eventsLoading ? (
              <div className="text-[11px] text-muted-foreground">Loading…</div>
            ) : events.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">No service events yet.</div>
            ) : (
              <div className="space-y-2">
                {events.map((ev) => (
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
