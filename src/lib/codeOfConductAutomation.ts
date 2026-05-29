import { supabase } from "@/integrations/supabase/client";

export type PostSendEventType = "email_sent";

export interface PostSendRule {
  id: string;
  name: string;
  event_type: string;
  template_id: string | null;
  source_type: "crm" | "paid_pipeline" | "both";
  current_pipeline_id: string | null;
  current_stage_id: string | null;
  destination_pipeline_id: string;
  destination_stage_id: string;
  also_update_paid_pipeline_stage: boolean;
  destination_paid_pipeline_stage: string | null;
  allow_repeat: boolean;
  is_active: boolean;
}

export type AutomationStatus = "applied" | "skipped" | "failed" | "no_match";

export interface PostSendAutomationResult {
  status: AutomationStatus;
  ruleId?: string;
  ruleName?: string;
  oldPipelineId?: string | null;
  oldStageId?: string | null;
  oldStageName?: string | null;
  newPipelineId?: string | null;
  newStageId?: string | null;
  newStageName?: string | null;
  skipReason?: string;
  errorMessage?: string;
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  dryRun?: boolean;
}

const normPhone = (v?: string | null) => (v || "").replace(/\D/g, "");

async function logEvent(args: {
  requestId?: string | null;
  ruleId?: string | null;
  eventType: string;
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  oldPipelineId?: string | null;
  oldStageId?: string | null;
  newPipelineId?: string | null;
  newStageId?: string | null;
  status: "applied" | "skipped" | "failed";
  skipReason?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, any>;
  createdBy?: string | null;
}) {
  try {
    await (supabase as any).from("code_of_conduct_automation_events").insert({
      request_id: args.requestId || null,
      rule_id: args.ruleId || null,
      event_type: args.eventType,
      crm_lead_id: args.crmLeadId || null,
      paid_pipeline_lead_id: args.paidPipelineLeadId || null,
      old_pipeline_id: args.oldPipelineId || null,
      old_stage_id: args.oldStageId || null,
      new_pipeline_id: args.newPipelineId || null,
      new_stage_id: args.newStageId || null,
      status: args.status,
      skip_reason: args.skipReason || null,
      error_message: args.errorMessage || null,
      metadata: args.metadata || null,
      created_by: args.createdBy || null,
    });
  } catch { /* best effort */ }

  // Mirror to existing code_of_conduct_events for unified audit feed
  try {
    const evMap: Record<string, string> = {
      applied: "coc_post_send_stage_moved",
      skipped: "coc_post_send_stage_move_skipped",
      failed: "coc_post_send_stage_move_failed",
    };
    await (supabase as any).from("code_of_conduct_events").insert({
      request_id: args.requestId || null,
      event_type: evMap[args.status] || "coc_post_send_stage_move",
      metadata: {
        rule_id: args.ruleId || null,
        crm_lead_id: args.crmLeadId || null,
        paid_pipeline_lead_id: args.paidPipelineLeadId || null,
        old_stage_id: args.oldStageId || null,
        new_stage_id: args.newStageId || null,
        skip_reason: args.skipReason || null,
        error: args.errorMessage || null,
        ...(args.metadata || {}),
      },
    });
  } catch { /* best effort */ }
}

async function resolveLinkedCrmLead(req: any): Promise<{ leadId: string | null; via: string }> {
  if (req?.crm_lead_id) return { leadId: req.crm_lead_id, via: "request" };
  if (req?.paid_pipeline_lead_id) {
    const { data: paid } = await (supabase as any)
      .from("paid_pipeline_leads")
      .select("id,email,phone,crm_lead_id")
      .eq("id", req.paid_pipeline_lead_id)
      .maybeSingle();
    if ((paid as any)?.crm_lead_id) return { leadId: (paid as any).crm_lead_id, via: "paid_link" };
    const email = (paid as any)?.email || req?.member_email || null;
    const phone = normPhone((paid as any)?.phone || req?.member_phone);
    if (email) {
      const { data } = await supabase.from("leads").select("id").ilike("email", email).is("archived_at", null).is("deleted_at", null).limit(1);
      if (data?.[0]?.id) return { leadId: data[0].id, via: "email_fallback" };
    }
    if (phone) {
      const { data } = await supabase.from("leads").select("id,phone").is("archived_at", null).is("deleted_at", null).limit(500);
      const m = (data || []).find((l: any) => normPhone(l.phone) === phone);
      if (m?.id) return { leadId: m.id, via: "phone_fallback" };
    }
  }
  return { leadId: null, via: "none" };
}

async function findMatchingRule(args: {
  templateId: string | null;
  hasCrm: boolean;
  hasPaid: boolean;
  currentPipelineId: string | null;
  currentStageId: string | null;
}): Promise<PostSendRule | null> {
  const { data } = await (supabase as any)
    .from("code_of_conduct_automation_rules")
    .select("*")
    .eq("event_type", "email_sent")
    .eq("is_active", true);
  const rules = (data || []) as PostSendRule[];

  // Source type filter
  const sourceOk = (r: PostSendRule) => {
    if (r.source_type === "both") return args.hasCrm || args.hasPaid;
    if (r.source_type === "crm") return args.hasCrm;
    return args.hasPaid;
  };
  // Template filter (null → any)
  const tplOk = (r: PostSendRule) => !r.template_id || r.template_id === args.templateId;
  // Current pipeline/stage condition (null → any)
  const stageOk = (r: PostSendRule) =>
    (!r.current_pipeline_id || r.current_pipeline_id === args.currentPipelineId) &&
    (!r.current_stage_id || r.current_stage_id === args.currentStageId);

  // Prefer more specific rules: those with explicit stage/template > generic
  const candidates = rules.filter((r) => sourceOk(r) && tplOk(r) && stageOk(r));
  candidates.sort((a, b) => {
    const score = (r: PostSendRule) =>
      (r.template_id ? 2 : 0) + (r.current_stage_id ? 2 : 0) + (r.current_pipeline_id ? 1 : 0);
    return score(b) - score(a);
  });
  return candidates[0] || null;
}

export interface EvaluatePostSendArgs {
  requestId: string;
  dryRun?: boolean;
  performedBy?: string | null;
}

/**
 * Evaluate and (unless dryRun) apply the post-send stage move automation for a CoC request.
 */
export async function evaluatePostSendAutomation(args: EvaluatePostSendArgs): Promise<PostSendAutomationResult> {
  const { requestId, dryRun = false, performedBy = null } = args;

  // 1) Load request
  const { data: req, error: reqErr } = await (supabase as any)
    .from("code_of_conduct_requests")
    .select("id,status,template_id,crm_lead_id,paid_pipeline_lead_id,member_email,member_phone")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr || !req) {
    return { status: "failed", errorMessage: reqErr?.message || "Request not found", dryRun };
  }
  if (req.status === "cancelled") {
    return { status: "skipped", skipReason: "request_cancelled", dryRun };
  }

  // 2) Resolve linked CRM lead
  const linked = await resolveLinkedCrmLead(req);
  if (!linked.leadId) {
    if (!dryRun) {
      await logEvent({
        requestId, eventType: "email_sent", crmLeadId: null, paidPipelineLeadId: req.paid_pipeline_lead_id,
        status: "skipped", skipReason: "no_linked_crm_lead", createdBy: performedBy,
      });
    }
    return { status: "skipped", skipReason: "no_linked_crm_lead", paidPipelineLeadId: req.paid_pipeline_lead_id, dryRun };
  }

  // 3) Read current lead state
  const { data: lead } = await supabase
    .from("leads")
    .select("id, pipeline_id, stage_id, archived_at, deleted_at")
    .eq("id", linked.leadId)
    .maybeSingle();
  if (!lead) {
    return { status: "skipped", skipReason: "lead_missing", crmLeadId: linked.leadId, dryRun };
  }
  if ((lead as any).archived_at || (lead as any).deleted_at) {
    if (!dryRun) {
      await logEvent({
        requestId, eventType: "email_sent", crmLeadId: linked.leadId, paidPipelineLeadId: req.paid_pipeline_lead_id,
        status: "skipped", skipReason: "lead_archived_or_deleted", createdBy: performedBy,
      });
    }
    return { status: "skipped", skipReason: "lead_archived_or_deleted", crmLeadId: linked.leadId, dryRun };
  }

  // 4) Find matching rule
  const rule = await findMatchingRule({
    templateId: req.template_id || null,
    hasCrm: !!req.crm_lead_id,
    hasPaid: !!req.paid_pipeline_lead_id,
    currentPipelineId: (lead as any).pipeline_id || null,
    currentStageId: (lead as any).stage_id || null,
  });
  if (!rule) {
    return {
      status: "no_match",
      crmLeadId: linked.leadId,
      paidPipelineLeadId: req.paid_pipeline_lead_id,
      oldPipelineId: (lead as any).pipeline_id, oldStageId: (lead as any).stage_id,
      dryRun,
    };
  }

  // 5) Validate destination
  const { data: destStage } = await supabase
    .from("stages")
    .select("id, name, pipeline_id, is_active")
    .eq("id", rule.destination_stage_id)
    .maybeSingle();
  const { data: destPipe } = await supabase
    .from("pipelines")
    .select("id, name")
    .eq("id", rule.destination_pipeline_id)
    .maybeSingle();
  if (!destStage || (destStage as any).is_active === false) {
    if (!dryRun) {
      await logEvent({
        requestId, ruleId: rule.id, eventType: "email_sent",
        crmLeadId: linked.leadId, paidPipelineLeadId: req.paid_pipeline_lead_id,
        status: "skipped", skipReason: "destination_stage_inactive", createdBy: performedBy,
      });
    }
    return { status: "skipped", ruleId: rule.id, ruleName: rule.name, skipReason: "destination_stage_inactive", crmLeadId: linked.leadId, dryRun };
  }
  if (!destPipe) {
    if (!dryRun) {
      await logEvent({
        requestId, ruleId: rule.id, eventType: "email_sent",
        crmLeadId: linked.leadId, paidPipelineLeadId: req.paid_pipeline_lead_id,
        status: "skipped", skipReason: "destination_pipeline_missing", createdBy: performedBy,
      });
    }
    return { status: "skipped", ruleId: rule.id, ruleName: rule.name, skipReason: "destination_pipeline_missing", crmLeadId: linked.leadId, dryRun };
  }

  const oldStageName = (lead as any).stage_id
    ? (await supabase.from("stages").select("name").eq("id", (lead as any).stage_id).maybeSingle()).data?.name || null
    : null;

  // 6) Already-in-destination check
  if ((lead as any).stage_id === rule.destination_stage_id && (lead as any).pipeline_id === rule.destination_pipeline_id) {
    if (!dryRun) {
      await logEvent({
        requestId, ruleId: rule.id, eventType: "email_sent",
        crmLeadId: linked.leadId, paidPipelineLeadId: req.paid_pipeline_lead_id,
        oldPipelineId: (lead as any).pipeline_id, oldStageId: (lead as any).stage_id,
        newPipelineId: rule.destination_pipeline_id, newStageId: rule.destination_stage_id,
        status: "skipped", skipReason: "already_in_destination", createdBy: performedBy,
      });
    }
    return {
      status: "skipped", ruleId: rule.id, ruleName: rule.name, skipReason: "already_in_destination",
      crmLeadId: linked.leadId, oldStageId: (lead as any).stage_id, oldStageName,
      newStageId: rule.destination_stage_id, newStageName: (destStage as any).name, dryRun,
    };
  }

  // 7) Repeat protection
  if (!rule.allow_repeat) {
    const { data: prior } = await (supabase as any)
      .from("code_of_conduct_automation_events")
      .select("id")
      .eq("request_id", requestId)
      .eq("rule_id", rule.id)
      .eq("status", "applied")
      .limit(1);
    if ((prior || []).length > 0) {
      if (!dryRun) {
        await logEvent({
          requestId, ruleId: rule.id, eventType: "email_sent",
          crmLeadId: linked.leadId, paidPipelineLeadId: req.paid_pipeline_lead_id,
          status: "skipped", skipReason: "already_applied_for_request", createdBy: performedBy,
        });
      }
      return {
        status: "skipped", ruleId: rule.id, ruleName: rule.name, skipReason: "already_applied_for_request",
        crmLeadId: linked.leadId, oldStageId: (lead as any).stage_id, oldStageName,
        newStageId: rule.destination_stage_id, newStageName: (destStage as any).name, dryRun,
      };
    }
  }

  // Dry-run: stop here, report what would happen
  if (dryRun) {
    return {
      status: "applied", ruleId: rule.id, ruleName: rule.name,
      crmLeadId: linked.leadId, paidPipelineLeadId: req.paid_pipeline_lead_id,
      oldPipelineId: (lead as any).pipeline_id, oldStageId: (lead as any).stage_id, oldStageName,
      newPipelineId: rule.destination_pipeline_id,
      newStageId: rule.destination_stage_id, newStageName: (destStage as any).name,
      dryRun: true,
    };
  }

  // 8) Apply the move
  const updates: any = { stage_id: rule.destination_stage_id };
  if ((lead as any).pipeline_id !== rule.destination_pipeline_id) updates.pipeline_id = rule.destination_pipeline_id;
  const { error: upErr } = await supabase.from("leads").update(updates).eq("id", linked.leadId);
  if (upErr) {
    await logEvent({
      requestId, ruleId: rule.id, eventType: "email_sent",
      crmLeadId: linked.leadId, paidPipelineLeadId: req.paid_pipeline_lead_id,
      oldPipelineId: (lead as any).pipeline_id, oldStageId: (lead as any).stage_id,
      newPipelineId: rule.destination_pipeline_id, newStageId: rule.destination_stage_id,
      status: "failed", errorMessage: upErr.message, createdBy: performedBy,
    });
    return {
      status: "failed", ruleId: rule.id, ruleName: rule.name, errorMessage: upErr.message,
      crmLeadId: linked.leadId, oldStageId: (lead as any).stage_id, oldStageName,
      newStageId: rule.destination_stage_id, newStageName: (destStage as any).name,
    };
  }

  // 9) Optional paid pipeline stage sync
  if (rule.also_update_paid_pipeline_stage && rule.destination_paid_pipeline_stage && req.paid_pipeline_lead_id) {
    try {
      await (supabase as any).from("paid_pipeline_leads")
        .update({ pipeline_stage: rule.destination_paid_pipeline_stage })
        .eq("id", req.paid_pipeline_lead_id);
    } catch { /* non-fatal */ }
  }

  await logEvent({
    requestId, ruleId: rule.id, eventType: "email_sent",
    crmLeadId: linked.leadId, paidPipelineLeadId: req.paid_pipeline_lead_id,
    oldPipelineId: (lead as any).pipeline_id, oldStageId: (lead as any).stage_id,
    newPipelineId: rule.destination_pipeline_id, newStageId: rule.destination_stage_id,
    status: "applied", createdBy: performedBy,
    metadata: { resolved_via: linked.via, rule_name: rule.name },
  });

  return {
    status: "applied", ruleId: rule.id, ruleName: rule.name,
    crmLeadId: linked.leadId, paidPipelineLeadId: req.paid_pipeline_lead_id,
    oldPipelineId: (lead as any).pipeline_id, oldStageId: (lead as any).stage_id, oldStageName,
    newPipelineId: rule.destination_pipeline_id,
    newStageId: rule.destination_stage_id, newStageName: (destStage as any).name,
  };
}

/** Fetch the most recent automation event for a request (for the debug panel). */
export async function getLastAutomationEvent(requestId: string) {
  const { data } = await (supabase as any)
    .from("code_of_conduct_automation_events")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data || [])[0] || null;
}

export function describeSkipReason(reason?: string | null): string {
  switch (reason) {
    case "no_linked_crm_lead": return "No linked CRM lead found";
    case "lead_missing": return "CRM lead missing";
    case "lead_archived_or_deleted": return "Lead is archived or deleted";
    case "destination_stage_inactive": return "Destination stage is inactive or deleted";
    case "destination_pipeline_missing": return "Destination pipeline is missing";
    case "already_in_destination": return "Already in destination stage";
    case "already_applied_for_request": return "Automation already ran for this request (allow_repeat = no)";
    case "request_cancelled": return "Request was cancelled";
    default: return reason || "Unknown reason";
  }
}
