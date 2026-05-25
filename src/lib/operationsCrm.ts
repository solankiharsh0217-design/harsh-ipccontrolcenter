import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_OPERATIONS_STAGES: { name: string; color: string }[] = [
  { name: "New Assignment", color: "gray" },
  { name: "Client Contact Pending", color: "amber" },
  { name: "Client Contacted", color: "blue" },
  { name: "Ad Access Requested", color: "blue" },
  { name: "Ad Access Received", color: "indigo" },
  { name: "Ads Launched", color: "green" },
  { name: "Optimization Ongoing", color: "green" },
  { name: "Paused", color: "amber" },
  { name: "Stopped", color: "red" },
  { name: "Completed", color: "purple" },
  { name: "Issue / Escalation", color: "red" },
];

export interface OperationsPipelineInfo {
  pipelineId: string;
  firstStageId: string | null;
}

/**
 * Ensures the Operations CRM pipeline (pipeline_type = 'operations') exists
 * and is seeded with the default stages. Returns the pipeline id and the
 * id of the first stage. Safe to call multiple times.
 */
export async function ensureOperationsPipeline(): Promise<OperationsPipelineInfo> {
  const { data: existing } = await supabase
    .from("pipelines")
    .select("id")
    .eq("type", "operations" as any)
    .order("position")
    .limit(1);

  let pipelineId: string | null = (existing?.[0] as any)?.id ?? null;

  if (!pipelineId) {
    const { data: countRows } = await supabase.from("pipelines").select("id");
    const pos = (countRows?.length ?? 0);
    const { data: ins, error } = await supabase
      .from("pipelines")
      .insert({ name: "Operations CRM", type: "operations" as any, position: pos } as any)
      .select("id")
      .maybeSingle();
    if (error || !ins) throw new Error(error?.message || "Could not create Operations pipeline");
    pipelineId = (ins as any).id;

    // Seed default stages
    const rows = DEFAULT_OPERATIONS_STAGES.map((s, i) => ({
      pipeline_id: pipelineId,
      name: s.name,
      color: s.color,
      position: i,
    }));
    await supabase.from("stages").insert(rows as any);
  }

  const { data: st } = await supabase
    .from("stages")
    .select("id, position")
    .eq("pipeline_id", pipelineId!)
    .order("position")
    .limit(1);

  return {
    pipelineId: pipelineId!,
    firstStageId: (st?.[0] as any)?.id ?? null,
  };
}

export const SERVICE_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  active: "Active",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
};

export const SERVICE_STATUS_COLORS: Record<string, string> = {
  not_started: "bg-[#F3F4F6] text-[#6B7280]",
  active: "bg-[#DCFCE7] text-[#166534]",
  paused: "bg-[#FEF3C7] text-[#92400E]",
  stopped: "bg-[#FEE2E2] text-[#991B1B]",
  completed: "bg-[#E0E7FF] text-[#3730A3]",
};

// ─────────────── Service day calculations ───────────────

export function toDateStr(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  if (isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function todayStr(): string { return toDateStr(new Date())!; }

export function daysBetween(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  if (isNaN(da) || isNaN(db)) return 0;
  return Math.max(0, Math.round((db - da) / 86400000));
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d)!;
}

export function monthsToDays(months: number | null | undefined): number {
  if (!months || months <= 0) return 0;
  return Math.round(months * 30);
}

export interface OpsLeadCalcInput {
  service_status: string;
  service_months?: number | null;
  service_days_committed?: number | null;
  total_active_days?: number | null;
  total_paused_days?: number | null;
  current_active_start_date?: string | null;
  last_paused_at?: string | null;
  service_end_target_date?: string | null;
}

export interface ServiceCalc {
  committedDays: number;
  activeDaysUsed: number;
  pausedDays: number;
  currentActivePeriodDays: number;
  currentPausedPeriodDays: number;
  remainingDays: number;
  estimatedEndDate: string | null;
}

export function computeServiceCalc(l: OpsLeadCalcInput): ServiceCalc {
  const today = todayStr();
  const committedDays = l.service_days_committed && l.service_days_committed > 0
    ? l.service_days_committed
    : monthsToDays(l.service_months);
  const totalActiveDays = l.total_active_days ?? 0;
  const totalPausedDays = l.total_paused_days ?? 0;

  const currentActivePeriodDays = l.service_status === "active" && l.current_active_start_date
    ? daysBetween(l.current_active_start_date, today) : 0;
  const currentPausedPeriodDays = l.service_status === "paused" && l.last_paused_at
    ? daysBetween(l.last_paused_at, today) : 0;

  const activeDaysUsed = totalActiveDays + currentActivePeriodDays;
  const pausedDays = totalPausedDays + currentPausedPeriodDays;
  const remainingDays = Math.max(0, committedDays - activeDaysUsed);

  let estimatedEndDate: string | null = null;
  if (l.service_status === "active") {
    estimatedEndDate = addDays(today, remainingDays);
  } else if (l.service_status === "paused") {
    // If resumed today, service would end remainingDays from today.
    estimatedEndDate = addDays(today, remainingDays);
  } else if (l.service_status === "not_started") {
    estimatedEndDate = committedDays > 0 ? addDays(today, committedDays) : null;
  } else {
    estimatedEndDate = l.service_end_target_date ?? null;
  }

  return {
    committedDays, activeDaysUsed, pausedDays,
    currentActivePeriodDays, currentPausedPeriodDays,
    remainingDays, estimatedEndDate,
  };
}

export const COMMS_TEMPLATES: Record<string, (name: string, date: string) => string> = {
  start: (n, d) => `Hi ${n}, your ads service has started from ${d}. Our team will now begin managing and optimizing your campaigns.`,
  pause: (n, d) => `Hi ${n}, your ads service has been paused from ${d} as discussed. These paused days will not be counted as active service days.`,
  resume: (n, d) => `Hi ${n}, your ads service has resumed from ${d}.`,
  stop: (n, d) => `Hi ${n}, your ads service has been stopped from ${d}.`,
  complete: (n, d) => `Hi ${n}, your committed service period has been completed on ${d}.`,
};

