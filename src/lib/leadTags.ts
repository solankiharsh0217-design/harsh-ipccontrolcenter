import { supabase } from "@/integrations/supabase/client";

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  module_scope: string;
  created_by: string | null;
  is_active?: boolean;
}

export interface TagAssignment {
  id: string;
  tag_id: string;
  crm_lead_id: string | null;
  paid_pipeline_lead_id: string | null;
}

const DEFAULT_COLORS = ["#2563EB", "#16A34A", "#CA8A04", "#DC2626", "#7C3AED", "#BE185D", "#0EA5E9", "#65A30D"];

export function pickTagColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return DEFAULT_COLORS[h % DEFAULT_COLORS.length];
}

export async function listAllTags(opts?: { includeInactive?: boolean }): Promise<Tag[]> {
  let q = supabase
    .from("tags" as any)
    .select("id, name, color, module_scope, created_by, is_active")
    .eq("is_deleted", false);
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q.order("name");
  if (error) throw error;
  return (data as any) || [];
}

export async function createTag(name: string, opts?: { color?: string; module_scope?: string }): Promise<Tag | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return null;
  const scope = opts?.module_scope || "all";

  // Normalize: prevent case/whitespace duplicates. Fetch existing by case-insensitive name.
  const { data: existingArr } = await supabase
    .from("tags" as any)
    .select("id, name, color, module_scope, created_by, is_active, is_deleted")
    .ilike("name", trimmed)
    .eq("module_scope", scope);
  const existing = ((existingArr as any[]) || []).find((t) => (t.name || "").toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    // If soft-deleted or inactive, reactivate
    if (existing.is_deleted || existing.is_active === false) {
      await supabase.from("tags" as any).update({ is_deleted: false, is_active: true } as any).eq("id", existing.id);
      return { ...existing, is_deleted: false, is_active: true } as any;
    }
    return existing as any;
  }

  const { data, error } = await supabase
    .from("tags" as any)
    .insert({
      name: trimmed,
      color: opts?.color || pickTagColor(trimmed),
      module_scope: scope,
      created_by: userId,
    } as any)
    .select("id, name, color, module_scope, created_by, is_active")
    .maybeSingle();
  if (error) return null;
  return data as any;
}

export async function deactivateTag(tagId: string) {
  await supabase.from("tags" as any).update({ is_active: false } as any).eq("id", tagId);
}

export async function reactivateTag(tagId: string) {
  await supabase.from("tags" as any).update({ is_active: true } as any).eq("id", tagId);
}

export async function getTagUsageCount(tagId: string): Promise<number> {
  const { count } = await supabase
    .from("lead_tag_assignments" as any)
    .select("id", { count: "exact", head: true })
    .eq("tag_id", tagId);
  return count || 0;
}

/** Hard-delete if unused; else returns false so caller can offer deactivate instead. */
export async function deleteTagIfUnused(tagId: string): Promise<boolean> {
  const usage = await getTagUsageCount(tagId);
  if (usage > 0) return false;
  await supabase.from("tags" as any).update({ is_deleted: true, is_active: false } as any).eq("id", tagId);
  return true;
}

export async function getAssignmentsFor(ids: { crmLeadId?: string | null; paidLeadId?: string | null }): Promise<TagAssignment[]> {
  const filters: string[] = [];
  if (ids.crmLeadId) filters.push(`crm_lead_id.eq.${ids.crmLeadId}`);
  if (ids.paidLeadId) filters.push(`paid_pipeline_lead_id.eq.${ids.paidLeadId}`);
  if (filters.length === 0) return [];
  const { data, error } = await supabase
    .from("lead_tag_assignments" as any)
    .select("id, tag_id, crm_lead_id, paid_pipeline_lead_id")
    .or(filters.join(","));
  if (error) return [];
  return (data as any) || [];
}

export async function assignTag(tagId: string, ids: { crmLeadId?: string | null; paidLeadId?: string | null }) {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return;
  const rows: any[] = [];
  if (ids.crmLeadId) rows.push({ tag_id: tagId, crm_lead_id: ids.crmLeadId, assigned_by: userId });
  if (ids.paidLeadId) rows.push({ tag_id: tagId, paid_pipeline_lead_id: ids.paidLeadId, assigned_by: userId });
  for (const row of rows) {
    let q = supabase.from("lead_tag_assignments" as any).select("id").eq("tag_id", tagId);
    if (row.crm_lead_id) q = q.eq("crm_lead_id", row.crm_lead_id);
    else q = q.eq("paid_pipeline_lead_id", row.paid_pipeline_lead_id);
    const { data: existing } = await q.limit(1);
    if (existing && existing.length > 0) continue;
    const { error } = await supabase.from("lead_tag_assignments" as any).insert(row);
    if (error && !/duplicate|unique/i.test(error.message || "")) throw error;
  }
}

export async function unassignTag(tagId: string, ids: { crmLeadId?: string | null; paidLeadId?: string | null }) {
  if (ids.crmLeadId) {
    await supabase.from("lead_tag_assignments" as any).delete().eq("tag_id", tagId).eq("crm_lead_id", ids.crmLeadId);
  }
  if (ids.paidLeadId) {
    await supabase.from("lead_tag_assignments" as any).delete().eq("tag_id", tagId).eq("paid_pipeline_lead_id", ids.paidLeadId);
  }
}

export async function getTagsForLeads(opts: { crmLeadIds?: string[]; paidLeadIds?: string[] }): Promise<Record<string, Tag[]>> {
  const tags = await listAllTags({ includeInactive: true });
  const byId = new Map(tags.map((t) => [t.id, t]));
  const filters: string[] = [];
  if (opts.crmLeadIds && opts.crmLeadIds.length) filters.push(`crm_lead_id.in.(${opts.crmLeadIds.join(",")})`);
  if (opts.paidLeadIds && opts.paidLeadIds.length) filters.push(`paid_pipeline_lead_id.in.(${opts.paidLeadIds.join(",")})`);
  if (!filters.length) return {};
  const { data } = await supabase
    .from("lead_tag_assignments" as any)
    .select("tag_id, crm_lead_id, paid_pipeline_lead_id")
    .or(filters.join(","));
  const out: Record<string, Tag[]> = {};
  ((data as any[]) || []).forEach((row) => {
    const tag = byId.get(row.tag_id);
    if (!tag) return;
    const k = row.crm_lead_id || row.paid_pipeline_lead_id;
    if (!k) return;
    if (!out[k]) out[k] = [];
    out[k].push(tag);
  });
  return out;
}
