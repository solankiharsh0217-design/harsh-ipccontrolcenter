import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";

export interface AccessTemplate {
  id: string;
  name: string;
  description: string | null;
  module_keys: string[];
  grants_admin: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const client = () => supabase as any;

export async function listAccessTemplates(opts?: { includeInactive?: boolean }): Promise<AccessTemplate[]> {
  let q = client().from("access_templates").select("*").order("grants_admin", { ascending: true }).order("name");
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AccessTemplate[];
}

export async function createAccessTemplate(input: {
  name: string; description?: string | null; module_keys: string[]; grants_admin: boolean; created_by?: string | null;
}): Promise<AccessTemplate> {
  const { data, error } = await client().from("access_templates").insert({
    name: input.name.trim(),
    description: input.description?.trim() || null,
    module_keys: input.module_keys,
    grants_admin: !!input.grants_admin,
    created_by: input.created_by ?? null,
  }).select("*").single();
  if (error) throw error;
  await logActivity({
    module_key: "team_directory", action_type: "access_template_created",
    entity_type: "access_template", entity_id: data.id, entity_label: data.name,
    metadata: { module_keys: input.module_keys, grants_admin: input.grants_admin },
    summary: `Access template "${data.name}" created.`,
  }).catch(() => {});
  return data as AccessTemplate;
}

export async function updateAccessTemplate(id: string, patch: Partial<Pick<AccessTemplate, "name" | "description" | "module_keys" | "grants_admin" | "is_active">>): Promise<void> {
  const { error } = await client().from("access_templates").update(patch).eq("id", id);
  if (error) throw error;
  await logActivity({
    module_key: "team_directory", action_type: "access_template_updated",
    entity_type: "access_template", entity_id: id,
    metadata: patch, summary: `Access template updated.`,
  }).catch(() => {});
}

export async function deleteAccessTemplate(id: string, name?: string): Promise<void> {
  const { error } = await client().from("access_templates").delete().eq("id", id);
  if (error) throw error;
  await logActivity({
    module_key: "team_directory", action_type: "access_template_deleted",
    entity_type: "access_template", entity_id: id, entity_label: name,
    summary: `Access template ${name ? `"${name}"` : ""} deleted.`, severity: "warning",
  }).catch(() => {});
}

/** Count active admins (status = active AND has admin role). */
async function countActiveAdmins(): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("user_roles").select("user_id, profiles!inner(status)")
    .eq("role", "admin").eq("profiles.status", "active");
  if (error) throw error;
  return (data ?? []).length;
}

async function userIsAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}

export interface ApplyPreview {
  currentModules: string[];
  currentIsAdmin: boolean;
  finalModules: string[];
  addedModules: string[];
  removedModules: string[];
  willGrantAdmin: boolean;
  willRemoveAdmin: boolean;
}

export async function previewApplyTemplate(opts: {
  memberId: string;
  template: AccessTemplate;
  mode: "replace" | "additive";
  removeAdmin: boolean;
}): Promise<ApplyPreview> {
  const [curModRes, curAdmin] = await Promise.all([
    supabase.from("user_module_access").select("module_key").eq("user_id", opts.memberId),
    userIsAdmin(opts.memberId),
  ]);
  const currentModules: string[] = ((curModRes.data ?? []) as any[]).map((r) => r.module_key);
  const templateMods = opts.template.module_keys ?? [];
  const finalModules = opts.mode === "replace"
    ? [...new Set(templateMods)]
    : [...new Set([...currentModules, ...templateMods])];
  const curSet = new Set(currentModules);
  const finSet = new Set(finalModules);
  const addedModules = [...finSet].filter((m) => !curSet.has(m));
  const removedModules = [...curSet].filter((m) => !finSet.has(m));
  const willGrantAdmin = opts.template.grants_admin && !curAdmin;
  const willRemoveAdmin = !opts.template.grants_admin && curAdmin && opts.removeAdmin;
  return { currentModules, currentIsAdmin: curAdmin, finalModules, addedModules, removedModules, willGrantAdmin, willRemoveAdmin };
}

export async function applyAccessTemplate(opts: {
  memberId: string;
  memberName: string;
  template: AccessTemplate;
  mode: "replace" | "additive";
  removeAdmin: boolean;
  actorId: string;
}): Promise<void> {
  const preview = await previewApplyTemplate(opts);

  // Final admin protection: block if this would remove the last remaining active admin.
  if (preview.willRemoveAdmin) {
    const admins = await countActiveAdmins();
    if (admins <= 1) {
      throw new Error("Cannot remove the last remaining active admin.");
    }
    if (opts.memberId === opts.actorId) {
      throw new Error("You cannot remove your own admin role. Ask another admin to do it.");
    }
  }

  // Update modules
  if (opts.mode === "replace") {
    const del = await supabase.from("user_module_access").delete().eq("user_id", opts.memberId);
    if (del.error) throw del.error;
  }
  const modsToInsert = preview.finalModules
    .filter((m) => opts.mode === "replace" || !preview.currentModules.includes(m))
    .map((k) => ({ user_id: opts.memberId, module_key: k, granted_by: opts.actorId }));
  if (modsToInsert.length > 0) {
    const ins = await supabase.from("user_module_access").insert(modsToInsert as any);
    if (ins.error) throw ins.error;
  }

  // Admin role
  if (preview.willGrantAdmin) {
    const { error } = await supabase.from("user_roles").upsert({ user_id: opts.memberId, role: "admin" } as any, { onConflict: "user_id,role" } as any);
    if (error) throw error;
    await logActivity({
      module_key: "team_directory", action_type: "admin_role_granted",
      entity_type: "team_member", entity_id: opts.memberId, entity_label: opts.memberName,
      target_user_id: opts.memberId, target_name: opts.memberName,
      summary: `Admin role granted to ${opts.memberName}.`, severity: "warning",
    }).catch(() => {});
  } else if (preview.willRemoveAdmin) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", opts.memberId).eq("role", "admin");
    if (error) throw error;
    await logActivity({
      module_key: "team_directory", action_type: "admin_role_removed",
      entity_type: "team_member", entity_id: opts.memberId, entity_label: opts.memberName,
      target_user_id: opts.memberId, target_name: opts.memberName,
      summary: `Admin role removed from ${opts.memberName}.`, severity: "warning",
    }).catch(() => {});
  }

  await logActivity({
    module_key: "team_directory", action_type: "access_template_applied",
    entity_type: "team_member", entity_id: opts.memberId, entity_label: opts.memberName,
    target_user_id: opts.memberId, target_name: opts.memberName,
    metadata: {
      template_id: opts.template.id, template_name: opts.template.name, mode: opts.mode,
      added_modules: preview.addedModules, removed_modules: preview.removedModules,
      admin_granted: preview.willGrantAdmin, admin_removed: preview.willRemoveAdmin,
    },
    summary: `Applied template "${opts.template.name}" to ${opts.memberName}.`,
  }).catch(() => {});
}

/** Safely remove admin role without touching module access. */
export async function removeAdminRole(opts: { memberId: string; memberName: string; actorId: string }): Promise<void> {
  if (opts.memberId === opts.actorId) {
    throw new Error("You cannot remove your own admin role. Ask another admin to do it.");
  }
  const admins = await countActiveAdmins();
  if (admins <= 1) throw new Error("Cannot remove the last remaining active admin.");
  const { error } = await supabase.from("user_roles").delete().eq("user_id", opts.memberId).eq("role", "admin");
  if (error) throw error;
  await logActivity({
    module_key: "team_directory", action_type: "admin_role_removed",
    entity_type: "team_member", entity_id: opts.memberId, entity_label: opts.memberName,
    target_user_id: opts.memberId, target_name: opts.memberName,
    summary: `Admin role removed from ${opts.memberName}.`, severity: "warning",
  }).catch(() => {});
}
