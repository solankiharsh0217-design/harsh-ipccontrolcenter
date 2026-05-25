import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";

export type SaveCentralFollowUpInput = {
  crmLeadId?: string | null;
  paidLeadId?: string | null;
  leadName?: string;
  date: string;
  time?: string | null;
  type?: string | null;
  priority?: string | null;
  note?: string | null;
  status?: string | null;
  ownerId?: string | null;
  createdBy?: string | null;
  sourceModule?: string | null;
  auditActionType?: string;
  auditModuleKey?: string;
  auditModuleLabel?: string;
  metadata?: Record<string, any>;
};

export function mapTypeToChannel(t: string | null | undefined): "call" | "whatsapp" | "email" | "sms" | "note" {
  const v = (t || "").toLowerCase();
  if (v.includes("whatsapp")) return "whatsapp";
  if (v.includes("email")) return "email";
  if (v.includes("sms")) return "sms";
  if (v.includes("note")) return "note";
  return "call";
}

export async function saveCentralFollowUp(input: SaveCentralFollowUpInput) {
  const followUpDate = input.date;
  const followUpTime = (input.time || "11:00").slice(0, 5);
  const followUpType = input.type || null;
  const status = input.status || "Pending";
  const ownerId = input.ownerId || input.createdBy || null;
  if (!input.crmLeadId && !input.paidLeadId) throw new Error("No lead linked");

  const row: any = {
    paid_pipeline_lead_id: input.paidLeadId || null,
    related_crm_lead_id: input.crmLeadId || null,
    follow_up_date: followUpDate,
    follow_up_time: followUpTime,
    follow_up_type: followUpType,
    follow_up_reason: followUpType,
    priority: input.priority || "Normal",
    status,
    assigned_to: ownerId,
    notes: input.note || null,
    source_module: input.sourceModule || (input.paidLeadId ? "paid_pipeline" : "calling_crm"),
    created_by: input.createdBy || null,
  };

  let exactQ = (supabase as any).from("paid_pipeline_followups")
    .select("id")
    .eq("follow_up_date", followUpDate)
    .eq("follow_up_time", followUpTime)
    .eq("status", "Pending")
    .eq("is_deleted", false);
  exactQ = followUpType ? exactQ.eq("follow_up_type", followUpType) : exactQ.is("follow_up_type", null);
  exactQ = input.paidLeadId
    ? exactQ.eq("paid_pipeline_lead_id", input.paidLeadId)
    : exactQ.is("paid_pipeline_lead_id", null).eq("related_crm_lead_id", input.crmLeadId);
  const { data: exact } = await exactQ.limit(1);

  let targetId = exact?.[0]?.id as string | undefined;
  if (!targetId && status === "Pending") {
    let latestQ = (supabase as any).from("paid_pipeline_followups")
      .select("id")
      .eq("status", "Pending")
      .eq("is_deleted", false);
    latestQ = followUpType ? latestQ.eq("follow_up_type", followUpType) : latestQ.is("follow_up_type", null);
    latestQ = input.paidLeadId
      ? latestQ.eq("paid_pipeline_lead_id", input.paidLeadId)
      : latestQ.is("paid_pipeline_lead_id", null).eq("related_crm_lead_id", input.crmLeadId);
    const { data: latest } = await latestQ.order("created_at", { ascending: false }).limit(1);
    targetId = latest?.[0]?.id as string | undefined;
  }

  if (targetId) await (supabase as any).from("paid_pipeline_followups").update(row).eq("id", targetId);
  else {
    const { data } = await (supabase as any).from("paid_pipeline_followups").insert(row).select("id").maybeSingle();
    targetId = data?.id;
  }

  if (input.crmLeadId && status === "Pending") {
    const channel = mapTypeToChannel(followUpType);
    const reminderRow = {
      lead_id: input.crmLeadId,
      agent_id: ownerId,
      reminder_date: followUpDate,
      reminder_time: followUpTime,
      channel,
      note: input.note || followUpType || null,
    };
    const { data: rDup } = await (supabase as any).from("follow_up_reminders")
      .select("id")
      .eq("lead_id", input.crmLeadId)
      .eq("reminder_date", followUpDate)
      .eq("reminder_time", followUpTime)
      .eq("channel", channel)
      .eq("is_completed", false)
      .limit(1);
    if (rDup?.[0]?.id) await (supabase as any).from("follow_up_reminders").update(reminderRow).eq("id", rDup[0].id);
    else await (supabase as any).from("follow_up_reminders").insert(reminderRow);
  }

  if (input.paidLeadId) {
    await (supabase as any).from("paid_pipeline_leads").update({
      next_follow_up_date: followUpDate,
      next_follow_up_time: followUpTime,
      follow_up_reason: followUpType,
      follow_up_priority: input.priority || "Normal",
      follow_up_status: status,
    }).eq("id", input.paidLeadId);
  }

  await logActivity({
    module_key: input.auditModuleKey || "follow_up_command_center",
    module_label: input.auditModuleLabel || "Follow-Up Command Center",
    action_type: input.auditActionType || "follow_up_created",
    action_label: "Follow-up saved",
    entity_type: input.paidLeadId ? "paid_pipeline_lead" : "crm_lead",
    entity_id: input.paidLeadId || input.crmLeadId || null,
    entity_label: input.leadName,
    new_values: { date: followUpDate, time: followUpTime, type: followUpType, priority: input.priority, note: input.note, status },
    metadata: { paid_pipeline_lead_id: input.paidLeadId || null, crm_lead_id: input.crmLeadId || null, owner_id: ownerId, changed_by: input.createdBy || null, follow_up_id: targetId || null, ...input.metadata },
    summary: `Follow-up saved for ${input.leadName || "lead"} on ${followUpDate} ${followUpTime} (${followUpType || "—"}, ${input.priority || "Normal"}).`,
  });

  return { id: targetId };
}