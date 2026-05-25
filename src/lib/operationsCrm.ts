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

// ─────────────── Handoff Rules ───────────────

export type HandoffMode = "manual" | "suggest" | "auto";
export type AssignmentMethod = "unassigned" | "single" | "round_robin";
export type DuplicateBehavior = "skip" | "update";

export interface HandoffRule {
  id: string;
  name: string;
  source_pipeline_id: string;
  eligible_stage_ids: string[];
  mode: HandoffMode;
  default_service_package: string | null;
  default_service_days: number | null;
  default_assignment_method: AssignmentMethod;
  default_single_buyer_id: string | null;
  eligible_buyer_ids: string[];
  duplicate_behavior: DuplicateBehavior;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getActiveHandoffRules(): Promise<HandoffRule[]> {
  const { data, error } = await (supabase as any)
    .from("operations_handoff_rules")
    .select("*")
    .eq("is_active", true);
  if (error) {
    console.warn("[handoff] list failed", error);
    return [];
  }
  return (data ?? []) as HandoffRule[];
}

export function findRuleForStage(
  rules: HandoffRule[],
  pipelineId: string | null,
  stageId: string | null,
  stagesById?: Map<string, { id: string; name: string | null }>,
): HandoffRule | null {
  if (!pipelineId || !stageId) return null;
  const currentName = stagesById?.get(stageId)?.name?.trim().toLowerCase() ?? null;
  return rules.find((r) => {
    if (!r.is_active || r.source_pipeline_id !== pipelineId) return false;
    const ids = r.eligible_stage_ids || [];
    // 1) Match by stage ID (primary)
    if (ids.includes(stageId)) return true;
    // 2) Fallback: match by stage name (handles stage rebuilds/renames where IDs drift)
    if (currentName && stagesById) {
      for (const eid of ids) {
        const n = stagesById.get(eid)?.name?.trim().toLowerCase();
        if (n && n === currentName) return true;
      }
    }
    return false;
  }) ?? null;
}

export function isRuleAutoReady(r: HandoffRule): boolean {
  if (r.mode !== "auto") return true;
  if (!r.default_service_package || !r.default_service_days || r.default_service_days <= 0) return false;
  if (r.default_assignment_method === "single" && !r.default_single_buyer_id) return false;
  if (r.default_assignment_method === "round_robin" && (!r.eligible_buyer_ids || r.eligible_buyer_ids.length === 0)) return false;
  return true;
}

// Returns existing active operations_leads row matching crm_lead_id / paid_pipeline_lead_id
export async function findExistingActiveOpsLead(opts: {
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<any | null> {
  const { crmLeadId, paidPipelineLeadId, email, phone } = opts;
  const sb = supabase as any;
  if (crmLeadId) {
    const { data } = await sb.from("operations_leads").select("*").eq("crm_lead_id", crmLeadId);
    const hit = (data ?? []).find((r: any) => r.service_status !== "stopped" && r.service_status !== "completed");
    if (hit) return hit;
  }
  if (paidPipelineLeadId) {
    const { data } = await sb.from("operations_leads").select("*").eq("paid_pipeline_lead_id", paidPipelineLeadId);
    const hit = (data ?? []).find((r: any) => r.service_status !== "stopped" && r.service_status !== "completed");
    if (hit) return hit;
  }
  if (!crmLeadId && !paidPipelineLeadId && (email || phone)) {
    let query = sb.from("operations_leads").select("*");
    if (email && phone) query = query.or(`email.eq.${email},phone.eq.${phone}`);
    else if (email) query = query.eq("email", email);
    else if (phone) query = query.eq("phone", phone);
    const { data } = await query;
    const hit = (data ?? []).find((r: any) => r.service_status !== "stopped" && r.service_status !== "completed");
    if (hit) return hit;
  }
  return null;
}

// ─────────────── Auto handoff executor ───────────────

export interface AutoHandoffLeadInput {
  id: string;                      // crm lead id
  full_name: string | null;
  email: string | null;
  phone: string | null;
  program_name?: string | null;
  webinar_source?: string | null;
  deal_value?: number | null;
  paid_pipeline_lead_id?: string | null;
}

export interface AutoHandoffResult {
  inserted: number;
  updated: number;
  skipped: number;
  buyerCounts: Record<string, number>;
}

/**
 * Creates / updates Operations CRM leads from an active handoff rule.
 * Honors duplicate_behavior, performs round-robin / single assignment, and
 * returns counts the caller can use for notifications / audit logs.
 */
export async function applyAutoHandoff(
  rule: HandoffRule,
  leads: AutoHandoffLeadInput[],
  createdBy: string | null,
): Promise<AutoHandoffResult> {
  const sb = supabase as any;
  if (!leads.length) return { inserted: 0, updated: 0, skipped: 0, buyerCounts: {} };

  const { pipelineId, firstStageId } = await ensureOperationsPipeline();

  const crmIds = leads.map((l) => l.id);
  const ppIds = leads.map((l) => l.paid_pipeline_lead_id).filter(Boolean) as string[];
  const dupQueries: Promise<any>[] = [
    sb.from("operations_leads").select("id, crm_lead_id, paid_pipeline_lead_id, service_status").in("crm_lead_id", crmIds),
  ];
  if (ppIds.length) {
    dupQueries.push(sb.from("operations_leads").select("id, crm_lead_id, paid_pipeline_lead_id, service_status").in("paid_pipeline_lead_id", ppIds));
  }
  const dupResults = await Promise.all(dupQueries);
  const dupByCrm = new Map<string, any>();
  const dupByPp = new Map<string, any>();
  for (const { data } of dupResults) {
    for (const r of (data ?? [])) {
      if (r.service_status === "stopped" || r.service_status === "completed") continue;
      if (r.crm_lead_id) dupByCrm.set(r.crm_lead_id, r);
      if (r.paid_pipeline_lead_id) dupByPp.set(r.paid_pipeline_lead_id, r);
    }
  }

  const buyerIds = new Set<string>();
  if (rule.default_assignment_method === "single" && rule.default_single_buyer_id) buyerIds.add(rule.default_single_buyer_id);
  if (rule.default_assignment_method === "round_robin") (rule.eligible_buyer_ids || []).forEach((id) => buyerIds.add(id));
  const buyerNames = new Map<string, string>();
  if (buyerIds.size) {
    const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", Array.from(buyerIds));
    (profs ?? []).forEach((p: any) => buyerNames.set(p.id, p.full_name ?? "—"));
  }

  const days = rule.default_service_days ?? 0;
  const months = days > 0 ? Math.round((days / 30) * 100) / 100 : null;
  const pkg = rule.default_service_package ?? null;
  const pool = rule.eligible_buyer_ids ?? [];
  let rr = 0;
  let inserted = 0, updated = 0, skipped = 0;
  const buyerCounts: Record<string, number> = {};

  const toInsert: any[] = [];

  for (const lead of leads) {
    let buyerId: string | null = null;
    if (rule.default_assignment_method === "single") buyerId = rule.default_single_buyer_id ?? null;
    else if (rule.default_assignment_method === "round_robin" && pool.length) {
      buyerId = pool[rr % pool.length];
      rr++;
    }
    const buyerName = buyerId ? buyerNames.get(buyerId) ?? null : null;

    const dup = dupByCrm.get(lead.id) || (lead.paid_pipeline_lead_id ? dupByPp.get(lead.paid_pipeline_lead_id) : undefined);
    if (dup) {
      if (rule.duplicate_behavior === "skip") { skipped++; continue; }
      const patch: any = {
        service_package_name: pkg,
        service_days_committed: days || null,
        service_months: months,
      };
      if (buyerId) { patch.assigned_media_buyer_id = buyerId; patch.assigned_media_buyer_name = buyerName; }
      const { error } = await sb.from("operations_leads").update(patch).eq("id", dup.id);
      if (!error) {
        updated++;
        if (buyerId) buyerCounts[buyerId] = (buyerCounts[buyerId] ?? 0) + 1;
      }
      continue;
    }

    toInsert.push({
      crm_lead_id: lead.id,
      paid_pipeline_lead_id: lead.paid_pipeline_lead_id ?? null,
      name: lead.full_name ?? "—",
      email: lead.email,
      phone: lead.phone,
      product_name: lead.program_name ?? null,
      batch_name: lead.webinar_source ?? null,
      onboarding_batch: lead.webinar_source ?? null,
      deal_value: lead.deal_value ?? null,
      service_package_name: pkg,
      service_months: months,
      service_days_committed: days || null,
      service_status: "not_started",
      pipeline_id: pipelineId,
      stage_id: firstStageId,
      assigned_media_buyer_id: buyerId,
      assigned_media_buyer_name: buyerName,
      created_by: createdBy,
    });
    if (buyerId) buyerCounts[buyerId] = (buyerCounts[buyerId] ?? 0) + 1;
  }

  if (toInsert.length) {
    const chunk = 200;
    for (let i = 0; i < toInsert.length; i += chunk) {
      const slice = toInsert.slice(i, i + chunk);
      const { error, data } = await sb.from("operations_leads").insert(slice).select("id");
      if (!error) inserted += data?.length ?? slice.length;
      else skipped += slice.length;
    }
  }

  return { inserted, updated, skipped, buyerCounts };
}



