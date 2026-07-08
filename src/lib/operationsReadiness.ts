import { supabase } from "@/integrations/supabase/client";
import type { Stage } from "@/lib/crmTypes";
import { logActivity } from "@/lib/auditLog";

export interface ReadinessSettings {
  operations_readiness_target_stage_id: string | null;
  operations_readiness_auto_move: boolean;
}

export async function getReadinessSettings(): Promise<ReadinessSettings> {
  const { data } = await supabase
    .from("company_settings" as any)
    .select("operations_readiness_target_stage_id, operations_readiness_auto_move")
    .eq("workspace", "default")
    .maybeSingle();
  return {
    operations_readiness_target_stage_id: (data as any)?.operations_readiness_target_stage_id ?? null,
    operations_readiness_auto_move: !!(data as any)?.operations_readiness_auto_move,
  };
}

export async function updateReadinessSettings(patch: Partial<ReadinessSettings>): Promise<void> {
  // Ensure a default row exists, then update it.
  const { data: existing } = await supabase
    .from("company_settings" as any)
    .select("id")
    .eq("workspace", "default")
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase.from("company_settings" as any).insert({
      workspace: "default",
      ...patch,
    } as any);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("company_settings" as any)
    .update(patch as any)
    .eq("workspace", "default");
  if (error) throw error;
}

/**
 * Choose the stage to move a lead into when readiness reaches 100%.
 * Priority:
 *   1. configured target stage (if it exists on this pipeline)
 *   2. first stage whose name contains "active"
 *   3. first stage whose name contains "in progress"
 *   4. the next stage after the current one (by position)
 * Returns null if no forward stage could be resolved.
 */
export function resolveReadinessTargetStage(
  stages: Stage[],
  currentStageId: string | null,
  configuredTargetId: string | null,
): Stage | null {
  const ordered = [...stages].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
  if (configuredTargetId) {
    const configured = ordered.find((s) => s.id === configuredTargetId);
    if (configured) return configured;
  }
  const byName = (needle: string) =>
    ordered.find((s) => (s.name || "").toLowerCase().includes(needle));
  const active = byName("active") || byName("in progress");
  if (active) return active;
  if (currentStageId) {
    const idx = ordered.findIndex((s) => s.id === currentStageId);
    if (idx >= 0 && idx < ordered.length - 1) return ordered[idx + 1];
  } else if (ordered.length > 0) {
    return ordered[0];
  }
  return null;
}

/** True when currentStage is already at/after target (no backward moves). */
export function isAtOrAfterTarget(
  stages: Stage[],
  currentStageId: string | null,
  targetStageId: string,
): boolean {
  if (!currentStageId) return false;
  const ordered = [...stages].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
  const cur = ordered.findIndex((s) => s.id === currentStageId);
  const tgt = ordered.findIndex((s) => s.id === targetStageId);
  if (cur < 0 || tgt < 0) return false;
  return cur >= tgt;
}

export type ReadinessMoveKind = "readiness_manual_move" | "readiness_auto_move";

export async function moveOperationsLeadStage(params: {
  leadId: string;
  fromStageId: string | null;
  toStageId: string;
  fromStageName?: string | null;
  toStageName?: string | null;
  kind: ReadinessMoveKind;
  actorUserId: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from("operations_leads" as any)
    .update({ stage_id: params.toStageId } as any)
    .eq("id", params.leadId);
  if (error) throw error;

  // Best-effort audit trail via the audit_logs table.
  try {
    await logActivity({
      module_key: "operations_crm",
      module_label: "Operations CRM",
      action_type: params.kind,
      action_label: params.kind === "readiness_auto_move" ? "Readiness auto-move" : "Readiness manual move",
      entity_type: "operations_lead",
      entity_id: params.leadId,
      old_values: { stage_id: params.fromStageId, stage_name: params.fromStageName ?? null },
      new_values: { stage_id: params.toStageId, stage_name: params.toStageName ?? null },
      summary: `Readiness completed. Moved from ${params.fromStageName ?? "—"} to ${params.toStageName ?? "—"}.`,
    });
  } catch {
    /* audit log is best-effort */
  }
}
