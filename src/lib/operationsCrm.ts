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
