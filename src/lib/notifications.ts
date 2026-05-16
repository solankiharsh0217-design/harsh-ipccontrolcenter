import { supabase } from "@/integrations/supabase/client";

export type NotificationPriority = "urgent" | "high" | "normal" | "low";
export type NotificationStatus = "unread" | "read" | "dismissed";

export interface CreateNotificationInput {
  recipient_user_id?: string | null;
  recipient_team_member_id?: string | null;
  recipient_role?: string | null;
  module_key: string;
  notification_type: string;
  title: string;
  message?: string;
  entity_type?: string;
  entity_id?: string | null;
  entity_label?: string;
  priority?: NotificationPriority;
  action_url?: string;
  action_label?: string;
  metadata?: Record<string, any>;
  triggered_by_user_id?: string | null;
  triggered_by_name?: string;
  source?: string;
  /** if true, skip the duplicate-prevention check */
  allowDuplicate?: boolean;
}

export const NOTIFICATION_MODULE_LABELS: Record<string, string> = {
  follow_up_command_center: "Follow-Up",
  payment_recovery: "Payment Recovery",
  paid_pipeline: "Paid Pipeline",
  calling_crm: "Calling CRM",
  webinar_performance: "Webinar Performance",
  audit_log: "Audit Log",
  master_settings: "Master Settings",
  team: "Team",
  admin: "Admin",
  reports: "Reports",
};

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    if (!input.recipient_user_id && !input.recipient_team_member_id && !input.recipient_role) {
      return;
    }
    if (!input.allowDuplicate && input.recipient_user_id && input.entity_id) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data: existing } = await (supabase as any)
        .from("notifications")
        .select("id")
        .eq("recipient_user_id", input.recipient_user_id)
        .eq("notification_type", input.notification_type)
        .eq("entity_id", input.entity_id)
        .eq("status", "unread")
        .eq("is_deleted", false)
        .gte("created_at", since.toISOString())
        .limit(1);
      if (existing && existing.length > 0) return;
    }
    await (supabase as any).from("notifications").insert({
      recipient_user_id: input.recipient_user_id ?? null,
      recipient_team_member_id: input.recipient_team_member_id ?? null,
      recipient_role: input.recipient_role ?? null,
      module_key: input.module_key,
      notification_type: input.notification_type,
      title: input.title,
      message: input.message ?? null,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      entity_label: input.entity_label ?? null,
      priority: input.priority ?? "normal",
      status: "unread",
      action_url: input.action_url ?? null,
      action_label: input.action_label ?? null,
      metadata: input.metadata ?? null,
      triggered_by_user_id: input.triggered_by_user_id ?? null,
      triggered_by_name: input.triggered_by_name ?? null,
      source: input.source ?? "app",
    });
  } catch (e) {
    console.warn("[notifications] createNotification failed", e);
  }
}

export async function notifyAdmins(input: Omit<CreateNotificationInput, "recipient_user_id" | "recipient_role">) {
  try {
    const { data: admins } = await (supabase as any)
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (!admins) return;
    for (const a of admins as Array<{ user_id: string }>) {
      await createNotification({ ...input, recipient_user_id: a.user_id });
    }
  } catch (e) {
    console.warn("[notifications] notifyAdmins failed", e);
  }
}

export async function markNotificationsRead(ids: string[]) {
  if (!ids.length) return;
  await (supabase as any)
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .in("id", ids);
}

export async function markAllRead(recipientUserId: string) {
  await (supabase as any)
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("recipient_user_id", recipientUserId)
    .eq("status", "unread");
}

// ──────────────────────────────────────────────────────────────────────────
// Notification generator
// Scans existing business data + audit events and creates notifications
// for the current user (and admins where relevant). Safe to call on
// /notifications open, on Refresh, and on bell-count refresh.
// ──────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  highValuePending: 50000,
  recoveryOverdueDays: 3,
  financeDocsPendingDays: 2,
  financeApprovalDays: 3,
};

function daysAgo(n: number) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n);
  return d.toISOString();
}

function todayStartIso() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getAdminUserIds(): Promise<string[]> {
  try {
    const { data } = await (supabase as any)
      .from("user_roles").select("user_id").eq("role", "admin");
    return (data ?? []).map((r: any) => r.user_id).filter(Boolean);
  } catch { return []; }
}

export interface GeneratorContext {
  userId: string;
  isAdmin: boolean;
}

export async function generateNotifications(ctx: GeneratorContext): Promise<{ created: number }> {
  let created = 0;
  const inc = () => { created++; };
  const adminIds = await getAdminUserIds();
  const today = todayDateStr();

  // ─── Paid Pipeline / Recovery / Finance / Follow-Up scans ──────────────
  try {
    const { data: leads } = await (supabase as any)
      .from("paid_pipeline_leads")
      .select("id,name,assigned_sales_executive,balance_pending,follow_up_date,follow_up_priority,follow_up_status,pipeline_stage,finance_required,finance_status,finance_partner,updated_at,is_dropped,is_deleted,is_final_sale,is_enrolled,token_amount_collected,next_balance_follow_up_date")
      .eq("is_deleted", false)
      .limit(2000);

    const list = (leads ?? []) as any[];

    for (const l of list) {
      const owner = l.assigned_sales_executive as string | null;
      const entityLabel = l.name ?? "Lead";
      const entityId = l.id as string;
      const visibleToCurrent = ctx.isAdmin || owner === ctx.userId;
      const recipients = new Set<string>();
      if (owner) recipients.add(owner);
      if (!owner) adminIds.forEach((a) => recipients.add(a));

      // Skip dropped leads except for high-value dropped risk
      const isDropped = !!l.is_dropped;

      // 1. Follow-up due today
      if (!isDropped && l.follow_up_date === today && l.follow_up_status !== "Done" && owner) {
        const pri = (l.follow_up_priority || "").toLowerCase();
        const priority = pri === "urgent" || pri === "hot" ? "urgent" : "normal";
        await createNotification({
          recipient_user_id: owner,
          module_key: "follow_up_command_center",
          notification_type: "follow_up_due_today",
          title: "Follow-up due today",
          message: `Follow-up scheduled today for ${entityLabel}.`,
          entity_type: "paid_pipeline_lead",
          entity_id: entityId,
          entity_label: entityLabel,
          priority: priority as any,
          action_url: "/follow-up-command-center",
          action_label: "Open Follow-Up",
        }); inc();
      }

      // 2/3. Follow-up overdue (and hot/urgent overdue)
      if (!isDropped && l.follow_up_date && l.follow_up_date < today && l.follow_up_status !== "Done") {
        const pri = (l.follow_up_priority || "").toLowerCase();
        const isHot = pri === "urgent" || pri === "hot";
        for (const r of recipients) {
          await createNotification({
            recipient_user_id: r,
            module_key: "follow_up_command_center",
            notification_type: isHot ? "follow_up_hot_overdue" : "follow_up_overdue",
            title: isHot ? "Hot follow-up overdue" : "Follow-up overdue",
            message: `Follow-up overdue for ${entityLabel} (due ${l.follow_up_date}).`,
            entity_type: "paid_pipeline_lead",
            entity_id: entityId,
            entity_label: entityLabel,
            priority: isHot ? "urgent" : "high",
            action_url: "/follow-up-command-center",
            action_label: "Open Follow-Up",
          }); inc();
        }
      }

      // Payment Recovery / balance pending
      const bal = Number(l.balance_pending ?? 0);
      const activePending = !isDropped && bal > 0 && !l.is_enrolled;

      // 4. High-value balance pending
      if (activePending && bal >= DEFAULTS.highValuePending) {
        for (const r of recipients) {
          await createNotification({
            recipient_user_id: r,
            module_key: "payment_recovery",
            notification_type: "recovery_high_value",
            title: "High-value balance pending",
            message: `${entityLabel} has ₹${bal.toLocaleString()} pending.`,
            entity_type: "paid_pipeline_lead",
            entity_id: entityId,
            entity_label: entityLabel,
            priority: "high",
            action_url: "/payment-recovery",
            action_label: "Open Payment Recovery",
          }); inc();
        }
      }

      // 5. Token paid but no next payment date
      if (activePending && Number(l.token_amount_collected ?? 0) > 0 && !l.next_balance_follow_up_date) {
        for (const r of recipients) {
          await createNotification({
            recipient_user_id: r,
            module_key: "payment_recovery",
            notification_type: "recovery_no_next_date",
            title: "No next payment date set",
            message: `${entityLabel} paid token but has no scheduled next payment date.`,
            entity_type: "paid_pipeline_lead",
            entity_id: entityId,
            entity_label: entityLabel,
            priority: "high",
            action_url: "/payment-recovery",
            action_label: "Open Payment Recovery",
          }); inc();
        }
      }

      // 6. Balance pending no owner → admins
      if (activePending && !owner) {
        for (const a of adminIds) {
          await createNotification({
            recipient_user_id: a,
            module_key: "payment_recovery",
            notification_type: "recovery_no_owner",
            title: "Balance pending — no owner assigned",
            message: `${entityLabel} has ₹${bal.toLocaleString()} pending and no owner.`,
            entity_type: "paid_pipeline_lead",
            entity_id: entityId,
            entity_label: entityLabel,
            priority: "urgent",
            action_url: "/payment-recovery",
            action_label: "Assign owner",
          }); inc();
        }
      }

      // 7. Recovery follow-up overdue
      if (activePending && l.next_balance_follow_up_date && l.next_balance_follow_up_date < today) {
        const daysOver = Math.floor((Date.now() - new Date(l.next_balance_follow_up_date).getTime()) / 86400000);
        if (daysOver >= DEFAULTS.recoveryOverdueDays) {
          for (const r of recipients) {
            await createNotification({
              recipient_user_id: r,
              module_key: "payment_recovery",
              notification_type: "recovery_overdue",
              title: "Recovery follow-up overdue",
              message: `${entityLabel} recovery overdue by ${daysOver} days.`,
              entity_type: "paid_pipeline_lead",
              entity_id: entityId,
              entity_label: entityLabel,
              priority: "high",
              action_url: "/payment-recovery",
              action_label: "Open Payment Recovery",
            }); inc();
          }
        }
      }

      // 8. Dropped risk with high pending
      if (isDropped && bal >= DEFAULTS.highValuePending) {
        for (const r of recipients) {
          await createNotification({
            recipient_user_id: r,
            module_key: "payment_recovery",
            notification_type: "recovery_dropped_risk",
            title: "Dropped lead with high pending amount",
            message: `${entityLabel} is dropped but has ₹${bal.toLocaleString()} pending.`,
            entity_type: "paid_pipeline_lead",
            entity_id: entityId,
            entity_label: entityLabel,
            priority: "urgent",
            action_url: "/payment-recovery",
            action_label: "Open Payment Recovery",
          }); inc();
        }
      }

      // ─── Finance rules ────────────────────────────────────────────────
      if (l.finance_required) {
        const fs = (l.finance_status || "").toLowerCase();
        const updatedAt = l.updated_at ? new Date(l.updated_at).getTime() : 0;
        const ageDays = updatedAt ? Math.floor((Date.now() - updatedAt) / 86400000) : 0;

        // Approved but not disbursed
        if ((fs === "approved" || fs.includes("approved")) && bal > 0) {
          for (const r of recipients) {
            await createNotification({
              recipient_user_id: r,
              module_key: "payment_recovery",
              notification_type: "finance_approved_not_disbursed",
              title: "Finance approved but not disbursed",
              message: `${entityLabel}: ${l.finance_partner ?? "Finance"} approved, balance still pending.`,
              entity_type: "paid_pipeline_lead",
              entity_id: entityId,
              entity_label: entityLabel,
              priority: "urgent",
              action_url: "/paid-pipeline",
              action_label: "Open Finance Case",
            }); inc();
          }
        }

        // Rejected with no alternate partner (no alternate partner field, so: rejected + still pending)
        if (fs.includes("reject") && bal > 0) {
          for (const r of recipients) {
            await createNotification({
              recipient_user_id: r,
              module_key: "payment_recovery",
              notification_type: "finance_rejected_no_alt",
              title: "Finance rejected — no alternate partner",
              message: `${entityLabel}: finance rejected. Balance still pending.`,
              entity_type: "paid_pipeline_lead",
              entity_id: entityId,
              entity_label: entityLabel,
              priority: "high",
              action_url: "/paid-pipeline",
              action_label: "Open Finance Case",
            }); inc();
          }
        }

        // Docs pending too long
        if ((fs.includes("doc") || fs.includes("pending")) && ageDays >= DEFAULTS.financeDocsPendingDays) {
          for (const r of recipients) {
            await createNotification({
              recipient_user_id: r,
              module_key: "payment_recovery",
              notification_type: "finance_docs_pending",
              title: "Finance documents pending",
              message: `${entityLabel}: docs pending for ${ageDays} days.`,
              entity_type: "paid_pipeline_lead",
              entity_id: entityId,
              entity_label: entityLabel,
              priority: "high",
              action_url: "/paid-pipeline",
              action_label: "Open Finance Case",
            }); inc();
          }
        }

        // Application submitted, no approval after N days
        if ((fs.includes("submit") || fs.includes("applied")) && ageDays >= DEFAULTS.financeApprovalDays) {
          for (const r of recipients) {
            await createNotification({
              recipient_user_id: r,
              module_key: "payment_recovery",
              notification_type: "finance_no_approval",
              title: "Finance application — no approval",
              message: `${entityLabel}: submitted ${ageDays} days ago, no approval yet.`,
              entity_type: "paid_pipeline_lead",
              entity_id: entityId,
              entity_label: entityLabel,
              priority: "high",
              action_url: "/paid-pipeline",
              action_label: "Open Finance Case",
            }); inc();
          }
        }
      }
    }
  } catch (e) {
    console.warn("[notifications] paid_pipeline scan failed", e);
  }

  // ─── Audit-based admin alerts (last 24h) ────────────────────────────────
  if (ctx.isAdmin || adminIds.length > 0) {
    try {
      const { data: audits } = await (supabase as any)
        .from("audit_logs")
        .select("id,action_type,severity,module_key,entity_type,entity_id,entity_label,summary,created_at,actor_name,target_name")
        .eq("is_deleted", false)
        .gte("created_at", daysAgo(1))
        .order("created_at", { ascending: false })
        .limit(500);

      const IMPORTANT: Record<string, { priority: "urgent" | "high" | "normal"; title: string; module: string; url: string; label: string }> = {
        payment_deleted: { priority: "urgent", title: "Payment deleted", module: "audit_log", url: "/audit-log", label: "Open Audit Log" },
        payment_soft_deleted: { priority: "urgent", title: "Payment deleted", module: "audit_log", url: "/audit-log", label: "Open Audit Log" },
        report_soft_deleted: { priority: "high", title: "Report deleted", module: "reports", url: "/reports", label: "Open Reports" },
        report_restored: { priority: "normal", title: "Report restored", module: "reports", url: "/reports", label: "Open Reports" },
        module_access_granted: { priority: "high", title: "Access granted", module: "team", url: "/team", label: "Open Team" },
        module_access_removed: { priority: "high", title: "Access removed", module: "team", url: "/team", label: "Open Team" },
        access_granted: { priority: "high", title: "Access granted", module: "team", url: "/team", label: "Open Team" },
        access_removed: { priority: "high", title: "Access removed", module: "team", url: "/team", label: "Open Team" },
        assignment_eligibility_updated: { priority: "normal", title: "Assignment eligibility updated", module: "team", url: "/team", label: "Open Team" },
        finance_status_changed: { priority: "normal", title: "Finance status changed", module: "paid_pipeline", url: "/paid-pipeline", label: "Open Paid Pipeline" },
        lead_dropped: { priority: "high", title: "Lead dropped", module: "paid_pipeline", url: "/paid-pipeline", label: "Open Paid Pipeline" },
      };

      for (const ev of (audits ?? []) as any[]) {
        let rule = IMPORTANT[ev.action_type as string];
        const isCritical = ev.severity === "critical";
        if (!rule && !isCritical) continue;
        if (!rule && isCritical) {
          rule = { priority: "urgent", title: `Critical: ${ev.action_type}`, module: ev.module_key ?? "audit_log", url: "/audit-log", label: "Open Audit Log" };
        }
        const targets = ctx.isAdmin ? [ctx.userId] : adminIds;
        for (const a of targets) {
          await createNotification({
            recipient_user_id: a,
            module_key: rule!.module,
            notification_type: ev.action_type,
            title: rule!.title,
            message: ev.summary ?? `${ev.action_type} on ${ev.entity_label ?? ev.entity_type ?? "—"}${ev.actor_name ? ` by ${ev.actor_name}` : ""}`,
            entity_type: "audit_log",
            entity_id: ev.id,
            entity_label: ev.entity_label ?? null,
            priority: (isCritical ? "urgent" : rule!.priority) as any,
            action_url: rule!.url,
            action_label: rule!.label,
            metadata: { audit_id: ev.id, action_type: ev.action_type, severity: ev.severity },
          }); inc();
        }
      }
    } catch (e) {
      console.warn("[notifications] audit scan failed", e);
    }
  }

  return { created };
}

/**
 * Resolve (mark as read) any unread notifications tied to a given entity.
 * Called after the underlying problem is solved (follow-up done, payment
 * collected, owner assigned, etc.). Safe and best-effort.
 */
export async function resolveNotificationsForEntity(opts: {
  entity_id: string;
  notification_types?: string[];
}) {
  try {
    let q: any = (supabase as any)
      .from("notifications")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("entity_id", opts.entity_id)
      .eq("status", "unread");
    if (opts.notification_types?.length) q = q.in("notification_type", opts.notification_types);
    await q;
  } catch (e) {
    console.warn("[notifications] resolveNotificationsForEntity failed", e);
  }
}

