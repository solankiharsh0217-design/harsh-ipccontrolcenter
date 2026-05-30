// Ensures the 3-record paid invariant:
//   1. Source unpaid CRM lead (kept as sales history) — optional
//   2. Paid Onboarding CRM lead (visible in Paid — Onboarding Kanban) — REQUIRED
//   3. Paid Pipeline buyer (finance) — REQUIRED
//
// Every paid_pipeline_leads row MUST have crm_lead_id pointing at a CRM lead in
// the Paid — Onboarding pipeline. If the linked CRM lead is in another pipeline
// (typically the original unpaid Sales Pipeline lead) we treat that lead as the
// source unpaid lead and create/find a separate Paid Onboarding CRM lead.

import { supabase } from "@/integrations/supabase/client";
import { ensurePipelineExists } from "@/lib/crmTypes";
import { normalizeEmail, normalizePhone } from "@/lib/identity";
import { logActivity } from "@/lib/auditLog";

export type EnsureAction =
  | "already_linked"
  | "link_repaired"
  | "linked_existing"
  | "created"
  | "promoted_from_source"
  | "error";

export type EnsureResult = {
  ok: boolean;
  crmLeadId: string | null;
  sourceUnpaidLeadId: string | null;
  action: EnsureAction;
  message: string;
};

const PREFERRED_FIRST_STAGE = "Payment Confirmed";

async function getPaidPipelineAndStage(): Promise<{ pipelineId: string; stageId: string | null }> {
  const { pipelineId, firstStageId } = await ensurePipelineExists(supabase, "paid", "Paid — Onboarding");
  const { data: stages } = await supabase
    .from("stages").select("id, name, position")
    .eq("pipeline_id", pipelineId).order("position");
  const preferred = (stages || []).find((s: any) => s.name === PREFERRED_FIRST_STAGE);
  return { pipelineId, stageId: preferred?.id ?? firstStageId };
}

async function markSourceConverted(
  sourceLeadId: string,
  paidPipelineLeadId: string,
  paidOnboardingLeadId: string,
) {
  await supabase
    .from("leads")
    .update({
      conversion_status: "converted",
      paid_pipeline_lead_id: paidPipelineLeadId,
      converted_to_crm_lead_id: paidOnboardingLeadId,
      converted_at: new Date().toISOString(),
    } as any)
    .eq("id", sourceLeadId);
}

async function repairPaidOnboardingLead(leadId: string, paidPipelineLeadId: string, pipelineId: string, stageId: string | null) {
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return { repaired: false, lead: null as any };
  const patch: Record<string, any> = {};
  if ((lead as any).pipeline_id !== pipelineId) {
    patch.pipeline_id = pipelineId;
    patch.stage_id = stageId;
  }
  if ((lead as any).archived_at) patch.archived_at = null;
  if ((lead as any).deleted_at) patch.deleted_at = null;
  if ((lead as any).hide_from_sales_workload) patch.hide_from_sales_workload = false;
  if ((lead as any).lead_type !== "paid") patch.lead_type = "paid";
  if ((lead as any).paid_pipeline_lead_id !== paidPipelineLeadId) patch.paid_pipeline_lead_id = paidPipelineLeadId;
  if ((lead as any).conversion_status !== "converted" && (lead as any).conversion_status !== "linked_to_paid") {
    patch.conversion_status = "converted";
  }
  if (Object.keys(patch).length > 0) {
    await supabase.from("leads").update(patch as any).eq("id", leadId);
  }
  return { repaired: Object.keys(patch).length > 0, lead };
}

async function createPaidOnboardingLead(
  paid: any,
  pipelineId: string,
  stageId: string | null,
  paidPipelineLeadId: string,
): Promise<{ id: string | null; error?: string }> {
  const insertRow: Record<string, any> = {
    full_name: paid.name || "Unnamed Buyer",
    email: paid.email || null,
    phone: paid.phone || null,
    pipeline_id: pipelineId,
    stage_id: stageId,
    lead_type: "paid",
    paid_pipeline_lead_id: paidPipelineLeadId,
    conversion_status: "converted",
    hide_from_sales_workload: false,
    assigned_agent_id: paid.assigned_sales_executive || null,
    program_name: paid.product_name_snapshot || "",
    webinar_source: paid.batch_name_snapshot || paid.source_webinar || null,
    deal_value: Number(paid.deal_value_including_gst || 0),
  };
  const { data, error } = await supabase
    .from("leads").insert(insertRow as any).select("id").maybeSingle();
  return { id: (data as any)?.id || null, error: error?.message };
}

export async function ensurePaidPipelineCrmLead(
  paidPipelineLeadId: string,
  opts: { sourceUnpaidLeadId?: string | null } = {},
): Promise<EnsureResult> {
  try {
    const { data: paid } = await supabase
      .from("paid_pipeline_leads")
      .select("id, name, email, phone, crm_lead_id, source_unpaid_lead_id, pipeline_stage, deal_value_including_gst, assigned_sales_executive, product_name_snapshot, batch_name_snapshot, source_webinar, paid_batch_id")
      .eq("id", paidPipelineLeadId)
      .maybeSingle();
    if (!paid) return { ok: false, crmLeadId: null, sourceUnpaidLeadId: null, action: "error", message: "Paid buyer not found" };

    const { pipelineId, stageId } = await getPaidPipelineAndStage();
    const email = normalizeEmail((paid as any).email);
    const phone = normalizePhone((paid as any).phone);
    let sourceUnpaidLeadId: string | null = opts.sourceUnpaidLeadId ?? (paid as any).source_unpaid_lead_id ?? null;

    // 1) Already linked → verify the linked lead lives in Paid Onboarding.
    if ((paid as any).crm_lead_id) {
      const { data: linked } = await supabase
        .from("leads")
        .select("id, pipeline_id, archived_at, deleted_at, hide_from_sales_workload, lead_type, paid_pipeline_lead_id, conversion_status")
        .eq("id", (paid as any).crm_lead_id)
        .maybeSingle();

      if (linked && (linked as any).pipeline_id === pipelineId) {
        const { repaired } = await repairPaidOnboardingLead(
          (linked as any).id, paidPipelineLeadId, pipelineId, stageId,
        );
        return {
          ok: true,
          crmLeadId: (linked as any).id,
          sourceUnpaidLeadId,
          action: repaired ? "link_repaired" : "already_linked",
          message: repaired ? "Linked CRM lead repaired" : "Already linked correctly",
        };
      }

      // Linked lead is in another pipeline (probably the source unpaid lead).
      if (linked) {
        sourceUnpaidLeadId = sourceUnpaidLeadId || (linked as any).id;
        // Do not move the source; demote it back to unpaid lead_type if it was flipped.
        await supabase.from("leads").update({
          lead_type: "unpaid",
          paid_pipeline_lead_id: paidPipelineLeadId,
        } as any).eq("id", (linked as any).id);
      }
      // fall through to search/create a real Paid Onboarding lead
    }

    // 2) Look for an existing Paid Onboarding CRM lead by identity.
    let paidOnboardingMatch: any = null;
    let otherMatch: any = null;
    if (email || phone) {
      const filters: string[] = [];
      if (email) filters.push(`email.ilike.${email}`);
      if (phone) filters.push(`phone.eq.${phone}`);
      const { data: candidates } = await supabase
        .from("leads")
        .select("id, pipeline_id, archived_at, deleted_at, hide_from_sales_workload, lead_type, paid_pipeline_lead_id")
        .or(filters.join(","))
        .limit(20);
      for (const c of (candidates || [])) {
        if (sourceUnpaidLeadId && (c as any).id === sourceUnpaidLeadId) continue;
        if ((c as any).pipeline_id === pipelineId) {
          paidOnboardingMatch = c;
          break;
        }
        if (!otherMatch) otherMatch = c;
      }
      // If we did not yet have a source lead, the first non-paid-onboarding match becomes it.
      if (!sourceUnpaidLeadId && otherMatch) sourceUnpaidLeadId = (otherMatch as any).id;
    }

    if (paidOnboardingMatch) {
      await repairPaidOnboardingLead((paidOnboardingMatch as any).id, paidPipelineLeadId, pipelineId, stageId);
      await supabase.from("paid_pipeline_leads").update({
        crm_lead_id: (paidOnboardingMatch as any).id,
        source_unpaid_lead_id: sourceUnpaidLeadId,
      } as any).eq("id", paidPipelineLeadId);
      if (sourceUnpaidLeadId) {
        await markSourceConverted(sourceUnpaidLeadId, paidPipelineLeadId, (paidOnboardingMatch as any).id);
      }
      logActivity({
        module_key: "paid_pipeline",
        action_type: "paid_onboarding_crm_lead_linked",
        entity_type: "paid_pipeline_lead",
        entity_id: paidPipelineLeadId,
        entity_label: (paid as any).name || undefined,
        metadata: {
          paid_pipeline_lead_id: paidPipelineLeadId,
          paid_onboarding_crm_lead_id: (paidOnboardingMatch as any).id,
          source_unpaid_lead_id: sourceUnpaidLeadId,
          email, phone, action_taken: "linked_existing",
        },
        summary: `Linked paid buyer to existing Paid Onboarding lead.`,
      }).catch(() => {});
      return {
        ok: true,
        crmLeadId: (paidOnboardingMatch as any).id,
        sourceUnpaidLeadId,
        action: "linked_existing",
        message: "Linked existing Paid Onboarding CRM lead",
      };
    }

    // 3) Create a new Paid Onboarding CRM lead.
    const { id: newId, error } = await createPaidOnboardingLead(paid, pipelineId, stageId, paidPipelineLeadId);
    if (!newId) {
      return { ok: false, crmLeadId: null, sourceUnpaidLeadId, action: "error", message: error || "Failed to create CRM lead" };
    }
    await supabase.from("paid_pipeline_leads").update({
      crm_lead_id: newId,
      source_unpaid_lead_id: sourceUnpaidLeadId,
    } as any).eq("id", paidPipelineLeadId);
    if (sourceUnpaidLeadId) {
      await markSourceConverted(sourceUnpaidLeadId, paidPipelineLeadId, newId);
    }
    logActivity({
      module_key: "paid_pipeline",
      action_type: sourceUnpaidLeadId ? "paid_onboarding_crm_lead_repaired" : "paid_onboarding_crm_lead_created",
      entity_type: "paid_pipeline_lead",
      entity_id: paidPipelineLeadId,
      entity_label: (paid as any).name || undefined,
      metadata: {
        paid_pipeline_lead_id: paidPipelineLeadId,
        paid_onboarding_crm_lead_id: newId,
        source_unpaid_lead_id: sourceUnpaidLeadId,
        email, phone,
        new_pipeline_id: pipelineId,
        new_stage_id: stageId,
        action_taken: sourceUnpaidLeadId ? "promoted_from_source" : "created",
      },
      summary: `Created Paid Onboarding CRM lead for ${(paid as any).name || "buyer"}.`,
    }).catch(() => {});
    return {
      ok: true,
      crmLeadId: newId,
      sourceUnpaidLeadId,
      action: sourceUnpaidLeadId ? "promoted_from_source" : "created",
      message: "Paid Onboarding CRM lead created",
    };
  } catch (e: any) {
    return { ok: false, crmLeadId: null, sourceUnpaidLeadId: null, action: "error", message: e?.message || "Repair failed" };
  }
}
