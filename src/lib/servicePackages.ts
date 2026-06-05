import { supabase } from "@/integrations/supabase/client";

export type ServicePackage = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  default_process_template_id: string | null;
  default_service_duration_days: number | null;
  included_services: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServicePackageSnapshot = {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  included_services?: string[] | null;
  default_service_duration_days?: number | null;
  default_process_template_id?: string | null;
  captured_at: string;
};

export async function listServicePackages(includeArchived = false): Promise<ServicePackage[]> {
  let q = supabase.from("service_packages" as any).select("*").order("name");
  if (!includeArchived) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as unknown) as ServicePackage[];
}

export async function createServicePackage(
  payload: Partial<ServicePackage>,
): Promise<ServicePackage> {
  const { data, error } = await supabase
    .from("service_packages" as any)
    .insert(payload as any)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

export async function updateServicePackage(
  id: string,
  patch: Partial<ServicePackage>,
): Promise<void> {
  const { error } = await supabase
    .from("service_packages" as any)
    .update(patch as any)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteServicePackage(id: string): Promise<void> {
  const { error } = await supabase.from("service_packages" as any).delete().eq("id", id);
  if (error) throw error;
}

export function buildSnapshot(pkg: ServicePackage): ServicePackageSnapshot {
  return {
    id: pkg.id,
    name: pkg.name,
    code: pkg.code,
    description: pkg.description,
    included_services: pkg.included_services,
    default_service_duration_days: pkg.default_service_duration_days,
    default_process_template_id: pkg.default_process_template_id,
    captured_at: new Date().toISOString(),
  };
}
