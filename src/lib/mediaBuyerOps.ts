import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import { createNotification } from "@/lib/notifications";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";

export const CALL_SLA_DAYS = 2;
export const SERVICE_ENDING_SOON_DAYS = 7;
export const SERVICE_DURATION_PRESETS = [
  { label: "30 days (1 month)", days: 30, months: 1 },
  { label: "90 days (3 months)", days: 90, months: 3 },
  { label: "180 days (6 months)", days: 180, months: 6 },
];

export type AdsStatus =
  | "not_started" | "access_pending" | "setup_in_progress"
  | "launched" | "active" | "paused" | "stopped" | "resumed" | "completed";

export interface MBCase {
  id: string;
  student_name: string;
  student_email: string | null;
  student_phone: string | null;
  program_name: string | null;
  assigned_media_buyer_id: string | null;
  assigned_media_buyer_name: string | null;
  assigned_media_buyer_email: string | null;
  assigned_at: string | null;
  assignment_method: string;
  case_stage: string;
  call_status: string;
  first_call_due_at: string | null;
  first_called_at: string | null;
  last_called_at: string | null;
  total_call_attempts: number;
  last_call_outcome: string | null;
  email_followup_sent_at: string | null;
  ad_access_status: string;
  ad_account_access_received_at: string | null;
  ad_account_name: string | null;
  business_manager_access: boolean;
  page_access: boolean;
  ad_account_access: boolean;
  pixel_domain_access: boolean;
  access_notes: string | null;
  ads_status: AdsStatus;
  ads_launch_date: string | null;
  ads_start_date: string | null;
  ads_stop_date: string | null;
  current_pause_started_at: string | null;
  service_duration_type: string;
  service_duration_months: number | null;
  service_duration_days: number | null;
  active_days_used: number;
  active_days_remaining: number | null;
  projected_service_end_date: string | null;
  stop_reason: string | null;
  pause_reason: string | null;
  resume_reason: string | null;
  priority: string;
  notes: string | null;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface MBServicePeriod {
  id: string;
  case_id: string;
  period_type: "active" | "paused" | "stopped";
  started_at: string;
  ended_at: string | null;
  total_days: number | null;
  reason: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function contractDays(c: Pick<MBCase, "service_duration_days" | "service_duration_months">): number | null {
  if (c.service_duration_days != null) return c.service_duration_days;
  if (c.service_duration_months != null) return c.service_duration_months * 30;
  return null;
}

export function computeServiceMetrics(c: MBCase, periods: MBServicePeriod[]) {
  const contract = contractDays(c);
  const now = Date.now();
  let activeMs = 0;
  let pausedMs = 0;
  for (const p of periods) {
    const start = new Date(p.started_at).getTime();
    const end = p.ended_at ? new Date(p.ended_at).getTime() : now;
    if (end <= start) continue;
    const dur = end - start;
    if (p.period_type === "active") activeMs += dur;
    else if (p.period_type === "paused") pausedMs += dur;
  }
  const activeDays = Math.floor(activeMs / DAY_MS);
  const pausedDays = Math.floor(pausedMs / DAY_MS);
  const remaining = contract != null ? Math.max(0, contract - activeDays) : null;
  let projectedEnd: string | null = null;
  if (contract != null && remaining != null && c.ads_status === "active") {
    projectedEnd = new Date(now + remaining * DAY_MS).toISOString().slice(0, 10);
  }
  return { contractDays: contract, activeDays, pausedDays, remainingDays: remaining, projectedEnd };
}

const SIGN = "Regards,\nIndia Photographers Club";
function tmplStarted(c: MBCase) {
  return {
    subject: "Your ads have been started",
    body: `Hi ${c.student_name},\n\nThis is to confirm that your ads have been started on ${c.ads_start_date ?? new Date().toISOString().slice(0, 10)}.\n\nAssigned Media Buyer: ${c.assigned_media_buyer_name ?? "—"}\nService Duration: ${c.service_duration_days ?? (c.service_duration_months ? c.service_duration_months * 30 : "Custom")} days\n\nWe will track your active ad service days from the start date. If ads are paused or stopped on your request, the same will be recorded.\n\n${SIGN}`,
  };
}
function tmplPaused(c: MBCase, reason: string) {
  return {
    subject: "Your ads have been paused",
    body: `Hi ${c.student_name},\n\nThis is to confirm that your ads have been paused on ${new Date().toISOString().slice(0, 10)}.\n\nReason: ${reason || "—"}\n\nYour paused days will not be counted as active ad service days.\n\n${SIGN}`,
  };
}
function tmplResumed(c: MBCase, remaining: number | null) {
  return {
    subject: "Your ads have been resumed",
    body: `Hi ${c.student_name},\n\nThis is to confirm that your ads have been resumed on ${new Date().toISOString().slice(0, 10)}.\n\nRemaining Active Days: ${remaining ?? "—"}\n\n${SIGN}`,
  };
}
function tmplStopped(c: MBCase, reason: string, used: number, remaining: number | null) {
  return {
    subject: "Your ads have been stopped",
    body: `Hi ${c.student_name},\n\nThis is to confirm that your ads have been stopped on ${new Date().toISOString().slice(0, 10)}.\n\nReason: ${reason || "—"}\nActive Days Used: ${used}\nRemaining Days: ${remaining ?? "—"}\n\n${SIGN}`,
  };
}
function tmplAccess(c: MBCase) {
  return {
    subject: "Please share ad account access",
    body: `Hi ${c.student_name},\n\nTo launch your ads, please share the required ad account/business access with our team.\n\nYour assigned media buyer is: ${c.assigned_media_buyer_name ?? "—"}\n\n${SIGN}`,
  };
}
function tmplNoResponse(c: MBCase) {
  return {
    subject: "We tried reaching you for your ads setup",
    body: `Hi ${c.student_name},\n\nWe tried calling you regarding your ads setup but could not connect.\n\nPlease reply to this email or contact your assigned media buyer so we can proceed with your ad launch.\n\n${SIGN}`,
  };
}

export type EmailType = "ads_started" | "ads_paused" | "ads_resumed" | "ads_stopped" | "access_requested" | "no_response_followup";

async function queueEmail(c: MBCase, email_type: EmailType, subject: string, body: string) {
  if (!c.student_email) return null;
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await (supabase as any).from("media_buyer_case_emails").insert({
    case_id: c.id,
    email_type,
    recipient_email: c.student_email,
    subject,
    body,
    status: "queued",
    created_by: u?.user?.id ?? null,
  }).select("id").single();
  if (error) console.error("queueEmail failed", error);
  return data?.id ?? null;
}

async function logEvent(case_id: string, event_type: string, opts: { event_label?: string; old_status?: string; new_status?: string; notes?: string; metadata?: any } = {}) {
  const { data: u } = await supabase.auth.getUser();
  await (supabase as any).from("media_buyer_case_events").insert({
    case_id,
    event_type,
    event_label: opts.event_label ?? null,
    old_status: opts.old_status ?? null,
    new_status: opts.new_status ?? null,
    notes: opts.notes ?? null,
    metadata: opts.metadata ?? null,
    created_by: u?.user?.id ?? null,
  });
}

export async function createCase(input: {
  student_name: string;
  student_email?: string;
  student_phone?: string;
  program_name?: string;
  service_duration_days?: number | null;
  service_duration_months?: number | null;
  service_duration_type?: string;
  priority?: string;
  notes?: string;
  assigned_media_buyer_id?: string | null;
  assignment_method?: string;
}) {
  const { data: u } = await supabase.auth.getUser();
  let assignedName: string | null = null;
  let assignedEmail: string | null = null;
  if (input.assigned_media_buyer_id) {
    const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", input.assigned_media_buyer_id).maybeSingle();
    assignedName = (p as any)?.full_name ?? null;
    assignedEmail = (p as any)?.email ?? null;
  }
  const now = new Date();
  const due = input.assigned_media_buyer_id ? new Date(now.getTime() + CALL_SLA_DAYS * DAY_MS) : null;
  const { data, error } = await (supabase as any).from("media_buyer_cases").insert({
    student_name: input.student_name,
    student_email: input.student_email || null,
    student_phone: input.student_phone || null,
    program_name: input.program_name || null,
    service_duration_days: input.service_duration_days ?? null,
    service_duration_months: input.service_duration_months ?? null,
    service_duration_type: input.service_duration_type ?? "custom",
    priority: input.priority ?? "normal",
    notes: input.notes || null,
    assigned_media_buyer_id: input.assigned_media_buyer_id ?? null,
    assigned_media_buyer_name: assignedName,
    assigned_media_buyer_email: assignedEmail,
    assigned_at: input.assigned_media_buyer_id ? now.toISOString() : null,
    assigned_by: input.assigned_media_buyer_id ? (u?.user?.id ?? null) : null,
    assignment_method: input.assignment_method ?? "manual",
    case_stage: input.assigned_media_buyer_id ? "call_pending" : "assigned",
    first_call_due_at: due ? due.toISOString() : null,
    created_by: u?.user?.id ?? null,
  }).select("*").single();
  if (error) throw error;
  await logEvent(data.id, "assigned", { event_label: "Case created", new_status: data.case_stage });
  logActivity({ module_key: "media_buyer_operations", action_type: "media_buyer_case_created", entity_type: "media_buyer_case", entity_id: data.id, entity_label: data.student_name, summary: `Media buyer case created for ${data.student_name}.` });
  if (input.assigned_media_buyer_id) {
    await createNotification({
      recipient_user_id: input.assigned_media_buyer_id,
      module_key: "media_buyer_operations",
      notification_type: "media_buyer_case_assigned",
      title: "New media buyer case assigned",
      message: `${data.student_name} — first call due within ${CALL_SLA_DAYS} days.`,
      entity_type: "media_buyer_case",
      entity_id: data.id,
      entity_label: data.student_name,
      action_url: "/media-buyer-operations",
      action_label: "Open case",
      priority: "high",
    });
    logActivity({ module_key: "media_buyer_operations", action_type: "media_buyer_case_assigned", entity_type: "media_buyer_case", entity_id: data.id, entity_label: data.student_name, target_user_id: input.assigned_media_buyer_id, target_name: assignedName ?? "", summary: `${data.student_name} assigned to ${assignedName ?? "—"}.` });
  }
  return data as MBCase;
}

export async function assignCase(caseId: string, buyerId: string, method: "manual" | "round_robin" = "manual") {
  const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", buyerId).maybeSingle();
  const { data: u } = await supabase.auth.getUser();
  const now = new Date();
  const due = new Date(now.getTime() + CALL_SLA_DAYS * DAY_MS);
  const { data: prev } = await supabase.from("media_buyer_cases").select("student_name, assigned_media_buyer_name").eq("id", caseId).maybeSingle();
  const { data, error } = await (supabase as any).from("media_buyer_cases").update({
    assigned_media_buyer_id: buyerId,
    assigned_media_buyer_name: (p as any)?.full_name ?? null,
    assigned_media_buyer_email: (p as any)?.email ?? null,
    assigned_at: now.toISOString(),
    assigned_by: u?.user?.id ?? null,
    assignment_method: method,
    first_call_due_at: due.toISOString(),
    case_stage: "call_pending",
  }).eq("id", caseId).select("*").single();
  if (error) throw error;
  await logEvent(caseId, method === "round_robin" ? "round_robin_assigned" : "assigned", { event_label: `Assigned to ${(p as any)?.full_name ?? ""}` });
  await createNotification({
    recipient_user_id: buyerId,
    module_key: "media_buyer_operations",
    notification_type: "media_buyer_case_assigned",
    title: "New media buyer case assigned",
    message: `${data.student_name} — first call due within ${CALL_SLA_DAYS} days.`,
    entity_type: "media_buyer_case", entity_id: caseId, entity_label: data.student_name,
    action_url: "/media-buyer-operations", action_label: "Open case", priority: "high",
  });
  logActivity({ module_key: "media_buyer_operations", action_type: method === "round_robin" ? "media_buyer_round_robin_assigned" : "media_buyer_case_reassigned", entity_type: "media_buyer_case", entity_id: caseId, entity_label: data.student_name, target_user_id: buyerId, target_name: (p as any)?.full_name ?? "", old_values: { assigned_to: (prev as any)?.assigned_media_buyer_name ?? null }, new_values: { assigned_to: (p as any)?.full_name }, summary: `${data.student_name} assigned to ${(p as any)?.full_name ?? "—"}.` });
  return data as MBCase;
}

export async function autoAssignRoundRobin(caseId: string) {
  const eligible = await getEligibleAssignees("media_buyer_operations");
  if (eligible.length === 0) throw new Error("No eligible media buyers. Enable 'Can receive Media Buyer cases' on a team member first.");
  const { data: counts } = await (supabase as any).from("media_buyer_cases")
    .select("assigned_media_buyer_id")
    .in("assigned_media_buyer_id", eligible.map((e) => e.id))
    .eq("is_deleted", false).eq("is_active", true);
  const tally: Record<string, number> = {};
  eligible.forEach((e) => { tally[e.id] = 0; });
  (counts ?? []).forEach((r: any) => { if (r.assigned_media_buyer_id) tally[r.assigned_media_buyer_id] = (tally[r.assigned_media_buyer_id] ?? 0) + 1; });
  const sorted = eligible.slice().sort((a, b) => tally[a.id] - tally[b.id]);
  return assignCase(caseId, sorted[0].id, "round_robin");
}

export async function markCalled(c: MBCase, outcome: string) {
  const now = new Date().toISOString();
  const update: any = {
    call_status: "called",
    last_called_at: now,
    last_call_outcome: outcome,
    total_call_attempts: c.total_call_attempts + 1,
  };
  if (!c.first_called_at) update.first_called_at = now;
  if (c.case_stage === "call_pending" || c.case_stage === "assigned") update.case_stage = "called";
  const { error } = await (supabase as any).from("media_buyer_cases").update(update).eq("id", c.id);
  if (error) throw error;
  await logEvent(c.id, "call_connected", { event_label: `Call connected (${outcome})`, notes: outcome });
  logActivity({ module_key: "media_buyer_operations", action_type: "media_buyer_call_marked", entity_type: "media_buyer_case", entity_id: c.id, entity_label: c.student_name, summary: `Call marked for ${c.student_name}: ${outcome}.` });
}

export async function markNotPicked(c: MBCase) {
  const now = new Date().toISOString();
  const update: any = {
    call_status: "not_picked",
    last_called_at: now,
    last_call_outcome: "Not picked",
    total_call_attempts: c.total_call_attempts + 1,
    case_stage: "not_picked",
  };
  const { error } = await (supabase as any).from("media_buyer_cases").update(update).eq("id", c.id);
  if (error) throw error;
  await logEvent(c.id, "no_answer", { event_label: "Not picked" });
  logActivity({ module_key: "media_buyer_operations", action_type: "media_buyer_no_answer_marked", entity_type: "media_buyer_case", entity_id: c.id, entity_label: c.student_name, summary: `No answer marked for ${c.student_name}.` });
}

export async function sendFollowUpEmail(c: MBCase) {
  const t = tmplNoResponse(c);
  const id = await queueEmail(c, "no_response_followup", t.subject, t.body);
  if (id) {
    await (supabase as any).from("media_buyer_cases").update({ email_followup_sent_at: new Date().toISOString(), case_stage: "email_followup_sent" }).eq("id", c.id);
    await logEvent(c.id, "email_sent", { event_label: "Follow-up email queued" });
    logActivity({ module_key: "media_buyer_operations", action_type: "media_buyer_email_sent_or_queued", entity_type: "media_buyer_case", entity_id: c.id, entity_label: c.student_name, summary: `Follow-up email queued for ${c.student_name}.` });
  }
  return id;
}

export async function setAdAccessStatus(c: MBCase, status: string, fields?: Partial<Pick<MBCase, "ad_account_name" | "business_manager_access" | "page_access" | "ad_account_access" | "pixel_domain_access" | "access_notes">>) {
  const update: any = { ad_access_status: status, ...fields };
  if (status === "received") {
    update.ad_account_access_received_at = new Date().toISOString();
    update.case_stage = "ad_access_received";
  } else if (status === "requested") {
    update.case_stage = "ad_access_requested";
  }
  const { error } = await (supabase as any).from("media_buyer_cases").update(update).eq("id", c.id);
  if (error) throw error;
  await logEvent(c.id, status === "received" ? "ad_access_received" : "ad_access_requested", { event_label: `Ad access: ${status}` });
  logActivity({ module_key: "media_buyer_operations", action_type: status === "received" ? "ad_access_received" : "ad_access_requested", entity_type: "media_buyer_case", entity_id: c.id, entity_label: c.student_name, summary: `Ad access ${status} for ${c.student_name}.` });
}

export async function requestAccessEmail(c: MBCase) {
  const t = tmplAccess(c);
  const id = await queueEmail(c, "access_requested", t.subject, t.body);
  if (id) {
    await setAdAccessStatus(c, "requested");
  }
  return id;
}

export async function launchAds(c: MBCase) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const update: any = {
    ads_status: "active",
    ads_launch_date: c.ads_launch_date ?? today,
    ads_start_date: c.ads_start_date ?? today,
    case_stage: "ads_launched",
    current_pause_started_at: null,
  };
  const { error } = await (supabase as any).from("media_buyer_cases").update(update).eq("id", c.id);
  if (error) throw error;
  await (supabase as any).from("media_buyer_service_periods").insert({
    case_id: c.id, period_type: "active", started_at: now,
  });
  await logEvent(c.id, "ads_launched", { event_label: "Ads launched", new_status: "active" });
  const updated = { ...c, ...update } as MBCase;
  const t = tmplStarted(updated);
  await queueEmail(updated, "ads_started", t.subject, t.body);
  logActivity({ module_key: "media_buyer_operations", action_type: "ads_launched", entity_type: "media_buyer_case", entity_id: c.id, entity_label: c.student_name, summary: `Ads launched for ${c.student_name}.` });
}

async function closeOpenPeriod(caseId: string, type: "active" | "paused") {
  const { data } = await (supabase as any).from("media_buyer_service_periods")
    .select("id, started_at").eq("case_id", caseId).eq("period_type", type).is("ended_at", null);
  const now = new Date();
  for (const row of (data ?? [])) {
    const totalDays = Math.floor((now.getTime() - new Date(row.started_at).getTime()) / DAY_MS);
    await (supabase as any).from("media_buyer_service_periods").update({ ended_at: now.toISOString(), total_days: totalDays }).eq("id", row.id);
  }
}

export async function pauseAds(c: MBCase, reason: string) {
  const now = new Date();
  await closeOpenPeriod(c.id, "active");
  await (supabase as any).from("media_buyer_service_periods").insert({ case_id: c.id, period_type: "paused", started_at: now.toISOString(), reason });
  await (supabase as any).from("media_buyer_cases").update({
    ads_status: "paused", case_stage: "ads_paused_by_student", current_pause_started_at: now.toISOString(), pause_reason: reason,
  }).eq("id", c.id);
  await logEvent(c.id, "ads_paused", { event_label: "Ads paused", notes: reason });
  const t = tmplPaused(c, reason);
  await queueEmail(c, "ads_paused", t.subject, t.body);
  logActivity({ module_key: "media_buyer_operations", action_type: "ads_paused", entity_type: "media_buyer_case", entity_id: c.id, entity_label: c.student_name, summary: `Ads paused for ${c.student_name}: ${reason}.` });
}

export async function resumeAds(c: MBCase, reason: string) {
  const now = new Date();
  await closeOpenPeriod(c.id, "paused");
  await (supabase as any).from("media_buyer_service_periods").insert({ case_id: c.id, period_type: "active", started_at: now.toISOString(), reason });
  await (supabase as any).from("media_buyer_cases").update({
    ads_status: "active", case_stage: "ads_resumed", current_pause_started_at: null, resume_reason: reason,
  }).eq("id", c.id);
  await logEvent(c.id, "ads_resumed", { event_label: "Ads resumed", notes: reason });
  const { data: periods } = await (supabase as any).from("media_buyer_service_periods").select("*").eq("case_id", c.id).eq("is_deleted", false);
  const m = computeServiceMetrics(c, (periods ?? []) as any);
  const t = tmplResumed(c, m.remainingDays);
  await queueEmail(c, "ads_resumed", t.subject, t.body);
  logActivity({ module_key: "media_buyer_operations", action_type: "ads_resumed", entity_type: "media_buyer_case", entity_id: c.id, entity_label: c.student_name, summary: `Ads resumed for ${c.student_name}.` });
}

export async function stopAds(c: MBCase, reason: string) {
  const now = new Date();
  await closeOpenPeriod(c.id, "active");
  await closeOpenPeriod(c.id, "paused");
  await (supabase as any).from("media_buyer_service_periods").insert({ case_id: c.id, period_type: "stopped", started_at: now.toISOString(), reason });
  await (supabase as any).from("media_buyer_cases").update({
    ads_status: "stopped", case_stage: "ads_stopped_by_student", ads_stop_date: now.toISOString().slice(0, 10), stop_reason: reason,
  }).eq("id", c.id);
  await logEvent(c.id, "ads_stopped", { event_label: "Ads stopped", notes: reason });
  const { data: periods } = await (supabase as any).from("media_buyer_service_periods").select("*").eq("case_id", c.id).eq("is_deleted", false);
  const m = computeServiceMetrics(c, (periods ?? []) as any);
  const t = tmplStopped(c, reason, m.activeDays, m.remainingDays);
  await queueEmail(c, "ads_stopped", t.subject, t.body);
  logActivity({ module_key: "media_buyer_operations", action_type: "ads_stopped", entity_type: "media_buyer_case", entity_id: c.id, entity_label: c.student_name, summary: `Ads stopped for ${c.student_name}: ${reason}.` });
}

export async function completeService(c: MBCase) {
  await closeOpenPeriod(c.id, "active");
  await closeOpenPeriod(c.id, "paused");
  await (supabase as any).from("media_buyer_cases").update({
    ads_status: "completed", case_stage: "service_completed", is_active: false,
  }).eq("id", c.id);
  await logEvent(c.id, "service_completed", { event_label: "Service completed" });
  logActivity({ module_key: "media_buyer_operations", action_type: "service_completed", entity_type: "media_buyer_case", entity_id: c.id, entity_label: c.student_name, summary: `Service completed for ${c.student_name}.` });
}

export async function addCaseNote(c: MBCase, note: string) {
  await logEvent(c.id, "note_added", { event_label: "Note added", notes: note });
  logActivity({ module_key: "media_buyer_operations", action_type: "media_buyer_case_note_added", entity_type: "media_buyer_case", entity_id: c.id, entity_label: c.student_name, summary: `Note added on ${c.student_name}.` });
}

export async function retryEmail(emailId: string) {
  return;
}
