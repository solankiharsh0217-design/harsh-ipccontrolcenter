import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, format, parseISO, isBefore, isAfter, getDaysInMonth,
} from "date-fns";

const sb: any = supabase;

const MOD = { module_key: "team_performance", module_label: "Team Performance" };

export interface GenerationResult {
  target_date: string;
  assignments_checked: number;
  entries_created: number;
  entries_skipped_duplicates: number;
  entries_skipped_inactive: number;
  entries_skipped_out_of_range: number;
  entries_skipped_unsupported: number;
  errors: { assignment_id?: string; kpi_id?: string; error: string }[];
  created_ids: string[];
}

function toDateOnly(d: Date): string { return format(d, "yyyy-MM-dd"); }

/** Build period_start / period_end / due_at for a KPI on targetDate. Returns null if unsupported. */
function periodFor(
  cadence: string,
  targetDate: Date,
  kpi: { due_time?: string | null; due_day_of_week?: number | null; due_day_of_month?: number | null; recurrence_rule?: string | null },
): { period_start: string; period_end: string; due_at: string | null } | { unsupported: string } | null {
  const applyTime = (day: Date): string | null => {
    if (!kpi.due_time) return null;
    // due_time = "HH:MM:SS"
    const [h, m, s] = kpi.due_time.split(":").map((n) => parseInt(n, 10) || 0);
    const dt = new Date(day);
    dt.setHours(h, m, s || 0, 0);
    return dt.toISOString();
  };

  if (cadence === "daily") {
    return { period_start: toDateOnly(targetDate), period_end: toDateOnly(targetDate), due_at: applyTime(targetDate) };
  }
  if (cadence === "weekly") {
    const monday = startOfWeek(targetDate, { weekStartsOn: 1 });
    const sunday = endOfWeek(targetDate, { weekStartsOn: 1 });
    let dueDay = sunday;
    if (kpi.due_day_of_week != null) {
      // ISO: 1=Mon..7=Sun
      const dow = Math.min(7, Math.max(1, kpi.due_day_of_week));
      dueDay = addDays(monday, dow - 1);
    }
    return { period_start: toDateOnly(monday), period_end: toDateOnly(sunday), due_at: applyTime(dueDay) };
  }
  if (cadence === "monthly") {
    const first = startOfMonth(targetDate);
    const last = endOfMonth(targetDate);
    let dueDay = last;
    if (kpi.due_day_of_month != null) {
      const maxDay = getDaysInMonth(targetDate);
      const day = Math.min(kpi.due_day_of_month, maxDay);
      dueDay = new Date(first.getFullYear(), first.getMonth(), day);
    }
    return { period_start: toDateOnly(first), period_end: toDateOnly(last), due_at: applyTime(dueDay) };
  }
  if (cadence === "recurring") {
    if (!kpi.recurrence_rule || kpi.recurrence_rule.trim() === "" || kpi.recurrence_rule.toLowerCase() === "daily") {
      return { period_start: toDateOnly(targetDate), period_end: toDateOnly(targetDate), due_at: applyTime(targetDate) };
    }
    return { unsupported: "Complex recurring rules will be supported in a later phase." };
  }
  if (cadence === "custom") {
    return { unsupported: "Custom cadence generation not supported in Phase 2." };
  }
  return null;
}

/** Idempotent: generate kpi_entries for the given date. Admin-only via RLS. */
export async function generateKpiEntriesForDate(targetDateStr: string): Promise<GenerationResult> {
  const targetDate = parseISO(targetDateStr);

  const result: GenerationResult = {
    target_date: targetDateStr,
    assignments_checked: 0,
    entries_created: 0,
    entries_skipped_duplicates: 0,
    entries_skipped_inactive: 0,
    entries_skipped_out_of_range: 0,
    entries_skipped_unsupported: 0,
    errors: [],
    created_ids: [],
  };

  await logActivity({ ...MOD, action_type: "kpi_entries_generation_started", entity_type: "kpi_entries", metadata: { target_date: targetDateStr }, summary: `KPI generation started for ${targetDateStr}` });

  // 1) Load all assignments
  const { data: assignments, error: aerr } = await sb.from("kpi_assignments").select("*");
  if (aerr) throw aerr;

  // 2) Preload KPI defs + template items in bulk
  const { data: kpis } = await sb.from("kpi_definitions").select("*");
  const kpiById = new Map<string, any>((kpis ?? []).map((k: any) => [k.id, k]));

  const templateIds = Array.from(new Set((assignments ?? []).filter((a: any) => a.assignment_type === "template" && a.template_id).map((a: any) => a.template_id)));
  let itemsByTemplate = new Map<string, any[]>();
  if (templateIds.length) {
    const { data: items } = await sb.from("kpi_template_items").select("*").in("template_id", templateIds);
    for (const it of items ?? []) {
      const arr = itemsByTemplate.get(it.template_id) ?? [];
      arr.push(it);
      itemsByTemplate.set(it.template_id, arr);
    }
  }

  // Build target entries
  type Plan = { assignment: any; kpi: any; period_start: string; period_end: string; due_at: string | null; target_value: number | null; period_type: string };
  const plans: Plan[] = [];

  for (const a of assignments ?? []) {
    result.assignments_checked++;
    if (!a.is_active) { result.entries_skipped_inactive++; continue; }
    if (a.start_date && isAfter(parseISO(a.start_date), targetDate)) { result.entries_skipped_out_of_range++; continue; }
    if (a.end_date && isBefore(parseISO(a.end_date), targetDate)) { result.entries_skipped_out_of_range++; continue; }

    // Resolve KPI list
    let kpiList: { kpi: any; target_override: number | null }[] = [];
    if (a.assignment_type === "template" && a.template_id) {
      const items = itemsByTemplate.get(a.template_id) ?? [];
      for (const it of items) {
        const kpi = kpiById.get(it.kpi_id);
        if (kpi && kpi.is_active) kpiList.push({ kpi, target_override: it.target_override });
      }
    } else if (a.assignment_type === "individual" && a.kpi_id) {
      const kpi = kpiById.get(a.kpi_id);
      if (kpi && kpi.is_active) kpiList.push({ kpi, target_override: null });
    }

    for (const { kpi, target_override } of kpiList) {
      const per = periodFor(kpi.cadence, targetDate, kpi);
      if (!per) { result.entries_skipped_unsupported++; continue; }
      if ("unsupported" in per) { result.entries_skipped_unsupported++; continue; }
      const target_value = a.custom_target ?? target_override ?? kpi.target_default ?? null;
      plans.push({
        assignment: a, kpi,
        period_start: per.period_start, period_end: per.period_end, due_at: per.due_at,
        target_value, period_type: kpi.cadence,
      });
    }
  }

  // Insert one by one to detect duplicates via unique constraint (idempotent).
  for (const p of plans) {
    const row = {
      assignment_id: p.assignment.id,
      user_id: p.assignment.user_id,
      kpi_id: p.kpi.id,
      period_type: p.period_type,
      period_start: p.period_start,
      period_end: p.period_end,
      due_at: p.due_at,
      target_value: p.target_value,
      // Snapshots: frozen at generation time so later KPI edits never rewrite history.
      weight_snapshot: p.kpi.weight ?? 1,
      direction_snapshot: p.kpi.direction ?? "higher_is_better",
      points_allocation_snapshot: p.kpi.points_allocation ?? 0,
      status: "pending",
    };
    const { data, error } = await sb.from("kpi_entries").insert(row).select("id").single();
    if (error) {
      if ((error.code === "23505") || (error.message || "").toLowerCase().includes("duplicate")) {
        result.entries_skipped_duplicates++;
      } else {
        result.errors.push({ assignment_id: p.assignment.id, kpi_id: p.kpi.id, error: error.message });
      }
    } else if (data) {
      result.entries_created++;
      result.created_ids.push(data.id);
    }
  }

  if (result.entries_skipped_duplicates > 0) {
    await logActivity({ ...MOD, action_type: "kpi_entries_generation_skipped_duplicates", entity_type: "kpi_entries", metadata: { target_date: targetDateStr, skipped: result.entries_skipped_duplicates } });
  }
  if (result.errors.length) {
    await logActivity({ ...MOD, action_type: "kpi_entries_generation_failed", entity_type: "kpi_entries", metadata: { target_date: targetDateStr, errors: result.errors }, severity: "warning" });
  }
  await logActivity({
    ...MOD,
    action_type: "kpi_entries_generated",
    entity_type: "kpi_entries",
    metadata: {
      target_date: targetDateStr,
      created: result.entries_created,
      duplicates: result.entries_skipped_duplicates,
      inactive: result.entries_skipped_inactive,
      out_of_range: result.entries_skipped_out_of_range,
      unsupported: result.entries_skipped_unsupported,
      errors: result.errors.length,
    },
    summary: `Generated ${result.entries_created} KPI entries for ${targetDateStr}`,
  });

  return result;
}

// ─────── Preview / listing ───────
export interface GeneratedEntryRow {
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
  kpi_name?: string;
  user_name?: string;
  assignment_type?: string;
}

export interface EntryFilters {
  date?: string; // filters where date is within [period_start, period_end]
  user_id?: string;
  cadence?: string;
  status?: string;
  kpi_id?: string;
  template_id?: string;
}

export async function listGeneratedEntries(filters: EntryFilters = {}): Promise<GeneratedEntryRow[]> {
  let q = sb.from("kpi_entries").select("*, kpi:kpi_definitions(name), assignment:kpi_assignments(assignment_type, template_id)").order("generated_at", { ascending: false }).limit(1000);
  if (filters.user_id) q = q.eq("user_id", filters.user_id);
  if (filters.cadence) q = q.eq("period_type", filters.cadence);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.kpi_id) q = q.eq("kpi_id", filters.kpi_id);
  if (filters.date) { q = q.lte("period_start", filters.date).gte("period_end", filters.date); }

  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as any[];
  if (filters.template_id) {
    rows = rows.filter((r) => r.assignment?.template_id === filters.template_id);
  }

  // Attach names
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  let nameById = new Map<string, string>();
  if (userIds.length) {
    const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", userIds);
    nameById = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
  }
  return rows.map((r) => ({
    id: r.id,
    assignment_id: r.assignment_id,
    user_id: r.user_id,
    kpi_id: r.kpi_id,
    period_type: r.period_type,
    period_start: r.period_start,
    period_end: r.period_end,
    due_at: r.due_at,
    target_value: r.target_value,
    status: r.status,
    generated_at: r.generated_at,
    kpi_name: r.kpi?.name,
    user_name: nameById.get(r.user_id),
    assignment_type: r.assignment?.assignment_type,
  }));
}
