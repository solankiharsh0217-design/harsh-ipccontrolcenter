import { supabase } from "@/integrations/supabase/client";

export interface OperationsSlaSettings {
  watch_days: number;
  overdue_days: number;
}

export const DEFAULT_SLA: OperationsSlaSettings = {
  watch_days: 3,
  overdue_days: 6,
};

export type SlaStatus = "on_track" | "watch" | "overdue";

export interface StageAging {
  days: number;
  status: SlaStatus;
  lastMovedAt: string; // ISO
  source: "exact" | "estimated";
}

export async function getOperationsSlaSettings(): Promise<OperationsSlaSettings> {
  try {
    const { data } = await supabase
      .from("company_settings" as any)
      .select("operations_sla_watch_days, operations_sla_overdue_days")
      .eq("workspace", "default")
      .maybeSingle();
    const w = Number((data as any)?.operations_sla_watch_days);
    const o = Number((data as any)?.operations_sla_overdue_days);
    return {
      watch_days: Number.isFinite(w) && w > 0 ? w : DEFAULT_SLA.watch_days,
      overdue_days: Number.isFinite(o) && o > 0 ? o : DEFAULT_SLA.overdue_days,
    };
  } catch {
    return { ...DEFAULT_SLA };
  }
}

export async function updateOperationsSlaSettings(patch: Partial<OperationsSlaSettings>): Promise<void> {
  const dbPatch: Record<string, any> = {};
  if (patch.watch_days != null) dbPatch.operations_sla_watch_days = patch.watch_days;
  if (patch.overdue_days != null) dbPatch.operations_sla_overdue_days = patch.overdue_days;
  const { data: existing } = await supabase
    .from("company_settings" as any)
    .select("id")
    .eq("workspace", "default")
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase
      .from("company_settings" as any)
      .insert({ workspace: "default", ...dbPatch } as any);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("company_settings" as any)
    .update(dbPatch as any)
    .eq("workspace", "default");
  if (error) throw error;
}

export function classifySla(days: number, settings: OperationsSlaSettings): SlaStatus {
  if (days >= settings.overdue_days) return "overdue";
  if (days >= settings.watch_days) return "watch";
  return "on_track";
}

const STAGE_MOVE_ACTIONS = new Set([
  "readiness_manual_move",
  "readiness_auto_move",
  "operations_stage_moved",
  "operations_lead_stage_moved",
  "stage_moved",
  "stage_changed",
]);

/**
 * Fetch the most recent stage-change timestamp per operations lead from audit_logs.
 * Read-only. Returns a map of leadId → ISO timestamp.
 */
export async function fetchStageChangeMap(leadIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!leadIds.length) return map;
  try {
    const { data } = await (supabase as any)
      .from("audit_logs")
      .select("entity_id, action_type, created_at, new_values")
      .eq("entity_type", "operations_lead")
      .eq("is_deleted", false)
      .in("entity_id", leadIds)
      .order("created_at", { ascending: false })
      .limit(2000);
    for (const r of (data ?? []) as any[]) {
      const eid = r.entity_id as string;
      if (!eid || map.has(eid)) continue;
      const at = r.action_type as string;
      const hasStageChange =
        STAGE_MOVE_ACTIONS.has(at) ||
        (at && at.toLowerCase().includes("stage")) ||
        (r.new_values && typeof r.new_values === "object" && "stage_id" in r.new_values);
      if (hasStageChange && r.created_at) map.set(eid, r.created_at);
    }
  } catch {
    // ignore — fallback to updated_at
  }
  return map;
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

export function computeStageAging(
  lead: { created_at?: string | null; updated_at?: string | null },
  settings: OperationsSlaSettings,
  exactLastMoved?: string | null,
): StageAging {
  const iso =
    exactLastMoved ||
    lead.updated_at ||
    lead.created_at ||
    new Date().toISOString();
  const days = daysSince(iso);
  return {
    days,
    status: classifySla(days, settings),
    lastMovedAt: iso,
    source: exactLastMoved ? "exact" : "estimated",
  };
}

export const SLA_LABELS: Record<SlaStatus, string> = {
  on_track: "On Track",
  watch: "Watch",
  overdue: "Overdue",
};

export const SLA_CLASSES: Record<SlaStatus, string> = {
  on_track: "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]",
  watch: "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]",
  overdue: "bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]",
};
