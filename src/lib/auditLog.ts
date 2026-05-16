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

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    let actor_name: string | null = null;
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      actor_name = (prof as any)?.full_name ?? null;
    }

    await supabase.from("audit_logs" as any).insert({
      module_key: input.module_key,
      module_label: input.module_label ?? input.module_key,
      action_type: input.action_type,
      action_label: input.action_label ?? input.action_type,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      entity_label: input.entity_label ?? null,
      actor_user_id: user?.id ?? null,
      actor_name,
      actor_email: user?.email ?? null,
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
    // Never block primary action
    console.warn("[auditLog] failed:", e);
  }
}

export const MODULE_LABELS: Record<string, string> = {
  paid_pipeline: "Paid Pipeline",
  payment_recovery: "Payment Recovery",
  follow_up_command_center: "Follow-Up Command Center",
  calling_crm: "Calling CRM",
  master_settings: "Master Settings",
  admin: "Admin / Team Access",
  team: "Team Directory",
  reports: "Reports & History",
  webinar_performance: "Webinar Performance",
  roas: "ROAS Calculator",
};
