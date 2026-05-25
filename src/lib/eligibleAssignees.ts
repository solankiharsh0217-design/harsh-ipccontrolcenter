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
  | "operations_crm"
  | "send_to_crm"
  | "round_robin_calling_crm"
  | "round_robin_paid_pipeline"
  | "round_robin_follow_up"
  | "round_robin_payment_recovery"
  | "round_robin_media_buyer_operations"
  | "round_robin_operations_crm";

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
  operations_crm:                       { flag: "can_receive_operations_leads",        requireRoundRobin: false },
  round_robin_calling_crm:              { flag: "can_receive_calling_crm_leads",       requireRoundRobin: true },
  round_robin_paid_pipeline:            { flag: "can_receive_paid_pipeline_leads",     requireRoundRobin: true },
  round_robin_follow_up:                { flag: "can_receive_follow_up_tasks",         requireRoundRobin: true },
  round_robin_payment_recovery:         { flag: "can_receive_payment_recovery_leads",  requireRoundRobin: true },
  round_robin_media_buyer_operations:   { flag: "can_receive_media_buyer_cases",       requireRoundRobin: true },
  round_robin_operations_crm:           { flag: "can_receive_operations_leads",        requireRoundRobin: true },
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
    "deactivated_at",
    ...flags,
  ].join(", ");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select(cols)
    .eq("status", "active")
    .is("deactivated_at", null);

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

  // Operations CRM additionally treats anyone with role "Media Buyer" as
  // implicitly eligible, even if the flag column was never toggled.
  const includesOps = ctxs.some((c) => c === "operations_crm" || c === "round_robin_operations_crm");

  return ((profiles ?? []) as any[])
    .filter((p) => p.active_for_assignment !== false && p.deactivated_at == null)

    .filter((p) => {
      const flagMatch = flags.some((f) => p[f] === true);
      const opsRoleMatch = includesOps && typeof p.role === "string" && p.role.toLowerCase().includes("media buyer");
      return flagMatch || opsRoleMatch;
    })
    .filter((p) => (needsRoundRobin ? p.include_in_round_robin === true : true))
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      role: p.role ?? null,
      isAdmin: admins.has(p.id),
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

// ---------------------------------------------------------------------------
// Operations CRM eligibility diagnostics — surfaces *why* a media buyer is
// missing from the Send to Operations dropdown.
// ---------------------------------------------------------------------------

export interface OpsEligibilityProfile {
  id: string;
  full_name: string;
  role: string | null;
  status: string;
  active_for_assignment: boolean;
  can_receive_operations_leads: boolean;
  has_operations_module_access: boolean;
  isMediaBuyerRole: boolean;
  isEligible: boolean;
  blockingReasons: string[];
}

export interface OpsEligibilityDiagnostics {
  counts: {
    activeUsers: number;
    mediaBuyerRoleUsers: number;
    withOperationsModule: number;
    withActiveForAssignment: number;
    withCanReceiveOperations: number;
    eligible: number;
  };
  eligible: OpsEligibilityProfile[];
  mediaBuyersNotEligible: OpsEligibilityProfile[];
}

export async function getOperationsEligibilityDiagnostics(): Promise<OpsEligibilityDiagnostics> {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, status, active_for_assignment, can_receive_operations_leads")
    .eq("status", "active");

  const { data: modAccess } = await supabase
    .from("user_module_access")
    .select("user_id, module_key");
  const opsAccessUserIds = new Set(
    (modAccess ?? [])
      .filter((m: any) => m.module_key === "operations_crm")
      .map((m: any) => m.user_id as string)
  );

  const list = (profiles ?? []) as any[];

  const counts = {
    activeUsers: list.length,
    mediaBuyerRoleUsers: 0,
    withOperationsModule: 0,
    withActiveForAssignment: 0,
    withCanReceiveOperations: 0,
    eligible: 0,
  };

  const enriched: OpsEligibilityProfile[] = list.map((p) => {
    const isMediaBuyerRole = typeof p.role === "string" && p.role.toLowerCase().includes("media buyer");
    const hasOpsAccess = opsAccessUserIds.has(p.id);
    const canReceive = !!p.can_receive_operations_leads;
    const activeForAssign = p.active_for_assignment !== false;

    if (isMediaBuyerRole) counts.mediaBuyerRoleUsers++;
    if (hasOpsAccess) counts.withOperationsModule++;
    if (activeForAssign) counts.withActiveForAssignment++;
    if (canReceive) counts.withCanReceiveOperations++;

    const blockingReasons: string[] = [];
    if (!activeForAssign) blockingReasons.push("Enable 'Active for assignment'");
    if (!canReceive) blockingReasons.push("Enable 'Can receive Operations leads'");

    const isEligible = activeForAssign && (canReceive || isMediaBuyerRole);
    if (isEligible) counts.eligible++;

    return {
      id: p.id,
      full_name: p.full_name ?? "Unnamed",
      role: p.role ?? null,
      status: p.status,
      active_for_assignment: activeForAssign,
      can_receive_operations_leads: canReceive,
      has_operations_module_access: hasOpsAccess,
      isMediaBuyerRole,
      isEligible,
      blockingReasons,
    };
  });

  return {
    counts,
    eligible: enriched.filter((p) => p.isEligible).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    mediaBuyersNotEligible: enriched.filter((p) => p.isMediaBuyerRole && !p.isEligible)
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  };
}

