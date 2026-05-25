import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import { createNotification } from "@/lib/notifications";

export type ConversionStatus = "pending" | "approved" | "rejected";

export interface ConversionReport {
  id: string;
  operations_lead_id: string;
  media_buyer_id: string;
  client_name: string | null;
  conversion_count: number;
  conversion_value: number | null;
  proof_url: string | null;
  campaign_name: string | null;
  notes: string | null;
  conversion_date: string;
  verification_status: ConversionStatus;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
  created_at: string;
  updated_at: string;
  // joined
  media_buyer_name?: string | null;
  lead_name?: string | null;
}

export interface RewardRule {
  id: string;
  rule_name: string;
  role_scope: string;
  period: string;
  target_metric: string;
  target_count: number;
  reward_amount: number;
  currency: string;
  active: boolean;
  description: string | null;
}

export interface RewardProgress {
  id: string;
  media_buyer_id: string;
  rule_id: string;
  month: string;
  approved_conversion_count: number;
  target_count: number;
  reward_amount: number;
  reward_status: string; // active | achieved | paid
  achieved_at: string | null;
}

export function currentMonthStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

export async function getActiveRewardRule(): Promise<RewardRule | null> {
  const { data } = await (supabase as any)
    .from("operations_reward_rules")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1);
  return (data?.[0] as RewardRule) ?? null;
}

export async function listConversionsForLead(leadId: string): Promise<ConversionReport[]> {
  const { data } = await (supabase as any)
    .from("operations_conversion_reports")
    .select("*")
    .eq("operations_lead_id", leadId)
    .order("conversion_date", { ascending: false })
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as ConversionReport[];
  const ids = Array.from(new Set(rows.map((r) => r.media_buyer_id).filter(Boolean)));
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    const map = new Map<string, string>();
    (profs ?? []).forEach((p: any) => map.set(p.id, p.full_name ?? "—"));
    rows.forEach((r) => { r.media_buyer_name = map.get(r.media_buyer_id) ?? null; });
  }
  return rows;
}

export async function listPendingConversions(limit = 200): Promise<ConversionReport[]> {
  const { data } = await (supabase as any)
    .from("operations_conversion_reports")
    .select("*")
    .eq("verification_status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as ConversionReport[];
  await enrichNames(rows);
  return rows;
}

export async function listConversionsForBuyerMonth(buyerId: string, month: string): Promise<ConversionReport[]> {
  const { start, end } = monthBounds(month);
  const { data } = await (supabase as any)
    .from("operations_conversion_reports")
    .select("*")
    .eq("media_buyer_id", buyerId)
    .gte("conversion_date", start)
    .lt("conversion_date", end)
    .order("conversion_date", { ascending: false });
  return ((data ?? []) as ConversionReport[]);
}

export async function listAllConversionsForMonth(month: string): Promise<ConversionReport[]> {
  const { start, end } = monthBounds(month);
  const { data } = await (supabase as any)
    .from("operations_conversion_reports")
    .select("*")
    .gte("conversion_date", start)
    .lt("conversion_date", end)
    .order("created_at", { ascending: false });
  const rows = ((data ?? []) as ConversionReport[]);
  await enrichNames(rows);
  return rows;
}

async function enrichNames(rows: ConversionReport[]) {
  const buyerIds = Array.from(new Set(rows.map((r) => r.media_buyer_id).filter(Boolean)));
  const leadIds = Array.from(new Set(rows.map((r) => r.operations_lead_id).filter(Boolean)));
  if (buyerIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", buyerIds);
    const map = new Map<string, string>();
    (profs ?? []).forEach((p: any) => map.set(p.id, p.full_name ?? "—"));
    rows.forEach((r) => { r.media_buyer_name = map.get(r.media_buyer_id) ?? null; });
  }
  if (leadIds.length) {
    const { data: leads } = await (supabase as any).from("operations_leads").select("id, name").in("id", leadIds);
    const map = new Map<string, string>();
    (leads ?? []).forEach((l: any) => map.set(l.id, l.name ?? "—"));
    rows.forEach((r) => { r.lead_name = map.get(r.operations_lead_id) ?? null; });
  }
}

export interface ReportInput {
  operations_lead_id: string;
  media_buyer_id: string;
  client_name?: string | null;
  conversion_date: string;
  conversion_count: number;
  conversion_value?: number | null;
  campaign_name?: string | null;
  proof_url?: string | null;
  notes?: string | null;
}

export async function reportConversion(input: ReportInput, actor: { id: string; name: string | null }): Promise<ConversionReport> {
  const { data, error } = await (supabase as any)
    .from("operations_conversion_reports")
    .insert({
      operations_lead_id: input.operations_lead_id,
      media_buyer_id: input.media_buyer_id,
      client_name: input.client_name ?? null,
      conversion_date: input.conversion_date,
      conversion_count: input.conversion_count,
      conversion_value: input.conversion_value ?? null,
      campaign_name: input.campaign_name ?? null,
      proof_url: input.proof_url ?? null,
      notes: input.notes ?? null,
      verification_status: "pending",
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  const row = data as ConversionReport;

  await logActivity({
    module_key: "operations_crm",
    module_label: "Operations CRM",
    action_type: "operations_conversion_reported",
    action_label: "Conversion reported",
    entity_type: "operations_conversion",
    entity_id: row.id,
    entity_label: input.client_name ?? null,
    metadata: {
      operations_lead_id: input.operations_lead_id,
      media_buyer_id: input.media_buyer_id,
      conversion_count: input.conversion_count,
      conversion_value: input.conversion_value ?? null,
      status: "pending",
    },
    summary: `Reported ${input.conversion_count} conversion${input.conversion_count === 1 ? "" : "s"} pending approval.`,
  });

  await createNotification({
    recipient_role: "admin",
    module_key: "operations_crm",
    notification_type: "ops_conversion_reported",
    title: "New conversion awaiting approval",
    message: `${actor.name ?? "Media buyer"} reported ${input.conversion_count} conversion${input.conversion_count === 1 ? "" : "s"}.`,
    entity_type: "operations_conversion",
    entity_id: row.id,
    priority: "normal",
    action_url: `/operations-crm?conversion=${row.id}`,
    action_label: "Review",
    triggered_by_user_id: actor.id,
    triggered_by_name: actor.name ?? undefined,
  });

  return row;
}

export async function updatePendingConversion(id: string, patch: Partial<ReportInput>): Promise<void> {
  const { error } = await (supabase as any)
    .from("operations_conversion_reports")
    .update({
      ...(patch.conversion_date !== undefined ? { conversion_date: patch.conversion_date } : {}),
      ...(patch.conversion_count !== undefined ? { conversion_count: patch.conversion_count } : {}),
      ...(patch.conversion_value !== undefined ? { conversion_value: patch.conversion_value } : {}),
      ...(patch.campaign_name !== undefined ? { campaign_name: patch.campaign_name } : {}),
      ...(patch.proof_url !== undefined ? { proof_url: patch.proof_url } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    })
    .eq("id", id);
  if (error) throw error;
  await logActivity({
    module_key: "operations_crm",
    module_label: "Operations CRM",
    action_type: "operations_conversion_updated",
    entity_type: "operations_conversion",
    entity_id: id,
    metadata: patch as any,
    summary: "Conversion report updated.",
  });
}

export async function approveConversion(
  conversion: ConversionReport,
  actor: { id: string; name: string | null },
  note?: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("operations_conversion_reports")
    .update({
      verification_status: "approved",
      verified_by: actor.id,
      verified_at: new Date().toISOString(),
      verification_note: note ?? null,
    })
    .eq("id", conversion.id);
  if (error) throw error;

  await logActivity({
    module_key: "operations_crm",
    module_label: "Operations CRM",
    action_type: "operations_conversion_approved",
    entity_type: "operations_conversion",
    entity_id: conversion.id,
    metadata: {
      operations_lead_id: conversion.operations_lead_id,
      media_buyer_id: conversion.media_buyer_id,
      conversion_count: conversion.conversion_count,
      verified_by: actor.id,
    },
    summary: `Approved ${conversion.conversion_count} conversion${conversion.conversion_count === 1 ? "" : "s"}.`,
  });

  await createNotification({
    recipient_user_id: conversion.media_buyer_id,
    module_key: "operations_crm",
    notification_type: "ops_conversion_approved",
    title: "Your conversion was approved",
    message: `${conversion.conversion_count} approved${note ? ` — ${note}` : ""}.`,
    entity_type: "operations_conversion",
    entity_id: conversion.id,
    action_url: `/operations-crm?conversion=${conversion.id}`,
    action_label: "Open",
    triggered_by_user_id: actor.id,
    triggered_by_name: actor.name ?? undefined,
  });

  // Reward check
  await checkAndCreateRewardAchievement(conversion.media_buyer_id, currentMonthStr(new Date(conversion.conversion_date)), actor);
}

export async function rejectConversion(
  conversion: ConversionReport,
  actor: { id: string; name: string | null },
  note?: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("operations_conversion_reports")
    .update({
      verification_status: "rejected",
      verified_by: actor.id,
      verified_at: new Date().toISOString(),
      verification_note: note ?? null,
    })
    .eq("id", conversion.id);
  if (error) throw error;
  await logActivity({
    module_key: "operations_crm",
    module_label: "Operations CRM",
    action_type: "operations_conversion_rejected",
    entity_type: "operations_conversion",
    entity_id: conversion.id,
    metadata: {
      operations_lead_id: conversion.operations_lead_id,
      media_buyer_id: conversion.media_buyer_id,
      verified_by: actor.id,
      reason: note ?? null,
    },
    summary: `Rejected ${conversion.conversion_count} conversion${conversion.conversion_count === 1 ? "" : "s"}.`,
  });
  await createNotification({
    recipient_user_id: conversion.media_buyer_id,
    module_key: "operations_crm",
    notification_type: "ops_conversion_rejected",
    title: "Your conversion was rejected",
    message: note ? `Reason: ${note}` : `Reviewer did not approve this report.`,
    entity_type: "operations_conversion",
    entity_id: conversion.id,
    priority: "high",
    action_url: `/operations-crm?conversion=${conversion.id}`,
    action_label: "Open",
    triggered_by_user_id: actor.id,
    triggered_by_name: actor.name ?? undefined,
  });
}

export async function getMonthlyApprovedCount(buyerId: string, month: string): Promise<number> {
  const { start, end } = monthBounds(month);
  const { data } = await (supabase as any)
    .from("operations_conversion_reports")
    .select("conversion_count")
    .eq("media_buyer_id", buyerId)
    .eq("verification_status", "approved")
    .gte("conversion_date", start)
    .lt("conversion_date", end);
  return (data ?? []).reduce((s: number, r: any) => s + (r.conversion_count || 0), 0);
}

export async function getMonthlyCountsByBuyer(month: string): Promise<Map<string, { approved: number; pending: number; rejected: number; value: number }>> {
  const { start, end } = monthBounds(month);
  const { data } = await (supabase as any)
    .from("operations_conversion_reports")
    .select("media_buyer_id, conversion_count, conversion_value, verification_status")
    .gte("conversion_date", start)
    .lt("conversion_date", end);
  const map = new Map<string, { approved: number; pending: number; rejected: number; value: number }>();
  for (const r of (data ?? [])) {
    const k = r.media_buyer_id as string;
    const e = map.get(k) ?? { approved: 0, pending: 0, rejected: 0, value: 0 };
    if (r.verification_status === "approved") {
      e.approved += r.conversion_count || 0;
      e.value += Number(r.conversion_value || 0);
    } else if (r.verification_status === "pending") e.pending += r.conversion_count || 0;
    else if (r.verification_status === "rejected") e.rejected += r.conversion_count || 0;
    map.set(k, e);
  }
  return map;
}

export async function getRewardProgress(buyerId: string, month: string): Promise<RewardProgress | null> {
  const { data } = await (supabase as any)
    .from("operations_reward_progress")
    .select("*")
    .eq("media_buyer_id", buyerId)
    .eq("month", month)
    .limit(1);
  return (data?.[0] as RewardProgress) ?? null;
}

export async function checkAndCreateRewardAchievement(
  buyerId: string,
  month: string,
  actor: { id: string; name: string | null },
): Promise<RewardProgress | null> {
  try {
    const rule = await getActiveRewardRule();
    if (!rule) return null;
    const approved = await getMonthlyApprovedCount(buyerId, month);
    if (approved < rule.target_count) return null;

    const existing = await getRewardProgress(buyerId, month);
    if (existing && (existing.reward_status === "achieved" || existing.reward_status === "paid")) return existing;

    let achievement: RewardProgress;
    if (existing) {
      const { data, error } = await (supabase as any)
        .from("operations_reward_progress")
        .update({
          approved_conversion_count: approved,
          reward_status: "achieved",
          achieved_at: new Date().toISOString(),
          target_count: rule.target_count,
          reward_amount: rule.reward_amount,
          rule_id: rule.id,
        })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      achievement = data as RewardProgress;
    } else {
      const { data, error } = await (supabase as any)
        .from("operations_reward_progress")
        .insert({
          media_buyer_id: buyerId,
          rule_id: rule.id,
          month,
          approved_conversion_count: approved,
          target_count: rule.target_count,
          reward_amount: rule.reward_amount,
          reward_status: "achieved",
          achieved_at: new Date().toISOString(),
        })
        .select("*")
        .maybeSingle();
      if (error) throw error;
      achievement = data as RewardProgress;
    }

    // Buyer name
    let buyerName: string | null = null;
    const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", buyerId).maybeSingle();
    buyerName = (prof as any)?.full_name ?? null;

    await logActivity({
      module_key: "operations_crm",
      module_label: "Operations CRM",
      action_type: "operations_reward_achieved",
      entity_type: "operations_reward",
      entity_id: achievement.id,
      metadata: {
        media_buyer_id: buyerId,
        month,
        reward_rule_id: rule.id,
        approved_conversion_count: approved,
        reward_amount: rule.reward_amount,
      },
      summary: `${buyerName ?? "Media buyer"} achieved ${rule.rule_name} for ${month}.`,
    });

    await createNotification({
      recipient_user_id: buyerId,
      module_key: "operations_crm",
      notification_type: "ops_reward_achieved",
      title: `Reward unlocked: ${rule.currency} ${rule.reward_amount.toLocaleString()}`,
      message: `${approved} approved conversions in ${month}.`,
      entity_type: "operations_reward",
      entity_id: achievement.id,
      priority: "high",
      action_url: `/operations-crm`,
      action_label: "Open",
      triggered_by_user_id: actor.id,
      triggered_by_name: actor.name ?? undefined,
      allowDuplicate: false,
    });
    await createNotification({
      recipient_role: "admin",
      module_key: "operations_crm",
      notification_type: "ops_reward_achieved_admin",
      title: `Reward achieved by ${buyerName ?? "media buyer"}`,
      message: `${approved} approved conversions in ${month} — ${rule.currency} ${rule.reward_amount.toLocaleString()}.`,
      entity_type: "operations_reward",
      entity_id: achievement.id,
      priority: "normal",
      action_url: `/operations-crm`,
      action_label: "Open",
      triggered_by_user_id: actor.id,
      triggered_by_name: actor.name ?? undefined,
    });

    return achievement;
  } catch (e) {
    console.warn("[reward] check failed", e);
    return null;
  }
}

// ============================================================
// Phase D additions: bulk approvals, rules CRUD, monthly progress queries
// ============================================================

export async function bulkApproveConversions(
  conversions: ConversionReport[],
  actor: { id: string; name: string | null },
  note?: string,
): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0;
  for (const c of conversions) {
    try { await approveConversion(c, actor, note); ok++; }
    catch { failed++; }
  }
  return { ok, failed };
}

export async function bulkRejectConversions(
  conversions: ConversionReport[],
  actor: { id: string; name: string | null },
  note?: string,
): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0;
  for (const c of conversions) {
    try { await rejectConversion(c, actor, note); ok++; }
    catch { failed++; }
  }
  return { ok, failed };
}

export async function listRewardRules(): Promise<RewardRule[]> {
  const { data } = await (supabase as any)
    .from("operations_reward_rules")
    .select("*")
    .order("active", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []) as RewardRule[];
}

export async function upsertRewardRule(rule: Partial<RewardRule> & { id?: string }): Promise<RewardRule> {
  if (rule.id) {
    const { data, error } = await (supabase as any)
      .from("operations_reward_rules")
      .update({
        rule_name: rule.rule_name,
        period: rule.period,
        target_metric: rule.target_metric,
        target_count: rule.target_count,
        reward_amount: rule.reward_amount,
        currency: rule.currency,
        active: rule.active,
        description: rule.description,
        role_scope: rule.role_scope,
      })
      .eq("id", rule.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data as RewardRule;
  }
  const { data, error } = await (supabase as any)
    .from("operations_reward_rules")
    .insert({
      rule_name: rule.rule_name ?? "New reward rule",
      role_scope: rule.role_scope ?? "media_buyer",
      period: rule.period ?? "monthly",
      target_metric: rule.target_metric ?? "approved_conversions",
      target_count: rule.target_count ?? 10,
      reward_amount: rule.reward_amount ?? 3000,
      currency: rule.currency ?? "INR",
      active: rule.active ?? true,
      description: rule.description ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as RewardRule;
}

export async function deleteRewardRule(id: string): Promise<void> {
  const { error } = await (supabase as any).from("operations_reward_rules").delete().eq("id", id);
  if (error) throw error;
}

export async function listAllRewardProgressForMonth(month: string): Promise<RewardProgress[]> {
  const { data } = await (supabase as any)
    .from("operations_reward_progress")
    .select("*")
    .eq("month", month);
  return (data ?? []) as RewardProgress[];
}

export async function listConversionsBetween(startDate: string, endDate: string): Promise<ConversionReport[]> {
  const { data } = await (supabase as any)
    .from("operations_conversion_reports")
    .select("*")
    .gte("conversion_date", startDate)
    .lte("conversion_date", endDate)
    .order("conversion_date", { ascending: true });
  const rows = (data ?? []) as ConversionReport[];
  await enrichNames(rows);
  return rows;
}

