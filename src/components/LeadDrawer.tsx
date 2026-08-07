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

  useEffect(() => {
    if (!lead) return;
    const hasDealValue = Number(lead.deal_value) > 0 || (paidSnap && Number(paidSnap.deal_value) > 0);
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

  const paidLeadId = (lead as any).paid_pipeline_lead_id as string | null;
  const openTokenPayment = () => {
    if (!paidLeadId) return;
    setPayPrefill({ type: "First Token", category: "Token Amount", description: "Token payment", isToken: true });
    setPostPayAction("setTokenPaid");
    setOpenPay(true);
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
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full name" className="ipc-input !h-9 !text-sm w-full" />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={savingEdit} className="ipc-btn ipc-btn-black !h-8 !text-xs">Save</button>
                    <button onClick={() => setEditMode(false)} className="ipc-btn ipc-btn-ghost !h-8 !text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="font-serif text-[22px] leading-tight">{lead.full_name || "Unnamed"}</div>
                    <button onClick={() => { setEditName(lead.full_name || ""); setEditEmail(lead.email || ""); setEditPhone(lead.phone || ""); setEditMode(true); }} className="p-1 hover:bg-off rounded"><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="font-sans text-xs text-muted-foreground mt-1">{lead.phone} · {lead.email}</div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] uppercase bg-off border border-line">{lead.program_name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] uppercase bg-off border border-line">{lead.lead_type}</span>
                  </div>
                </>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-off rounded"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-6 border-b border-line bg-off/50">
              <TabsList className="bg-transparent h-10 w-full justify-start overflow-x-auto no-scrollbar">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="payments" className="text-xs">Payments</TabsTrigger>
                <TabsTrigger value="onboarding" className="text-xs">Onboarding</TabsTrigger>
                <TabsTrigger value="stage & handoff" className="text-xs">Stage & Handoff</TabsTrigger>
                <TabsTrigger value="follow-ups & activity" className="text-xs">Activity</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 space-y-6">
              <TagPicker crmLeadId={lead.id} leadName={lead.full_name || undefined} />
              <SuggestedNextActions crmLeadId={lead.id} onApplied={() => { load(); onChanged(); }} onOpenTokenPayment={openTokenPayment} />
              <SessionAttendanceTimeline leadId={lead.id} />
              <LeadNotesSection leadId={lead.id} />
              <LinkedRecordsPanel crmLeadId={lead.id} email={lead.email} phone={lead.phone} onChanged={onChanged} />
            </TabsContent>
            <TabsContent value="payments" className="flex-1 overflow-y-auto p-6">
              {(paidSnap || Number(lead.deal_value) > 0) && (
                <div className="rounded-lg border border-line bg-off/40 p-3">
                  <div className="text-[11px] font-semibold uppercase mb-2">Financial Summary</div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-1.5 rounded bg-white border border-line text-[10px]">Deal<br/>{inr(paidSnap?.deal_value ?? lead.deal_value)}</div>
                    <div className="p-1.5 rounded bg-white border border-line text-[10px]">Token<br/>{paidSnap ? inr(paidSnap.token_amount_collected) : "—"}</div>
                    <div className="p-1.5 rounded bg-white border border-line text-[10px]">Paid<br/>{paidSnap ? inr(paidSnap.total_collected) : "—"}</div>
                    <div className="p-1.5 rounded bg-white border border-line text-[10px]">Bal<br/>{paidSnap ? inr(paidSnap.balance_pending) : "—"}</div>
                  </div>
                  {paidLeadId && (
                    <div className="mt-4 flex gap-2">
                      {!hasToken ? <button onClick={openTokenPayment} className="ipc-btn ipc-btn-black !h-8 !text-xs">Record Token</button> : <button onClick={() => { setPayPrefill(null); setPostPayAction(null); setOpenPay(true); }} className="ipc-btn ipc-btn-ghost !h-8 !text-xs">Add Payment</button>}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
            <TabsContent value="onboarding" className="flex-1 overflow-y-auto p-6 space-y-6">
              <AccessVerificationPanel memberLabel={lead.full_name || undefined} crmLeadId={lead.id} cocStatus={(lead as any).code_of_conduct_status} />
              <CodeOfConductCard crmLeadId={lead.id} pipelineId={lead.pipeline_id} stageId={lead.stage_id} memberName={lead.full_name || ""} memberEmail={lead.email} memberPhone={lead.phone} programName={lead.program_name} dealValue={Number(lead.deal_value) || null} />
              <PromisedOffersPanel crmLeadId={lead.id} title="Services / Commitments" />
            </TabsContent>
            <TabsContent value="stage & handoff" className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase">CRM Stage</div>
                <CrmStagePicker
                  stages={pipelineStages} currentStageId={lead.stage_id} open={crmPickerOpen} onOpenChange={setCrmPickerOpen}
                  newStageName={newStageName} onNewStageNameChange={setNewStageName} onAddStage={addStageInline}
                  onChangeStage={(id) => { moveStage(id); setCrmPickerOpen(false); }}
                  onDeleteStage={() => {}}
                />
              </div>
              {isOpsEligible && !inOps && (
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                  <div className="text-xs text-amber-800">Eligible for Operations CRM handoff.</div>
                  <button onClick={() => setSendOpsOpen(true)} className="mt-2 ipc-btn ipc-btn-black !h-8 !text-xs">Send to Operations</button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="follow-ups & activity" className="flex-1 overflow-y-auto p-6 space-y-6">
              <FastFollowUpComposer crmLeadId={lead.id} leadName={lead.full_name || undefined} onSaved={load} />
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase">Activity History</div>
                {activities.map(a => (
                  <div key={a.id} className="text-xs border-l-2 border-line pl-3 py-1">
                    <div className="text-muted-foreground">{new Date(a.logged_at).toLocaleString()} · {a.channel}</div>
                    <div className="mt-1">{a.note}</div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line flex justify-between bg-white">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={() => { load(); onChanged(); onClose(); }} className="ipc-btn ipc-btn-black">Save & Close</button>
        </div>
      </div>
      
      {sendOpsOpen && <SendToOperationsCrmModal candidateLeads={[lead as any]} sourceStages={[]} preSelectedIds={[lead.id]} prefill={rulePrefill as any} onClose={() => setSendOpsOpen(false)} onDone={() => { setSendOpsOpen(false); load(); }} />}
      {openPay && paidLeadId && <QuickAddPaymentModal leadId={paidLeadId} leadName={lead.full_name || undefined} prefill={payPrefill} onSaved={handlePaymentSaved} onClose={() => setOpenPay(false)} />}
    </div>
  );
}
