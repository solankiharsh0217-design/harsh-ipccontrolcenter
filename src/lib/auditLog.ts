import { supabase } from "@/integrations/supabase/client";

export type Severity = "info" | "warning" | "critical";

export interface LogActivityInput {
  module_key: string;
  module_label?: string;
  action_type: string;
  action_label?: string;
  entity_type?: string;
  entity_id?: string | null;
  entity_label?: string;
  target_user_id?: string | null;
  target_name?: string;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  severity?: Severity;
  summary?: string;
}

const SENSITIVE_KEYS = [
  "password", "pass", "secret", "token", "api_key", "apikey",
  "access_token", "refresh_token", "private_key", "client_secret",
  "service_role", "anon_key", "auth_token", "jwt",
];

export function maskSensitive(obj: any): any {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(maskSensitive);
  if (typeof obj !== "object") return obj;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const low = k.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => low.includes(s))) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object") {
      out[k] = maskSensitive(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

let _cachedActor: { id: string | null; name: string | null; email: string | null } | null = null;
async function getActor() {
  if (_cachedActor) return _cachedActor;
  try {
    const { data } = await supabase.auth.getUser();
    const u = data?.user;
    let name: string | null = null;
    if (u) {
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", u.id).maybeSingle();
      name = (prof as any)?.full_name ?? null;
    }
    _cachedActor = { id: u?.id ?? null, name, email: u?.email ?? null };
    return _cachedActor;
  } catch {
    return { id: null, name: null, email: null };
  }
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const actor = await getActor();
    await (supabase as any).from("audit_logs").insert({
      module_key: input.module_key,
      module_label: input.module_label ?? input.module_key,
      action_type: input.action_type,
      action_label: input.action_label ?? input.action_type,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      entity_label: input.entity_label ?? null,
      actor_user_id: actor.id,
      actor_name: actor.name,
      actor_email: actor.email,
      target_user_id: input.target_user_id ?? null,
      target_name: input.target_name ?? null,
      old_values: input.old_values ? maskSensitive(input.old_values) : null,
      new_values: input.new_values ? maskSensitive(input.new_values) : null,
      metadata: input.metadata ? maskSensitive(input.metadata) : null,
      severity: input.severity ?? "info",
      source: "app",
      summary: input.summary ?? null,
    });
  } catch (e) {
    console.warn("[auditLog] failed:", e);
  }
}

export const MODULE_LABELS: Record<string, string> = {
  paid_pipeline: "Paid Pipeline",
  payment_recovery: "Payment Recovery",
  follow_up_command_center: "Follow-Up Command Center",
  calling_crm: "Calling CRM",
  master_settings: "Master Settings",
  admin_panel: "Admin / Team Access",
  team_directory: "Team Directory",
  reports_history: "Reports & History",
  webinar_performance: "Webinar Performance",
  roas: "ROAS Calculator",
};

// ─────────────── Paid Pipeline lead diff logger ───────────────
type AnyLead = Record<string, any>;

const PAID_FIELD_LABELS: Record<string, { label: string; action: string }> = {
  pipeline_stage: { label: "Stage", action: "stage_changed" },
  lead_temperature: { label: "Lead Priority", action: "lead_priority_changed" },
  balance_category: { label: "Balance Category", action: "balance_category_changed" },
  assigned_sales_executive: { label: "Owner", action: "owner_assigned" },
  finance_partner: { label: "Finance Partner", action: "finance_partner_changed" },
  finance_status: { label: "Finance Status", action: "finance_status_changed" },
  is_final_sale: { label: "Final Sale", action: "final_sale_marked" },
  is_dropped: { label: "Dropped", action: "lead_dropped" },
  next_follow_up_date: { label: "Follow-Up Date", action: "follow_up_rescheduled" },
};

export function logPaidLeadDiff(
  oldLead: AnyLead | null | undefined,
  patch: AnyLead,
  opts: { leadId: string; leadName?: string; moduleKey?: string; moduleLabel?: string } = { leadId: "" },
) {
  if (!opts.leadId) return;
  const moduleKey = opts.moduleKey ?? "paid_pipeline";
  const moduleLabel = opts.moduleLabel ?? "Paid Pipeline";
  const name = opts.leadName || "Lead";
  for (const [k, newVal] of Object.entries(patch)) {
    const def = PAID_FIELD_LABELS[k];
    if (!def) continue;
    const oldVal = oldLead ? oldLead[k] : undefined;
    if (oldVal === newVal) continue;
    if (oldVal == null && newVal == null) continue;
    let summary = `${def.label} changed for ${name}`;
    let severity: Severity = "info";
    if (k === "pipeline_stage") summary = `${name} moved from ${oldVal ?? "—"} to ${newVal ?? "—"}.`;
    else if (k === "finance_status") summary = `Finance status changed from ${oldVal ?? "—"} to ${newVal ?? "—"} for ${name}.`;
    else if (k === "assigned_sales_executive") summary = `Owner reassigned for ${name}.`;
    else if (k === "is_final_sale" && newVal) { summary = `${name} marked as final sale.`; severity = "info"; }
    else if (k === "is_dropped" && newVal) { summary = `${name} marked as dropped.`; severity = "warning"; }
    else if (k === "next_follow_up_date") summary = `Follow-up date set to ${newVal} for ${name}.`;
    else summary = `${def.label}: ${oldVal ?? "—"} → ${newVal ?? "—"} (${name}).`;

    logActivity({
      module_key: moduleKey,
      module_label: moduleLabel,
      action_type: def.action,
      action_label: def.label + " changed",
      entity_type: "paid_pipeline_lead",
      entity_id: opts.leadId,
      entity_label: name,
      old_values: { [k]: oldVal ?? null },
      new_values: { [k]: newVal ?? null },
      summary,
      severity,
    });
  }
}

export function logBulkPaidLeadDiff(
  oldLeads: AnyLead[],
  patch: AnyLead,
  opts: { ids: string[]; moduleKey?: string; moduleLabel?: string } = { ids: [] },
) {
  for (const id of opts.ids) {
    const o = oldLeads.find((l) => l.id === id);
    logPaidLeadDiff(o, patch, { leadId: id, leadName: o?.name, moduleKey: opts.moduleKey, moduleLabel: opts.moduleLabel });
  }
}
