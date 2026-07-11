import { supabase } from "@/integrations/supabase/client";

const sb: any = supabase;

export interface RoleCatalogRow {
  id: string;
  role_key: string;
  role_label: string;
  department: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface KpiCategoryRow {
  id: string;
  category_key: string;
  category_label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

function toKey(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "custom";
}

export async function listRoles(activeOnly = true): Promise<RoleCatalogRow[]> {
  let q = sb.from("company_role_catalog").select("*").order("sort_order").order("role_label");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listCategories(activeOnly = true): Promise<KpiCategoryRow[]> {
  let q = sb.from("kpi_categories").select("*").order("sort_order").order("category_label");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function ensureRoleLabel(label: string): Promise<void> {
  const clean = label?.trim();
  if (!clean) return;
  const key = toKey(clean);
  await sb.from("company_role_catalog")
    .upsert({ role_key: key, role_label: clean }, { onConflict: "role_key", ignoreDuplicates: true });
}

export async function ensureCategoryLabel(label: string): Promise<void> {
  const clean = label?.trim();
  if (!clean) return;
  const key = toKey(clean);
  await sb.from("kpi_categories")
    .upsert({ category_key: key, category_label: clean }, { onConflict: "category_key", ignoreDuplicates: true });
}

export async function toggleRoleActive(id: string, active: boolean) {
  const { error } = await sb.from("company_role_catalog").update({ is_active: active }).eq("id", id);
  if (error) throw error;
}
export async function toggleCategoryActive(id: string, active: boolean) {
  const { error } = await sb.from("kpi_categories").update({ is_active: active }).eq("id", id);
  if (error) throw error;
}

/** Merge catalog + existing values from KPIs/profiles into a unique sorted label list. */
export function mergeLabels(...lists: (string | null | undefined)[][]): string[] {
  const s = new Set<string>();
  for (const list of lists) for (const v of list) {
    const t = (v || "").trim();
    if (t) s.add(t);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}
