import { supabase } from "@/integrations/supabase/client";

export interface EligibleAssignee {
  id: string;
  full_name: string;
  role: string | null;
  isAdmin: boolean;
}

// Aliases — historical / alternate module keys that should be treated equivalently.
const MODULE_ALIASES: Record<string, string[]> = {
  calling_crm: ["calling_crm", "crm", "calling-crm", "callingCRM"],
  paid_pipeline: ["paid_pipeline", "paid-pipeline"],
  follow_up_command_center: ["follow_up_command_center", "follow-up-command-center"],
  founder_dashboard: ["founder_dashboard", "founder-dashboard"],
};

export function moduleAliases(moduleKey: string): string[] {
  return MODULE_ALIASES[moduleKey] || [moduleKey];
}

/**
 * Returns active team members who are eligible for assignment for the given
 * module(s). A member is eligible if they:
 *   - have module access for ANY of the provided moduleKeys (or their aliases), OR
 *   - are an admin
 */
export async function getEligibleAssignees(
  moduleKeys: string | string[]
): Promise<EligibleAssignee[]> {
  const keys = Array.isArray(moduleKeys) ? moduleKeys : [moduleKeys];
  const expanded = Array.from(new Set(keys.flatMap(moduleAliases)));

  const [{ data: profiles }, { data: mods }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, status").eq("status", "active"),
    supabase.from("user_module_access").select("user_id, module_key").in("module_key", expanded as any),
    supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
  ]);

  const granted = new Set((mods ?? []).map((m: any) => m.user_id));
  const admins = new Set((roles ?? []).map((r: any) => r.user_id));

  return ((profiles ?? []) as any[])
    .filter((p) => admins.has(p.id) || granted.has(p.id))
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      role: p.role ?? null,
      isAdmin: admins.has(p.id),
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
