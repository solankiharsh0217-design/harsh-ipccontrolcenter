import { supabase } from "@/integrations/supabase/client";

// Session-scoped guard: only attempt once per user per day per app session.
const attempted = new Set<string>();

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Ensures a today attendance_sessions row exists for the current user when the
 * admin setting `team_performance_auto_checkin_on_login` is ON.
 *
 * - Never overwrites existing check_in_at or check_out_at.
 * - Never reopens a closed-out day.
 * - Idempotent per user/day/app session (in-memory guard) and per DB row.
 * - Silent on failure (must never block auth flows).
 */
export async function ensureAutoCheckInForCurrentUser(userId: string): Promise<void> {
  if (!userId) return;
  const workDate = todayKey();
  const guardKey = `${userId}:${workDate}`;
  if (attempted.has(guardKey)) return;
  attempted.add(guardKey);

  try {
    const sb: any = supabase;

    // Only active users
    const { data: prof } = await sb
      .from("profiles")
      .select("status")
      .eq("id", userId)
      .maybeSingle();
    if (prof?.status !== "active") return;

    // Admin setting
    const { data: settingsRows } = await sb.rpc("get_team_performance_settings");
    const settings = Array.isArray(settingsRows) ? settingsRows[0] : settingsRows;
    if (!settings?.auto_checkin_on_login) return;

    // Existing row? Never touch check_in_at / check_out_at
    const { data: existing } = await sb
      .from("attendance_sessions")
      .select("id, check_in_at, check_out_at")
      .eq("user_id", userId)
      .eq("work_date", workDate)
      .maybeSingle();
    if (existing) return;

    const { data: inserted, error: insErr } = await sb
      .from("attendance_sessions")
      .insert({
        user_id: userId,
        work_date: workDate,
        check_in_at: new Date().toISOString(),
        source: "login",
        status: "present",
      })
      .select("id")
      .maybeSingle();

    if (!insErr && inserted) {
      // Best-effort activity log; ignore failures
      await sb.from("activity_logs").insert({
        module_key: "team_performance",
        module_label: "Team Performance",
        action_type: "attendance_auto_check_in",
        entity_type: "attendance_session",
        entity_id: inserted.id,
        actor_user_id: userId,
        metadata: { work_date: workDate, source: "login" },
        summary: "Auto checked-in on login",
      });
    }
  } catch {
    // Non-fatal — never block auth
  }
}
