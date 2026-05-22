import { supabase } from "@/integrations/supabase/client";

export interface EligibleAssignee {
  id: string;
  full_name: string;
  role: string | null;
  isAdmin: boolean;
}

// Aliases — historical / alternate module keys that should be treated equivalently
// for *module access* checks (sidebar visibility, route guards). Assignment
// eligibility is a SEPARATE concept — see getEligibleAssignees below.
const ALIAS_GROUPS: string[][] = [
  ["calling_crm", "crm", "calling-crm", "callingCRM"],
  ["paid_pipeline", "paid-pipeline"],
  ["follow_up_command_center", "follow-up-command-center"],
  ["founder_dashboard", "founder-dashboard"],
  ["payment_recovery"],
];

export function moduleAliases(moduleKey: string): string[] {
  const group = ALIAS_GROUPS.find((g) => g.includes(moduleKey));
  return group ? [...group] : [moduleKey];
}

// ---------------------------------------------------------------------------
// Assignment-eligibility contexts
// ---------------------------------------------------------------------------
// Module access (user_module_access / admin role) controls VISIBILITY only.
// Assignment eligibility controls who can RECEIVE leads / tasks / round-robin.
// These two concepts are intentionally decoupled — admins are NOT auto-eligible
// for any assignment context. They must be explicitly flagged on their profile.

export type AssignmentContext =
  | "calling_crm"
  | "paid_pipeline"
  | "follow_up_command_center"
  | "payment_recovery"
  | "media_buyer_operations"
  | "send_to_crm"
  | "round_robin_calling_crm"
  | "round_robin_paid_pipeline"
  | "round_robin_follow_up"
  | "round_robin_payment_recovery"
  | "round_robin_media_buyer_operations";

interface ContextSpec {
  flag: string;            // profiles.<col> that must be true
  requireRoundRobin: boolean;
}

const CONTEXT_MAP: Record<AssignmentContext, ContextSpec> = {
  calling_crm:                          { flag: "can_receive_calling_crm_leads",       requireRoundRobin: false },
  send_to_crm:                          { flag: "can_receive_calling_crm_leads",       requireRoundRobin: false },
  paid_pipeline:                        { flag: "can_receive_paid_pipeline_leads",     requireRoundRobin: false },
  follow_up_command_center:             { flag: "can_receive_follow_up_tasks",         requireRoundRobin: false },
  payment_recovery:                     { flag: "can_receive_payment_recovery_leads",  requireRoundRobin: false },
  media_buyer_operations:               { flag: "can_receive_media_buyer_cases",       requireRoundRobin: false },
  round_robin_calling_crm:              { flag: "can_receive_calling_crm_leads",       requireRoundRobin: true },
  round_robin_paid_pipeline:            { flag: "can_receive_paid_pipeline_leads",     requireRoundRobin: true },
  round_robin_follow_up:                { flag: "can_receive_follow_up_tasks",         requireRoundRobin: true },
  round_robin_payment_recovery:         { flag: "can_receive_payment_recovery_leads",  requireRoundRobin: true },
  round_robin_media_buyer_operations:   { flag: "can_receive_media_buyer_cases",       requireRoundRobin: true },
};


/**
 * Returns active team members who are eligible to RECEIVE assignments for the
 * given context(s). Module access alone does NOT grant eligibility — the
 * relevant `can_receive_*` flag must be set on the profile, and the member
 * must be active for assignment. Admins are included ONLY if they have the
 * relevant flag enabled (and `include_in_round_robin` for round-robin pools).
 *
 * Accepts a single context string, an array of contexts (union — eligible
 * for ANY), or for backward compatibility a legacy module key string which
 * is mapped to its closest assignment context.
 */
export async function getEligibleAssignees(
  contextOrLegacyKey: AssignmentContext | string | (AssignmentContext | string)[]
): Promise<EligibleAssignee[]> {
  const raw = Array.isArray(contextOrLegacyKey) ? contextOrLegacyKey : [contextOrLegacyKey];

  // Map any legacy module keys to their closest assignment context.
  const ctxs: AssignmentContext[] = raw
    .map((k) => {
      if ((CONTEXT_MAP as any)[k]) return k as AssignmentContext;
      // legacy module-key fallbacks
      if (k === "crm" || k === "calling-crm") return "calling_crm";
      if (k === "paid-pipeline") return "paid_pipeline";
      if (k === "follow-up-command-center") return "follow_up_command_center";
      return null;
    })
    .filter(Boolean) as AssignmentContext[];

  if (ctxs.length === 0) return [];

  const flags = Array.from(new Set(ctxs.map((c) => CONTEXT_MAP[c].flag)));
  const needsRoundRobin = ctxs.every((c) => CONTEXT_MAP[c].requireRoundRobin);

  // Build select with assignment columns
  const cols = [
    "id", "full_name", "role", "status",
    "active_for_assignment",
    "include_in_round_robin",
    ...flags,
  ].join(", ");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select(cols)
    .eq("status", "active");

  if (error) {
    console.error("getEligibleAssignees failed", error);
    return [];
  }

  // Identify admins (for the isAdmin flag only — NOT for auto-eligibility)
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("role", "admin");
  const admins = new Set((roles ?? []).map((r: any) => r.user_id));

  return ((profiles ?? []) as any[])
    .filter((p) => p.active_for_assignment !== false)
    .filter((p) => flags.some((f) => p[f] === true))
    .filter((p) => (needsRoundRobin ? p.include_in_round_robin === true : true))
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      role: p.role ?? null,
      isAdmin: admins.has(p.id),
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
