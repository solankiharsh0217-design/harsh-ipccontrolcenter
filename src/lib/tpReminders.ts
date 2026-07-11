import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";

const sb: any = supabase;
const MOD = { module_key: "team_performance", module_label: "Team Performance" };

export type ReminderType = "morning_summary" | "due_soon" | "overdue" | "rejected_feedback";
export type ReminderStatus = "unread" | "read" | "dismissed";

export interface TpReminder {
  id: string;
  user_id: string;
  kpi_entry_id: string | null;
  reminder_type: ReminderType;
  title: string;
  message: string;
  status: ReminderStatus;
  reminder_for_date: string;
  generated_at: string;
  read_at: string | null;
  dismissed_at: string | null;
}

export interface TpReminderSettings {
  auto_checkin_on_login: boolean;
  daily_reminder_enabled: boolean;
  reminder_morning_time: string;
  reminder_due_soon_minutes: number;
  reminder_overdue_enabled: boolean;
}

export async function fetchTpSettings(): Promise<TpReminderSettings | null> {
  const { data, error } = await sb.rpc("get_team_performance_settings");
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function fetchMyTodayReminders(userId: string, date: string): Promise<TpReminder[]> {
  const { data, error } = await sb
    .from("team_performance_reminders")
    .select("*")
    .eq("user_id", userId)
    .eq("reminder_for_date", date)
    .neq("status", "dismissed")
    .order("generated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TpReminder[];
}

export async function generateMyReminders(userId: string, date: string): Promise<{ created: number; skipped_duplicates: number; skipped_disabled: boolean }> {
  const { data, error } = await sb.rpc("generate_tp_reminders_for_user", { _user_id: userId, _target_date: date });
  if (error) throw error;
  const res = (data ?? {}) as any;
  const created = res.created ?? 0;
  if (created > 0) {
    await logActivity({ ...MOD, action_type: "team_performance_reminders_generated", entity_type: "team_performance_reminders", metadata: { date, created, skipped_duplicates: res.skipped_duplicates ?? 0, scope: "self" }, summary: `Generated ${created} reminder(s)` });
  }
  return { created, skipped_duplicates: res.skipped_duplicates ?? 0, skipped_disabled: !!res.skipped_disabled };
}

export async function adminGenerateReminders(date: string): Promise<{ users_checked: number; created: number; skipped_duplicates: number; skipped_disabled: boolean }> {
  const { data, error } = await sb.rpc("generate_tp_reminders_for_date", { _target_date: date });
  if (error) throw error;
  const res = (data ?? {}) as any;
  await logActivity({ ...MOD, action_type: "team_performance_reminders_generated", entity_type: "team_performance_reminders", metadata: { date, ...res, scope: "admin_bulk" }, summary: `Admin generated ${res.created ?? 0} reminder(s) for ${res.users_checked ?? 0} user(s)` });
  return { users_checked: res.users_checked ?? 0, created: res.created ?? 0, skipped_duplicates: res.skipped_duplicates ?? 0, skipped_disabled: !!res.skipped_disabled };
}

export async function markReminderRead(id: string): Promise<void> {
  const { error } = await sb
    .from("team_performance_reminders")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await logActivity({ ...MOD, action_type: "team_performance_reminder_read", entity_type: "team_performance_reminder", entity_id: id, summary: "Marked reminder as read" });
}

export async function dismissReminder(id: string): Promise<void> {
  const { error } = await sb
    .from("team_performance_reminders")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await logActivity({ ...MOD, action_type: "team_performance_reminder_dismissed", entity_type: "team_performance_reminder", entity_id: id, summary: "Dismissed reminder" });
}
