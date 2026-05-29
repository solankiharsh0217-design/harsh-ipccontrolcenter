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

export interface RuleMatchDiagnostics {
  activeRulesCount: number;
  candidateSources: CoCRuleSource[];
  currentPipelineId: string | null;
  currentStageId: string | null;
  currentStageName: string | null;
  matchedBy: "id" | "stage_name" | null;
  stageNameFallbackUsed: boolean;
  possibleStageNameMatch: boolean;
  comparisons: Array<{
    rule_id: string;
    rule_name: string;
    source: CoCRuleSource;
    source_match: boolean;
    pipeline_id: string | null;
    pipeline_match: boolean;
    stage_id: string | null;
    stage_match: boolean;
    stage_name: string | null;
    stage_name_match: boolean;
  }>;
}

export async function loadActiveCoCRules(source?: CoCRuleSource): Promise<CodeOfConductRule[]> {
  let q = (supabase as any).from("code_of_conduct_rules").select("*").eq("is_active", true);
  if (source) q = q.eq("source", source);
  const { data } = await q;
  return (data || []) as CodeOfConductRule[];
}

export const normalizeCoCName = (v: string | null | undefined) =>
  (v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

export function getCandidateSources(input: { source?: CoCRuleSource | null; crmLeadId?: string | null; paidPipelineLeadId?: string | null }): CoCRuleSource[] {
  const out: CoCRuleSource[] = [];
  if (input.source) out.push(input.source);
  if (input.paidPipelineLeadId) out.push("paid_pipeline");
  if (input.crmLeadId) out.push("crm");
  return Array.from(new Set(out));
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

async function loadStageNames(stageIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = Array.from(new Set(stageIds.filter(Boolean) as string[]));
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("stages").select("id,name").in("id", ids);
  return new Map((data || []).map((s: any) => [s.id, s.name || ""]));
}

export async function findMatchingRuleDetailed(args: {
  rules: CodeOfConductRule[];
  source: CoCRuleSource;
  pipelineId: string | null | undefined;
  stageId: string | null | undefined;
  stageName?: string | null;
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
}): Promise<{ rule: CodeOfConductRule | null; diagnostics: RuleMatchDiagnostics }> {
  const candidateSources = getCandidateSources(args);
  const stageNameMap = await loadStageNames([args.stageId, ...args.rules.map((r) => r.stage_id)]);
  const currentStageName = args.stageName || (args.stageId ? stageNameMap.get(args.stageId) || null : null);
  const currentStageNorm = normalizeCoCName(currentStageName);
  const comparisons = args.rules.map((r) => {
    const ruleStageName = stageNameMap.get(r.stage_id) || null;
    return {
      rule_id: r.id,
      rule_name: r.name,
      source: r.source,
      source_match: candidateSources.includes(r.source),
      pipeline_id: r.pipeline_id || null,
      pipeline_match: !!args.pipelineId && r.pipeline_id === args.pipelineId,
      stage_id: r.stage_id || null,
      stage_match: !!args.stageId && r.stage_id === args.stageId,
      stage_name: ruleStageName,
      stage_name_match: !!currentStageNorm && normalizeCoCName(ruleStageName) === currentStageNorm,
    };
  });

  const byId = args.rules.find((r) =>
    r.is_active && candidateSources.includes(r.source) && !!args.pipelineId && !!args.stageId && r.pipeline_id === args.pipelineId && r.stage_id === args.stageId
  ) || null;
  const byStageName = byId ? null : args.rules.find((r) => {
    const ruleStageName = stageNameMap.get(r.stage_id) || null;
    return r.is_active && candidateSources.includes(r.source) && !!currentStageNorm && normalizeCoCName(ruleStageName) === currentStageNorm;
  }) || null;
  const rule = byId || byStageName;
  const diagnostics: RuleMatchDiagnostics = {
    activeRulesCount: args.rules.length,
    candidateSources,
    currentPipelineId: args.pipelineId || null,
    currentStageId: args.stageId || null,
    currentStageName,
    matchedBy: byId ? "id" : byStageName ? "stage_name" : null,
    stageNameFallbackUsed: !!byStageName,
    possibleStageNameMatch: comparisons.some((c) => c.stage_name_match),
    comparisons,
  };
  return { rule, diagnostics };
}

export interface EvaluateInput {
  source: CoCRuleSource;
  pipelineId: string | null | undefined;
  stageId: string | null | undefined;
  stageName?: string | null;
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
  diagnostics?: RuleMatchDiagnostics;
}

async function logCoCEvent(event_type: string, input: Partial<EvaluateInput>, metadata: Record<string, any> = {}, request_id?: string | null) {
  try {
    await (supabase as any).from("code_of_conduct_events").insert({
      request_id: request_id || null,
      event_type,
      metadata: {
        ...metadata,
        crm_lead_id: input.crmLeadId || null,
        paid_pipeline_lead_id: input.paidPipelineLeadId || null,
      },
    });
  } catch { /* best effort */ }
}

/** Check for an existing active (non-cancelled/expired) request for this lead+template. */
async function findExistingRequest(input: EvaluateInput, templateId: string): Promise<any | null> {
  const base = (supabase as any).from("code_of_conduct_requests")
    .select("id,status,sent_at,signed_at,token_expires_at,template_id,template_version,crm_lead_id,paid_pipeline_lead_id,last_email_attempt_at,last_email_error,last_email_error_code")
    .eq("template_id", templateId)
    .in("status", ["draft", "ready_to_send", "sent", "viewed", "signed"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (input.paidPipelineLeadId && input.crmLeadId) {
    const { data } = await base.or(`paid_pipeline_lead_id.eq.${input.paidPipelineLeadId},crm_lead_id.eq.${input.crmLeadId}`);
    return data?.[0] || null;
  }
  let q = base;
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
  await logCoCEvent("code_of_conduct_trigger_evaluation_started", input, {
    source: input.source,
    pipeline_id: input.pipelineId || null,
    stage_id: input.stageId || null,
    stage_name: input.stageName || null,
    candidate_sources: getCandidateSources(input),
  });

  if (!input.pipelineId || !input.stageId) {
    await logCoCEvent("code_of_conduct_trigger_match_failed_missing_crm_link", input, { reason: "missing_pipeline_or_stage" });
    return { matched: false, rule: null, action: "none", message: "Trigger cannot evaluate — CRM link/stage missing." };
  }

  const rules = await loadActiveCoCRules();
  const { rule, diagnostics } = await findMatchingRuleDetailed({
    rules,
    source: input.source,
    pipelineId: input.pipelineId,
    stageId: input.stageId,
    stageName: input.stageName,
    crmLeadId: input.crmLeadId,
    paidPipelineLeadId: input.paidPipelineLeadId,
  });
  if (!rule) {
    await logCoCEvent("code_of_conduct_trigger_not_matched", input, { diagnostics });
    return { matched: false, rule: null, action: "none", message: diagnostics.possibleStageNameMatch ? "Possible stage-name match found, but source/pipeline did not fully match." : "No active rule matched.", diagnostics };
  }

  await logCoCEvent("code_of_conduct_trigger_matched", input, { rule_id: rule.id, rule_name: rule.name, mode: rule.mode, matched_by: diagnostics.matchedBy, diagnostics });
  if (diagnostics.stageNameFallbackUsed) {
    await logCoCEvent("code_of_conduct_trigger_matched_by_stage_name_fallback", input, { rule_id: rule.id, rule_name: rule.name, diagnostics });
  }

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
    await logCoCEvent("code_of_conduct_auto_send_skipped_existing_request", input, { rule_id: rule.id, rule_name: rule.name, existing_status: existing.status }, existing.id);
    if (rule.mode === "auto_send") {
      return { matched: true, rule, action: "duplicate_skipped", message: `Already ${existing.status}`, request: existing, diagnostics };
    }
    return { matched: true, rule, action: "suggested", request: existing, diagnostics };
  }

  if (rule.mode === "suggest_only") {
    return { matched: true, rule, action: "suggested", diagnostics };
  }

  // auto_send
  if (!input.memberEmail || !input.memberEmail.includes("@")) {
    await logCoCEvent("code_of_conduct_auto_send_blocked_missing_email", input, { rule_id: rule.id, rule_name: rule.name });
    return { matched: true, rule, action: "missing_email", message: "Cannot auto-send — member has no valid email.", diagnostics };
  }

  try {
    await logCoCEvent("code_of_conduct_auto_send_started", input, { rule_id: rule.id, rule_name: rule.name });
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
      await logCoCEvent("code_of_conduct_auto_send_failed", input, { rule_id: rule.id, rule_name: rule.name, error: data?.message || error?.message || "Auto-send failed" });
      return { matched: true, rule, action: "auto_send_failed", message: data?.message || error?.message || "Auto-send failed", diagnostics };
    }
    if (data?.request_id) {
      try {
        await (supabase as any).from("code_of_conduct_events").insert({
          request_id: data.request_id,
          event_type: "code_of_conduct_email_auto_sent",
          metadata: { rule_id: rule.id, rule_name: rule.name },
        });
      } catch { /* ignore */ }
      // Run post-send stage automation (non-fatal)
      try {
        const { evaluatePostSendAutomation } = await import("./codeOfConductAutomation");
        await evaluatePostSendAutomation({ requestId: data.request_id });
      } catch { /* ignore */ }
    }
    return { matched: true, rule, action: "auto_sent", request: data, diagnostics };
  } catch (e: any) {
    await logCoCEvent("code_of_conduct_auto_send_failed", input, { rule_id: rule.id, rule_name: rule.name, error: e?.message || "Auto-send failed" });
    return { matched: true, rule, action: "auto_send_failed", message: e?.message || "Auto-send failed", diagnostics };
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
