import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { GRADE_STYLES, type Lead, type Stage, type ActivityLog, type Reminder } from "@/lib/crmTypes";
import { X, Phone, MessageCircle, Mail, MessageSquare, Trash2, ExternalLink, Sparkles, ChevronDown, Archive, RotateCcw, Plus, CreditCard, Pencil, Check, Settings, ShieldAlert, History } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TagPicker from "@/components/TagPicker";
import FastFollowUpComposer from "@/components/FastFollowUpComposer";
import SuggestedNextActions from "@/components/SuggestedNextActions";
import { createNotification } from "@/lib/notifications";
import SendToOperationsCrmModal from "@/components/SendToOperationsCrmModal";
import { getActiveHandoffRules, findRuleForStage, isRuleAutoReady, type HandoffRule } from "@/lib/operationsCrm";
import { archiveLead, restoreLead, permanentlyDeleteLead, getLeadLinks } from "@/lib/crmArchive";
import { ArchiveConfirmModal, PermanentDeleteModal } from "@/components/crm/ArchiveConfirmModal";
import QuickAddPaymentModal from "@/components/paid-pipeline/QuickAddPaymentModal";
import { recomputePaidLead } from "@/lib/paidPipeline";
import { logActivity as auditLog } from "@/lib/auditLog";
import { stageChip } from "@/lib/stageColors";
import CrmStagePicker from "@/components/crm/CrmStagePicker";
import CodeOfConductCard from "@/components/crm/CodeOfConductCard";
import ConvertToPaidModal from "@/components/crm/ConvertToPaidModal";
import ConversionHistoryDrawer from "@/components/crm/ConversionHistoryDrawer";
import { loadActiveConversionRules, isConvertedStage, DEFAULT_TRIGGER_STAGES, type ConversionRule } from "@/lib/conversionRules";
import SessionAttendanceTimeline from "@/components/crm/SessionAttendanceTimeline";
import LinkedRecordsPanel from "@/components/crm/LinkedRecordsPanel";
import AccessVerificationPanel from "@/components/access-followup/AccessVerificationPanel";
import LeadNotesSection from "@/components/crm/LeadNotesSection";
import MoveCopyLinkPipelineModal from "@/components/crm/MoveCopyLinkPipelineModal";
import SendToPaidOnboardingModal from "@/components/crm/SendToPaidOnboardingModal";
import PromisedOffersPanel from "@/components/offers/PromisedOffersPanel";
import ServicePackageChip from "@/components/ServicePackageChip";
import { inr } from "@/lib/format";



interface Props {
  leadId: string;
  stages: Stage[];
  agents: { id: string; full_name: string }[];
  onClose: () => void;
  onChanged: () => void;
  onStageChanged?: (leadId: string, newStageId: string) => void;
  /** Optional label of the origin surface that opened this drawer (e.g. "Access Follow-up").
   *  When set, the drawer shows a "Back to <origin>" action and relabels
   *  "Save & Close" to "Save & Return". Normal CRM navigation is unchanged. */
  originLabel?: string | null;
  /** Return path used when the user clicks the origin "Back" button. Ignored when unset. */
  returnTo?: string | null;
}


const channelStyle: Record<string, string> = {
  call: "#16A34A", whatsapp: "#22C55E", email: "#2563EB", sms: "#7C3AED", note: "#888888", system: "#0a0a0a",
};

export default function LeadDrawer({ leadId, stages, agents, onClose, onChanged, onStageChanged, originLabel, returnTo }: Props) {
  // Focus the Code of Conduct panel when navigated via `?focus=code-of-conduct`.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("focus") !== "code-of-conduct") return;
    const start = Date.now();
    const timer = window.setInterval(() => {
      const el = document.getElementById("code-of-conduct-panel");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-amber-400", "rounded-lg");
        window.setTimeout(() => el.classList.remove("ring-2", "ring-amber-400", "rounded-lg"), 2400);
        window.clearInterval(timer);
      } else if (Date.now() - start > 4000) {
        window.clearInterval(timer);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [leadId]);
  const { profile, isAdmin } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activityNote, setActivityNote] = useState("");
  const [activityChannel, setActivityChannel] = useState<ActivityLog["channel"]>("call");
  const [paidSnap, setPaidSnap] = useState<any | null>(null);
  const [showStagePicker, setShowStagePicker] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [opsLeadId, setOpsLeadId] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [sendOnboardingOpen, setSendOnboardingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = () => {
    if (!lead) return;
    setEditName(lead.full_name || "");
    setEditEmail(lead.email || "");
    setEditPhone(lead.phone || "");
    setEditMode(true);
  };
  const saveEdit = async () => {
    if (!lead) return;
    const name = editName.trim();
    const email = editEmail.trim() || null;
    const phone = editPhone.trim() || null;
    if (!name) { toast.error("Name is required"); return; }
    setSavingEdit(true);
    try {
      // Pre-check duplicate email on another lead. If the conflict is only with an archived
      // lead, auto-release the email from the archived row so the active lead can claim it.
      if (email && email !== lead.email) {
        const { data: dups } = await supabase
          .from("leads")
          .select("id, full_name, archived_at")
          .eq("email", email)
          .neq("id", lead.id);
        const conflicts = (dups || []) as any[];
        const active = conflicts.filter((d) => !d.archived_at);
        const archived = conflicts.filter((d) => !!d.archived_at);
        if (active.length > 0) {
          toast.error(`Email already used by another active lead: ${active[0].full_name || "(no name)"}. Use a different email or merge the two leads.`);
          setSavingEdit(false);
          return;
        }
        if (archived.length > 0) {
          // Null out email on archived duplicates so the active lead can take it.
          const ids = archived.map((d) => d.id);
          const { error: rErr } = await supabase.from("leads").update({ email: null }).in("id", ids);
          if (rErr) throw rErr;
          toast.message(`Released email from ${archived.length} archived lead${archived.length > 1 ? "s" : ""}.`);
        }
      }
      const before = { full_name: lead.full_name, email: lead.email, phone: lead.phone };
      const { error } = await supabase.from("leads").update({ full_name: name, email, phone }).eq("id", lead.id);
      if (error) throw error;
      const paidId = (lead as any).paid_pipeline_lead_id;
      if (paidId) {
        await supabase.from("paid_pipeline_leads").update({ name, email, phone } as any).eq("id", paidId);
      }
      await auditLog({
        module_key: "crm",
        action_type: "lead_details_updated",
        entity_type: "lead", entity_id: lead.id, entity_label: name,
        old_values: before, new_values: { full_name: name, email, phone },
        metadata: { changed_by: profile?.id || null },
        summary: `Edited lead details for '${name}'.`,
      });
      toast.success("Lead updated");
      setEditMode(false);
      setLead({ ...lead, full_name: name, email, phone } as Lead);
      onChanged();
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("leads_unique_email") || (e?.code === "23505" && msg.toLowerCase().includes("email"))) {
        toast.error("That email is already used by another lead. Use a different email or merge the two leads.");
      } else {
        toast.error(msg || "Failed to update lead");
      }
    } finally {
      setSavingEdit(false);
    }
  };
  const [sendOpsOpen, setSendOpsOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [convRules, setConvRules] = useState<ConversionRule[]>([]);
  const [opsRules, setOpsRules] = useState<HandoffRule[]>([]);
  const [extraOpen, setExtraOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveLinks, setArchiveLinks] = useState<{ paid: number; ops: number } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);
  const [openPay, setOpenPay] = useState(false);
  const [payPrefill, setPayPrefill] = useState<any>(null);
  const [payHeaderNote, setPayHeaderNote] = useState<string | undefined>(undefined);
  const [postPayAction, setPostPayAction] = useState<"setTokenPaid" | null>(null);
  const stagesById = useMemo(() => new Map(stages.map((s) => [s.id, { id: s.id, name: s.name }])), [stages]);


  const load = async () => {
    const [{ data: l }, { data: a }, { data: r }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", leadId).maybeSingle(),
      supabase.from("activity_logs").select("*").eq("lead_id", leadId).order("logged_at", { ascending: false }),
      supabase.from("follow_up_reminders").select("*").eq("lead_id", leadId).order("reminder_date"),
    ]);
    setLead(l as any); setActivities((a || []) as any); setReminders((r || []) as any);
    const ppid = (l as any)?.paid_pipeline_lead_id;
    if (ppid) {
      const { data: pp } = await supabase.from("paid_pipeline_leads")
        .select("id,deal_value,token_amount_collected,total_collected,balance_pending,token_paid_status")
        .eq("id", ppid).maybeSingle();
      setPaidSnap(pp || null);
    } else setPaidSnap(null);
    // Check whether this lead is already in Operations CRM (active record)
    const { data: ops } = await (supabase as any)
      .from("operations_leads")
      .select("id, service_status")
      .eq("crm_lead_id", leadId)
      .not("service_status", "in", "(stopped,completed)")
      .maybeSingle();
    setOpsLeadId(ops?.id ?? null);
  };
  useEffect(() => { load(); }, [leadId]);
  useEffect(() => { 
    getActiveHandoffRules().then(setOpsRules).catch(() => setOpsRules([])); 
    loadActiveConversionRules().then(setConvRules).catch(() => setConvRules([])); 
  }, []);

  if (!lead) return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-[560px] bg-white p-8" onClick={(e) => e.stopPropagation()}>Loading…</div>
    </div>
  );

  const g = GRADE_STYLES[lead.grade];
  const pipelineAllStages = stages.filter((s) => s.pipeline_id === lead.pipeline_id).sort((a, b) => a.position - b.position);
  const pipelineStages = pipelineAllStages.filter((s) => (s as any).is_active !== false || s.id === lead.stage_id);

  const today = new Date().toISOString().slice(0, 10);
  const currentStage = pipelineStages.find((s) => s.id === lead.stage_id);
  const matchingRule = findRuleForStage(opsRules, lead.pipeline_id, lead.stage_id, stagesById);
  const isOpsEligible = !!matchingRule;
  const inOps = opsLeadId !== null;
  const hasToken = !!paidSnap && Number(paidSnap.token_amount_collected || 0) > 0;

  // Determine default tab on open
  useEffect(() => {
    if (!lead) return;
    
    // Payments: if deal value exists but no token recorded
    const hasDealValue = Number(lead.deal_value) > 0 || (paidSnap && Number(paidSnap.deal_value) > 0);
    const tokenMissing = hasDealValue && !hasToken;
    if (tokenMissing) {
      setActiveTab("payments");
      return;
    }

    // Stage & Handoff: if Ops Eligible but not in Ops
    if (isOpsEligible && !inOps) {
      setActiveTab("stage & handoff");
      return;
    }

    // Activity: if overdue reminders
    const overdue = reminders.some(r => r.reminder_date < today);
    if (overdue) {
      setActiveTab("follow-ups & activity");
      return;
    }

    setActiveTab("overview");
  }, [leadId, !!lead, isOpsEligible, inOps, hasToken, reminders.length]);

  const g = GRADE_STYLES[lead.grade];
  const pipelineAllStages = stages.filter((s) => s.pipeline_id === lead.pipeline_id).sort((a, b) => a.position - b.position);
  const pipelineStages = pipelineAllStages.filter((s) => (s as any).is_active !== false || s.id === lead.stage_id);

  const moveStage = async (stageId: string) => {
    const prev = lead.stage_id;
    await supabase.from("leads").update({ stage_id: stageId }).eq("id", lead.id);
    toast.success("Stage updated");
    await load(); onChanged();
    if (prev !== stageId) {
      onStageChanged?.(lead.id, stageId);
      try {
        const { evaluateStageTrigger } = await import("@/lib/codeOfConductRules");
        const res = await evaluateStageTrigger({
          source: "crm", pipelineId: lead.pipeline_id, stageId,
          crmLeadId: lead.id, paidPipelineLeadId: (lead as any).paid_pipeline_lead_id || null, memberName: lead.full_name || "Member",
          memberEmail: lead.email, memberPhone: lead.phone,
          programName: lead.program_name, dealValue: lead.deal_value,
        });
        if (res.action === "auto_sent") toast.success(`Code of Conduct auto-sent (rule: ${res.rule?.name})`);
        else if (res.action === "suggested") toast.message(`Code of Conduct suggested for this stage`, { description: res.rule?.name });
        else if (res.action === "auto_send_failed") toast.error(`Auto-send failed: ${res.message}`);
        else if (res.action === "missing_email") toast.error(res.message || "Member has no email");
      } catch { /* ignore */ }
    }
  };

  const setAgent = async (agentId: string | null) => {
    await supabase.from("leads").update({ assigned_agent_id: agentId }).eq("id", lead.id);
    toast.success("Agent updated");
    if (agentId && agentId !== lead.assigned_agent_id) {
      try {
        await createNotification({
          recipient_user_id: agentId,
          module_key: "calling_crm",
          notification_type: "leads_assigned",
          title: "New Calling CRM lead assigned",
          message: `${lead.full_name || "A lead"} has been assigned to you.`,
          priority: "normal",
          action_url: "/crm?assigned_to=me",
          action_label: "Open Calling CRM",
          entity_type: "crm_lead",
          entity_id: lead.id,
          entity_label: lead.full_name || undefined,
          triggered_by_user_id: profile?.id ?? null,
          triggered_by_name: profile?.full_name ?? undefined,
          allowDuplicate: true,
          metadata: {
            module_key: "calling_crm",
            lead_ids: [lead.id],
            assignment_type: "single",
            assigned_by: profile?.id ?? null,
            assigned_to: agentId,
            count: 1,
            deep_link: "/crm?assigned_to=me",
          },
        });
      } catch { /* ignore */ }
    }
    await load(); onChanged();
  };
  const logActivity = async () => {
    if (!activityNote.trim()) return;
    await supabase.from("activity_logs").insert({
      lead_id: lead.id, agent_id: profile?.id, agent_name: profile?.full_name,
      channel: activityChannel, note: activityNote.trim(),
    });
    setActivityNote(""); await load();
  };
  const delReminder = async (id: string) => {
    await supabase.from("follow_up_reminders").delete().eq("id", id);
    await load();
  };
  const addStageInline = async () => {
    const name = newStageName.trim();
    if (!name) return;
    const dup = pipelineAllStages.some((s) => s.name.toLowerCase() === name.toLowerCase());
    if (dup) { toast.error("Stage already exists"); return; }
    setAddingStage(true);
    try {
      const { data, error } = await supabase.from("stages").insert({
        pipeline_id: lead.pipeline_id, name, color: "gray", position: pipelineAllStages.length,
      } as any).select("id, name, pipeline_id, color").maybeSingle();
      if (error) { toast.error(error.message); return; }
      setNewStageName("");
      toast.success("Stage added");
      auditLog({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "crm_stage_created_from_calling_crm_drawer",
        entity_type: "crm_stage", entity_id: (data as any)?.id, entity_label: name,
        metadata: { crm_lead_id: lead.id, pipeline_id: lead.pipeline_id, stage_id: (data as any)?.id, stage_name: name, changed_by: profile?.id || null },
        summary: `Created CRM stage '${name}' from Calling CRM drawer.`,
      });
      if (data?.id) await moveStage(data.id);
      onChanged();
    } finally { setAddingStage(false); }
  };
  const deleteOrDeactivateStage = async (s: Stage) => {
    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("stage_id", s.id);
    const used = (count ?? 0) > 0;
    if (used || (s as any).is_protected) {
      const reason = used ? `has ${count} lead(s)` : "is protected";
      if (!confirm(`Stage "${s.name}" ${reason}. Deactivate it instead?`)) return;
      const { error } = await supabase.from("stages").update({ is_active: false } as any).eq("id", s.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Stage deactivated");
      auditLog({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "crm_stage_deactivated_from_calling_crm_drawer",
        entity_type: "crm_stage", entity_id: s.id, entity_label: s.name,
        metadata: { crm_lead_id: lead.id, pipeline_id: lead.pipeline_id, stage_id: s.id, stage_name: s.name, used_count: count, changed_by: profile?.id || null },
        severity: "warning",
        summary: `Deactivated CRM stage '${s.name}' from Calling CRM drawer.`,
      });
      onChanged();
      return;
    }
    if (!confirm(`Delete stage "${s.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("stages").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Stage deleted");
    auditLog({
      module_key: "calling_crm", module_label: "Calling CRM",
      action_type: "crm_stage_deleted_from_calling_crm_drawer",
      entity_type: "crm_stage", entity_id: s.id, entity_label: s.name,
      metadata: { crm_lead_id: lead.id, pipeline_id: lead.pipeline_id, stage_id: s.id, stage_name: s.name, changed_by: profile?.id || null },
      severity: "warning",
      summary: `Deleted CRM stage '${s.name}' from Calling CRM drawer.`,
    });
    onChanged();
  };

  const today = new Date().toISOString().slice(0, 10);
  const currentStage = pipelineStages.find((s) => s.id === lead.stage_id);
  const matchingRule = findRuleForStage(opsRules, lead.pipeline_id, lead.stage_id, stagesById);
  const isOpsEligible = !!matchingRule;
  const inOps = opsLeadId !== null;
  const rulePrefill = matchingRule ? {
    serviceDays: matchingRule.default_service_days ?? null,
    packageName: matchingRule.default_service_package ?? null,
    assignMethod: matchingRule.default_assignment_method,
    singleBuyerId: matchingRule.default_single_buyer_id,
    duplicateBehavior: matchingRule.duplicate_behavior,
  } : null;

  const paidLeadId = (lead as any).paid_pipeline_lead_id as string | null;
  const hasToken = !!paidSnap && Number(paidSnap.token_amount_collected || 0) > 0;

  const openTokenPayment = () => {
    if (!paidLeadId) { toast.error("This lead is not linked to a Paid Pipeline buyer yet."); return; }
    setPayPrefill({ type: "First Token", category: "Token Amount", description: "Token payment", isToken: true });
    setPayHeaderNote("Record token amount to move this buyer to Token Paid.");
    setPostPayAction("setTokenPaid");
    setOpenPay(true);
  };
  const openAddPayment = () => {
    if (!paidLeadId) { toast.error("This lead is not linked to a Paid Pipeline buyer yet."); return; }
    setPayPrefill(null);
    setPayHeaderNote(undefined);
    setPostPayAction(null);
    setOpenPay(true);
  };
  const handlePaymentSaved = async () => {
    if (paidLeadId && postPayAction === "setTokenPaid") {
      await supabase.from("paid_pipeline_leads").update({ pipeline_stage: "Token Paid" } as any).eq("id", paidLeadId);
      await recomputePaidLead(paidLeadId);
      auditLog({
        module_key: "paid_pipeline", module_label: "Paid Pipeline",
        action_type: "paid_pipeline_stage_set_after_token_payment",
        entity_type: "paid_pipeline_lead", entity_id: paidLeadId, entity_label: lead.full_name || undefined,
        new_values: { pipeline_stage: "Token Paid" },
        metadata: { crm_lead_id: lead.id, source: "calling_crm_drawer" },
        summary: `Paid Pipeline stage set to 'Token Paid' after token recorded from Calling CRM.`,
      });
      toast.success("Token recorded and stage set to Token Paid");
    } else {
      toast.success("Payment recorded");
    }
    auditLog({
      module_key: "calling_crm", module_label: "Calling CRM",
      action_type: "calling_crm_token_recorded_to_paid_pipeline",
      entity_type: "lead", entity_id: lead.id, entity_label: lead.full_name || undefined,
      metadata: { paid_pipeline_lead_id: paidLeadId, post_action: postPayAction },
      summary: `Payment recorded from Calling CRM drawer.`,
    });
    setPostPayAction(null);
    setOpenPay(false);
    await load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>

        <div className="absolute right-0 top-0 h-full w-[560px] bg-white border-l border-line flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-line">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {editMode ? (
                <div className="space-y-2">
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full name" className="ipc-input !h-9 !text-sm w-full" />
                  <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" className="ipc-input !h-9 !text-xs w-full" />
                  <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" className="ipc-input !h-9 !text-xs w-full" />
                  <div className="flex gap-2">
                    <button disabled={savingEdit} onClick={saveEdit} className="ipc-btn ipc-btn-black !h-8 !text-xs"><Check className="w-3 h-3" /> {savingEdit ? "Saving…" : "Save"}</button>
                    <button disabled={savingEdit} onClick={() => setEditMode(false)} className="ipc-btn ipc-btn-ghost !h-8 !text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="font-serif text-[22px] leading-tight">{lead.full_name || "Unnamed lead"}</div>
                    <button onClick={startEdit} title="Edit name / phone / email" className="w-6 h-6 rounded hover:bg-off flex items-center justify-center text-muted-foreground hover:text-black"><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="font-sans text-xs text-muted-foreground mt-1">{lead.phone || "—"} · {lead.email || <span className="text-[#B91C1C]">no email</span>}</div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider" style={{ background: g.bg, color: g.fg, border: `1px solid ${g.border}` }}>{g.label}</span>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-off border border-line text-muted-foreground">{lead.program_name}</span>
                    {lead.webinar_source && <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-off border border-line text-muted-foreground">{lead.webinar_source}</span>}
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-off border border-line text-muted-foreground">{lead.lead_type}</span>
                    <ServicePackageChip snapshot={(lead as any).service_package_snapshot} />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {originLabel && (
                <button
                  onClick={onClose}
                  title={`Return to ${originLabel}`}
                  className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-line bg-white hover:bg-off text-[12px] font-medium whitespace-nowrap"
                >
                  ← Back to {originLabel}
                </button>
              )}
              <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-off flex items-center justify-center" title={originLabel ? `Return to ${originLabel}` : "Close"}><X className="w-4 h-4" /></button>
            </div>
          </div>
          {lead.lead_type === "unpaid"
            && !(lead as any).paid_pipeline_lead_id
            && !(lead as any).converted_to_crm_lead_id && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setSendOnboardingOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-black text-white hover:opacity-90"
                title="Create or link a Paid Onboarding CRM card for this lead"
              >
                <ExternalLink className="w-3 h-3" /> Send to Paid Onboarding
              </button>
              <button onClick={() => setMoveModalOpen(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] border border-line bg-white hover:bg-off">
                <ExternalLink className="w-3 h-3" /> Move / Copy to Pipeline
              </button>
            </div>
          )}
          {((lead as any).paid_pipeline_lead_id || opsLeadId !== null || lead.lead_type === "paid") && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(lead as any).paid_pipeline_lead_id && (
                <Link to={`/paid-pipeline?lead=${(lead as any).paid_pipeline_lead_id}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-black text-white hover:opacity-90">
                  <ExternalLink className="w-3 h-3" /> Open in Paid Pipeline
                </Link>
              )}
              {paidLeadId && (
                <button onClick={openAddPayment} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-[#16A34A] text-white hover:opacity-90">
                  <Plus className="w-3 h-3" /> Add Payment
                </button>
              )}
              {opsLeadId ? (
                <Link to={`/operations-crm?lead=${opsLeadId}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-[#166534] text-white hover:opacity-90">
                  <ExternalLink className="w-3 h-3" /> Open in Operations CRM
                </Link>
              ) : (
                <button onClick={() => setSendOpsOpen(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] border border-line bg-white hover:bg-off">
                  <ExternalLink className="w-3 h-3" /> Send to Operations CRM
                </button>
              )}
              <button onClick={() => setMoveModalOpen(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] border border-line bg-white hover:bg-off">
                <ExternalLink className="w-3 h-3" /> Move / Copy to Pipeline
              </button>
            </div>
          )}
          <div className="mt-3">
            <LeadNotesSection
              leadId={lead.id}
              paidPipelineLeadId={(lead as any).paid_pipeline_lead_id || null}
            />
          </div>
          <div className="mt-3">
            <LinkedRecordsPanel
              crmLeadId={lead.id}
              paidPipelineLeadId={(lead as any).paid_pipeline_lead_id || null}
              email={lead.email}
              phone={lead.phone}
              onChanged={onChanged}
            />
          </div>
          <div className="mt-3">
            <AccessVerificationPanel
              memberLabel={lead.full_name || undefined}
              crmLeadId={lead.id}
              paidPipelineLeadId={(lead as any).paid_pipeline_lead_id || null}
              cocStatus={(lead as any).code_of_conduct_status || null}
              currentStageName={(lead as any).stage_name || null}
            />
          </div>
          {moveModalOpen && (
            <MoveCopyLinkPipelineModal
              open={moveModalOpen}
              onClose={() => setMoveModalOpen(false)}
              leadId={lead.id}
              leadName={lead.full_name || "Lead"}
              leadEmail={lead.email}
              leadPhone={lead.phone}
              currentPipelineId={lead.pipeline_id}
              currentStageId={lead.stage_id}
              onDone={onChanged}
            />
          )}
          {sendOnboardingOpen && (
            <SendToPaidOnboardingModal
              open={sendOnboardingOpen}
              onClose={() => setSendOnboardingOpen(false)}
              leadId={lead.id}
              leadName={lead.full_name || "Lead"}
              leadEmail={lead.email}
              leadPhone={lead.phone}
              onDone={onChanged}
            />
          )}

          {(() => {
            const stageName = stagesById.get(lead.stage_id || "")?.name || "";
            const isLinked = !!(lead as any).paid_pipeline_lead_id;
            const convStatus = (lead as any).conversion_status as string | undefined;
            if (lead.lead_type !== "unpaid") return null;
            if (isLinked || convStatus === "converted" || convStatus === "linked_to_paid") {
              return (
                <div className="mt-3 rounded-lg border border-[#86EFAC] bg-[#F0FDF4] px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-[#16A34A] text-white">Converted to Paid Onboarding</span>
                    <div className="text-[12px] text-[#14532D] truncate">{isLinked ? "Linked to paid buyer." : "Conversion complete."}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] border border-[#86EFAC] bg-white hover:bg-[#F0FDF4] text-[#14532D]">View Conversion History</button>
                    {(lead as any).converted_to_crm_lead_id && (
                      <Link to={`/crm?lead=${(lead as any).converted_to_crm_lead_id}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] border border-[#86EFAC] bg-white hover:bg-[#F0FDF4] text-[#14532D]">
                        <ExternalLink className="w-3 h-3" /> Open Paid Onboarding CRM
                      </Link>
                    )}
                    {(lead as any).paid_pipeline_lead_id && (
                      <Link to={`/paid-pipeline?lead=${(lead as any).paid_pipeline_lead_id}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-[#16A34A] text-white hover:opacity-90">
                        <ExternalLink className="w-3 h-3" /> Open Paid Buyer
                      </Link>
                    )}
                  </div>
                </div>
              );
            }
            const triggerNow = isConvertedStage(convRules, lead.pipeline_id, lead.stage_id, stageName) ||
              (convRules.length === 0 && DEFAULT_TRIGGER_STAGES.includes(stageName));
            if (triggerNow) {
              return (
                <div className="mt-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-[#92400E] shrink-0" />
                    <div className="text-[12px] text-[#92400E] truncate">
                      This lead is marked as <span className="font-semibold">{stageName}</span>. Convert it to Paid Onboarding.
                    </div>
                  </div>
                  <button
                    onClick={() => setConvertOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-medium bg-black text-white hover:opacity-90 shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Send to Paid Onboarding
                  </button>
                </div>
              );
            }
            return null;
          })()}
          {/* Payment / Token Recording */}
          {(paidSnap || Number(lead.deal_value) > 0) && (
            <div className="mt-4 rounded-lg border border-line bg-off/40 px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Payment / Token Recording</div>
                {paidSnap ? (
                  hasToken ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]">Token Paid {inr(paidSnap.token_amount_collected)}</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">Token Pending</span>
                  )
                ) : (
                  <span className="text-[10px] text-muted-foreground">No paid record</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-1.5 rounded bg-white border border-line"><div className="uppercase-label">Deal</div><div className="font-serif text-sm">{inr(paidSnap?.deal_value ?? lead.deal_value)}</div></div>
                <div className="p-1.5 rounded bg-white border border-line"><div className="uppercase-label">Token</div><div className="font-serif text-sm">{paidSnap ? inr(paidSnap.token_amount_collected) : "—"}</div></div>
                <div className="p-1.5 rounded bg-white border border-line"><div className="uppercase-label">Collected</div><div className="font-serif text-sm">{paidSnap ? inr(paidSnap.total_collected) : "—"}</div></div>
                <div className="p-1.5 rounded bg-white border border-line"><div className="uppercase-label">Balance</div><div className="font-serif text-sm">{paidSnap ? inr(paidSnap.balance_pending) : "—"}</div></div>
              </div>
              {paidLeadId && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {!hasToken ? (
                    <button onClick={openTokenPayment} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-medium bg-black text-white hover:opacity-90">
                      <CreditCard className="w-3.5 h-3.5" /> Record Token Payment
                    </button>
                  ) : (
                    <button onClick={openAddPayment} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] border border-line bg-white hover:bg-off">
                      <Plus className="w-3.5 h-3.5" /> Add Payment
                    </button>
                  )}
                </div>
              )}
              {!paidLeadId && Number(lead.deal_value) > 0 && (
                <div className="mt-2 text-[11px] text-muted-foreground">Link this lead to Paid Pipeline to record payments.</div>
              )}
            </div>
          )}
          <div className="mt-4 rounded-lg border border-line bg-off/40 px-3 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Lead Tags</div>
            </div>
            <TagPicker
              crmLeadId={lead.id}
              paidLeadId={(lead as any).paid_pipeline_lead_id || null}
              leadName={lead.full_name || undefined}
            />
          </div>
          <SuggestedNextActions
            crmLeadId={lead.id}
            paidLeadId={(lead as any).paid_pipeline_lead_id || null}
            onApplied={() => { load(); onChanged(); }}
            onOpenTokenPayment={openTokenPayment}
          />
          <div className="mt-4">
            <PromisedOffersPanel
              crmLeadId={lead.id}
              paidPipelineLeadId={(lead as any).paid_pipeline_lead_id || null}
              title="Services / Commitments"
            />
          </div>
        </div>



        {/* CRM Stage — single prominent card with popover picker */}
        <div className="px-6 py-4 border-b border-line bg-gold-pale/10">
          <div className="rounded-xl border border-line bg-white p-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">CRM Stage</div>
                {isOpsEligible && !inOps && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]">
                    <Sparkles className="w-3 h-3" /> Ops Eligible
                  </span>
                )}
                {inOps && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E0E7FF] text-[#3730A3] border border-[#C7D2FE]">
                    In Operations
                  </span>
                )}
              </div>
              <CrmStagePicker
                stages={pipelineStages as any}
                currentStageId={lead.stage_id}
                open={showStagePicker}
                onOpenChange={(v) => { setShowStagePicker(v); if (!v) setNewStageName(""); }}
                newStageName={newStageName}
                onNewStageNameChange={setNewStageName}
                onChangeStage={(id) => { moveStage(id); setShowStagePicker(false); }}
                onAddStage={addStageInline}
                onDeleteStage={(s) => deleteOrDeactivateStage(s as Stage)}
                addingStage={addingStage}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Current</span>
              {(() => {
                const ch = stageChip(currentStage?.name, (currentStage as any)?.color);
                return currentStage ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border" style={{ background: ch.bg, color: ch.text, borderColor: ch.border }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: ch.dot }} />
                    {currentStage.name}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs bg-off border border-line">—</span>
                );
              })()}
            </div>

            {/* Operations handoff suggestion */}
            {matchingRule && !inOps && (
              <div className="mt-3 rounded-lg border border-[#86EFAC] bg-[#F0FDF4] p-3">
                {matchingRule.mode === "auto" && !isRuleAutoReady(matchingRule) ? (
                  <div className="text-[12px] text-amber-900">
                    <div className="font-medium mb-1">Operations handoff rule is incomplete.</div>
                    <div className="text-[11px]">Add package, duration, assignment method, and media buyer pool in Master Settings → Operations Handoff Rules.</div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="text-[12px] font-medium text-[#166534]">This lead is ready for Operations CRM.</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">Rule: {matchingRule.name} · {matchingRule.default_service_package ?? "—"} · {matchingRule.default_service_days ?? "—"} days</div>
                    </div>
                    <button onClick={() => setSendOpsOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] bg-[#16A34A] text-white hover:opacity-90">
                      Send to Operations CRM
                    </button>
                  </div>
                )}
              </div>
            )}
            {inOps && opsLeadId && (
              <div className="mt-3 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[12px] text-[#3730A3]">This lead is already in Operations CRM.</div>
                <Link to={`/operations-crm?lead=${opsLeadId}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] bg-[#3730A3] text-white hover:opacity-90">
                  <ExternalLink className="w-3 h-3" /> Open in Operations CRM
                </Link>
              </div>
            )}
          </div>
        </div>

        <CodeOfConductCard
          crmLeadId={lead.id}
          paidLeadId={(lead as any).paid_pipeline_lead_id || null}
          pipelineId={lead.pipeline_id}
          stageId={lead.stage_id}
          memberName={lead.full_name || "Member"}
          memberEmail={lead.email}
          memberPhone={lead.phone}
          programName={lead.program_name}
          dealValue={lead.deal_value}
        />

        <SessionAttendanceTimeline
          leadId={lead.id}
          isAdmin={isAdmin}
          legacy={{
            grade: lead.grade,
            is_super_hot: lead.is_super_hot,
            score: lead.score,
            attendance_pct: lead.attendance_pct,
            sessions_count: lead.sessions_count,
            total_minutes: lead.total_minutes,
            webinar_count: lead.webinar_count,
            webinar_source: (lead as any).webinar_source,
            webinar_date: (lead as any).webinar_date,
          }}
        />



        {/* Next Follow-up — high-visibility, daily-use card (moved up) */}
        <div className="px-6 py-4 border-b border-line">
          {(() => {
            const upcoming = [...reminders].sort((a, b) => (a.reminder_date < b.reminder_date ? -1 : 1));
            const next = upcoming.find((r) => r.reminder_date >= today) || upcoming[upcoming.length - 1] || null;
            let status: { label: string; cls: string } = { label: "No follow-up set", cls: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" };
            if (next) {
              if (next.reminder_date < today) status = { label: "Overdue", cls: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]" };
              else if (next.reminder_date === today) status = { label: "Due today", cls: "bg-[#FEF3C7] text-[#92400E] border-[#FBBF24]" };
              else status = { label: "Upcoming", cls: "bg-[#DBEAFE] text-[#1E3A8A] border-[#93C5FD]" };
            }
            return (
              <div className="rounded-xl border border-[#FDE68A] bg-gradient-to-br from-[#FFFBEB] to-[#FEF3C7]/40 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#78350F]">⏰ Next Follow-up</div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${status.cls}`}>{status.label}</span>
                  </div>
                  {next && (
                    <div className="text-[11.5px] text-[#78350F]">
                      <b>{next.reminder_date}</b>{next.reminder_time ? ` · ${next.reminder_time.slice(0,5)}` : ""} · <span className="uppercase">{next.channel}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2 mb-3">
                  {reminders.map((r) => {
                    const overdue = r.reminder_date < today;
                    const isToday = r.reminder_date === today;
                    const cls = overdue ? "bg-[#FEF2F2] border-[#FECACA]" : isToday ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-white border-line";
                    return (
                      <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cls}`}>
                        <div className="flex-1 text-xs">
                          <span className="font-medium">{r.reminder_date}</span> {r.reminder_time?.slice(0, 5)} · <span className="uppercase">{r.channel}</span>
                          {r.note && <div className="text-muted-foreground mt-0.5">{r.note}</div>}
                        </div>
                        <button onClick={() => delReminder(r.id)} className="text-muted-foreground hover:text-black" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
                <FastFollowUpComposer
                  crmLeadId={lead.id}
                  paidLeadId={(lead as any).paid_pipeline_lead_id || null}
                  leadName={lead.full_name || undefined}
                  ownerId={lead.assigned_agent_id || profile?.id || null}
                  source="calling_crm_drawer"
                  onSaved={load}
                />
              </div>
            );
          })()}
        </div>

        {/* Communication actions */}
        <div className="px-6 py-4 border-b border-line">
          <div className="grid grid-cols-4 gap-2">
            <a href={`tel:${lead.phone}`} className="ipc-btn !bg-[#16A34A] !text-white !h-10"><Phone className="w-3.5 h-3.5" /> Call</a>
            <a href={`https://wa.me/${(lead.phone || "").replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="ipc-btn ipc-btn-ghost !h-10"><MessageCircle className="w-3.5 h-3.5" /> WA</a>
            <a href={`mailto:${lead.email}`} className="ipc-btn ipc-btn-ghost !h-10"><Mail className="w-3.5 h-3.5" /> Email</a>
            <a href={`sms:${lead.phone}`} className="ipc-btn ipc-btn-ghost !h-10"><MessageSquare className="w-3.5 h-3.5" /> SMS</a>
          </div>
        </div>

        {/* Assigned agent */}
        <div className="px-6 py-5 border-b border-line">
          <div className="section-divider">Assigned agent</div>
          <select className="ipc-input" value={lead.assigned_agent_id || ""} onChange={(e) => setAgent(e.target.value || null)}>
            <option value="">— Unassigned —</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </div>

        {/* Extra details — collapsed by default */}
        <div className="px-6 py-4 border-b border-line">
          <Collapsible open={extraOpen} onOpenChange={setExtraOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-foreground hover:text-black">
              <span>Extra details · attendance, webinars, score</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${extraOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#E8E5DE" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke={g.fg} strokeWidth="3" strokeDasharray={`${(lead.score / 100) * 94.2} 94.2`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="font-serif text-xl">{lead.score}</div>
                    <div className="font-sans text-[9px] uppercase text-muted-foreground tracking-wider">{g.label}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 flex-1">
                  <div className="p-2 rounded-md bg-off border border-line"><div className="uppercase-label">Attendance</div><div className="font-serif text-base">{lead.total_minutes} min · {lead.sessions_count}×</div></div>
                  <div className="p-2 rounded-md bg-off border border-line"><div className="uppercase-label">Webinars</div><div className="font-serif text-base">{lead.webinar_count}{lead.is_super_hot ? " ★" : ""}</div></div>
                  <div className="p-2 rounded-md bg-off border border-line"><div className="uppercase-label">First join</div><div className="font-sans text-xs">{lead.first_join_time?.slice(0, 16) || "—"}</div></div>
                  <div className="p-2 rounded-md bg-off border border-line"><div className="uppercase-label">Deal value</div><div className="font-serif text-base">₹{Number(lead.deal_value).toLocaleString("en-IN")}</div></div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Activity — collapsed by default */}
        <div className="px-6 py-4">
          <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-foreground hover:text-black">
              <span>Activity log & history{activities.length > 0 ? ` · ${activities.length}` : ""}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${activityOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <textarea className="ipc-input !h-auto py-2.5" rows={3} placeholder="Write call notes, WhatsApp summary…" value={activityNote} onChange={(e) => setActivityNote(e.target.value)} />
              <div className="flex gap-2 mt-2">
                <select className="ipc-input !h-10 !text-xs flex-1" value={activityChannel} onChange={(e) => setActivityChannel(e.target.value as any)}>
                  <option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="sms">SMS</option><option value="note">Note</option>
                </select>
                <button onClick={logActivity} className="ipc-btn ipc-btn-black !h-10">Save</button>
              </div>
              <div className="space-y-3 mt-4">
                {activities.length === 0 && <div className="text-xs text-muted-foreground">No activity yet.</div>}
                {activities.map((a) => (
                  <div key={a.id} className="flex gap-3">
                    <div className="w-1 rounded-full" style={{ background: channelStyle[a.channel] }} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: channelStyle[a.channel] }}>{a.channel}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(a.logged_at).toLocaleString()}</span>
                      </div>
                      <div className="font-sans text-xs">{a.note}</div>
                      {a.agent_name && <div className="text-[10px] text-muted-foreground mt-0.5">— {a.agent_name}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>


        {/* Danger zone: archive / restore / permanent delete */}
        <div className="px-6 py-4 border-t border-line">
          {(lead as any).archived_at && (
            <div className="mb-3 px-3 py-2 rounded-md bg-[#FEF3C7] border border-[#FDE68A] text-[11.5px] text-[#92400E]">
              <span className="font-medium">Archived</span> on {new Date((lead as any).archived_at).toLocaleString()}
              {(lead as any).archive_reason && <div className="text-[11px] mt-0.5 opacity-80">Reason: {(lead as any).archive_reason}</div>}
            </div>
          )}
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Danger zone</div>
          <div className="flex flex-wrap gap-2">
            {!(lead as any).archived_at ? (
              <button
                onClick={async () => {
                  const links = await getLeadLinks([lead.id]).catch(() => ({ paid: 0, ops: 0 }));
                  setArchiveLinks(links);
                  setArchiveOpen(true);
                }}
                className="ipc-btn !h-9 !text-xs !bg-[#FEF3C7] !text-[#92400E] hover:!bg-[#FDE68A] border border-[#FDE68A]"
              >
                <Archive className="w-3.5 h-3.5" /> Archive lead
              </button>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await restoreLead({ id: lead.id, full_name: lead.full_name });
                    toast.success("Lead restored");
                    await load(); onChanged();
                  } catch (e: any) { toast.error(e.message || "Restore failed"); }
                }}
                className="ipc-btn !h-9 !text-xs !bg-[#DCFCE7] !text-[#166534] hover:!bg-[#BBF7D0] border border-[#86EFAC]"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore lead
              </button>
            )}
            {isAdmin && (
              <button
                onClick={async () => {
                  const links = await getLeadLinks([lead.id]).catch(() => ({ paid: 0, ops: 0 }));
                  setDeleteBlocked(links.paid > 0 || links.ops > 0
                    ? `Cannot permanently delete — this lead is linked to ${links.paid ? "Paid Pipeline" : ""}${links.paid && links.ops ? " and " : ""}${links.ops ? "Operations CRM" : ""}. Archive instead.`
                    : null);
                  setDeleteOpen(true);
                }}
                className="ipc-btn !h-9 !text-xs !text-[#DC2626] hover:!bg-[#FEE2E2] border border-[#FCA5A5]"
              >
                <Trash2 className="w-3.5 h-3.5" /> Permanent delete
              </button>
            )}
          </div>
        </div>

        </div>
        {/* Sticky Save / Save & Close */}
        <div className="shrink-0 bg-white border-t border-line px-6 py-3 flex items-center justify-between gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => { await load(); onChanged(); toast.success("Saved"); }}
              className="ipc-btn ipc-btn-ghost !h-10"
            >
              Save
            </button>
            <button
              onClick={async () => { await load(); onChanged(); toast.success("Saved"); onClose(); }}
              className="ipc-btn !bg-[#16A34A] hover:!bg-[#15803D] !text-white !h-10"
              title={originLabel ? `Save changes and return to ${originLabel}` : "Save and close"}
            >
              {originLabel ? "Save & Return" : "Save & Close"}
            </button>
          </div>
        </div>
      </div>
      {archiveOpen && (
        <ArchiveConfirmModal
          title={`Archive "${lead.full_name || "lead"}"?`}
          description="This hides the lead from active CRM views. Paid Pipeline / Operations CRM links are preserved."
          detailLines={archiveLinks ? [
            `${archiveLinks.paid} linked Paid Pipeline record(s) — preserved.`,
            `${archiveLinks.ops} active Operations CRM record(s) — preserved.`,
            archiveLinks.paid + archiveLinks.ops > 0
              ? "Archiving here hides from Calling CRM only."
              : "You can restore from Show archived.",
          ] : undefined}
          busy={archiveBusy}
          onClose={() => { setArchiveOpen(false); setArchiveLinks(null); }}
          onConfirm={async (reason) => {
            setArchiveBusy(true);
            try {
              await archiveLead({ id: lead.id, full_name: lead.full_name, webinar_source: lead.webinar_source, paid_pipeline_lead_id: (lead as any).paid_pipeline_lead_id }, reason || undefined);
              toast.success("Lead archived");
              setArchiveOpen(false); setArchiveLinks(null);
              onChanged(); onClose();
            } catch (e: any) { toast.error(e.message || "Archive failed"); }
            finally { setArchiveBusy(false); }
          }}
        />
      )}
      {deleteOpen && (
        <PermanentDeleteModal
          title={`Permanently delete "${lead.full_name || "lead"}"?`}
          description="This cannot be undone. Activity, reminders, and tags on this lead will be removed."
          blocked={deleteBlocked}
          busy={deleteBusy}
          onClose={() => { setDeleteOpen(false); setDeleteBlocked(null); }}
          onConfirm={async (reason) => {
            setDeleteBusy(true);
            try {
              await permanentlyDeleteLead({ id: lead.id, full_name: lead.full_name }, reason || undefined);
              toast.success("Lead permanently deleted");
              setDeleteOpen(false);
              onChanged(); onClose();
            } catch (e: any) { toast.error(e.message || "Delete failed"); }
            finally { setDeleteBusy(false); }
          }}
        />
      )}
      {sendOpsOpen && (
        <SendToOperationsCrmModal
          candidateLeads={[{
            id: lead.id,
            full_name: lead.full_name,
            email: lead.email,
            phone: lead.phone,
            program_name: (lead as any).program_name ?? null,
            webinar_source: lead.webinar_source,
            deal_value: (lead as any).deal_value ?? null,
            stage_id: lead.stage_id,
            paid_pipeline_lead_id: (lead as any).paid_pipeline_lead_id ?? null,
          }]}
          sourceStages={[]}
          preSelectedIds={[lead.id]}
          prefill={rulePrefill}

          onClose={() => setSendOpsOpen(false)}
          onDone={() => { setSendOpsOpen(false); load(); }}
        />
      )}
      {openPay && paidLeadId && (
        <QuickAddPaymentModal
          leadId={paidLeadId}
          leadName={lead.full_name || undefined}
          prefill={payPrefill || undefined}
          headerNote={payHeaderNote}
          onClose={() => { setOpenPay(false); setPostPayAction(null); }}
          onSaved={handlePaymentSaved}
        />
      )}
      {convertOpen && (
        <ConvertToPaidModal
          lead={lead}
          agents={agents}
          onClose={() => setConvertOpen(false)}
          onConverted={() => { load(); onChanged(); }}
        />
      )}
      {historyOpen && <ConversionHistoryDrawer leadId={lead.id} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
