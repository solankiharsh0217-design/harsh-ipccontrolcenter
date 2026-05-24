import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import { getAssignmentsFor, listAllTags } from "@/lib/leadTags";

export interface Suggestion {
  id: string;
  title: string;
  reason: string;
  /** Confirmation prompt shown before applying. */
  confirm?: string;
  /** Returns a short summary of what changed, for audit/toasts. */
  apply: () => Promise<string>;
}

export interface SyncRule {
  id: string;
  rule_name: string;
  trigger_module: string;
  trigger_field: string;
  trigger_value: string;
  suggested_module: string;
  suggested_field: string;
  suggested_value: string;
  is_active: boolean;
}

export interface SuggestionContext {
  crm: any | null;          // public.leads row
  paid: any | null;         // public.paid_pipeline_leads row
  crmStages: { id: string; name: string; pipeline_id: string | null }[];
  hasFollowUp: boolean;
  tagNames: string[];       // lowercase tag names assigned to lead pair
  refresh: () => Promise<void> | void;
}

const norm = (s: any) => String(s ?? "").trim().toLowerCase();

function findCrmStageByName(ctx: SuggestionContext, candidates: string[]): { id: string; name: string } | null {
  if (!ctx.crm) return null;
  const pid = ctx.crm.pipeline_id;
  const inPipeline = ctx.crmStages.filter(s => !pid || s.pipeline_id === pid);
  for (const cand of candidates) {
    const c = norm(cand);
    const hit = inPipeline.find(s => norm(s.name) === c) || inPipeline.find(s => norm(s.name).includes(c));
    if (hit) return hit;
  }
  return null;
}

async function setCrmStage(ctx: SuggestionContext, stageId: string, stageName: string) {
  await supabase.from("leads").update({ stage_id: stageId }).eq("id", ctx.crm.id);
  await logActivity({
    module_key: "stage_sync", module_label: "Stage Sync",
    action_type: "stage_sync_suggestion_applied",
    entity_type: "lead", entity_id: ctx.crm.id, entity_label: ctx.crm.full_name,
    new_values: { stage: stageName },
    summary: `CRM stage moved to '${stageName}' via suggestion.`,
  });
}

async function setPaidField(ctx: SuggestionContext, patch: Record<string, any>, label: string) {
  await supabase.from("paid_pipeline_leads").update(patch).eq("id", ctx.paid.id);
  await logActivity({
    module_key: "stage_sync", module_label: "Stage Sync",
    action_type: "stage_sync_suggestion_applied",
    entity_type: "paid_pipeline_lead", entity_id: ctx.paid.id, entity_label: ctx.paid.name,
    new_values: patch,
    summary: `Paid Pipeline updated: ${label}.`,
  });
}

export function computeSuggestions(ctx: SuggestionContext, rules: SyncRule[]): Suggestion[] {
  const out: Suggestion[] = [];
  const crm = ctx.crm;
  const paid = ctx.paid;
  const crmStageName = crm ? ctx.crmStages.find(s => s.id === crm.stage_id)?.name : null;

  // 1. CRM = Payment Confirmed → Paid pipeline_stage = Token Paid
  if (paid && crmStageName && norm(crmStageName) === "payment confirmed" && norm(paid.pipeline_stage) !== "token paid") {
    out.push({
      id: "crm-pay-confirmed-to-token-paid",
      title: "Set Paid Pipeline stage to 'Token Paid'",
      reason: "CRM stage is 'Payment Confirmed' and a Paid Pipeline record exists.",
      confirm: "Move this Paid Pipeline lead to stage 'Token Paid'?",
      apply: async () => {
        await setPaidField(ctx, { pipeline_stage: "Token Paid" }, "stage → Token Paid");
        return "Paid Pipeline stage set to Token Paid";
      },
    });
  }

  // 2. Paid balance = 0 → Final Sale + CRM stage Active Member / Onboarding Completed
  if (paid && Number(paid.balance_pending) === 0 && Number(paid.total_collected) > 0 && !paid.is_final_sale) {
    const target = findCrmStageByName(ctx, ["Active Member", "Onboarding Completed", "Closed Won", "Payment Completed"]);
    out.push({
      id: "paid-balance-zero-final-sale",
      title: target ? `Mark Final Sale and move CRM to '${target.name}'` : "Mark Paid Pipeline lead as Final Sale",
      reason: "Balance pending is 0 with collections received.",
      confirm: "Mark this lead as Final Sale" + (target ? ` and move CRM stage to '${target.name}'?` : "?"),
      apply: async () => {
        await setPaidField(ctx, { is_final_sale: true }, "is_final_sale → true");
        if (target && crm) await setCrmStage(ctx, target.id, target.name);
        return "Marked Final Sale" + (target ? ` + CRM → ${target.name}` : "");
      },
    });
  }

  // 3. Finance Status = Approved → CRM = Finance Approved
  if (paid && crm && norm(paid.finance_status) === "approved") {
    const target = findCrmStageByName(ctx, ["Finance Approved"]);
    if (target && crm.stage_id !== target.id) {
      out.push({
        id: "finance-approved-to-crm",
        title: `Move CRM stage to '${target.name}'`,
        reason: "Finance status is 'Approved'.",
        confirm: `Move CRM stage to '${target.name}'?`,
        apply: async () => {
          await setCrmStage(ctx, target.id, target.name);
          return `CRM → ${target.name}`;
        },
      });
    }
  }

  // 4. Finance Status = Disbursed → CRM = Active Member / Payment Completed
  if (paid && crm && norm(paid.finance_status) === "disbursed") {
    const target = findCrmStageByName(ctx, ["Active Member", "Payment Completed", "Closed Won"]);
    if (target && crm.stage_id !== target.id) {
      out.push({
        id: "finance-disbursed-to-crm",
        title: `Move CRM stage to '${target.name}'`,
        reason: "Finance status is 'Disbursed'.",
        confirm: `Move CRM stage to '${target.name}'?`,
        apply: async () => {
          await setCrmStage(ctx, target.id, target.name);
          return `CRM → ${target.name}`;
        },
      });
    }
  }

  // 5. Paid stage = Dropped After Token → CRM = Dropped / Refund
  if (paid && crm && norm(paid.pipeline_stage).includes("dropped after token")) {
    const target = findCrmStageByName(ctx, ["Dropped / Refund", "Dropped", "Refund", "Closed Lost"]);
    if (target && crm.stage_id !== target.id) {
      out.push({
        id: "paid-dropped-to-crm",
        title: `Move CRM stage to '${target.name}'`,
        reason: "Paid Pipeline stage is 'Dropped After Token'.",
        confirm: `Move CRM stage to '${target.name}'?`,
        apply: async () => {
          await setCrmStage(ctx, target.id, target.name);
          return `CRM → ${target.name}`;
        },
      });
    }
  }

  // 6. Tag = Urgent Follow-Up and no follow-up
  if (ctx.tagNames.includes("urgent follow-up") && !ctx.hasFollowUp) {
    out.push({
      id: "urgent-needs-followup",
      title: "Schedule a follow-up",
      reason: "Lead is tagged 'Urgent Follow-Up' but has no upcoming follow-up.",
      apply: async () => {
        return "OPEN_FOLLOWUP";
      },
    });
  }

  // Custom rules from Master Settings
  for (const r of rules) {
    if (!r.is_active) continue;
    const src = r.trigger_module === "crm" ? crm : paid;
    if (!src) continue;
    // For CRM stage, compare stage name; for everything else direct field
    let actual: any;
    if (r.trigger_module === "crm" && r.trigger_field === "stage") {
      actual = crmStageName;
    } else {
      actual = src[r.trigger_field];
    }
    if (norm(actual) !== norm(r.trigger_value)) continue;

    const sugId = `rule-${r.id}`;
    if (r.suggested_module === "crm" && r.suggested_field === "stage" && crm) {
      const target = findCrmStageByName(ctx, [r.suggested_value]);
      if (!target || crm.stage_id === target.id) continue;
      out.push({
        id: sugId,
        title: `${r.rule_name}: move CRM to '${target.name}'`,
        reason: `${r.trigger_module} ${r.trigger_field} = ${r.trigger_value}`,
        confirm: `Apply rule '${r.rule_name}'?`,
        apply: async () => { await setCrmStage(ctx, target.id, target.name); return `CRM → ${target.name}`; },
      });
    } else if (r.suggested_module === "paid" && paid) {
      const cur = paid[r.suggested_field];
      if (norm(cur) === norm(r.suggested_value)) continue;
      out.push({
        id: sugId,
        title: `${r.rule_name}: set ${r.suggested_field} = ${r.suggested_value}`,
        reason: `${r.trigger_module} ${r.trigger_field} = ${r.trigger_value}`,
        confirm: `Apply rule '${r.rule_name}'?`,
        apply: async () => {
          await setPaidField(ctx, { [r.suggested_field]: r.suggested_value }, `${r.suggested_field} → ${r.suggested_value}`);
          return `Paid ${r.suggested_field} → ${r.suggested_value}`;
        },
      });
    }
  }

  return out;
}

export async function loadSuggestionContext(opts: {
  crmLeadId?: string | null;
  paidLeadId?: string | null;
}): Promise<Omit<SuggestionContext, "refresh">> {
  let crm: any = null, paid: any = null;
  if (opts.crmLeadId) {
    const { data } = await supabase.from("leads").select("*").eq("id", opts.crmLeadId).maybeSingle();
    crm = data;
  }
  if (opts.paidLeadId) {
    const { data } = await supabase.from("paid_pipeline_leads").select("*").eq("id", opts.paidLeadId).maybeSingle();
    paid = data;
  }
  // Backfill the other side via linkage
  if (crm && !paid && crm.paid_pipeline_lead_id) {
    const { data } = await supabase.from("paid_pipeline_leads").select("*").eq("id", crm.paid_pipeline_lead_id).maybeSingle();
    paid = data;
  }
  if (paid && !crm && (paid as any).crm_lead_id) {
    const { data } = await supabase.from("leads").select("*").eq("id", (paid as any).crm_lead_id).maybeSingle();
    crm = data;
  }

  const { data: crmStages } = await supabase.from("stages").select("id, name, pipeline_id");

  // Follow-ups: check pending ones in either source
  let hasFollowUp = false;
  if (crm?.id) {
    const { count } = await supabase
      .from("follow_up_reminders").select("id", { count: "exact", head: true })
      .eq("lead_id", crm.id).gte("reminder_date", new Date().toISOString().slice(0, 10));
    if ((count || 0) > 0) hasFollowUp = true;
  }
  if (!hasFollowUp && paid?.id) {
    const { count } = await supabase
      .from("paid_pipeline_followups" as any).select("id", { count: "exact", head: true })
      .eq("paid_pipeline_lead_id", paid.id).eq("status", "pending");
    if ((count || 0) > 0) hasFollowUp = true;
  }

  // Tags
  const assignments = await getAssignmentsFor({ crmLeadId: crm?.id, paidLeadId: paid?.id });
  const tagIds = Array.from(new Set(assignments.map(a => a.tag_id)));
  let tagNames: string[] = [];
  if (tagIds.length) {
    const all = await listAllTags({ includeInactive: true });
    tagNames = all.filter(t => tagIds.includes(t.id)).map(t => t.name.toLowerCase());
  }

  return {
    crm, paid,
    crmStages: (crmStages as any) || [],
    hasFollowUp,
    tagNames,
  };
}

export async function listSyncRules(): Promise<SyncRule[]> {
  const { data } = await supabase
    .from("stage_sync_rules" as any)
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  return ((data as any) || []) as SyncRule[];
}

export async function logIgnoreSuggestion(suggestionId: string, ctx: { crm: any; paid: any }) {
  await logActivity({
    module_key: "stage_sync", module_label: "Stage Sync",
    action_type: "stage_sync_suggestion_ignored",
    entity_type: ctx.crm ? "lead" : "paid_pipeline_lead",
    entity_id: ctx.crm?.id || ctx.paid?.id || null,
    entity_label: ctx.crm?.full_name || ctx.paid?.name,
    metadata: { suggestion_id: suggestionId },
    summary: `Suggestion '${suggestionId}' ignored.`,
  });
}
