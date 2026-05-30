// Ensures every paid_pipeline_leads row has a linked CRM lead in the
// Paid — Onboarding pipeline. Used by the Paid Pipeline drawer / actions to
// repair orphans without creating duplicates.

import { supabase } from "@/integrations/supabase/client";
import { ensurePipelineExists } from "@/lib/crmTypes";
import { normalizeEmail, normalizePhone } from "@/lib/identity";
import { logActivity } from "@/lib/auditLog";

export type EnsureResult = {
  ok: boolean;
  crmLeadId: string | null;
  action: "already_linked" | "link_repaired" | "linked_existing" | "created" | "error";
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

export async function ensurePaidPipelineCrmLead(paidPipelineLeadId: string): Promise<EnsureResult> {
  try {
    const { data: paid } = await supabase
      .from("paid_pipeline_leads")
      .select("id, name, email, phone, crm_lead_id, pipeline_stage, deal_value_including_gst, assigned_sales_executive, product_name_snapshot, batch_name_snapshot, paid_batch_id")
      .eq("id", paidPipelineLeadId)
      .maybeSingle();
    if (!paid) return { ok: false, crmLeadId: null, action: "error", message: "Paid buyer not found" };

    const { pipelineId, stageId } = await getPaidPipelineAndStage();
    const email = normalizeEmail((paid as any).email);
    const phone = normalizePhone((paid as any).phone);

    // 1) Already linked → repair visibility/pipeline/stage if needed.
    if ((paid as any).crm_lead_id) {
      const { data: lead } = await supabase
        .from("leads").select("*").eq("id", (paid as any).crm_lead_id).maybeSingle();
      if (lead) {
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
        if (Object.keys(patch).length === 0) {
          return { ok: true, crmLeadId: (lead as any).id, action: "already_linked", message: "Already linked correctly" };
        }
        await supabase.from("leads").update(patch as any).eq("id", (lead as any).id);
        logActivity({
          module_key: "paid_pipeline",
          action_type: "paid_pipeline_crm_visibility_repaired",
          entity_type: "paid_pipeline_lead",
          entity_id: paidPipelineLeadId,
          entity_label: (paid as any).name || undefined,
          metadata: {
            paid_pipeline_lead_id: paidPipelineLeadId,
            crm_lead_id: (lead as any).id,
            email, phone,
            old_pipeline_id: (lead as any).pipeline_id,
            new_pipeline_id: patch.pipeline_id ?? (lead as any).pipeline_id,
            old_stage_id: (lead as any).stage_id,
            new_stage_id: patch.stage_id ?? (lead as any).stage_id,
          },
          summary: `Repaired Paid Onboarding visibility for ${(paid as any).name || "buyer"}.`,
        }).catch(() => {});
        return { ok: true, crmLeadId: (lead as any).id, action: "link_repaired", message: "Linked CRM lead repaired" };
      }
      // Linked id stale; fall through to search/create.
    }

    // 2) Search for existing CRM lead by email/phone.
    let match: any = null;
    if (email || phone) {
      const filters: string[] = [];
      if (email) filters.push(`email.ilike.${email}`);
      if (phone) filters.push(`phone.eq.${phone}`);
      const { data: candidates } = await supabase
        .from("leads").select("*").or(filters.join(",")).limit(5);
      match = (candidates || [])[0] || null;
    }

    if (match) {
      const patch: Record<string, any> = {
        pipeline_id: pipelineId,
        stage_id: stageId,
        lead_type: "paid",
        paid_pipeline_lead_id: paidPipelineLeadId,
        conversion_status: "converted",
        hide_from_sales_workload: false,
        archived_at: null,
        deleted_at: null,
      };
      await supabase.from("leads").update(patch as any).eq("id", match.id);
      await supabase.from("paid_pipeline_leads").update({ crm_lead_id: match.id } as any).eq("id", paidPipelineLeadId);
      logActivity({
        module_key: "paid_pipeline",
        action_type: "paid_pipeline_crm_link_repaired",
        entity_type: "paid_pipeline_lead",
        entity_id: paidPipelineLeadId,
        entity_label: (paid as any).name || undefined,
        metadata: {
          paid_pipeline_lead_id: paidPipelineLeadId,
          crm_lead_id: match.id,
          email, phone,
          new_pipeline_id: pipelineId,
          new_stage_id: stageId,
        },
        summary: `Linked paid buyer to existing CRM lead ${match.full_name || ""} and moved to Paid Onboarding.`,
      }).catch(() => {});
      return { ok: true, crmLeadId: match.id, action: "linked_existing", message: "Linked existing CRM lead and moved to Paid Onboarding" };
    }

    // 3) No CRM lead exists → create one in Paid Onboarding.
    const insertRow: Record<string, any> = {
      full_name: (paid as any).name || "Unnamed Buyer",
      email: (paid as any).email || null,
      phone: (paid as any).phone || null,
      pipeline_id: pipelineId,
      stage_id: stageId,
      lead_type: "paid",
      paid_pipeline_lead_id: paidPipelineLeadId,
      conversion_status: "converted",
      hide_from_sales_workload: false,
      assigned_agent_id: (paid as any).assigned_sales_executive || null,
      program_name: (paid as any).product_name_snapshot || "",
      webinar_source: (paid as any).batch_name_snapshot || null,
      deal_value: Number((paid as any).deal_value_including_gst || 0),
    };
    const { data: created, error: insErr } = await supabase
      .from("leads").insert(insertRow).select("id").maybeSingle();
    if (insErr || !created) {
      return { ok: false, crmLeadId: null, action: "error", message: insErr?.message || "Failed to create CRM lead" };
    }
    await supabase.from("paid_pipeline_leads").update({ crm_lead_id: (created as any).id } as any).eq("id", paidPipelineLeadId);
    logActivity({
      module_key: "paid_pipeline",
      action_type: "paid_pipeline_crm_lead_created",
      entity_type: "paid_pipeline_lead",
      entity_id: paidPipelineLeadId,
      entity_label: (paid as any).name || undefined,
      metadata: {
        paid_pipeline_lead_id: paidPipelineLeadId,
        crm_lead_id: (created as any).id,
        email, phone,
        new_pipeline_id: pipelineId,
        new_stage_id: stageId,
      },
      summary: `Created Paid Onboarding CRM lead for ${(paid as any).name || "buyer"}.`,
    }).catch(() => {});
    return { ok: true, crmLeadId: (created as any).id, action: "created", message: "CRM lead created in Paid — Onboarding" };
  } catch (e: any) {
    return { ok: false, crmLeadId: null, action: "error", message: e?.message || "Repair failed" };
  }
}
