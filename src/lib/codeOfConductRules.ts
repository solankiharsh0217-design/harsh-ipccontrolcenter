import { supabase } from "@/integrations/supabase/client";

export type CoCRuleSource = "crm" | "paid_pipeline";
export type CoCRuleMode = "suggest_only" | "auto_send";

export interface CodeOfConductRule {
  id: string;
  name: string;
  source: CoCRuleSource;
  pipeline_id: string;
  stage_id: string;
  template_id: string;
  mode: CoCRuleMode;
  link_expiry_days: number;
  tag_id_after_signed: string | null;
  stage_id_after_signed: string | null;
  notify_admin: boolean;
  notify_owner: boolean;
  is_active: boolean;
}

export async function loadActiveCoCRules(source?: CoCRuleSource): Promise<CodeOfConductRule[]> {
  let q = (supabase as any).from("code_of_conduct_rules").select("*").eq("is_active", true);
  if (source) q = q.eq("source", source);
  const { data } = await q;
  return (data || []) as CodeOfConductRule[];
}

export function findMatchingRule(
  rules: CodeOfConductRule[],
  source: CoCRuleSource,
  pipelineId: string | null | undefined,
  stageId: string | null | undefined,
): CodeOfConductRule | null {
  if (!pipelineId || !stageId) return null;
  return rules.find((r) => r.source === source && r.pipeline_id === pipelineId && r.stage_id === stageId && r.is_active) || null;
}

export interface EvaluateInput {
  source: CoCRuleSource;
  pipelineId: string | null | undefined;
  stageId: string | null | undefined;
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  memberName: string;
  memberEmail: string | null;
  memberPhone?: string | null;
  programName?: string | null;
  dealValue?: number | null;
}

export interface EvaluateResult {
  matched: boolean;
  rule: CodeOfConductRule | null;
  action: "none" | "suggested" | "auto_sent" | "duplicate_skipped" | "auto_send_failed" | "missing_email";
  message?: string;
  request?: any;
}

/** Check for an existing active (non-cancelled/expired) request for this lead+template. */
async function findExistingRequest(input: EvaluateInput, templateId: string): Promise<any | null> {
  let q = (supabase as any).from("code_of_conduct_requests")
    .select("id,status,sent_at,signed_at,token_expires_at,template_id,template_version")
    .eq("template_id", templateId)
    .in("status", ["draft", "ready_to_send", "sent", "viewed", "signed"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (input.paidPipelineLeadId) q = q.eq("paid_pipeline_lead_id", input.paidPipelineLeadId);
  else if (input.crmLeadId) q = q.eq("crm_lead_id", input.crmLeadId);
  else return null;
  const { data } = await q;
  return data?.[0] || null;
}

/**
 * Evaluate rules after a stage change. Logs a trigger_detected event when matched.
 * - suggest_only: returns { action: 'suggested' } so UI can show the banner.
 * - auto_send: dispatches one email if no active request exists yet.
 */
export async function evaluateStageTrigger(input: EvaluateInput): Promise<EvaluateResult> {
  const rules = await loadActiveCoCRules(input.source);
  const rule = findMatchingRule(rules, input.source, input.pipelineId, input.stageId);
  if (!rule) return { matched: false, rule: null, action: "none" };

  const existing = await findExistingRequest(input, rule.template_id);

  // Log trigger detected (best effort; depends on existing request to attach to)
  if (existing?.id) {
    try {
      await (supabase as any).from("code_of_conduct_events").insert({
        request_id: existing.id,
        event_type: "code_of_conduct_trigger_detected",
        metadata: { rule_id: rule.id, rule_name: rule.name, mode: rule.mode, source: input.source, stage_id: input.stageId },
      });
    } catch { /* ignore */ }
  }

  // Duplicate protection: never re-send for an already active/signed request
  if (existing && existing.status !== "expired" && existing.status !== "cancelled") {
    if (rule.mode === "auto_send") {
      return { matched: true, rule, action: "duplicate_skipped", message: `Already ${existing.status}`, request: existing };
    }
    return { matched: true, rule, action: "suggested", request: existing };
  }

  if (rule.mode === "suggest_only") {
    return { matched: true, rule, action: "suggested" };
  }

  // auto_send
  if (!input.memberEmail || !input.memberEmail.includes("@")) {
    return { matched: true, rule, action: "missing_email", message: "Cannot auto-send — member has no valid email." };
  }

  try {
    const { data, error } = await supabase.functions.invoke("send-code-of-conduct-email", {
      body: {
        paid_pipeline_lead_id: input.paidPipelineLeadId || undefined,
        crm_lead_id: input.crmLeadId || undefined,
        template_id: rule.template_id,
        member_name: input.memberName,
        member_email: input.memberEmail,
        member_phone: input.memberPhone || undefined,
        program_name: input.programName || undefined,
        deal_value: input.dealValue ?? undefined,
        origin: window.location.origin,
      },
    });
    if (error || !data?.ok) {
      return { matched: true, rule, action: "auto_send_failed", message: data?.message || error?.message || "Auto-send failed" };
    }
    if (data?.request_id) {
      try {
        await (supabase as any).from("code_of_conduct_events").insert({
          request_id: data.request_id,
          event_type: "code_of_conduct_email_auto_sent",
          metadata: { rule_id: rule.id, rule_name: rule.name },
        });
      } catch { /* ignore */ }
    }
    return { matched: true, rule, action: "auto_sent", request: data };
  } catch (e: any) {
    return { matched: true, rule, action: "auto_send_failed", message: e?.message || "Auto-send failed" };
  }
}

/** After-the-fact event logger for manual sends from UI. */
export async function logManualSendEvent(requestId: string | null | undefined, ruleId?: string | null) {
  if (!requestId) return;
  try {
    await (supabase as any).from("code_of_conduct_events").insert({
      request_id: requestId,
      event_type: "code_of_conduct_email_manual_sent",
      metadata: ruleId ? { rule_id: ruleId } : null,
    });
  } catch { /* ignore */ }
}

export async function logSuggestionShown(requestId: string | null | undefined, ruleId: string) {
  if (!requestId) return;
  try {
    await (supabase as any).from("code_of_conduct_events").insert({
      request_id: requestId,
      event_type: "code_of_conduct_email_suggested",
      metadata: { rule_id: ruleId },
    });
  } catch { /* ignore */ }
}
