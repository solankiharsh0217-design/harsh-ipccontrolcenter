import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import QuickSaveInput from "@/components/QuickSaveInput";
import QuickAddPaymentModal from "@/components/paid-pipeline/QuickAddPaymentModal";
import QuickFollowUpModal from "@/components/paid-pipeline/QuickFollowUpModal";
import QuickFinanceModal from "@/components/paid-pipeline/QuickFinanceModal";
import InlineManagedSelect from "@/components/paid-pipeline/InlineManagedSelect";
import { inr, fmtDate, recomputePaidLead } from "@/lib/paidPipeline";
import { logActivity, logPaidLeadDiff } from "@/lib/auditLog";
import TagPicker from "@/components/TagPicker";
import PromisedOffersPanel from "@/components/offers/PromisedOffersPanel";
import FastFollowUpComposer from "@/components/FastFollowUpComposer";
import SuggestedNextActions from "@/components/SuggestedNextActions";
import { stageChip } from "@/lib/stageColors";
import { getActiveHandoffRules, findRuleForStage, isRuleAutoReady, applyAutoHandoff } from "@/lib/operationsCrm";
import { auditPaidPipelineVisibility, type VisibilityAudit } from "@/lib/paidPipelineVisibility";
import CrmStagePicker, { type CrmStagePickerStage } from "@/components/crm/CrmStagePicker";
import CodeOfConductPanel from "@/components/paid-pipeline/CodeOfConductPanel";
import AccessVerificationPanel from "@/components/access-followup/AccessVerificationPanel";
import { ensurePaidPipelineCrmLead } from "@/lib/paidCrmMirror";
import ServicePackageChip from "@/components/ServicePackageChip";
import SendPaidToOpsModal from "@/components/paid-pipeline/SendPaidToOpsModal";
import type { Lead, Batch, Payment } from "@/pages/PaidPipeline";
import { Phone, MessageCircle, Plus, RefreshCw, Send, MoreHorizontal, X, ExternalLink, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fetchVerificationForPaidLead, computeOverall } from "@/lib/accessVerification";

const today = () => new Date().toISOString().slice(0, 10);

export default function PaidPipelineLeadDrawer({ lead, onClose, stages, agents, onChanged }: { lead: Lead; onClose: () => void; stages: string[]; agents: { id: string; full_name: string }[]; onChanged: () => void }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [tabResolved, setTabResolved] = useState(false);
  
  if (!tabResolved && typeof window !== 'undefined') {
    // Only trigger on client
    setTimeout(() => {
      // Small delay to ensure render for test Initializing check
    }, 0);
  }

  
  const resolveDefaultTab = async () => {
    if (tabResolved) return;
    
    const isTokenMissing = Number(lead.token_amount_collected || 0) === 0;
    const isBalancePending = Number(lead.balance_pending || 0) > 0;
    if (isTokenMissing || isBalancePending) {
      setActiveTab("payments");
      setTabResolved(true);
      return;
    }

    const cocStatus = (lead as any).code_of_conduct_status;
    const isCocWaiting = !cocStatus || cocStatus === "pending" || cocStatus === "sent";
    if (isCocWaiting) {
      setActiveTab("documents");
      setTabResolved(true);
      return;
    }

    // Onboarding: Access Verification incomplete
    try {
      const v = await fetchVerificationForPaidLead(lead.id);
      const overall = computeOverall(v);
      if (overall !== "completed") {
        setActiveTab("onboarding");
        setTabResolved(true);
        return;
      }
    } catch (e) { /* fall through */ }

    const isOpsReady = /Operations Ready/i.test(lead.pipeline_stage || "");
    if (isOpsReady) {
      setActiveTab("offers & delivery");
      setTabResolved(true);
      return;
    }

    setActiveTab("overview");
    setTabResolved(true);
  };

  useEffect(() => {
    resolveDefaultTab();
  }, [lead.id]);
  const { user, isAdmin } = useAuth();
  const [visibilityAudit, setVisibilityAudit] = useState<VisibilityAudit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
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
  const [sendOpsOpen, setSendOpsOpen] = useState(false);

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

  const loadAudit = async () => {
    if (!isAdmin) return;
    setAuditLoading(true);
    try { setVisibilityAudit(await auditPaidPipelineVisibility(lead.id)); }
    finally { setAuditLoading(false); }
  };
  useEffect(() => { loadAudit(); }, [lead.id, lead.crm_lead_id, isAdmin]);

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

    // Code of Conduct trigger evaluation
    try {
      const { evaluateStageTrigger } = await import("@/lib/codeOfConductRules");
      const res = await evaluateStageTrigger({
        source: "paid_pipeline", pipelineId: crmPipelineId, stageId: newStageId,
        crmLeadId: lead.crm_lead_id, paidPipelineLeadId: lead.id,
        memberName: lead.name || "Member", memberEmail: lead.email, memberPhone: lead.phone,
        programName: lead.product_name_snapshot, dealValue: (lead as any).deal_value,
      });
      if (res.action === "auto_sent") toast.success(`Code of Conduct auto-sent (rule: ${res.rule?.name})`);
      else if (res.action === "suggested") toast.info(`Code of Conduct suggested: ${res.rule?.name}`);
      else if (res.action === "auto_send_failed") toast.error(`CoC auto-send failed: ${res.message}`);
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

  // Surgical repair: ensure linked CRM lead exists in Paid — Onboarding and is visible.
  const repairCrmLink = async () => {
    setLinkingCrm(true);
    try {
      const res = await ensurePaidPipelineCrmLead(lead.id);
      if (!res.ok) { toast.error(res.message); return; }
      const labels: Record<string, string> = {
        already_linked: "Already linked correctly",
        link_repaired: "Linked CRM lead repaired",
        linked_existing: "Linked existing CRM lead and moved to Paid Onboarding",
        created: "CRM lead created in Paid — Onboarding",
      };
      toast.success(labels[res.action] || "Repaired");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Repair failed");
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
        metadata: { paid_pipeline_lead_id: lead.id, crm_lead_id: lead.crm_lead_id, pipeline_id: crmPipelineId, stage_id: (data as any)?.id, stage_name: name, changed_by: user?.id || null },
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
    await loadInner();
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

  const chip = stageChip(stage, "gray");

  if (!tabResolved) {
    return (
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/30" onClick={onClose} />
        <div className="w-full max-w-[800px] bg-white flex flex-col h-[100dvh] items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
          <div className="text-[13px] text-muted-foreground">Initializing drawer…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-[800px] bg-white flex flex-col h-[100dvh] overflow-hidden">
        {/* Sticky Header */}
        <div className="shrink-0 bg-white border-b border-line z-20">
          <div className="px-6 py-4 flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="font-serif text-[24px] truncate leading-tight">{lead.name || "Untitled"}</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap" style={{ background: chip.bg, color: chip.text, borderColor: chip.border }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: chip.dot }} />
                  {stage || "No Stage"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                <span className="truncate max-w-[200px]">{lead.product_name_snapshot || lead.onboarding_batch_name || "No Program/Batch"}</span>
                <span>•</span>
                <span className="truncate">Owner: {agents.find(a => a.id === (lead as any).owner_id)?.full_name || "Unassigned"}</span>
                <span>•</span>
                <span className="font-medium text-amber-600">Balance: {inr(lead.balance_pending)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button onClick={onClose} className="ipc-btn ipc-btn-black !h-9 px-4">Save & Close</button>
              <button onClick={onClose} className="p-2 hover:bg-off rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="px-6 pb-4 flex flex-col gap-3">
            <TagPicker
              paidLeadId={lead.id}
              leadName={lead.name || undefined}
            />
            
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
          </div>

          {/* Quick Action Bar */}
          <div className="px-6 py-2 bg-off/30 border-t border-line flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(() => {
              const isTokenMissing = Number(lead.token_amount_collected || 0) === 0;
              const isBalancePending = Number(lead.balance_pending || 0) > 0;
              const isOpsReady = /Operations Ready/i.test(lead.pipeline_stage || "");
              
              if (isTokenMissing) {
                return (
                  <button onClick={openTokenPayment} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border border-[#16A34A] bg-[#16A34A] text-white hover:bg-[#15803D] transition-colors shadow-sm">
                    <Plus className="w-3.5 h-3.5" /> Record Token Payment
                  </button>
                );
              }
              if (isBalancePending) {
                return (
                  <button onClick={openAddPayment} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm">
                    <Plus className="w-3.5 h-3.5" /> Add Payment
                  </button>
                );
              }
              if (isOpsReady) {
                return (
                  <button onClick={() => setSendOpsOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm">
                    <Send className="w-3.5 h-3.5" /> Send to Operations CRM
                  </button>
                );
              }
              return (
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border border-line bg-white hover:bg-off transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Update Status
                </button>
              );
            })()}

            <div className="w-px h-4 bg-line mx-1" />

            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border border-line bg-white hover:bg-off transition-colors">
              <Phone className="w-3.5 h-3.5" /> Call
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border border-line bg-white hover:bg-off transition-colors text-green-600">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </button>
            <button className="inline-flex items-center px-2 py-1.5 rounded-md border border-line bg-white hover:bg-off transition-colors">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tabs List */}
          <div className="px-4 border-t border-line">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full justify-start h-12 bg-transparent p-0 gap-6">
                {["Overview", "Payments", "Onboarding", "Documents", "Offers & Delivery", "Activity"].map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab.toLowerCase()}
                    className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-black data-[state=active]:bg-transparent px-2 text-[13px] font-medium"
                  >
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsContent value="overview" className="m-0 focus-visible:ring-0">
              <div className="p-6 space-y-5">
                <div className="rounded-xl border border-line bg-off/30 p-5">
                  <div className="grid grid-cols-3 gap-8">
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Balance Pending</div>
                      <div className={`text-[24px] font-bold ${Number(lead.balance_pending) > 50000 ? "text-red-600" : "text-amber-600"}`}>
                        {inr(lead.balance_pending)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">Next follow-up: {lead.next_balance_follow_up_date ? fmtDate(lead.next_balance_follow_up_date) : "—"}</div>
                    </div>
                    <div className="space-y-1 border-l border-line pl-8">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Collected</div>
                      <div className="text-[24px] font-bold text-green-600">
                        {inr(lead.total_collected)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">Deal: {inr(lead.deal_value_including_gst)}</div>
                    </div>
                    <div className="space-y-1 border-l border-line pl-8">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Token Amount</div>
                      <div className="text-[24px] font-bold text-green-600">
                        {inr(lead.token_amount_collected)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{hasToken ? "Token recorded" : "Not recorded"}</div>
                    </div>
                  </div>
                </div>

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
              </div>
            </TabsContent>

            <TabsContent value="payments" className="m-0 focus-visible:ring-0">
              <div className="p-6 space-y-6">
                <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden">
                  <div className="bg-off/50 px-4 py-3 border-b border-line flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-foreground">Finance / EMI</h3>
                    <button onClick={() => setOpenFin(true)} className="text-[11px] font-medium text-blue-600 hover:underline">Open Editor</button>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Required</div>
                        <div className="text-[14px] font-medium">{lead.finance_required ? "Yes" : "No"}</div>
                      </div>
                      <div className="space-y-1 border-l border-line pl-4">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Approved</div>
                        <div className="text-[14px] font-medium">{inr(lead.finance_amount_approved || 0)}</div>
                      </div>
                      <div className="space-y-1 border-l border-line pl-4">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Disbursed</div>
                        <div className={`text-[14px] font-medium ${(lead.finance_amount_disbursed || 0) > 0 ? "text-green-600" : ""}`}>
                          {inr(lead.finance_amount_disbursed || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-foreground">Payment History ({payments.length})</h3>
                    <button onClick={openAddPayment} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-line bg-white text-[11px] font-medium hover:bg-off transition-colors">
                      <Plus className="w-3 h-3" /> Add Payment
                    </button>
                  </div>
                  
                  {payments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line p-8 text-center">
                      <div className="text-[12px] text-muted-foreground">No payments recorded for this lead yet.</div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="bg-off/50 text-left text-muted-foreground border-b border-line">
                            <th className="px-4 py-2.5 font-semibold">Date</th>
                            <th className="px-4 py-2.5 font-semibold">Category / Type</th>
                            <th className="px-4 py-2.5 font-semibold">Mode</th>
                            <th className="px-4 py-2.5 font-semibold">Description</th>
                            <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
                            <th className="px-4 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {payments.map(p => (
                            <tr key={p.id} className="hover:bg-off/30 transition-colors align-top">
                              <td className="px-4 py-3 whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-foreground">{p.payment_category || p.payment_type}</div>
                                <div className="text-[10px] text-muted-foreground">{p.payment_type}</div>
                              </td>
                              <td className="px-4 py-3">{p.payment_mode || "—"}</td>
                              <td className="px-4 py-3 max-w-[200px]">
                                <div className="text-[11px] line-clamp-2">{p.payment_description || p.notes || "—"}</div>
                                {p.next_payment_expected_date && (
                                  <div className="text-[10px] text-amber-600 mt-1 font-medium">Next: {fmtDate(p.next_payment_expected_date)}</div>
                                )}
                              </td>
                              <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${p.payment_type === "Refund" ? "text-red-600" : "text-green-600"}`}>
                                {p.payment_type === "Refund" ? "-" : ""}{inr(p.amount)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button onClick={() => deletePayment(p.id)} className="p-1 hover:bg-red-50 hover:text-red-600 rounded transition-colors text-muted-foreground">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="onboarding" className="m-0 focus-visible:ring-0">
              <div className="p-6 space-y-6">
                {/* Linked Calling CRM Stage */}
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
                        <button onClick={repairCrmLink} disabled={linkingCrm} className="text-[11px] px-2 py-0.5 rounded border border-[#C7D2FE] bg-white text-[#3730A3] hover:bg-[#EEF2FF] disabled:opacity-50" title="Ensure this paid buyer has a linked CRM lead visible in Paid — Onboarding">
                          {linkingCrm ? "Repairing…" : "Repair CRM Link"}
                        </button>
                      </div>

                      {!lead.crm_lead_id ? (
                        <div className="space-y-2">
                          <div className="text-[12px] text-[#3730A3]">No linked Calling CRM lead found. Repair CRM Link will search by email/phone and create one in Paid — Onboarding if none exists.</div>
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

                {/* Access Verification Panel */}
                <AccessVerificationPanel
                  memberLabel={lead.name || undefined}
                  crmLeadId={lead.crm_lead_id || null}
                  paidPipelineLeadId={lead.id}
                  cocStatus={(lead as any).code_of_conduct_status || null}
                  currentStageName={stage || null}
                />

                {/* Batch information */}
                <Section title="Batch information">
                  {!editBatch ? (
                    <div>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Paid batch" value={lead.paid_batch_name || "—"} />
                        <Field label="Onboarding batch" value={lead.onboarding_batch_name || "—"} />
                        <Field label="Product / Program" value={lead.product_name_snapshot || "—"} />
                        <Field label="Revenue recognition" value={lead.revenue_recognition_rule || "Realized Revenue Only"} />
                      </div>
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

                {/* Visibility Debug (Admin Only) */}
                {isAdmin && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[13px] font-semibold text-foreground">Advanced Settings</h3>
                      <button 
                        onClick={() => setShowAdvanced(!showAdvanced)} 
                        className="text-[11px] font-medium text-blue-600 hover:underline"
                      >
                        {showAdvanced ? "Hide" : "Show"} Debug Tools
                      </button>
                    </div>
                    
                    {showAdvanced && (
                      <div className="rounded-lg border border-dashed border-[#C7D2FE] bg-[#EEF2FF]/30 px-3 py-2 text-[11px]">
                        <div className="font-semibold text-[#3730A3] flex items-center gap-2 mb-2">
                          <span>🔍 Visibility Debug (admin)</span>
                          {visibilityAudit && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                              visibilityAudit.status === "included" ? "bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]" : "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
                            }`}>{visibilityAudit.status}</span>
                          )}
                          <button onClick={loadAudit} className="ml-auto text-[10.5px] underline text-[#3730A3]">Refresh</button>
                        </div>
                        <div className="space-y-1 text-[11px] text-[#1E1B4B]">
                          {auditLoading && <div className="text-muted-foreground">Checking visibility…</div>}
                          {!auditLoading && visibilityAudit && (() => {
                            const a = visibilityAudit;
                            const shouldBeInKanban = !!(a.linkedPipelineType === "paid" && !a.isArchived && !a.isDeleted);
                            const row = (k: string, v: any) => (
                              <div className="flex items-baseline gap-2"><span className="text-muted-foreground w-44 shrink-0">{k}</span><span className="font-mono break-all">{v ?? "—"}</span></div>
                            );
                            return (
                              <>
                                <div className="text-[12px] font-medium mb-1">{a.reason}</div>
                                {row("paid_pipeline_lead_id", a.paidPipelineLeadId)}
                                {row("crm_lead_id", a.crmLeadId)}
                                {row("source_unpaid_lead_id", a.sourceUnpaidLeadId)}
                                {row("linked CRM pipeline", a.linkedPipelineName ? `${a.linkedPipelineName} (${a.linkedPipelineType || "?"})` : null)}
                                {row("linked CRM stage", a.linkedStageName)}
                                {row("archived", String(a.isArchived))}
                                {row("soft-deleted", String(a.isDeleted))}
                                {row("hidden from sales", String(a.hiddenFromSales))}
                                {row("owner", a.ownerId)}
                                {row("Kanban should include", shouldBeInKanban ? "yes" : "no")}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="documents" className="m-0 focus-visible:ring-0">
              <div className="p-6 space-y-6">
                <CodeOfConductPanel
                  paidLeadId={lead.id}
                  crmLeadId={lead.crm_lead_id || null}
                  memberName={lead.name || "Member"}
                  memberEmail={(lead as any).email || null}
                  memberPhone={(lead as any).phone || null}
                  programName={null}
                  dealValue={Number(lead.deal_value_including_gst || 0) || null}
                  evalSource="paid_pipeline"
                  evalPipelineId={crmPipelineId}
                  evalStageId={crmStageId}
                />
              </div>
            </TabsContent>

            <TabsContent value="offers & delivery" className="m-0 focus-visible:ring-0">
              <div className="p-6 space-y-6">
                <PromisedOffersPanel
                  paidPipelineLeadId={lead.id}
                  crmLeadId={lead.crm_lead_id || null}
                  title="Promised Offers"
                />

                <SuggestedNextActions
                  paidLeadId={lead.id}
                  crmLeadId={lead.crm_lead_id || null}
                  onApplied={() => { loadInner(); onChanged(); }}
                  onOpenFollowUp={() => setOpenFu(true)}
                  onOpenTokenPayment={openTokenPayment}
                />
              </div>
            </TabsContent>

            <TabsContent value="activity" className="m-0 focus-visible:ring-0">
              <div className="p-6">
                <div className="space-y-4">
                  {activity.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-[13px]">No activity logs found.</div>
                  ) : (
                    activity.map((a: any) => (
                      <div key={a.id} className="relative pl-6 pb-6 border-l border-line last:pb-0">
                        <div className="absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full bg-line" />
                        <div className="text-[11px] text-muted-foreground mb-1">{fmtDate(a.created_at)}</div>
                        <div className="text-[13px] font-medium">{a.summary || a.action_label || a.action_type}</div>
                        {a.old_values && (
                          <div className="mt-1.5 text-[11px] bg-off p-2 rounded border border-line">
                            <div className="flex gap-4">
                              <div className="flex-1">
                                <div className="text-muted-foreground uppercase font-bold text-[9px]">Previous</div>
                                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(a.old_values, null, 2)}</pre>
                              </div>
                              <div className="flex-1">
                                <div className="text-muted-foreground uppercase font-bold text-[9px]">New</div>
                                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(a.new_values, null, 2)}</pre>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
        {/* Sticky footer */}
        <div className="shrink-0 bg-white border-t border-line px-6 py-3 flex justify-end gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
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
      {sendOpsOpen && <SendPaidToOpsModal lead={lead as any} onClose={() => setSendOpsOpen(false)} onDone={() => onChanged()} />}
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
