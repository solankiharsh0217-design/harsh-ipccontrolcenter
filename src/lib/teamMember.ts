import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";

export interface LinkedCounts {
  callingCrmLeads: number;
  paidPipelineLeads: number;
  operationsLeads: number;
  followUpReminders: number;
  paidFollowups: number;
  auditLogs: number;
  total: number;
}

export async function getMemberLinkedCounts(userId: string): Promise<LinkedCounts> {
  const head = { count: "exact" as const, head: true };
  const [crm, pp, ops, fu, ppfu, audit] = await Promise.all([
    supabase.from("leads").select("id", head).eq("assigned_agent_id", userId),
    supabase.from("paid_pipeline_leads").select("id", head).eq("assigned_sales_executive", userId),
    supabase.from("operations_leads").select("id", head).eq("assigned_media_buyer_id", userId),
    supabase.from("follow_up_reminders").select("id", head).eq("agent_id", userId).eq("is_completed", false),
    supabase.from("paid_pipeline_followups").select("id", head).eq("assigned_to", userId),
    (supabase as any).from("audit_logs").select("id", head).eq("actor_user_id", userId),
  ]);
  const callingCrmLeads = crm.count ?? 0;
  const paidPipelineLeads = pp.count ?? 0;
  const operationsLeads = ops.count ?? 0;
  const followUpReminders = fu.count ?? 0;
  const paidFollowups = ppfu.count ?? 0;
  const auditLogs = audit.count ?? 0;
  return {
    callingCrmLeads,
    paidPipelineLeads,
    operationsLeads,
    followUpReminders,
    paidFollowups,
    auditLogs,
    total: callingCrmLeads + paidPipelineLeads + operationsLeads + followUpReminders + paidFollowups,
  };
}

export async function deactivateMember(opts: { userId: string; name: string; reason?: string; actorId: string }) {
  const { error } = await supabase.from("profiles").update({
    deactivated_at: new Date().toISOString(),
    deactivated_by: opts.actorId,
    deactivation_reason: opts.reason || null,
    active_for_assignment: false,
  } as any).eq("id", opts.userId);
  if (error) throw error;
  await logActivity({
    module_key: "team_directory", action_type: "team_member_deactivated",
    entity_type: "team_member", entity_id: opts.userId, entity_label: opts.name,
    target_user_id: opts.userId, target_name: opts.name,
    metadata: { reason: opts.reason || null },
    summary: `${opts.name} deactivated.`, severity: "warning",
  });
}

export async function restoreMember(opts: { userId: string; name: string }) {
  const { error } = await supabase.from("profiles").update({
    deactivated_at: null,
    deactivated_by: null,
    deactivation_reason: null,
  } as any).eq("id", opts.userId);
  if (error) throw error;
  await logActivity({
    module_key: "team_directory", action_type: "team_member_restored",
    entity_type: "team_member", entity_id: opts.userId, entity_label: opts.name,
    target_user_id: opts.userId, target_name: opts.name,
    summary: `${opts.name} restored.`,
  });
}

export async function removeMemberAccess(opts: { userId: string; name: string }) {
  const { error } = await supabase.from("profiles").update({
    active_for_assignment: false,
    can_receive_calling_crm_leads: false,
    can_receive_paid_pipeline_leads: false,
    can_receive_operations_leads: false,
    can_receive_follow_up_tasks: false,
    can_receive_payment_recovery_leads: false,
    can_receive_media_buyer_cases: false,
    include_in_round_robin: false,
  } as any).eq("id", opts.userId);
  if (error) throw error;
  const { error: mErr } = await supabase.from("user_module_access").delete().eq("user_id", opts.userId);
  if (mErr) throw mErr;
  await logActivity({
    module_key: "team_directory", action_type: "team_member_access_removed",
    entity_type: "team_member", entity_id: opts.userId, entity_label: opts.name,
    target_user_id: opts.userId, target_name: opts.name,
    summary: `Access removed from ${opts.name}.`, severity: "warning",
  });
}

export async function deleteMemberSafely(opts: { userId: string; name: string }) {
  const counts = await getMemberLinkedCounts(opts.userId);
  if (counts.total > 0) {
    throw new Error("This member has linked assignments/history. Use Deactivate or Remove Access instead.");
  }
  // Audit BEFORE delete
  await logActivity({
    module_key: "team_directory", action_type: "team_member_deleted",
    entity_type: "team_member", entity_id: opts.userId, entity_label: opts.name,
    target_user_id: opts.userId, target_name: opts.name,
    summary: `${opts.name} permanently deleted from team directory.`, severity: "critical",
  });
  // Clean up dependents (safe ones)
  await supabase.from("user_module_access").delete().eq("user_id", opts.userId);
  await supabase.from("user_roles").delete().eq("user_id", opts.userId);
  const { error } = await supabase.from("profiles").delete().eq("id", opts.userId);
  if (error) throw error;
}

export async function reassignMemberWork(opts: {
  fromUserId: string; fromName: string;
  toUserId: string; toName: string;
}) {
  const a = await supabase.from("leads").update({ assigned_agent_id: opts.toUserId } as any).eq("assigned_agent_id", opts.fromUserId);
  const b = await supabase.from("paid_pipeline_leads").update({ assigned_sales_executive: opts.toUserId } as any).eq("assigned_sales_executive", opts.fromUserId);
  const c = await supabase.from("operations_leads").update({ assigned_media_buyer_id: opts.toUserId, assigned_media_buyer_name: opts.toName } as any).eq("assigned_media_buyer_id", opts.fromUserId);
  const d = await supabase.from("follow_up_reminders").update({ agent_id: opts.toUserId } as any).eq("agent_id", opts.fromUserId).eq("is_completed", false);
  const e = await supabase.from("paid_pipeline_followups").update({ assigned_to: opts.toUserId } as any).eq("assigned_to", opts.fromUserId);
  const firstErr = [a, b, c, d, e].find((r) => r.error);
  if (firstErr?.error) throw firstErr.error;
  await logActivity({
    module_key: "team_directory", action_type: "team_member_work_reassigned",
    entity_type: "team_member", entity_id: opts.fromUserId, entity_label: opts.fromName,
    target_user_id: opts.toUserId, target_name: opts.toName,
    summary: `Active work reassigned from ${opts.fromName} to ${opts.toName}.`, severity: "warning",
  });
}
