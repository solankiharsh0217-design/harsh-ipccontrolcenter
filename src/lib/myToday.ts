import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import { format } from "date-fns";

const sb: any = supabase;
const MOD = { module_key: "team_performance", module_label: "Team Performance" };

export interface AttendanceSession {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  total_minutes: number | null;
  source: string;
  status: string;
  notes: string | null;
}

export interface MyKpiEntry {
  id: string;
  assignment_id: string;
  user_id: string;
  kpi_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  due_at: string | null;
  target_value: number | null;
  status: string;
  generated_at: string;
  kpi?: {
    id: string;
    name: string;
    description: string | null;
    cadence: string;
    target_unit: string | null;
    measurement_type: string;
    proof_required: boolean;
    approval_required: boolean;
  };
  assignment?: { assignment_type: string };
}

export function todayStr(): string { return format(new Date(), "yyyy-MM-dd"); }

export async function fetchMyAttendance(userId: string, workDate: string): Promise<AttendanceSession | null> {
  const { data, error } = await sb
    .from("attendance_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function checkIn(userId: string): Promise<AttendanceSession> {
  const workDate = todayStr();
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("attendance_sessions")
    .insert({ user_id: userId, work_date: workDate, check_in_at: nowIso, source: "manual", status: "present" })
    .select("*")
    .single();
  if (error) {
    // If already exists, just fetch it
    const existing = await fetchMyAttendance(userId, workDate);
    if (existing) return existing;
    throw error;
  }
  await logActivity({ ...MOD, action_type: "attendance_check_in", entity_type: "attendance_session", entity_id: data.id, metadata: { work_date: workDate }, summary: "Checked in" });
  return data;
}

export async function checkOut(session: AttendanceSession): Promise<AttendanceSession> {
  const now = new Date();
  const inTs = session.check_in_at ? new Date(session.check_in_at) : now;
  const totalMinutes = Math.max(0, Math.round((now.getTime() - inTs.getTime()) / 60000));
  const { data, error } = await sb
    .from("attendance_sessions")
    .update({ check_out_at: now.toISOString(), total_minutes: totalMinutes })
    .eq("id", session.id)
    .select("*")
    .single();
  if (error) throw error;
  await logActivity({ ...MOD, action_type: "attendance_check_out", entity_type: "attendance_session", entity_id: session.id, metadata: { work_date: session.work_date, total_minutes: totalMinutes }, summary: `Checked out (${totalMinutes} min)` });
  return data;
}

export async function fetchMyTodayEntries(userId: string, date: string): Promise<MyKpiEntry[]> {
  const { data, error } = await sb
    .from("kpi_entries")
    .select("*, kpi:kpi_definitions(id,name,description,cadence,target_unit,measurement_type,proof_required,approval_required), assignment:kpi_assignments(assignment_type)")
    .eq("user_id", userId)
    .lte("period_start", date)
    .gte("period_end", date)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as MyKpiEntry[];
}

export async function generateMyEntriesForDate(date: string): Promise<{ created: number; skipped_duplicates: number; unsupported: number }> {
  const { data, error } = await sb.rpc("generate_my_kpi_entries_for_date", { _target_date: date });
  if (error) throw error;
  const res = (data ?? {}) as any;
  if ((res.created ?? 0) > 0) {
    await logActivity({ ...MOD, action_type: "my_today_kpis_generated", entity_type: "kpi_entries", metadata: { target_date: date, ...res }, summary: `Generated ${res.created} KPI entries for today` });
  }
  return { created: res.created ?? 0, skipped_duplicates: res.skipped_duplicates ?? 0, unsupported: res.unsupported ?? 0 };
}

export async function countMyActiveAssignments(userId: string, date: string): Promise<number> {
  const { count, error } = await sb
    .from("kpi_assignments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true)
    .or(`start_date.is.null,start_date.lte.${date}`)
    .or(`end_date.is.null,end_date.gte.${date}`);
  if (error) return 0;
  return count ?? 0;
}
