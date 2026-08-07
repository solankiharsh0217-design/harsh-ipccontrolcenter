import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { GRADE_STYLES, type Lead, type Stage, type ActivityLog, type Reminder } from "@/lib/crmTypes";
import { X, Phone, MessageCircle, Mail, MessageSquare, Trash2, ExternalLink, Sparkles, ChevronDown, Archive, RotateCcw, Plus, CreditCard, Pencil, Check, Settings, ShieldAlert, History } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TagPicker from "@/components/TagPicker";
import FastFollowUpComposer from "@/components/FastFollowUpComposer";
import SuggestedNextActions from "@/components/SuggestedNextActions";
import SendToOperationsCrmModal from "@/components/SendToOperationsCrmModal";
import { getActiveHandoffRules, findRuleForStage, type HandoffRule } from "@/lib/operationsCrm";
import { archiveLead, permanentlyDeleteLead } from "@/lib/crmArchive";
import { ArchiveConfirmModal, PermanentDeleteModal } from "@/components/crm/ArchiveConfirmModal";
import QuickAddPaymentModal from "@/components/paid-pipeline/QuickAddPaymentModal";
import { recomputePaidLead } from "@/lib/paidPipeline";
import { logActivity as auditLog } from "@/lib/auditLog";
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
import { inr } from "@/lib/format";

interface Props {
  leadId: string;
  stages: Stage[];
  agents: { id: string; full_name: string }[];
  onClose: () => void;
  onChanged: () => void;
  onStageChanged?: (leadId: string, newStageId: string) => void;
  originLabel?: string | null;
  returnTo?: string | null;
}

export default function LeadDrawer({ leadId, stages, agents, onClose, onChanged, onStageChanged, originLabel, returnTo }: Props) {
  const { profile, isAdmin } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [paidSnap, setPaidSnap] = useState<any | null>(null);
  const [opsLeadId, setOpsLeadId] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [sendOnboardingOpen, setSendOnboardingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [sendOpsOpen, setSendOpsOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [convRules, setConvRules] = useState<ConversionRule[]>([]);
  const [opsRules, setOpsRules] = useState<HandoffRule[]>([]);
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
  
  const [crmPickerOpen, setCrmPickerOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [addingStage, setAddingStage] = useState(false);

  const stagesById = useMemo(() => new Map(stages.map((s) => [s.id, { id: s.id, name: s.name }])), [stages]);

  const load = async () => {
    const [{ data: l }, { data: a }, { data: r }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", leadId).maybeSingle(),
      supabase.from("activity_logs").select("*").eq("lead_id", leadId).order("logged_at", { ascending: false }),
      supabase.from("follow_up_reminders").select("*").eq("lead_id", leadId).order("reminder_date"),
    ]);
    if (!l) return;
    setLead(l as any); setActivities((a || []) as any); setReminders((r || []) as any);
    const ppid = (l as any)?.paid_pipeline_lead_id;
    if (ppid) {
      const { data: pp } = await supabase.from("paid_pipeline_leads")
        .select("id,deal_value,token_amount_collected,total_collected,balance_pending,token_paid_status")
        .eq("id", ppid).maybeSingle();
      setPaidSnap(pp || null);
    } else setPaidSnap(null);
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

  const g = lead ? GRADE_STYLES[lead.grade] : GRADE_STYLES["C"];
  const pipelineStages = lead ? stages.filter((s) => s.pipeline_id === lead.pipeline_id).filter((s) => (s as any).is_active !== false || s.id === lead.stage_id) : [];
  const today = new Date().toISOString().slice(0, 10);
  const matchingRule = lead ? findRuleForStage(opsRules, lead.pipeline_id, lead.stage_id, stagesById) : null;
  const isOpsEligible = !!matchingRule;
  const inOps = opsLeadId !== null;
  const hasToken = !!paidSnap && Number(paidSnap.token_amount_collected || 0) > 0;
  const rulePrefill = matchingRule ? {
    serviceDays: matchingRule.default_service_days ?? null,
    packageName: matchingRule.default_service_package ?? null,
    assignMethod: matchingRule.default_assignment_method,
    singleBuyerId: matchingRule.default_single_buyer_id,
    duplicateBehavior: matchingRule.duplicate_behavior,
  } : null;

  const paidLeadId = lead ? ((lead as any).paid_pipeline_lead_id as string | null) : null;

  const handlePaymentSaved = async () => {
    const paidLeadId = (lead as any).paid_pipeline_lead_id;
    if (paidLeadId && postPayAction === "setTokenPaid") {
      await supabase.from("paid_pipeline_leads").update({ pipeline_stage: "Token Paid" } as any).eq("id", paidLeadId);
      await recomputePaidLead(paidLeadId);
      toast.success("Token recorded and stage set to Token Paid");
    } else toast.success("Payment recorded");
    setPostPayAction(null); setOpenPay(false);
    await load(); onChanged();
  };

  const openTokenPayment = () => {
    if (!paidLeadId) return;
    setPayPrefill({ type: "First Token", category: "Token Amount", description: "Token payment", isToken: true });
    setPostPayAction("setTokenPaid");
    setOpenPay(true);
  };

  const primaryAction = useMemo(() => {
    if (!lead) return null;

    // 1. Convert to Paid Pipeline (highest priority if unpaid and unlinked)
    const isUnpaid = lead.lead_type?.toLowerCase() === "unpaid";
    const isUnlinked = !paidLeadId;
    if (isUnpaid && isUnlinked) {
      return {
        label: "Send to Paid Onboarding",
        onClick: () => setSendOnboardingOpen(true),
        variant: "black" as const,
      };
    }

    // 2. Conversion Rule Match (triggers ConvertToPaidModal)
    const currentStageName = stagesById.get(lead.stage_id)?.name || null;
    const activeConvRule = convRules.find(r => {
      if (r.source_pipeline_id && r.source_pipeline_id !== lead.pipeline_id) return false;
      if (r.trigger_stage_ids?.includes(lead.stage_id)) return true;
      if (currentStageName && r.trigger_stage_names?.some(n => n.toLowerCase() === currentStageName.toLowerCase())) return true;
      return false;
    });
    if (activeConvRule) {
      return {
        label: "Convert to Paid",
        onClick: () => setConvertOpen(true),
        variant: "black" as const,
      };
    }

    // 3. Operations Handoff (isOpsEligible)
    if (isOpsEligible && !inOps) {
      return {
        label: "Send to Operations",
        onClick: () => setSendOpsOpen(true),
        variant: "black" as const,
      };
    }

    // 4. Record Token (if missing)
    if (paidSnap && Number(paidSnap.deal_value) > 0 && !hasToken) {
      return {
        label: "Record Token",
        onClick: openTokenPayment,
        variant: "black" as const,
      };
    }

    // Default fallback: Just allow updating status.
    return {
      label: "Update Status",
      onClick: () => setCrmPickerOpen(true),
      variant: "ghost" as const,
    };
  }, [lead, isOpsEligible, inOps, hasToken, paidSnap, convRules, stagesById, paidLeadId]);

  useEffect(() => {
    if (!lead) return;
    const hasDealValue = Number(lead.deal_value) > 0 || (paidSnap && Number(paidSnap.deal_value) > 0);
    
    // Default tab logic
    if (hasDealValue && !hasToken) { setActiveTab("payments"); return; }
    if (isOpsEligible && !inOps) { setActiveTab("stage & handoff"); return; }
    if (reminders.some(r => r.reminder_date < today)) { setActiveTab("follow-ups & activity"); return; }
    setActiveTab("overview");
  }, [leadId, !!lead, isOpsEligible, inOps, hasToken, reminders.length]);

  if (!lead) return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-[560px] bg-white p-8" onClick={(e) => e.stopPropagation()}>Loading…</div>
    </div>
  );

  const saveEdit = async () => {
    const name = editName.trim();
    if (!name) { toast.error("Name is required"); return; }
    setSavingEdit(true);
    try {
      const { error } = await supabase.from("leads").update({ full_name: name, email: editEmail.trim() || null, phone: editPhone.trim() || null }).eq("id", lead.id);
      if (error) throw error;
      toast.success("Lead updated");
      setEditMode(false); load(); onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingEdit(false); }
  };
  
  const moveStage = async (stageId: string) => {
    const prev = lead.stage_id;
    await supabase.from("leads").update({ stage_id: stageId }).eq("id", lead.id);
    toast.success("Stage updated");
    await load(); onChanged();
    if (prev !== stageId) {
      onStageChanged?.(lead.id, stageId);
      try {
        const { evaluateStageTrigger } = await import("@/lib/codeOfConductRules");
        await evaluateStageTrigger({
          source: "crm", pipelineId: lead.pipeline_id, stageId,
          crmLeadId: lead.id, paidPipelineLeadId: (lead as any).paid_pipeline_lead_id || null, memberName: lead.full_name || "Member",
          memberEmail: lead.email, memberPhone: lead.phone,
          programName: lead.program_name, dealValue: lead.deal_value,
        });
      } catch { /* ignore */ }
    }
  };

  const addStageInline = async () => {
    const name = newStageName.trim();
    if (!name) return;
    setAddingStage(true);
    try {
      const { data, error } = await supabase.from("stages").insert({ pipeline_id: lead.pipeline_id, name, color: "gray", position: pipelineStages.length } as any).select("id").maybeSingle();
      if (error) { toast.error(error.message); return; }
      setNewStageName(""); toast.success("Stage added");
      if (data?.id) await moveStage(data.id);
    } finally { setAddingStage(false); }
  };


  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-[560px] bg-white border-l border-line flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-line">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {editMode ? (
                <div className="space-y-2">
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full name" className="w-full h-9 px-3 border border-line rounded-md text-sm" />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={savingEdit} className="h-8 px-4 bg-black text-white rounded-md text-xs font-medium hover:bg-black/90">Save</button>
                    <button onClick={() => setEditMode(false)} className="h-8 px-4 border border-line rounded-md text-xs font-medium text-muted-foreground hover:bg-off">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground">{lead.full_name || "Unnamed"}</h2>
                    <button onClick={() => { setEditName(lead.full_name || ""); setEditEmail(lead.email || ""); setEditPhone(lead.phone || ""); setEditMode(true); }} className="p-1.5 hover:bg-off rounded-md text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="flex items-center gap-2 font-sans text-xs text-muted-foreground mt-1.5">
                    <span>{lead.phone}</span>
                    <span>•</span>
                    <span>{lead.email}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] uppercase bg-off border border-line text-muted-foreground">{lead.program_name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] uppercase bg-off border border-line text-muted-foreground">{lead.lead_type}</span>
                  </div>
                </>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-off rounded-md"><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-6 border-b border-line bg-card/50">
              <TabsList className="bg-transparent h-12 w-full justify-start overflow-x-auto no-scrollbar gap-6">
                <TabsTrigger value="overview" className="h-12 border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:text-black text-xs font-medium px-0">Overview</TabsTrigger>
                <TabsTrigger value="payments" className="h-12 border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:text-black text-xs font-medium px-0">Payments</TabsTrigger>
                <TabsTrigger value="onboarding" className="h-12 border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:text-black text-xs font-medium px-0">Onboarding</TabsTrigger>
                <TabsTrigger value="stage & handoff" className="h-12 border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:text-black text-xs font-medium px-0">Stage & Handoff</TabsTrigger>
                <TabsTrigger value="follow-ups & activity" className="h-12 border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:text-black text-xs font-medium px-0">Activity</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 space-y-8">
              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Context & Actions</h3>
                <TagPicker crmLeadId={lead.id} leadName={lead.full_name || undefined} />
                <SuggestedNextActions crmLeadId={lead.id} onApplied={() => { load(); onChanged(); }} onOpenTokenPayment={openTokenPayment} />
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attendance & History</h3>
                <SessionAttendanceTimeline leadId={lead.id} />
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</h3>
                <LeadNotesSection leadId={lead.id} />
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Records</h3>
                <LinkedRecordsPanel crmLeadId={lead.id} email={lead.email} phone={lead.phone} onChanged={onChanged} />
              </section>
            </TabsContent>
            
            <TabsContent value="payments" className="flex-1 overflow-y-auto p-6">
              {(paidSnap || Number(lead.deal_value) > 0) && (
                <div className="rounded-xl border border-line bg-card p-5 space-y-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Financial Summary</h3>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div className="p-3 rounded-lg bg-off/50 border border-line">
                      <div className="text-[10px] text-muted-foreground uppercase mb-1">Deal</div>
                      <div className="text-sm font-medium">{inr(paidSnap?.deal_value ?? lead.deal_value)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-off/50 border border-line">
                      <div className="text-[10px] text-muted-foreground uppercase mb-1">Token</div>
                      <div className="text-sm font-medium">{paidSnap ? inr(paidSnap.token_amount_collected) : "—"}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-off/50 border border-line text-success">
                      <div className="text-[10px] text-muted-foreground uppercase mb-1">Paid</div>
                      <div className="text-sm font-medium">{paidSnap ? inr(paidSnap.total_collected) : "—"}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-off/50 border border-line text-danger">
                      <div className="text-[10px] text-muted-foreground uppercase mb-1">Bal</div>
                      <div className="text-sm font-medium">{paidSnap ? inr(paidSnap.balance_pending) : "—"}</div>
                    </div>
                  </div>
                  {paidLeadId && (
                    <div className="flex gap-2">
                      {!hasToken ? (
                        <button onClick={openTokenPayment} className="h-9 px-4 bg-black text-white rounded-md text-sm font-medium hover:bg-black/90">Record Token</button>
                      ) : (
                        <button onClick={() => { setPayPrefill(null); setPostPayAction(null); setOpenPay(true); }} className="h-9 px-4 border border-line rounded-md text-sm font-medium hover:bg-off">Add Payment</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="onboarding" className="flex-1 overflow-y-auto p-6 space-y-8">
              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Access Health</h3>
                <AccessVerificationPanel memberLabel={lead.full_name || undefined} crmLeadId={lead.id} cocStatus={(lead as any).code_of_conduct_status} />
              </section>
              
              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Code of Conduct</h3>
                <CodeOfConductCard crmLeadId={lead.id} pipelineId={lead.pipeline_id} stageId={lead.stage_id} memberName={lead.full_name || ""} memberEmail={lead.email} memberPhone={lead.phone} programName={lead.program_name} dealValue={Number(lead.deal_value) || null} />
              </section>
              
              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Promised Offers</h3>
                <PromisedOffersPanel crmLeadId={lead.id} title="Services & Commitments" />
              </section>
            </TabsContent>

            <TabsContent value="stage & handoff" className="flex-1 overflow-y-auto p-6 space-y-8">
              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Stage</h3>
                <CrmStagePicker
                  stages={pipelineStages} currentStageId={lead.stage_id} open={crmPickerOpen} onOpenChange={setCrmPickerOpen}
                  newStageName={newStageName} onNewStageNameChange={setNewStageName} onAddStage={addStageInline}
                  onChangeStage={(id) => { moveStage(id); setCrmPickerOpen(false); }}
                  onDeleteStage={() => {}}
                />
              </section>

              {isOpsEligible && !inOps && (
                <section className="p-4 rounded-xl border border-amber-200 bg-amber-50 space-y-3">
                  <div className="text-sm font-medium text-amber-900 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    Operations Handoff Ready
                  </div>
                  <div className="text-xs text-amber-700">This lead matches an active handoff rule and is eligible for transfer to Operations CRM.</div>
                  <button onClick={() => setSendOpsOpen(true)} className="h-8 px-4 bg-amber-600 text-white rounded-md text-xs font-medium hover:bg-amber-700 transition-colors">Send to Operations</button>
                </section>
              )}
            </TabsContent>

            <TabsContent value="follow-ups & activity" className="flex-1 overflow-y-auto p-6 space-y-8">
              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fast Follow-up</h3>
                <FastFollowUpComposer crmLeadId={lead.id} leadName={lead.full_name || undefined} onSaved={load} />
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity Timeline</h3>
                <div className="space-y-4">
                  {activities.length === 0 ? (
                    <div className="text-sm text-muted-foreground italic px-2">No activity recorded yet.</div>
                  ) : (
                    activities.map(a => (
                      <div key={a.id} className="relative pl-6 pb-4 border-l border-line last:border-0 last:pb-0">
                        <div className="absolute left-[-5px] top-1 w-2 h-2 rounded-full bg-line" />
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 uppercase tracking-tight">
                          <span>{new Date(a.logged_at).toLocaleString()}</span>
                          <span>•</span>
                          <span>{a.channel}</span>
                        </div>
                        <div className="mt-1 text-sm text-foreground leading-relaxed">{a.note}</div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line flex items-center justify-between bg-white shadow-sm">
          <button onClick={onClose} className="h-10 px-6 border border-line rounded-md text-sm font-medium hover:bg-off transition-colors">Cancel</button>
          
          <div className="flex items-center gap-3">
            {primaryAction && (
              <button 
                onClick={primaryAction.onClick}
                className={`h-10 px-6 rounded-md text-sm font-medium transition-all ${
                  primaryAction.variant === "black" 
                    ? "bg-black text-white hover:bg-black/90 shadow-md active:scale-[0.98]" 
                    : "border border-line text-foreground hover:bg-off"
                }`}
              >
                {primaryAction.label}
              </button>
            )}
            <button 
              onClick={() => { load(); onChanged(); onClose(); }} 
              className="h-10 px-6 bg-black text-white rounded-md text-sm font-medium hover:bg-black/90 shadow-md active:scale-[0.98]"
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
      
      {sendOpsOpen && <SendToOperationsCrmModal candidateLeads={[lead as any]} sourceStages={[]} preSelectedIds={[lead.id]} prefill={rulePrefill as any} onClose={() => setSendOpsOpen(false)} onDone={() => { setSendOpsOpen(false); load(); }} />}
      {openPay && paidLeadId && <QuickAddPaymentModal leadId={paidLeadId} leadName={lead.full_name || undefined} prefill={payPrefill} onSaved={handlePaymentSaved} onClose={() => setOpenPay(false)} />}
      {convertOpen && <ConvertToPaidModal lead={lead as any} agents={agents} onClose={() => setConvertOpen(false)} onConverted={() => { setConvertOpen(false); load(); onChanged(); }} />}
      {sendOnboardingOpen && (
        <SendToPaidOnboardingModal 
          open={sendOnboardingOpen} 
          onClose={() => setSendOnboardingOpen(false)} 
          leadId={lead.id} 
          leadName={lead.full_name || ""} 
          leadEmail={lead.email} 
          leadPhone={lead.phone} 
          onDone={() => { setSendOnboardingOpen(false); load(); onChanged(); }} 
        />
      )}

    </div>
  );
}

