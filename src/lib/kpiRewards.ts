import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import { format } from "date-fns";
import {
  computePeriodRange, fetchEntriesForUserRange, computeScorecard,
  listActiveTeamMembers, type ScorecardPeriod,
} from "@/lib/kpiReview";

const sb: any = supabase;
const MOD = { module_key: "team_performance", module_label: "Team Performance" };

export type RewardPeriod = "daily" | "weekly" | "monthly";
export type RewardStatus = "pending_approval" | "approved" | "rejected" | "paid" | "cancelled";

export interface KpiRewardRule {
  id: string;
  name: string;
  description: string | null;
  period_type: RewardPeriod;
  min_score: number;
  reward_points: number;
  cash_amount: number;
  badge_name: string | null;
  recognition_label: string | null;
  applies_to_user_id: string | null;
  applies_to_role: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KpiRewardEarning {
  id: string;
  user_id: string;
  reward_rule_id: string | null;
  period_type: RewardPeriod;
  period_start: string;
  period_end: string;
  score: number;
  reward_points: number;
  cash_amount: number;
  badge_name: string | null;
  recognition_label: string | null;
  status: RewardStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  paid_by: string | null;
  paid_at: string | null;
  payout_notes: string | null;
  generated_by: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
  user_profile?: { id: string; full_name: string | null; email: string | null; role: string | null } | null;
  rule?: KpiRewardRule | null;
}

// ── Rules
export async function listRewardRules(): Promise<KpiRewardRule[]> {
  const { data, error } = await sb.from("kpi_reward_rules").select("*").order("period_type").order("min_score", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createRewardRule(row: Partial<KpiRewardRule>, actorId: string): Promise<KpiRewardRule> {
  const payload = { ...row, created_by: actorId };
  const { data, error } = await sb.from("kpi_reward_rules").insert(payload).select("*").single();
  if (error) throw error;
  await logActivity({
    ...MOD, action_type: "kpi_reward_rule_created", entity_type: "kpi_reward_rule",
    entity_id: data.id, entity_label: data.name,
    metadata: { period_type: data.period_type, min_score: data.min_score, reward_points: data.reward_points, cash_amount: data.cash_amount },
    summary: `Reward rule created: ${data.name}`,
  }).catch(() => {});
  return data;
}

export async function updateRewardRule(id: string, patch: Partial<KpiRewardRule>): Promise<void> {
  const { error } = await sb.from("kpi_reward_rules").update(patch).eq("id", id);
  if (error) throw error;
  await logActivity({
    ...MOD, action_type: "kpi_reward_rule_updated", entity_type: "kpi_reward_rule",
    entity_id: id, new_values: patch,
  }).catch(() => {});
}

export async function toggleRewardRuleActive(id: string, active: boolean): Promise<void> {
  await updateRewardRule(id, { is_active: active });
}

// ── Earnings
export interface EarningsFilters {
  period?: RewardPeriod | "all";
  userId?: string | null;
  role?: string | null;
  status?: RewardStatus | "all";
  ruleId?: string | null;
}

export async function listRewardEarnings(filters: EarningsFilters = {}): Promise<KpiRewardEarning[]> {
  let q = sb.from("kpi_reward_earnings").select("*, rule:kpi_reward_rules(*)").order("period_start", { ascending: false }).limit(500);
  if (filters.period && filters.period !== "all") q = q.eq("period_type", filters.period);
  if (filters.userId) q = q.eq("user_id", filters.userId);
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.ruleId) q = q.eq("reward_rule_id", filters.ruleId);
  const { data, error } = await q;
  if (error) throw error;
  let rows: KpiRewardEarning[] = data ?? [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  if (userIds.length > 0) {
    const { data: profs } = await sb.from("profiles").select("id, full_name, email, role").in("id", userIds);
    const map = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
    rows.forEach((r) => { r.user_profile = map.get(r.user_id) ?? null; });
    if (filters.role) rows = rows.filter((r) => (r.user_profile?.role || "").toLowerCase() === filters.role!.toLowerCase());
  }
  return rows;
}

export async function listMyRewardEarnings(userId: string): Promise<KpiRewardEarning[]> {
  const { data, error } = await sb
    .from("kpi_reward_earnings")
    .select("*, rule:kpi_reward_rules(*)")
    .eq("user_id", userId)
    .order("period_start", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

// ── Generation
export interface GenerateResult {
  users_checked: number;
  rewards_created: number;
  duplicates_skipped: number;
  users_below_threshold: number;
  users_no_data: number;
  errors: number;
}

export async function generateRewards(params: {
  period: RewardPeriod;
  refDate: Date;
  userId?: string | null;
  role?: string | null;
  actorId: string;
}): Promise<GenerateResult> {
  const { period, refDate, userId, role, actorId } = params;
  const result: GenerateResult = {
    users_checked: 0, rewards_created: 0, duplicates_skipped: 0,
    users_below_threshold: 0, users_no_data: 0, errors: 0,
  };

  const range = computePeriodRange(period as ScorecardPeriod, refDate);

  const rules = (await listRewardRules()).filter((r) => r.is_active && r.period_type === period);
  if (rules.length === 0) {
    await logActivity({
      ...MOD, action_type: "kpi_rewards_generated", entity_type: "kpi_reward_earnings",
      metadata: { period, period_start: range.from, period_end: range.to, result, note: "no active rules" },
      summary: `No active ${period} reward rules`,
    }).catch(() => {});
    return result;
  }

  // Collect candidate users
  const team = await listActiveTeamMembers();
  const profByRole = new Map<string, string>(); // for role filter
  let candidates = team;
  if (userId) candidates = candidates.filter((u) => u.id === userId);
  if (role) {
    const { data: profs } = await sb.from("profiles").select("id, role").in("id", candidates.map((c) => c.id));
    const map = new Map<string, string>((profs ?? []).map((p: any) => [p.id, (p.role || "").toLowerCase()]));
    map.forEach((v, k) => profByRole.set(k, v));
    candidates = candidates.filter((c) => map.get(c.id) === role.toLowerCase());
  } else {
    const { data: profs } = await sb.from("profiles").select("id, role").in("id", candidates.map((c) => c.id));
    (profs ?? []).forEach((p: any) => profByRole.set(p.id, (p.role || "").toLowerCase()));
  }

  for (const u of candidates) {
    result.users_checked += 1;
    try {
      const entries = await fetchEntriesForUserRange(u.id, range.from, range.to);
      if (entries.length === 0) { result.users_no_data += 1; continue; }
      const hasApproved = entries.some((e) => e.status === "approved");
      if (!hasApproved) { result.users_no_data += 1; continue; }
      const score = computeScorecard(entries).score_pct;

      let matched = 0;
      for (const rule of rules) {
        if (rule.applies_to_user_id && rule.applies_to_user_id !== u.id) continue;
        if (rule.applies_to_role) {
          const userRole = profByRole.get(u.id) || "";
          if (userRole !== rule.applies_to_role.toLowerCase()) continue;
        }
        if (score < Number(rule.min_score)) continue;
        matched += 1;

        const payload = {
          user_id: u.id,
          reward_rule_id: rule.id,
          period_type: period,
          period_start: range.from,
          period_end: range.to,
          score,
          reward_points: rule.reward_points,
          cash_amount: rule.cash_amount,
          badge_name: rule.badge_name,
          recognition_label: rule.recognition_label,
          status: "pending_approval" as RewardStatus,
          generated_by: actorId,
        };

        const { data, error } = await sb.from("kpi_reward_earnings").insert(payload).select("id").single();
        if (error) {
          // duplicate?
          if (String(error.code) === "23505" || /duplicate|unique/i.test(String(error.message))) {
            result.duplicates_skipped += 1;
          } else {
            result.errors += 1;
          }
        } else if (data) {
          result.rewards_created += 1;
        }
      }
      if (matched === 0) result.users_below_threshold += 1;
    } catch {
      result.errors += 1;
    }
  }

  await logActivity({
    ...MOD, action_type: "kpi_rewards_generated", entity_type: "kpi_reward_earnings",
    metadata: { period, period_start: range.from, period_end: range.to, ...result, user_filter: userId ?? null, role_filter: role ?? null },
    summary: `Generated ${result.rewards_created} ${period} reward(s); ${result.duplicates_skipped} duplicates skipped`,
  }).catch(() => {});

  return result;
}

// ── Approve/Reject/Pay/Cancel
export async function approveReward(id: string, actorId: string): Promise<void> {
  const { data: existing, error: fErr } = await sb.from("kpi_reward_earnings").select("id, user_id, status").eq("id", id).single();
  if (fErr) throw fErr;
  const { error } = await sb.from("kpi_reward_earnings").update({
    status: "approved", approved_by: actorId, approved_at: new Date().toISOString(),
    rejected_by: null, rejected_at: null, rejection_reason: null,
  }).eq("id", id);
  if (error) throw error;
  await logActivity({
    ...MOD, action_type: "kpi_reward_approved", entity_type: "kpi_reward_earning",
    entity_id: id, target_user_id: existing.user_id,
    metadata: { old_status: existing.status, new_status: "approved" },
    summary: "Reward approved",
  }).catch(() => {});
}

export async function rejectReward(id: string, reason: string, actorId: string): Promise<void> {
  const r = reason.trim();
  if (!r) throw new Error("Rejection reason is required");
  const { data: existing, error: fErr } = await sb.from("kpi_reward_earnings").select("id, user_id, status").eq("id", id).single();
  if (fErr) throw fErr;
  const { error } = await sb.from("kpi_reward_earnings").update({
    status: "rejected", rejected_by: actorId, rejected_at: new Date().toISOString(), rejection_reason: r,
  }).eq("id", id);
  if (error) throw error;
  await logActivity({
    ...MOD, action_type: "kpi_reward_rejected", entity_type: "kpi_reward_earning",
    entity_id: id, target_user_id: existing.user_id, severity: "warning",
    metadata: { old_status: existing.status, new_status: "rejected", reason: r },
    summary: "Reward rejected",
  }).catch(() => {});
}

export async function cancelReward(id: string, actorId: string): Promise<void> {
  const { data: existing, error: fErr } = await sb.from("kpi_reward_earnings").select("id, user_id, status").eq("id", id).single();
  if (fErr) throw fErr;
  const { error } = await sb.from("kpi_reward_earnings").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;
  await logActivity({
    ...MOD, action_type: "kpi_reward_cancelled", entity_type: "kpi_reward_earning",
    entity_id: id, target_user_id: existing.user_id, severity: "warning",
    metadata: { old_status: existing.status, new_status: "cancelled" },
    summary: "Reward cancelled",
  }).catch(() => {});
}

export async function markRewardPaid(id: string, payoutNotes: string | null, actorId: string): Promise<void> {
  const { data: existing, error: fErr } = await sb.from("kpi_reward_earnings").select("id, user_id, status").eq("id", id).single();
  if (fErr) throw fErr;
  if (existing.status !== "approved") throw new Error("Only approved rewards can be marked paid.");
  const { error } = await sb.from("kpi_reward_earnings").update({
    status: "paid", paid_by: actorId, paid_at: new Date().toISOString(),
    payout_notes: payoutNotes?.trim() || null,
  }).eq("id", id);
  if (error) throw error;
  await logActivity({
    ...MOD, action_type: "kpi_reward_paid", entity_type: "kpi_reward_earning",
    entity_id: id, target_user_id: existing.user_id,
    metadata: { old_status: existing.status, new_status: "paid", payout_notes: payoutNotes ?? null },
    summary: "Reward marked paid",
  }).catch(() => {});
}

// ── Summary
export interface RewardSummary {
  pending_approval: number;
  approved: number;
  paid: number;
  total_points: number;
  total_cash_liability: number;
  current_month_rewards: number;
}

export async function fetchRewardSummary(): Promise<RewardSummary> {
  const now = new Date();
  const firstOfMonth = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");

  const [{ count: pending }, { count: approved }, { count: paid }, { data: totals }, { count: curMonth }] = await Promise.all([
    sb.from("kpi_reward_earnings").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    sb.from("kpi_reward_earnings").select("id", { count: "exact", head: true }).eq("status", "approved"),
    sb.from("kpi_reward_earnings").select("id", { count: "exact", head: true }).eq("status", "paid"),
    sb.from("kpi_reward_earnings").select("reward_points, cash_amount, status").in("status", ["approved", "paid"]),
    sb.from("kpi_reward_earnings").select("id", { count: "exact", head: true }).gte("period_start", firstOfMonth),
  ]);
  const totalPoints = (totals ?? []).reduce((a: number, r: any) => a + Number(r.reward_points || 0), 0);
  const totalCash = (totals ?? []).filter((r: any) => r.status === "approved").reduce((a: number, r: any) => a + Number(r.cash_amount || 0), 0);
  return {
    pending_approval: pending ?? 0,
    approved: approved ?? 0,
    paid: paid ?? 0,
    total_points: totalPoints,
    total_cash_liability: totalCash,
    current_month_rewards: curMonth ?? 0,
  };
}
