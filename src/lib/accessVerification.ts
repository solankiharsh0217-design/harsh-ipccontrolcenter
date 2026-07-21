import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";

export type WhatsappStatus = "unknown" | "invite_sent" | "not_joined" | "joined_verified" | "link_issue";
export type AppLoginStatus = "unknown" | "never_logged_in" | "logged_in" | "access_issue";
export type CallStatus = "not_called" | "no_answer" | "connected" | "follow_up_needed" | "resolved";
export type OverallStatus = "completed" | "needs_help" | "incomplete";

export interface AccessVerification {
  id: string;
  crm_lead_id: string | null;
  paid_pipeline_lead_id: string | null;
  user_id: string | null;
  whatsapp_group_status: WhatsappStatus;
  whatsapp_verified_at: string | null;
  whatsapp_verified_by: string | null;
  app_login_status: AppLoginStatus;
  app_last_login_at: string | null;
  app_login_verified_at: string | null;
  app_login_verified_by: string | null;
  call_status: CallStatus;
  call_attempt_count: number;
  last_called_at: string | null;
  last_called_by: string | null;
  next_follow_up_at: string | null;
  contact_notes: string | null;
  created_at: string;
  updated_at: string;
}

export const WHATSAPP_LABELS: Record<WhatsappStatus, string> = {
  unknown: "Unknown",
  invite_sent: "Invite sent",
  not_joined: "Not joined",
  joined_verified: "Joined — verified",
  link_issue: "Link issue",
};
export const APP_LOGIN_LABELS: Record<AppLoginStatus, string> = {
  unknown: "Unknown",
  never_logged_in: "Never logged in",
  logged_in: "Logged in",
  access_issue: "Access issue",
};
export const CALL_LABELS: Record<CallStatus, string> = {
  not_called: "Not called",
  no_answer: "No answer",
  connected: "Connected",
  follow_up_needed: "Follow-up needed",
  resolved: "Resolved",
};

export function computeOverall(v: Pick<AccessVerification, "whatsapp_group_status" | "app_login_status" | "call_status"> | null | undefined): OverallStatus {
  if (!v) return "incomplete";
  if (v.whatsapp_group_status === "joined_verified" && v.app_login_status === "logged_in") return "completed";
  if (v.whatsapp_group_status === "link_issue" || v.app_login_status === "access_issue" || v.call_status === "follow_up_needed") return "needs_help";
  return "incomplete";
}

export async function fetchVerificationForPaidLead(paidLeadId: string): Promise<AccessVerification | null> {
  const { data } = await (supabase as any)
    .from("member_access_verifications")
    .select("*")
    .eq("paid_pipeline_lead_id", paidLeadId)
    .maybeSingle();
  return (data as AccessVerification) || null;
}

export async function fetchVerificationForCrmLead(crmLeadId: string): Promise<AccessVerification | null> {
  const { data } = await (supabase as any)
    .from("member_access_verifications")
    .select("*")
    .or(`crm_lead_id.eq.${crmLeadId},paid_pipeline_lead_id.in.(select id from paid_pipeline_leads where crm_lead_id=${crmLeadId})`)
    .maybeSingle();
  if (data) return data as AccessVerification;
  const { data: d2 } = await (supabase as any)
    .from("member_access_verifications")
    .select("*")
    .eq("crm_lead_id", crmLeadId)
    .maybeSingle();
  return (d2 as AccessVerification) || null;
}

export async function fetchVerificationsForPaidLeads(paidLeadIds: string[]): Promise<Map<string, AccessVerification>> {
  const map = new Map<string, AccessVerification>();
  if (paidLeadIds.length === 0) return map;
  const { data } = await (supabase as any)
    .from("member_access_verifications")
    .select("*")
    .in("paid_pipeline_lead_id", paidLeadIds);
  for (const r of (data || []) as AccessVerification[]) {
    if (r.paid_pipeline_lead_id) map.set(r.paid_pipeline_lead_id, r);
  }
  return map;
}

export interface UpsertInput {
  crm_lead_id?: string | null;
  paid_pipeline_lead_id?: string | null;
  whatsapp_group_status?: WhatsappStatus;
  app_login_status?: AppLoginStatus;
  call_status?: CallStatus;
  call_attempted?: boolean; // when true, increments attempt count and stamps last_called_*
  next_follow_up_at?: string | null;
  contact_notes?: string | null;
  memberLabel?: string;
}

export async function upsertVerification(input: UpsertInput): Promise<AccessVerification> {
  const { data: userRes } = await supabase.auth.getUser();
  const actorId = userRes.user?.id || null;
  const nowIso = new Date().toISOString();
  if (!input.crm_lead_id && !input.paid_pipeline_lead_id) throw new Error("Missing lead link");

  // Find existing
  let existing: AccessVerification | null = null;
  if (input.paid_pipeline_lead_id) {
    const { data } = await (supabase as any)
      .from("member_access_verifications").select("*")
      .eq("paid_pipeline_lead_id", input.paid_pipeline_lead_id).maybeSingle();
    existing = (data as AccessVerification) || null;
  }
  if (!existing && input.crm_lead_id) {
    const { data } = await (supabase as any)
      .from("member_access_verifications").select("*")
      .eq("crm_lead_id", input.crm_lead_id).maybeSingle();
    existing = (data as AccessVerification) || null;
  }

  const patch: any = {};
  if (input.whatsapp_group_status && input.whatsapp_group_status !== existing?.whatsapp_group_status) {
    patch.whatsapp_group_status = input.whatsapp_group_status;
    if (input.whatsapp_group_status === "joined_verified") {
      patch.whatsapp_verified_at = nowIso;
      patch.whatsapp_verified_by = actorId;
    }
  }
  if (input.app_login_status && input.app_login_status !== existing?.app_login_status) {
    patch.app_login_status = input.app_login_status;
    if (input.app_login_status === "logged_in") {
      patch.app_login_verified_at = nowIso;
      patch.app_login_verified_by = actorId;
    }
  }
  if (input.call_status && input.call_status !== existing?.call_status) {
    patch.call_status = input.call_status;
  }
  if (input.call_attempted) {
    patch.call_attempt_count = (existing?.call_attempt_count || 0) + 1;
    patch.last_called_at = nowIso;
    patch.last_called_by = actorId;
  }
  if (input.next_follow_up_at !== undefined) patch.next_follow_up_at = input.next_follow_up_at;
  if (input.contact_notes !== undefined) patch.contact_notes = input.contact_notes;

  let saved: AccessVerification;
  if (existing) {
    const { data, error } = await (supabase as any)
      .from("member_access_verifications")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    saved = data as AccessVerification;
  } else {
    const { data, error } = await (supabase as any)
      .from("member_access_verifications")
      .insert({
        crm_lead_id: input.crm_lead_id || null,
        paid_pipeline_lead_id: input.paid_pipeline_lead_id || null,
        ...patch,
      })
      .select("*")
      .single();
    if (error) throw error;
    saved = data as AccessVerification;
  }

  // Activity logging
  const entityType = input.paid_pipeline_lead_id ? "paid_pipeline_lead" : "crm_lead";
  const entityId = input.paid_pipeline_lead_id || input.crm_lead_id || null;
  const memberLabel = input.memberLabel;
  const logs: Array<Promise<any>> = [];
  if (input.call_attempted) {
    logs.push(logActivity({
      module_key: "access_followup", module_label: "Access Follow-up",
      action_type: "access_followup_call_recorded", action_label: "Call recorded",
      entity_type: entityType, entity_id: entityId, entity_label: memberLabel,
      old_values: existing ? { call_status: existing.call_status, attempts: existing.call_attempt_count } : null,
      new_values: { call_status: saved.call_status, attempts: saved.call_attempt_count, notes: input.contact_notes || null },
      summary: `Call recorded for ${memberLabel || "member"} (${CALL_LABELS[saved.call_status]}, attempt #${saved.call_attempt_count}).`,
    }));
  }
  if (input.whatsapp_group_status && input.whatsapp_group_status !== existing?.whatsapp_group_status) {
    const action =
      input.whatsapp_group_status === "joined_verified" ? "whatsapp_group_join_verified" :
      input.whatsapp_group_status === "invite_sent" ? "whatsapp_group_invite_sent" :
      "whatsapp_group_status_updated";
    logs.push(logActivity({
      module_key: "access_followup", module_label: "Access Follow-up",
      action_type: action, action_label: "WhatsApp group status",
      entity_type: entityType, entity_id: entityId, entity_label: memberLabel,
      old_values: { whatsapp_group_status: existing?.whatsapp_group_status ?? null },
      new_values: { whatsapp_group_status: input.whatsapp_group_status },
      summary: `WhatsApp group: ${WHATSAPP_LABELS[input.whatsapp_group_status]} (${memberLabel || "member"}).`,
    }));
  }
  if (input.app_login_status && input.app_login_status !== existing?.app_login_status) {
    const action = input.app_login_status === "logged_in" ? "app_login_verified"
      : input.app_login_status === "access_issue" ? "app_access_issue_recorded"
      : "app_login_status_updated";
    logs.push(logActivity({
      module_key: "access_followup", module_label: "Access Follow-up",
      action_type: action, action_label: "App login status",
      entity_type: entityType, entity_id: entityId, entity_label: memberLabel,
      old_values: { app_login_status: existing?.app_login_status ?? null },
      new_values: { app_login_status: input.app_login_status },
      summary: `App login: ${APP_LOGIN_LABELS[input.app_login_status]} (${memberLabel || "member"}).`,
    }));
  }
  if (input.next_follow_up_at !== undefined && input.next_follow_up_at !== existing?.next_follow_up_at) {
    logs.push(logActivity({
      module_key: "access_followup", module_label: "Access Follow-up",
      action_type: "access_followup_scheduled", action_label: "Follow-up scheduled",
      entity_type: entityType, entity_id: entityId, entity_label: memberLabel,
      new_values: { next_follow_up_at: input.next_follow_up_at },
      summary: input.next_follow_up_at
        ? `Follow-up scheduled for ${memberLabel || "member"} at ${new Date(input.next_follow_up_at).toLocaleString()}.`
        : `Follow-up cleared for ${memberLabel || "member"}.`,
    }));
  }
  if (computeOverall(saved) === "completed" && computeOverall(existing) !== "completed") {
    logs.push(logActivity({
      module_key: "access_followup", module_label: "Access Follow-up",
      action_type: "access_completion_verified", action_label: "Access completion verified",
      entity_type: entityType, entity_id: entityId, entity_label: memberLabel,
      new_values: { whatsapp: saved.whatsapp_group_status, app: saved.app_login_status },
      summary: `${memberLabel || "Member"} fully verified (WhatsApp joined + app logged in).`,
    }));
  }
  await Promise.all(logs);
  return saved;
}
