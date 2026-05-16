import { supabase } from "@/integrations/supabase/client";

export type NotificationPriority = "urgent" | "high" | "normal" | "low";
export type NotificationStatus = "unread" | "read" | "dismissed";

export interface CreateNotificationInput {
  recipient_user_id?: string | null;
  recipient_team_member_id?: string | null;
  recipient_role?: string | null;
  module_key: string;
  notification_type: string;
  title: string;
  message?: string;
  entity_type?: string;
  entity_id?: string | null;
  entity_label?: string;
  priority?: NotificationPriority;
  action_url?: string;
  action_label?: string;
  metadata?: Record<string, any>;
  triggered_by_user_id?: string | null;
  triggered_by_name?: string;
  source?: string;
  /** if true, skip the duplicate-prevention check */
  allowDuplicate?: boolean;
}

export const NOTIFICATION_MODULE_LABELS: Record<string, string> = {
  follow_up_command_center: "Follow-Up",
  payment_recovery: "Payment Recovery",
  paid_pipeline: "Paid Pipeline",
  calling_crm: "Calling CRM",
  webinar_performance: "Webinar Performance",
  audit_log: "Audit Log",
  master_settings: "Master Settings",
  team: "Team",
  admin: "Admin",
  reports: "Reports",
};

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    if (!input.recipient_user_id && !input.recipient_team_member_id && !input.recipient_role) {
      return;
    }
    if (!input.allowDuplicate && input.recipient_user_id && input.entity_id) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data: existing } = await (supabase as any)
        .from("notifications")
        .select("id")
        .eq("recipient_user_id", input.recipient_user_id)
        .eq("notification_type", input.notification_type)
        .eq("entity_id", input.entity_id)
        .eq("status", "unread")
        .eq("is_deleted", false)
        .gte("created_at", since.toISOString())
        .limit(1);
      if (existing && existing.length > 0) return;
    }
    await (supabase as any).from("notifications").insert({
      recipient_user_id: input.recipient_user_id ?? null,
      recipient_team_member_id: input.recipient_team_member_id ?? null,
      recipient_role: input.recipient_role ?? null,
      module_key: input.module_key,
      notification_type: input.notification_type,
      title: input.title,
      message: input.message ?? null,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      entity_label: input.entity_label ?? null,
      priority: input.priority ?? "normal",
      status: "unread",
      action_url: input.action_url ?? null,
      action_label: input.action_label ?? null,
      metadata: input.metadata ?? null,
      triggered_by_user_id: input.triggered_by_user_id ?? null,
      triggered_by_name: input.triggered_by_name ?? null,
      source: input.source ?? "app",
    });
  } catch (e) {
    console.warn("[notifications] createNotification failed", e);
  }
}

export async function notifyAdmins(input: Omit<CreateNotificationInput, "recipient_user_id" | "recipient_role">) {
  try {
    const { data: admins } = await (supabase as any)
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (!admins) return;
    for (const a of admins as Array<{ user_id: string }>) {
      await createNotification({ ...input, recipient_user_id: a.user_id });
    }
  } catch (e) {
    console.warn("[notifications] notifyAdmins failed", e);
  }
}

export async function markNotificationsRead(ids: string[]) {
  if (!ids.length) return;
  await (supabase as any)
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .in("id", ids);
}

export async function markAllRead(recipientUserId: string) {
  await (supabase as any)
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("recipient_user_id", recipientUserId)
    .eq("status", "unread");
}
