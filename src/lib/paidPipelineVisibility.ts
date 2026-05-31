// Admin diagnostic: explain why a Paid Pipeline buyer's linked Calling CRM
// card may not be visible in the Paid — Onboarding Kanban.

import { supabase } from "@/integrations/supabase/client";

export type VisibilityStatus =
  | "included"
  | "wrong_pipeline"
  | "archived"
  | "soft_deleted"
  | "points_to_source_unpaid"
  | "missing_link"
  | "lead_not_found";

export interface VisibilityAudit {
  paidPipelineLeadId: string;
  crmLeadId: string | null;
  sourceUnpaidLeadId: string | null;
  linkedPipelineId: string | null;
  linkedPipelineName: string | null;
  linkedPipelineType: string | null;
  linkedStageId: string | null;
  linkedStageName: string | null;
  isArchived: boolean;
  isDeleted: boolean;
  hiddenFromSales: boolean;
  ownerId: string | null;
  status: VisibilityStatus;
  reason: string;
  repairable: boolean;
}

export async function auditPaidPipelineVisibility(paidPipelineLeadId: string): Promise<VisibilityAudit> {
  const base: VisibilityAudit = {
    paidPipelineLeadId,
    crmLeadId: null, sourceUnpaidLeadId: null,
    linkedPipelineId: null, linkedPipelineName: null, linkedPipelineType: null,
    linkedStageId: null, linkedStageName: null,
    isArchived: false, isDeleted: false, hiddenFromSales: false, ownerId: null,
    status: "missing_link", reason: "No Calling CRM lead linked to this paid buyer.", repairable: true,
  };

  const { data: paid } = await (supabase as any)
    .from("paid_pipeline_leads")
    .select("id, crm_lead_id, source_unpaid_lead_id")
    .eq("id", paidPipelineLeadId).maybeSingle();
  if (!paid) {
    return { ...base, status: "lead_not_found", reason: "Paid buyer not found.", repairable: false };
  }
  base.crmLeadId = (paid as any).crm_lead_id || null;
  base.sourceUnpaidLeadId = (paid as any).source_unpaid_lead_id || null;
  if (!base.crmLeadId) return base;

  const { data: lead } = await (supabase as any)
    .from("leads")
    .select("id, pipeline_id, stage_id, archived_at, deleted_at, hide_from_sales_workload, assigned_agent_id, lead_type")
    .eq("id", base.crmLeadId).maybeSingle();
  if (!lead) {
    return { ...base, status: "lead_not_found", reason: "crm_lead_id points to a missing lead.", repairable: true };
  }
  base.linkedPipelineId = (lead as any).pipeline_id;
  base.linkedStageId = (lead as any).stage_id;
  base.isArchived = !!(lead as any).archived_at;
  base.isDeleted = !!(lead as any).deleted_at;
  base.hiddenFromSales = !!(lead as any).hide_from_sales_workload;
  base.ownerId = (lead as any).assigned_agent_id || null;

  const [pipelineRes, stageRes, paidPipelineRes] = await Promise.all([
    base.linkedPipelineId
      ? (supabase as any).from("pipelines").select("id, name, type").eq("id", base.linkedPipelineId).maybeSingle()
      : Promise.resolve({ data: null }),
    base.linkedStageId
      ? (supabase as any).from("stages").select("id, name").eq("id", base.linkedStageId).maybeSingle()
      : Promise.resolve({ data: null }),
    (supabase as any).from("pipelines").select("id, name, type").eq("type", "paid").maybeSingle(),
  ]);
  base.linkedPipelineName = (pipelineRes.data as any)?.name || null;
  base.linkedPipelineType = (pipelineRes.data as any)?.type || null;
  base.linkedStageName = (stageRes.data as any)?.name || null;
  const paidOnboardingPipelineId = (paidPipelineRes.data as any)?.id || null;

  if (base.isDeleted) return { ...base, status: "soft_deleted", reason: "Linked CRM lead is soft-deleted.", repairable: true };
  if (base.isArchived) return { ...base, status: "archived", reason: "Linked CRM lead is archived.", repairable: true };

  if (paidOnboardingPipelineId && base.linkedPipelineId !== paidOnboardingPipelineId) {
    // crm_lead_id points to a non-paid-onboarding lead. Most often that's the source unpaid lead.
    const isSource = base.sourceUnpaidLeadId === base.crmLeadId || base.linkedPipelineType === "unpaid";
    return {
      ...base,
      status: isSource ? "points_to_source_unpaid" : "wrong_pipeline",
      reason: isSource
        ? "crm_lead_id points to the source unpaid lead instead of the Paid Onboarding lead. Run Repair to create / link the Paid Onboarding card."
        : `Linked lead is in pipeline '${base.linkedPipelineName}' instead of Paid — Onboarding.`,
      repairable: true,
    };
  }

  return { ...base, status: "included", reason: "Linked lead is visible in the Paid — Onboarding Kanban.", repairable: false };
}
