import { supabase } from "@/integrations/supabase/client";

export type ResultStatus = "pending" | "approved" | "rejected";
export type PayoutStatus = "pending" | "approved" | "paid" | "cancelled";

export const RESULT_TYPES = [
  { value: "lead_generated", label: "Lead generated" },
  { value: "campaign_live", label: "Campaign live" },
  { value: "client_win", label: "Client win" },
  { value: "portfolio_completed", label: "Portfolio completed" },
  { value: "ads_result", label: "Ads result" },
  { value: "support_milestone", label: "Support milestone" },
  { value: "custom", label: "Custom" },
];

export interface ResultSubmission {
  id: string;
  operations_lead_id: string | null;
  crm_lead_id: string | null;
  paid_pipeline_lead_id: string | null;
  member_name: string | null;
  submitted_by: string;
  result_type: string;
  title: string;
  description: string | null;
  proof_url: string | null;
  proof_file_path: string | null;
  result_date: string | null;
  status: ResultStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  reward_amount: number | null;
  created_at: string;
  updated_at: string;
  submitted_by_name?: string | null;
}

export interface RewardRule {
  id: string;
  name: string;
  result_type: string | null;
  reward_amount: number;
  min_approved_count: number;
  period: string;
  is_active: boolean;
}

export interface RewardPayout {
  id: string;
  team_member_id: string;
  period_start: string;
  period_end: string;
  approved_count: number;
  reward_amount: number;
  payout_status: PayoutStatus;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
}

export function currentMonthStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  const s = new Date(y, m - 1, 1);
  const e = new Date(y, m, 0); // last day of month
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(s), end: fmt(e) };
}

export async function getActiveRewardAmount(resultType?: string | null): Promise<number> {
  const { data } = await (supabase as any)
    .from("operations_result_reward_rules")
    .select("*")
    .eq("is_active", true);
  const rules = (data ?? []) as RewardRule[];
  if (resultType) {
    const match = rules.find((r) => r.result_type === resultType);
    if (match) return Number(match.reward_amount);
  }
  const generic = rules.find((r) => !r.result_type);
  return Number(generic?.reward_amount ?? 500);
}

export async function submitResult(input: {
  operations_lead_id?: string | null;
  crm_lead_id?: string | null;
  paid_pipeline_lead_id?: string | null;
  member_name?: string | null;
  result_type: string;
  title: string;
  description?: string | null;
  proof_url?: string | null;
  result_date?: string | null;
}): Promise<ResultSubmission> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user?.id) throw new Error("Not signed in");
  const row = {
    operations_lead_id: input.operations_lead_id ?? null,
    crm_lead_id: input.crm_lead_id ?? null,
    paid_pipeline_lead_id: input.paid_pipeline_lead_id ?? null,
    member_name: input.member_name ?? null,
    submitted_by: user.user.id,
    result_type: input.result_type,
    title: input.title,
    description: input.description ?? null,
    proof_url: input.proof_url ?? null,
    result_date: input.result_date ?? null,
    status: "pending" as const,
  };
  const { data, error } = await (supabase as any)
    .from("operations_result_submissions")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data as ResultSubmission;
}

export async function approveSubmission(id: string, resultType: string): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  const reward = await getActiveRewardAmount(resultType);
  const { error } = await (supabase as any)
    .from("operations_result_submissions")
    .update({
      status: "approved",
      approved_by: user?.user?.id ?? null,
      approved_at: new Date().toISOString(),
      reward_amount: reward,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function rejectSubmission(id: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("Rejection reason required");
  const { data: user } = await supabase.auth.getUser();
  const { error } = await (supabase as any)
    .from("operations_result_submissions")
    .update({
      status: "rejected",
      rejected_by: user?.user?.id ?? null,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason.trim(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function updateRewardAmount(id: string, amount: number): Promise<void> {
  const { error } = await (supabase as any)
    .from("operations_result_submissions")
    .update({ reward_amount: amount })
    .eq("id", id);
  if (error) throw error;
}

export async function listSubmissions(opts: {
  month?: string | null;
  status?: ResultStatus | "all";
  resultType?: string | "all";
  memberId?: string | "all";
  operationsLeadId?: string | null;
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  limit?: number;
}): Promise<ResultSubmission[]> {
  let q = (supabase as any)
    .from("operations_result_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 500);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts.resultType && opts.resultType !== "all") q = q.eq("result_type", opts.resultType);
  if (opts.memberId && opts.memberId !== "all") q = q.eq("submitted_by", opts.memberId);
  if (opts.operationsLeadId) q = q.eq("operations_lead_id", opts.operationsLeadId);
  if (opts.crmLeadId) q = q.eq("crm_lead_id", opts.crmLeadId);
  if (opts.paidPipelineLeadId) q = q.eq("paid_pipeline_lead_id", opts.paidPipelineLeadId);
  if (opts.month) {
    const { start, end } = monthBounds(opts.month);
    q = q.gte("created_at", `${start}T00:00:00`).lte("created_at", `${end}T23:59:59`);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as ResultSubmission[];
  const ids = Array.from(new Set(rows.map((r) => r.submitted_by).filter(Boolean)));
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    const map = new Map<string, string>();
    (profs ?? []).forEach((p: any) => map.set(p.id, p.full_name ?? "—"));
    rows.forEach((r) => (r.submitted_by_name = map.get(r.submitted_by) ?? null));
  }
  return rows;
}

export async function listSubmissionsForContext(opts: {
  operationsLeadId?: string | null;
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
}): Promise<ResultSubmission[]> {
  const parts: string[] = [];
  if (opts.operationsLeadId) parts.push(`operations_lead_id.eq.${opts.operationsLeadId}`);
  if (opts.crmLeadId) parts.push(`crm_lead_id.eq.${opts.crmLeadId}`);
  if (opts.paidPipelineLeadId) parts.push(`paid_pipeline_lead_id.eq.${opts.paidPipelineLeadId}`);
  if (!parts.length) return [];
  const { data, error } = await (supabase as any)
    .from("operations_result_submissions")
    .select("*")
    .or(parts.join(","))
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as ResultSubmission[];
  const ids = Array.from(new Set(rows.map((r) => r.submitted_by).filter(Boolean)));
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    const map = new Map<string, string>();
    (profs ?? []).forEach((p: any) => map.set(p.id, p.full_name ?? "—"));
    rows.forEach((r) => (r.submitted_by_name = map.get(r.submitted_by) ?? null));
  }
  return rows;
}

export async function listPayoutsForMonth(month: string): Promise<RewardPayout[]> {
  const { start, end } = monthBounds(month);
  const { data, error } = await (supabase as any)
    .from("operations_result_reward_payouts")
    .select("*")
    .eq("period_start", start)
    .eq("period_end", end);
  if (error) throw error;
  return (data ?? []) as RewardPayout[];
}

export async function upsertPayout(input: {
  team_member_id: string;
  period_start: string;
  period_end: string;
  approved_count: number;
  reward_amount: number;
  payout_status?: PayoutStatus;
  notes?: string | null;
}): Promise<RewardPayout> {
  const { data, error } = await (supabase as any)
    .from("operations_result_reward_payouts")
    .upsert(
      {
        team_member_id: input.team_member_id,
        period_start: input.period_start,
        period_end: input.period_end,
        approved_count: input.approved_count,
        reward_amount: input.reward_amount,
        payout_status: input.payout_status ?? "pending",
        notes: input.notes ?? null,
      },
      { onConflict: "team_member_id,period_start,period_end" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as RewardPayout;
}

export async function markPayoutPaid(id: string, notes?: string | null): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  const { error } = await (supabase as any)
    .from("operations_result_reward_payouts")
    .update({
      payout_status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: user?.user?.id ?? null,
      notes: notes ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function setPayoutStatus(id: string, status: PayoutStatus, notes?: string | null): Promise<void> {
  const payload: any = { payout_status: status };
  if (status === "paid") {
    const { data: user } = await supabase.auth.getUser();
    payload.paid_at = new Date().toISOString();
    payload.paid_by = user?.user?.id ?? null;
  } else {
    payload.paid_at = null;
    payload.paid_by = null;
  }
  if (notes !== undefined) payload.notes = notes;
  const { error } = await (supabase as any)
    .from("operations_result_reward_payouts")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}
