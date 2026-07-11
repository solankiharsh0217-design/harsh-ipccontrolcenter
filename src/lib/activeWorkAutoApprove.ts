import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import type { MyKpiEntry } from "@/lib/myToday";
import type { KpiSubmission } from "@/lib/kpiSubmissions";

const sb: any = supabase;
const MOD = { module_key: "team_performance", module_label: "Team Performance" };

export const ACTIVE_WORK_KEY = "active_work_minutes";
const REVIEWED_STATUSES = new Set(["approved", "rejected", "missed", "waived"]);

export function isActiveWorkKpi(entry: MyKpiEntry): boolean {
  return (entry.kpi?.auto_source_key ?? "").trim() === ACTIVE_WORK_KEY;
}

export function activeWorkTarget(entry: MyKpiEntry, fallback: number): number {
  const t = entry.target_value ?? entry.kpi?.target_default ?? fallback ?? 360;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 360;
}

export interface EvalParams {
  userId: string;
  entries: MyKpiEntry[];
  submissions: Record<string, KpiSubmission>;
  activeMinutes: number;
  fallbackTarget: number;
  trackingEnabled: boolean;
}

export interface EvalResult {
  evaluated: number;
  approvedEntryIds: string[];
  submissionsByEntry: Record<string, KpiSubmission>;
}

/**
 * Evaluate active-work KPIs and auto-approve any whose active minutes have
 * reached target. Idempotent: skips already-reviewed entries and does not
 * overwrite rejected/manual-reviewed submissions.
 */
export async function evaluateActiveWorkKpis(params: EvalParams): Promise<EvalResult> {
  const { userId, entries, submissions, activeMinutes, fallbackTarget, trackingEnabled } = params;
  const result: EvalResult = { evaluated: 0, approvedEntryIds: [], submissionsByEntry: {} };
  if (!trackingEnabled) return result;
  if (!userId) return result;

  const candidates = entries.filter(isActiveWorkKpi);
  if (candidates.length === 0) return result;
  result.evaluated = candidates.length;

  for (const entry of candidates) {
    // Skip already reviewed entries (approved/rejected/missed/waived)
    if (REVIEWED_STATUSES.has(entry.status)) continue;

    const target = activeWorkTarget(entry, fallbackTarget);
    if (activeMinutes < target) continue;

    const existing = submissions[entry.id];
    // Never override rejected or manual-reviewed submissions
    if (existing && (existing.status === "rejected" || existing.status === "approved")) continue;

    const nowIso = new Date().toISOString();
    const payload: any = {
      entry_id: entry.id,
      user_id: userId,
      submitted_value: activeMinutes,
      proof_url: existing?.proof_url ?? null,
      notes: existing?.notes || "Auto-approved from active work time tracking.",
      submitted_at: nowIso,
      status: "approved",
      reviewed_at: nowIso,
      reviewed_by: null,
      review_notes: existing?.review_notes ?? null,
    };

    try {
      let saved: KpiSubmission | null = null;
      if (existing) {
        const { data, error } = await sb
          .from("kpi_submissions")
          .update(payload)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        saved = data as KpiSubmission;
      } else {
        const { data, error } = await sb
          .from("kpi_submissions")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        saved = data as KpiSubmission;
      }

      const { error: entryErr } = await sb
        .from("kpi_entries")
        .update({ status: "approved" })
        .eq("id", entry.id);
      if (entryErr) throw entryErr;

      if (saved) result.submissionsByEntry[entry.id] = saved;
      result.approvedEntryIds.push(entry.id);

      // Audit — only on state change
      const meta = {
        entry_id: entry.id,
        kpi_id: entry.kpi?.id ?? entry.kpi_id,
        kpi_name: entry.kpi?.name,
        active_minutes: activeMinutes,
        target_minutes: target,
        auto_source_key: ACTIVE_WORK_KEY,
      };
      try {
        await logActivity({
          ...MOD,
          action_type: "kpi_auto_source_evaluated",
          entity_type: "kpi_entry",
          entity_id: entry.id,
          metadata: meta,
        });
        await logActivity({
          ...MOD,
          action_type: "kpi_active_work_auto_approved",
          entity_type: "kpi_submission",
          entity_id: saved?.id ?? null,
          metadata: meta,
          summary: `Auto-approved ${entry.kpi?.name ?? "KPI"} from ${activeMinutes} active minutes`,
        });
        await logActivity({
          ...MOD,
          action_type: "kpi_entry_status_updated",
          entity_type: "kpi_entry",
          entity_id: entry.id,
          metadata: { ...meta, old_status: entry.status, new_status: "approved" },
        });
      } catch { /* non-fatal */ }
    } catch (e) {
      // Non-fatal: one failed entry should not block others
      console.warn("[activeWorkAutoApprove] failed for entry", entry.id, e);
    }
  }

  return result;
}
