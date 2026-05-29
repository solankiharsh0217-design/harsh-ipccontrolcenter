import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import EditMemberEmailModal from "./EditMemberEmailModal";
import { useAuth } from "@/context/AuthContext";
import { evaluateStageTrigger, loadActiveCoCRules, findMatchingRuleDetailed, normalizeCoCName, type CodeOfConductRule, type CoCRuleSource, type RuleMatchDiagnostics } from "@/lib/codeOfConductRules";
import { evaluatePostSendAutomation, getLastAutomationEvent, describeSkipReason, type PostSendAutomationResult } from "@/lib/codeOfConductAutomation";

const toast = ({ title, description, variant }: { title: string; description?: string; variant?: "destructive" }) => {
  if (variant === "destructive") sonnerToast.error(title, { description });
  else sonnerToast.success(title, { description });
};

interface Props {
  paidLeadId?: string | null;
  crmLeadId?: string | null;
  memberName: string;
  memberEmail?: string | null;
  memberPhone?: string | null;
  programName?: string | null;
  dealValue?: number | null;
  /** Trigger-rule evaluation context. When provided, the panel auto-evaluates rules on mount. */
  evalSource?: CoCRuleSource;
  evalPipelineId?: string | null;
  evalStageId?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  not_required: "bg-slate-100 text-slate-600 border-slate-200",
  required: "bg-amber-50 text-amber-800 border-amber-200",
  ready_to_send: "bg-blue-50 text-blue-700 border-blue-200",
  sent: "bg-indigo-50 text-indigo-700 border-indigo-200",
  viewed: "bg-violet-50 text-violet-700 border-violet-200",
  signed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expired: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
};
const STATUS_LABELS: Record<string, string> = {
  not_required: "Not Required", required: "Required", ready_to_send: "Ready to Send",
  sent: "Sent", viewed: "Viewed", signed: "Signed", expired: "Expired", cancelled: "Cancelled", failed: "Failed",
};

const normPhone = (v?: string | null) => (v || "").replace(/\D/g, "");

export default function CodeOfConductPanel(props: Props) {
  const { paidLeadId, crmLeadId, memberName, memberEmail, memberPhone, programName, dealValue, evalSource, evalPipelineId, evalStageId } = props;
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [req, setReq] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [emailOverride, setEmailOverride] = useState(memberEmail || "");
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [diag, setDiag] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editEmailOpen, setEditEmailOpen] = useState(false);
  const [matchedRule, setMatchedRule] = useState<CodeOfConductRule | null>(null);
  const [evalResult, setEvalResult] = useState<{ action: string; message?: string; at: string } | null>(null);
  const [evalRunning, setEvalRunning] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [resolvedPipelineId, setResolvedPipelineId] = useState<string | null>(evalPipelineId || null);
  const [resolvedPipelineName, setResolvedPipelineName] = useState<string | null>(null);
  const [resolvedStageId, setResolvedStageId] = useState<string | null>(evalStageId || null);
  const [resolvedStageName, setResolvedStageName] = useState<string | null>(null);
  const [resolvedCrmLeadId, setResolvedCrmLeadId] = useState<string | null>(crmLeadId || null);
  const [resolvedSourceLabel, setResolvedSourceLabel] = useState<string>(crmLeadId ? "CRM" : paidLeadId ? "Paid Pipeline fallback" : "No link");
  const [matchDiag, setMatchDiag] = useState<RuleMatchDiagnostics | null>(null);
  const [autoSendAttemptedKeys, setAutoSendAttemptedKeys] = useState<string[]>([]);
  const [postSend, setPostSend] = useState<PostSendAutomationResult | null>(null);
  const [postSendLast, setPostSendLast] = useState<any>(null);
  const [postSendBusy, setPostSendBusy] = useState(false);

  const adminReceiptUrl = (): string | null => (req ? `${window.location.origin}/code-of-conduct/receipt/${req.id}` : null);
  const adminSignedPdfUrl = (): string | null => (req ? `${window.location.origin}/code-of-conduct/signed-pdf/${req.id}` : null);

  const getStorageUrl = async (stored: string | null): Promise<string | null> => {
    if (!stored) return null;
    const m = stored.match(/(?:storage:|\/storage\/v1\/object\/(?:public|sign)\/)signed-code-of-conduct\/(.+?)(?:\?|$)/);
    const path = m ? decodeURIComponent(m[1]) : null;
    if (!path) return stored;
    const { data } = await supabase.storage.from("signed-code-of-conduct").createSignedUrl(path, 60 * 60 * 24 * 7);
    return data?.signedUrl || null;
  };
  const getStoragePdfUrl = async (): Promise<string | null> => req ? getStorageUrl(req.signed_pdf_url || null) : null;
  const getStorageReceiptUrl = async (): Promise<string | null> => {
    if (!req) return null;
    return getStorageUrl(req.signed_html_url || req.signed_receipt_url || null);
  };

  const ensureSignedPdf = async (): Promise<boolean> => {
    if (!req) return false;
    if (req.signed_pdf_url) return true;
    if (req.status !== "signed") { toast({ title: "Request is not signed yet", variant: "destructive" }); return false; }
    toast({ title: "Generating signed PDF…" });
    try {
      const { data, error } = await supabase.functions.invoke("code-of-conduct-public", { body: { action: "admin_regenerate_signed_pdf", request_id: req.id } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message || "Generation failed");
      await load();
      return true;
    } catch (e: any) {
      toast({ title: "Signed PDF generation failed", description: e?.message, variant: "destructive" });
      return false;
    }
  };

  const viewSignedPdf = async () => {
    if (!(await ensureSignedPdf())) return;
    const url = adminSignedPdfUrl();
    if (!url) { toast({ title: "Signed PDF not available yet", variant: "destructive" }); return; }
    window.open(url, "_blank");
    if (req) (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_viewed_by_admin" });
  };
  const viewHtmlReceipt = () => {
    const url = adminReceiptUrl();
    if (!url) { toast({ title: "Receipt not available yet", variant: "destructive" }); return; }
    window.open(url, "_blank");
  };
  const downloadSignedPdf = async () => {
    if (!req) return;
    if (!(await ensureSignedPdf())) return;
    try {
      const url = await getStoragePdfUrl();
      if (!url) { toast({ title: "Signed PDF link unavailable", description: req.signed_pdf_generation_error || undefined, variant: "destructive" }); return; }
      const resp = await fetch(url);
      const blob = new Blob([await resp.blob()], { type: "application/pdf" });
      const dl = URL.createObjectURL(blob);
      const safeName = (req.signed_member_name || req.member_name || "member").replace(/[^\w-]+/g, "_");
      const a = document.createElement("a");
      a.href = dl; a.download = `IPC-Code-of-Conduct-Signed-${safeName}-${req.id.slice(0,8)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(dl);
      (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_downloaded_by_admin" });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message, variant: "destructive" });
      if (req) (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_link_open_failed", metadata: { error: e?.message } });
    }
  };
  const copySignedPdfLink = async () => {
    if (!(await ensureSignedPdf())) return;
    const url = await getStoragePdfUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast({ title: "Temporary signed PDF link copied" });
    if (req) (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_link_copied", metadata: { scope: "temporary_pdf" } });
  };
  const copyMemberPdfLink = async () => {
    if (!(await ensureSignedPdf())) return;
    const url = await getStoragePdfUrl();
    if (!url) { toast({ title: "Signed copy not available yet", variant: "destructive" }); return; }
    await navigator.clipboard.writeText(url);
    toast({ title: "Temporary member PDF link copied (valid 7 days)" });
    if (req) (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_link_copied", metadata: { scope: "member_temp" } });
  };
  const sendSignedCopy = async (mode: "admin" | "member") => {
    if (!req) return;
    if (!(await ensureSignedPdf())) return;
    try {
      const { data, error } = await supabase.functions.invoke("send-coc-signed-copy", { body: { request_id: req.id, mode } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message);
      const result = mode === "admin" ? (data as any)?.results?.admin?.find((x: any) => x.ok) : (data as any)?.results?.member;
      toast({ title: `Signed PDF sent to ${result?.to || mode}`, description: result?.provider_message_id ? `Provider id: ${result.provider_message_id}` : undefined });
      load();
    } catch (e: any) { toast({ title: "Failed to send signed copy", description: e?.message, variant: "destructive" }); }
  };
  const regenPdf = async () => {
    if (!req) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("code-of-conduct-public", { body: { action: "admin_regenerate_signed_pdf", request_id: req.id } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message);
      toast({ title: "Signed PDF generated" });
      await load();
    } catch (e: any) { toast({ title: "Could not generate signed PDF", description: e?.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const regenReceipt = async () => {
    if (!req) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("code-of-conduct-public", { body: { action: "admin_regenerate_receipt", request_id: req.id } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message);
      toast({ title: "Signed copy generated" });
      await load();
    } catch (e: any) { toast({ title: "Could not generate signed copy", description: e?.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };


  const load = async () => {
    setLoading(true);
    let q = (supabase as any).from("code_of_conduct_requests").select("*").order("created_at", { ascending: false }).limit(1);
    if (paidLeadId && crmLeadId) q = q.or(`paid_pipeline_lead_id.eq.${paidLeadId},crm_lead_id.eq.${crmLeadId}`);
    else if (paidLeadId) q = q.eq("paid_pipeline_lead_id", paidLeadId);
    else if (crmLeadId) q = q.eq("crm_lead_id", crmLeadId);
    else { setLoading(false); return; }
    const { data } = await q;
    setReq(data?.[0] || null);
    setLoading(false);
  };

  const loadDiag = async () => {
    try {
      const { data } = await supabase.functions.invoke("send-code-of-conduct-email", { body: { action: "diagnostics" } });
      setDiag(data);
    } catch { /* ignore */ }
  };

  /** Resolve CRM pipeline/stage with paid→CRM fallback by link, email, then normalized phone. */
  const resolveContext = async (repair = false): Promise<{ source: CoCRuleSource; pipelineId: string | null; stageId: string | null; stageName: string | null; crmId: string | null; resolution: string } | null> => {
    let source = evalSource || (paidLeadId ? "paid_pipeline" : "crm");
    let pipelineId = evalPipelineId || null;
    let stageId = evalStageId || null;
    let stageName: string | null = null;
    let pipelineName: string | null = null;
    let crmId = crmLeadId || null;
    let resolution = crmId ? "CRM" : paidLeadId ? "Paid Pipeline fallback" : "No link";

    if (paidLeadId) {
      const { data: paid } = await (supabase as any).from("paid_pipeline_leads").select("id,name,email,phone,crm_lead_id").eq("id", paidLeadId).maybeSingle();
      crmId = crmId || (paid as any)?.crm_lead_id || null;
      if (!crmId) {
        const email = (paid as any)?.email || memberEmail || emailOverride || null;
        const phone = normPhone((paid as any)?.phone || memberPhone);
        let match: any = null;
        if (email) {
          const { data } = await supabase.from("leads").select("id,pipeline_id,stage_id,full_name,email,phone").ilike("email", email).is("archived_at", null).is("deleted_at", null).limit(1);
          match = data?.[0] || null;
        }
        if (!match && phone) {
          const { data } = await supabase.from("leads").select("id,pipeline_id,stage_id,full_name,email,phone").is("archived_at", null).is("deleted_at", null).limit(200);
          match = (data || []).find((l: any) => normPhone(l.phone) === phone) || null;
        }
        if (match?.id) {
          crmId = match.id;
          resolution = "CRM repaired by email/phone";
          await supabase.from("paid_pipeline_leads").update({ crm_lead_id: crmId } as any).eq("id", paidLeadId);
          await supabase.from("leads").update({ paid_pipeline_lead_id: paidLeadId } as any).eq("id", crmId);
          await (supabase as any).from("code_of_conduct_events").insert({ event_type: "code_of_conduct_crm_link_repaired_for_trigger", metadata: { crm_lead_id: crmId, paid_pipeline_lead_id: paidLeadId, manual_repair: repair } });
        }
      }
    }

    if ((!pipelineId || !stageId) && crmId) {
      const { data: lead } = await supabase.from("leads").select("pipeline_id, stage_id").eq("id", crmId).maybeSingle();
      pipelineId = pipelineId || (lead as any)?.pipeline_id || null;
      stageId = stageId || (lead as any)?.stage_id || null;
      resolution = resolution === "No link" ? "CRM" : resolution;
    }
    if (stageId) {
      const { data: s } = await supabase.from("stages").select("name").eq("id", stageId).maybeSingle();
      stageName = (s as any)?.name || null;
    }
    if (pipelineId) {
      const { data: p } = await supabase.from("pipelines").select("name").eq("id", pipelineId).maybeSingle();
      pipelineName = (p as any)?.name || null;
    }
    setResolvedCrmLeadId(crmId);
    setResolvedPipelineId(pipelineId);
    setResolvedPipelineName(pipelineName);
    setResolvedStageId(stageId);
    setResolvedStageName(stageName);
    setResolvedSourceLabel(resolution);
    return { source, pipelineId, stageId, stageName, crmId, resolution };
  };

  /** Evaluate rules; auto-fires once if mode=auto_send and no active request. */
  const runEvaluator = async (opts: { force?: boolean; verbose?: boolean } = {}): Promise<void> => {
    setEvalRunning(true);
    try {
      const ctx = await resolveContext(opts.force);
      if (!ctx) return;
      const { source, pipelineId, stageId, stageName, crmId } = ctx;
      if (!pipelineId || !stageId) {
        setMatchedRule(null);
        setMatchDiag(null);
        setDebugOpen(true);
        setEvalResult({ action: "missing_context", message: "Trigger cannot evaluate — CRM link/stage missing", at: new Date().toISOString() });
        if (opts.verbose) toast({ title: "No CRM stage to evaluate" });
        return;
      }
      const rules = await loadActiveCoCRules();
      const { rule: matched, diagnostics } = await findMatchingRuleDetailed({ rules, source, pipelineId, stageId, stageName, crmLeadId: crmId, paidPipelineLeadId: paidLeadId || null });
      setMatchDiag(diagnostics);
      setMatchedRule(matched);
      if (!matched) {
        const possible = diagnostics.possibleStageNameMatch || normalizeCoCName(stageName).includes("code of conduct");
        if (possible) setDebugOpen(true);
        setEvalResult({ action: "none", message: possible ? "This lead is in a possible trigger stage but no rule matched." : "No active rule matched", at: new Date().toISOString() });
        if (opts.verbose) toast({ title: "No active rule matched this lead's CRM stage", description: possible ? "Open Trigger Debug for mismatch details." : undefined });
        return;
      }
      const guardKey = `${crmId || "no-crm"}:${paidLeadId || "no-paid"}:${matched.id}:${matched.template_id}`;
      if (matched.mode === "auto_send" && autoSendAttemptedKeys.includes(guardKey) && !opts.force) {
        setEvalResult({ action: "duplicate_skipped", message: "Auto-send already attempted for this lead/rule/template in this drawer", at: new Date().toISOString() });
        return;
      }
      const res = await evaluateStageTrigger({
        source, pipelineId, stageId, stageName,
        crmLeadId: crmId || null,
        paidPipelineLeadId: paidLeadId || null,
        memberName, memberEmail: emailOverride || memberEmail || null,
        memberPhone: memberPhone || null, programName, dealValue,
      });
      setMatchedRule(res.rule || matched);
      if (res.diagnostics) setMatchDiag(res.diagnostics);
      setEvalResult({ action: res.action, message: res.message, at: new Date().toISOString() });
      if (matched.mode === "auto_send") setAutoSendAttemptedKeys((prev) => prev.includes(guardKey) ? prev : [...prev, guardKey]);
      if (opts.verbose) {
        const label = `Rule matched: ${matched.name}`;
        const detail = res.action === "auto_sent" ? "Auto-send dispatched" :
                       res.action === "duplicate_skipped" ? `Skipped: ${res.message}` :
                       res.action === "suggested" ? "Suggested (manual send required)" :
                       res.action === "auto_send_failed" ? `Auto-send failed: ${res.message}` :
                       res.action === "missing_email" ? "Missing email — cannot auto-send" : res.action;
        toast({ title: label, description: detail });
      }
      if (res.action === "auto_sent" || res.action === "duplicate_skipped") await load();
    } catch (e: any) {
      setEvalResult({ action: "error", message: e?.message || String(e), at: new Date().toISOString() });
      setDebugOpen(true);
      if (opts.verbose) toast({ title: "Trigger check failed", description: e?.message, variant: "destructive" });
    } finally {
      setEvalRunning(false);
    }
  };

  useEffect(() => { load(); loadDiag(); /* eslint-disable-next-line */ }, [paidLeadId, crmLeadId]);

  // After load resolves the request, evaluate trigger rules
  useEffect(() => {
    if (loading) return;
    // Only auto-evaluate when there's no active/signed request that already covers it
    const activeStatuses = ["sent", "viewed", "signed", "ready_to_send"];
    if (req && activeStatuses.includes(req.status)) {
      // Still resolve context for debug visibility
      resolveContext();
      return;
    }
    runEvaluator({ force: false, verbose: false });
    // eslint-disable-next-line
  }, [loading, req?.id, paidLeadId, crmLeadId, evalPipelineId, evalStageId, evalSource]);


  const tpl = diag?.template;
  const setupMissing: string[] = [];
  if (!diag?.has_resend_api_key) setupMissing.push("RESEND_API_KEY");
  if (!tpl?.from_email && !diag?.has_email_from_address) setupMissing.push("EMAIL_FROM_ADDRESS");
  if (!tpl?.from_name && !diag?.has_email_from_name) setupMissing.push("EMAIL_FROM_NAME");
  if (!tpl) setupMissing.push("template");
  else {
    if (!tpl.email_subject) setupMissing.push("email subject");
    if (!tpl.email_body) setupMissing.push("email body");
    if (!tpl.template_pdf_url && !tpl.html_content) setupMissing.push("PDF/HTML");
    if (!tpl.whatsapp_redirect_url) setupMissing.push("WhatsApp URL");
  }
  const setupComplete = setupMissing.length === 0;

  const requestSend = () => {
    if (!emailOverride || !emailOverride.includes("@")) { toast({ title: "Valid email required", variant: "destructive" }); return; }
    if (!setupComplete) { toast({ title: "Email setup incomplete", description: `Missing: ${setupMissing.join(", ")}`, variant: "destructive" }); return; }
    setConfirmOpen(true);
  };

  const refreshLastAutomation = async (requestId?: string | null) => {
    const id = requestId || req?.id;
    if (!id) return;
    try { setPostSendLast(await getLastAutomationEvent(id)); } catch { /* ignore */ }
  };

  const sendEmail = async () => {
    setConfirmOpen(false);
    setBusy(true);
    let sentOk = false;
    let resultRequestId: string | null = req?.id || null;
    try {
      const { data, error } = await supabase.functions.invoke("send-code-of-conduct-email", {
        body: {
          request_id: req?.id || undefined,
          paid_pipeline_lead_id: paidLeadId || undefined,
          crm_lead_id: resolvedCrmLeadId || crmLeadId || undefined,
          member_name: memberName, member_email: emailOverride, member_phone: memberPhone,
          program_name: programName, deal_value: dealValue,
          origin: window.location.origin,
        },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false) throw new Error(`[${res.error_code}] ${res.message}`);
      if (res?.signing_url) setSigningUrl(res.signing_url);
      sentOk = true;
      resultRequestId = res?.request_id || resultRequestId;
    } catch (e: any) {
      toast({ title: "Code of Conduct email failed. Stage was not changed.", description: e?.message || "Unknown error", variant: "destructive" });
      await load();
      setBusy(false);
      return;
    }

    await load();

    // Run post-send automation only after a confirmed successful send
    if (sentOk && resultRequestId) {
      try {
        const automation = await evaluatePostSendAutomation({ requestId: resultRequestId });
        setPostSend(automation);
        await refreshLastAutomation(resultRequestId);
        if (automation.status === "applied") {
          toast({ title: `Code of Conduct email sent. Lead moved to ${automation.newStageName || "destination stage"}.` });
        } else if (automation.status === "no_match") {
          toast({ title: "Code of Conduct email sent. No stage automation rule matched." });
        } else if (automation.status === "skipped") {
          toast({ title: `Code of Conduct email sent. Stage not changed (${describeSkipReason(automation.skipReason)}).` });
        } else if (automation.status === "failed") {
          toast({ title: "Code of Conduct email sent, but stage automation failed. Check debug.", description: automation.errorMessage, variant: "destructive" });
        }
      } catch (e: any) {
        toast({ title: "Code of Conduct email sent, but stage automation failed. Check debug.", description: e?.message, variant: "destructive" });
      }
    } else {
      toast({ title: `Code of Conduct email sent to ${emailOverride}` });
    }
    setBusy(false);
  };

  const cancel = async () => {
    if (!req) return;
    if (!confirm("Cancel this signing request? The link will stop working.")) return;
    await (supabase as any).from("code_of_conduct_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", req.id);
    await (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "request_cancelled" });
    toast({ title: "Request cancelled" });
    setSigningUrl(null);
    load();
  };

  const copyLink = async () => {
    if (!signingUrl) return;
    await navigator.clipboard.writeText(signingUrl);
    toast({ title: "Signing link copied" });
    if (req) await (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signing_link_copied_by_admin" });
  };

  const isFailed = !!req?.last_email_error_code;
  const ruleActive = matchedRule && (!req || ["expired", "cancelled"].includes(req.status));
  let displayStatus = isFailed ? "failed" : (req?.status || "not_required");
  let displayLabel = STATUS_LABELS[displayStatus];
  if (!req && ruleActive) {
    displayStatus = "required";
    displayLabel = matchedRule!.mode === "auto_send"
      ? (evalRunning ? "Auto-send Pending…" : (evalResult?.action === "auto_send_failed" ? "Auto-send Failed" : "Required (auto-send)"))
      : "Required";
  } else if (!req && evalResult?.action === "missing_email") {
    displayStatus = "required";
    displayLabel = "Required — Email Missing";
  } else if (!req && ["missing_context", "error", "auto_send_failed"].includes(evalResult?.action || "")) {
    displayStatus = "failed";
    displayLabel = evalResult?.action === "missing_context" ? "Trigger Link Missing" : "Trigger Check Failed";
  } else if (!req && evalResult?.message?.includes("possible trigger stage")) {
    displayStatus = "required";
    displayLabel = "Trigger Mismatch";
  }
  const cls = STATUS_STYLES[displayStatus] || STATUS_STYLES.not_required;
  const sendDisabled = busy || !setupComplete;
  const effectiveEmail = emailOverride || memberEmail || "";
  const effectiveEmailValid = effectiveEmail.includes("@");

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">📜 Code of Conduct</div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${cls}`}>{displayLabel}</span>
          {matchedRule && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-violet-50 text-violet-700 border-violet-200" title={`Rule: ${matchedRule.name}`}>
              {matchedRule.mode === "auto_send" ? "Auto-send rule" : "Suggest rule"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {req?.template_version && <span className="text-[10.5px] text-slate-400">v{req.template_version}</span>}
          {isAdmin && (
            <>
              <button onClick={() => runEvaluator({ force: true, verbose: true })} disabled={evalRunning}
                className="text-[10.5px] px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
                title="Re-evaluate trigger rules for this lead">{evalRunning ? "Checking…" : "Run Trigger Check"}</button>
              <button onClick={() => runEvaluator({ force: true, verbose: true })} disabled={evalRunning}
                className="text-[10.5px] px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
                title="Repair the paid/CRM link by email or phone, then run the trigger check">Repair Link + Check</button>
            </>
          )}
        </div>
      </div>

      {isAdmin && !req && evalResult?.message?.includes("possible trigger stage") && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11.5px] text-amber-900">
          <div className="font-medium">This lead is in a possible trigger stage but no rule matched.</div>
          <div className="opacity-80">Open Trigger Debug below to compare the current stage/source against active rules.</div>
        </div>
      )}

      {ruleActive && (
        <div className={`mb-3 rounded-md border p-2.5 text-[11.5px] ${matchedRule!.mode === "auto_send" ? "bg-violet-50 border-violet-200 text-violet-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
          <div className="font-medium">
            {matchedRule!.mode === "auto_send" ? "Auto-send rule matched" : "Code of Conduct required"}
          </div>
          <div className="opacity-80">Rule: {matchedRule!.name}{evalResult?.action === "auto_send_failed" ? ` — ${evalResult.message}` : ""}</div>
        </div>
      )}

      {!setupComplete && diag && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11.5px] text-amber-900">
          <div className="font-medium">Email setup incomplete</div>
          <div className="opacity-80">Missing: {setupMissing.join(", ")}</div>
          <Link to="/admin-center/code-of-conduct" className="inline-block mt-1.5 text-[11.5px] font-medium underline">Open Email Setup →</Link>
        </div>
      )}

      {loading ? (
        <div className="text-[12px] text-slate-500">Loading…</div>
      ) : !req ? (
        <div className="space-y-2.5">
          <p className="text-[12px] text-slate-600">
            {ruleActive
              ? (matchedRule!.mode === "auto_send"
                  ? "An active auto-send rule matches this lead. The email is being dispatched automatically."
                  : "An active rule requires sending the Code of Conduct for this stage.")
              : evalResult?.action === "missing_context"
                ? "Trigger cannot evaluate because the CRM link or stage is missing. Repair the link, then run the trigger check."
                : evalResult?.message?.includes("possible trigger stage")
                  ? "This lead appears to be in a Code of Conduct trigger stage, but the saved rule did not match the resolved source/pipeline/stage."
                  : "No active Code of Conduct rule truly matches this lead yet."}
          </p>
          <input type="email" value={emailOverride} onChange={(e) => setEmailOverride(e.target.value)}
            className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-[12.5px]" placeholder="Member email" />
          <button onClick={requestSend} disabled={sendDisabled} className="ipc-btn ipc-btn-black !h-9 w-full disabled:opacity-50">
            {busy ? "Sending…" : "Send Code of Conduct Email"}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2 text-[11.5px]">
            <Cell label="Sent" value={req.sent_at ? new Date(req.sent_at).toLocaleString() : "—"} />
            <Cell label="Viewed" value={req.viewed_at ? new Date(req.viewed_at).toLocaleString() : "—"} />
            <Cell label="Signed" value={req.signed_at ? new Date(req.signed_at).toLocaleString() : "—"} />
            <Cell label="Expires" value={req.token_expires_at ? new Date(req.token_expires_at).toLocaleDateString() : "—"} />
            <Cell label="Member email" value={req.signed_member_email || req.member_email} />
            {req.signature_name && <Cell label="Signed by" value={req.signature_name} />}
            {req.corrected_contact_email && <Cell label="Corrected contact" value={req.corrected_contact_email} />}
            <Cell label="Request id" value={req.id.slice(0, 8)} />
          </div>
          {isFailed && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
              <div className="font-medium">Email failed</div>
              <div className="opacity-80">[{req.last_email_error_code}] {req.last_email_error}</div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {req.status === "signed" ? (
              <>
                <button onClick={viewSignedPdf} className="ipc-btn ipc-btn-black !h-8">View Signed PDF</button>
                {req.signed_pdf_url ? (
                  <button onClick={downloadSignedPdf} className="ipc-btn ipc-btn-ghost !h-8">Download PDF</button>
                ) : (
                  <button onClick={regenPdf} disabled={busy} className="ipc-btn ipc-btn-ghost !h-8 disabled:opacity-50">{busy ? "Generating…" : "Generate Signed PDF"}</button>
                )}
                {req.signed_pdf_generation_error && <div className="basis-full text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">PDF error: {req.signed_pdf_generation_error}</div>}
                <SignedMoreMenu
                  onCopyPdf={copySignedPdfLink}
                  onCopyMember={copyMemberPdfLink}
                  onSendAdmin={() => sendSignedCopy("admin")}
                  onSendMember={() => sendSignedCopy("member")}
                  onViewReceipt={viewHtmlReceipt}
                  onEditEmail={() => setEditEmailOpen(true)}
                  onRegenPdf={regenPdf}
                  onRegenReceipt={regenReceipt}
                  hasPdf={!!req.signed_pdf_url}
                  hasReceipt={!!(req.signed_html_url || req.signed_receipt_url)}
                />
              </>
            ) : req.status === "cancelled" || req.status === "expired" ? (
              <>
                <button onClick={requestSend} disabled={sendDisabled} className="ipc-btn ipc-btn-black !h-8 disabled:opacity-50">
                  {busy ? "Sending…" : "Resend New Link"}
                </button>
                <button onClick={() => setEditEmailOpen(true)} className="ipc-btn ipc-btn-ghost !h-8">Change Email & Resend</button>
              </>
            ) : (
              <>
                <button onClick={requestSend} disabled={sendDisabled} className="ipc-btn ipc-btn-black !h-8 disabled:opacity-50">
                  {busy ? "Sending…" : isFailed ? "Retry Send" : req.status === "sent" || req.status === "viewed" ? "Resend Email" : "Send Email"}
                </button>
                <button onClick={() => setEditEmailOpen(true)} className="ipc-btn ipc-btn-ghost !h-8">Edit Email</button>
                {signingUrl && (
                  <button onClick={copyLink} className="ipc-btn ipc-btn-ghost !h-8">Copy Signing Link</button>
                )}
                <button onClick={cancel} className="ipc-btn ipc-btn-ghost !h-8">Cancel</button>
              </>
            )}
          </div>
          {!signingUrl && (req.status === "sent" || req.status === "viewed" || isFailed) && (
            <div className="text-[10.5px] text-slate-400">Tip: click {isFailed ? "Retry Send" : "Resend Email"} to also receive a fresh copyable signing link.</div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="mt-3 border-t border-slate-200 pt-2">
          <button onClick={() => setDebugOpen((v) => !v)} className="text-[10.5px] uppercase tracking-wider text-slate-500 hover:text-slate-700">
            {debugOpen ? "▾" : "▸"} Trigger Debug
          </button>
          {debugOpen && (
            <div className="mt-1.5 rounded-md border border-slate-200 bg-white p-2 text-[10.5px] text-slate-600 space-y-1 font-mono overflow-x-auto">
              <div className="font-sans font-semibold text-slate-800">Lead</div>
              <div>Name: {memberName || "—"}</div>
              <div>paid_pipeline_lead_id: {paidLeadId || "—"}</div>
              <div>crm_lead_id: {resolvedCrmLeadId || crmLeadId || "—"}</div>
              <div>Email: {emailOverride || memberEmail || "—"}</div>
              <div>Phone: {memberPhone || "—"}</div>
              <div className="font-sans font-semibold text-slate-800 pt-1">Resolved current state</div>
              <div>Resolved source: {resolvedSourceLabel}</div>
              <div>Evaluator source: {evalSource || (paidLeadId ? "paid_pipeline" : "crm")}</div>
              <div>Current pipeline: {resolvedPipelineName || "—"} ({resolvedPipelineId || "—"})</div>
              <div>Current stage: {resolvedStageName || "—"} ({resolvedStageId || "—"})</div>
              <div className="font-sans font-semibold text-slate-800 pt-1">Rule evaluation</div>
              <div>Active rules loaded: {matchDiag?.activeRulesCount ?? "—"}</div>
              <div>Matched rule: {matchedRule ? `Yes — ${matchedRule.name}` : "No"}</div>
              <div>Matched by: {matchDiag?.matchedBy || "—"}</div>
              <div>Stage name fallback used: {matchDiag?.stageNameFallbackUsed ? "yes" : "no"}</div>
              {matchedRule && (<>
                <div>Rule source: {matchedRule.source} · pipeline_id: {matchedRule.pipeline_id} · stage_id: {matchedRule.stage_id}</div>
                <div>Mode: {matchedRule.mode} · expiry: {matchedRule.link_expiry_days}d</div>
              </>)}
              {(matchDiag?.comparisons || []).slice(0, 6).map((c) => (
                <div key={c.rule_id} className="border-t border-slate-100 pt-1 mt-1">
                  Rule compare: {c.rule_name} · source {c.source_match ? "✓" : "✕"} · pipeline {c.pipeline_match ? "✓" : "✕"} · stage_id {c.stage_match ? "✓" : "✕"} · stage_name {c.stage_name_match ? "✓" : "✕"} ({c.stage_name || "—"})
                </div>
              ))}
              <div className="font-sans font-semibold text-slate-800 pt-1">Request state</div>
              <div>Existing request: {req ? `${req.status} (${req.id.slice(0,8)})` : "none"}</div>
              <div>Last send attempt: {req?.last_email_attempt_at ? new Date(req.last_email_attempt_at).toLocaleString() : "—"}</div>
              <div>Last error: {req?.last_email_error || evalResult?.message || "—"}</div>
              <div className="font-sans font-semibold text-slate-800 pt-1">Auto-send</div>
              <div>Eligible: {matchedRule?.mode === "auto_send" && effectiveEmailValid && !req ? "yes" : "no"}</div>
              <div>Reason if no: {req ? `existing request ${req.status}` : !effectiveEmailValid ? "missing email" : matchedRule?.mode !== "auto_send" ? "no auto-send rule matched" : "—"}</div>
              <div>Attempted keys: {autoSendAttemptedKeys.length ? autoSendAttemptedKeys.join(" | ") : "—"}</div>
              <div>Last evaluator: {evalResult ? `${evalResult.action}${evalResult.message ? ` — ${evalResult.message}` : ""} @ ${new Date(evalResult.at).toLocaleTimeString()}` : "—"}</div>
            </div>
          )}
        </div>
      )}

      {req && (
        <EditMemberEmailModal
          open={editEmailOpen}
          onClose={() => setEditEmailOpen(false)}
          requestId={req.id}
          currentEmail={req.member_email || ""}
          isSigned={req.status === "signed"}
          onUpdated={load}
        />
      )}

      {confirmOpen && tpl && (() => {
        const sFromEmail = diag?.resolved_from_email || tpl.from_email || "";
        const sFromName = diag?.resolved_from_name || tpl.from_name || "";
        const sReplyTo = diag?.resolved_reply_to || tpl.reply_to_email || "—";
        const looksUnverified = !sFromEmail || sFromEmail === "onboarding@resend.dev";
        return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-xl border border-line w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-3">Send Code of Conduct Email?</div>
            <div className="space-y-1.5 text-[12.5px]">
              <Row k="Member" v={memberName} />
              <Row k="Member email" v={emailOverride} />
              <Row k="Sender email" v={sFromEmail || "—"} />
              <Row k="Sender name" v={sFromName || "—"} />
              <Row k="Reply-to" v={sReplyTo} />
              <Row k="Template" v={`${tpl.name || "—"}${tpl.version ? ` v${tpl.version}` : ""}`} />
              <Row k="Link expiry" v={`${tpl.expiry_days || 7} days`} />
            </div>
            {looksUnverified && (
              <div className="mt-3 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                This sender may not deliver to all recipients. Use a verified Resend domain sender for real members.
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setConfirmOpen(false)} className="ipc-btn ipc-btn-ghost">Cancel</button>
              <button onClick={sendEmail} className="ipc-btn ipc-btn-black">Send Email</button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-[12px] text-slate-700 truncate" title={value}>{value}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-slate-800 text-right truncate" title={v}>{v}</span>
    </div>
  );
}

function SignedMoreMenu(props: {
  onCopyPdf: () => void; onCopyMember: () => void; onViewReceipt: () => void;
  onSendAdmin: () => void; onSendMember: () => void;
  onEditEmail: () => void; onRegenPdf: () => void; onRegenReceipt: () => void; hasPdf: boolean; hasReceipt: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="ipc-btn ipc-btn-ghost !h-8" aria-label="More actions">More ▾</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 bg-white border border-line rounded-md shadow-lg w-56 py-1 text-[12.5px]">
            <MenuItem onClick={close(props.onCopyPdf)} disabled={!props.hasPdf}>Copy Signed PDF Link</MenuItem>
            <MenuItem onClick={close(props.onCopyMember)} disabled={!props.hasPdf}>Copy Member PDF Link</MenuItem>
            <div className="border-t border-line my-1" />
            <MenuItem onClick={close(props.onSendAdmin)}>Send Signed PDF to Admin</MenuItem>
            <MenuItem onClick={close(props.onSendMember)}>Send Signed PDF to Member</MenuItem>
            <div className="border-t border-line my-1" />
            <MenuItem onClick={close(props.onViewReceipt)} disabled={!props.hasReceipt}>View HTML Receipt</MenuItem>
            <MenuItem onClick={close(props.onRegenPdf)}>Regenerate Signed PDF</MenuItem>
            <MenuItem onClick={close(props.onRegenReceipt)}>Regenerate HTML Receipt</MenuItem>
            <MenuItem onClick={close(props.onEditEmail)}>Edit Contact Email</MenuItem>
          </div>
        </>
      )}
    </div>
  );
}
function MenuItem({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white">{children}</button>
  );
}
