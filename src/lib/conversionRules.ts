import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";

export type ConversionRule = {
  id: string;
  name: string;
  source_pipeline_id: string | null;
  trigger_stage_names: string[];
  trigger_stage_ids: string[];
  destination_pipeline_id: string | null;
  destination_stage_id: string | null;
  create_paid_buyer: boolean;
  hide_from_sales_workload: boolean;
  deassign_original: boolean;
  owner_policy: "same" | "selected" | "unassigned";
  default_owner_id: string | null;
  tag_after_conversion: string | null;
  followup_default: "keep" | "copy" | "move" | "done";
  is_active: boolean;
};

export const DEFAULT_TRIGGER_STAGES = ["Conversion Successful", "Payment Confirmed", "Closed Won"];

let cache: ConversionRule[] | null = null;
let cacheAt = 0;

export async function loadActiveConversionRules(force = false): Promise<ConversionRule[]> {
  if (!force && cache && Date.now() - cacheAt < 30_000) return cache;
  const { data } = await (supabase as any)
    .from("crm_conversion_rules")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  cache = (data || []) as ConversionRule[];
  cacheAt = Date.now();
  return cache;
}

export function invalidateRulesCache() {
  cache = null;
}

export function findRuleForStage(
  rules: ConversionRule[],
  pipelineId: string | null,
  stageId: string | null,
  stageName: string | null
): ConversionRule | null {
  if (!rules || rules.length === 0) return null;
  for (const r of rules) {
    if (r.source_pipeline_id && r.source_pipeline_id !== pipelineId) continue;
    if (stageId && r.trigger_stage_ids?.includes(stageId)) return r;
    if (stageName && r.trigger_stage_names?.some((n) => n.toLowerCase() === stageName.toLowerCase())) return r;
  }
  return null;
}

/** Whether a stage qualifies as "converted" trigger (rule-based, fallback to defaults). */
export function isConvertedStage(
  rules: ConversionRule[],
  pipelineId: string | null,
  stageId: string | null,
  stageName: string | null
): boolean {
  if (rules && rules.length > 0) return !!findRuleForStage(rules, pipelineId, stageId, stageName);
  return !!stageName && DEFAULT_TRIGGER_STAGES.includes(stageName);
}

/** Apply followup default policy. Caller passes the chosen handling. */
export async function applyFollowupHandling(opts: {
  handling: "keep" | "copy" | "move" | "done";
  crmLeadId: string;
  paidPipelineLeadId: string;
  leadName?: string | null;
  actorId?: string | null;
}) {
  const { handling, crmLeadId, paidPipelineLeadId, leadName, actorId } = opts;
  if (handling === "keep") return { copied: 0, moved: 0, marked: 0 };

  // Load pending followups attached to this CRM lead (in central followups table)
  const { data: pending } = await (supabase as any)
    .from("paid_pipeline_followups")
    .select("id, follow_up_date, follow_up_time, follow_up_type, priority, notes, assigned_to, follow_up_reason")
    .eq("related_crm_lead_id", crmLeadId)
    .eq("status", "Pending")
    .eq("is_deleted", false);
  const rows = (pending || []) as any[];

  if (handling === "done") {
    if (rows.length === 0) return { copied: 0, moved: 0, marked: 0 };
    await (supabase as any)
      .from("paid_pipeline_followups")
      .update({ status: "Done", completed_at: new Date().toISOString() })
      .in("id", rows.map((r) => r.id));
    await logActivity({
      module_key: "crm",
      action_type: "crm_conversion_followups_marked_done",
      entity_type: "lead",
      entity_id: crmLeadId,
      entity_label: leadName || undefined,
      metadata: { count: rows.length, paid_pipeline_lead_id: paidPipelineLeadId, by: actorId },
      summary: `Marked ${rows.length} pending follow-up(s) done during conversion.`,
    });
    return { copied: 0, moved: 0, marked: rows.length };
  }

  if (rows.length === 0) return { copied: 0, moved: 0, marked: 0 };

  if (handling === "move") {
    await (supabase as any)
      .from("paid_pipeline_followups")
      .update({ paid_pipeline_lead_id: paidPipelineLeadId, source_module: "conversion" })
      .in("id", rows.map((r) => r.id));
    await logActivity({
      module_key: "crm",
      action_type: "crm_conversion_followups_moved",
      entity_type: "lead",
      entity_id: crmLeadId,
      entity_label: leadName || undefined,
      metadata: { count: rows.length, paid_pipeline_lead_id: paidPipelineLeadId, by: actorId },
      summary: `Moved ${rows.length} pending follow-up(s) to paid onboarding lead.`,
    });
    return { copied: 0, moved: rows.length, marked: 0 };
  }

  if (handling === "copy") {
    const inserts = rows.map((r) => ({
      paid_pipeline_lead_id: paidPipelineLeadId,
      related_crm_lead_id: crmLeadId,
      follow_up_date: r.follow_up_date,
      follow_up_time: r.follow_up_time,
      follow_up_type: r.follow_up_type,
      follow_up_reason: r.follow_up_reason,
      priority: r.priority,
      notes: r.notes,
      assigned_to: r.assigned_to,
      status: "Pending",
      source_module: "conversion",
      created_by: actorId || null,
    }));
    await (supabase as any).from("paid_pipeline_followups").insert(inserts);
    await logActivity({
      module_key: "crm",
      action_type: "crm_conversion_followups_copied",
      entity_type: "lead",
      entity_id: crmLeadId,
      entity_label: leadName || undefined,
      metadata: { count: rows.length, paid_pipeline_lead_id: paidPipelineLeadId, by: actorId },
      summary: `Copied ${rows.length} pending follow-up(s) to paid onboarding lead.`,
    });
    return { copied: rows.length, moved: 0, marked: 0 };
  }

  return { copied: 0, moved: 0, marked: 0 };
}
