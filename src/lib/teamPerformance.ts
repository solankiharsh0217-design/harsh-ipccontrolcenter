import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";

const sb: any = supabase;

export type MeasurementType =
  | "number" | "yes_no" | "percentage" | "currency" | "time" | "checklist" | "quality_score" | "manual_proof" | "auto_source";
export type Cadence = "daily" | "weekly" | "monthly" | "recurring" | "custom";
export type AssignmentType = "template" | "individual";

export interface KpiDefinition {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  department: string | null;
  owner_role: string | null;
  measurement_type: MeasurementType;
  target_default: number | null;
  target_unit: string | null;
  cadence: Cadence;
  weight: number;
  proof_required: boolean;
  approval_required: boolean;
  reward_points: number;
  auto_source_key: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KpiTemplate {
  id: string;
  name: string;
  description: string | null;
  role_label: string | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
}

export interface KpiTemplateItem {
  id: string;
  template_id: string;
  kpi_id: string;
  target_override: number | null;
  weight_override: number | null;
  reward_points_override: number | null;
  is_required: boolean;
  sort_order: number;
}

export interface KpiAssignment {
  id: string;
  user_id: string;
  template_id: string | null;
  kpi_id: string | null;
  assignment_type: AssignmentType;
  assigned_by: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  custom_target: number | null;
  custom_weight: number | null;
  custom_reward_points: number | null;
  notes: string | null;
  created_at: string;
}

const MOD = { module_key: "team_performance", module_label: "Team Performance" };

// ── KPI Definitions
export async function listKpiDefinitions(): Promise<KpiDefinition[]> {
  const { data, error } = await sb.from("kpi_definitions").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function createKpiDefinition(row: Partial<KpiDefinition>): Promise<KpiDefinition> {
  const { data, error } = await sb.from("kpi_definitions").insert(row).select("*").single();
  if (error) throw error;
  logActivity({ ...MOD, action_type: "kpi_definition_created", entity_type: "kpi_definition", entity_id: data.id, entity_label: data.name, summary: `KPI created: ${data.name}` });
  return data;
}
export async function updateKpiDefinition(id: string, patch: Partial<KpiDefinition>): Promise<void> {
  const { error } = await sb.from("kpi_definitions").update(patch).eq("id", id);
  if (error) throw error;
  logActivity({ ...MOD, action_type: "kpi_definition_updated", entity_type: "kpi_definition", entity_id: id, new_values: patch, summary: `KPI updated` });
}
export async function toggleKpiDefinitionActive(id: string, active: boolean): Promise<void> {
  await updateKpiDefinition(id, { is_active: active });
}

// ── Templates
export async function listKpiTemplates(): Promise<KpiTemplate[]> {
  const { data, error } = await sb.from("kpi_templates").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function createKpiTemplate(row: Partial<KpiTemplate>): Promise<KpiTemplate> {
  const { data, error } = await sb.from("kpi_templates").insert(row).select("*").single();
  if (error) throw error;
  logActivity({ ...MOD, action_type: "kpi_template_created", entity_type: "kpi_template", entity_id: data.id, entity_label: data.name, summary: `Template created: ${data.name}` });
  return data;
}
export async function updateKpiTemplate(id: string, patch: Partial<KpiTemplate>): Promise<void> {
  const { error } = await sb.from("kpi_templates").update(patch).eq("id", id);
  if (error) throw error;
  logActivity({ ...MOD, action_type: "kpi_template_updated", entity_type: "kpi_template", entity_id: id, new_values: patch, summary: `Template updated` });
}
export async function listTemplateItems(templateId: string): Promise<(KpiTemplateItem & { kpi: KpiDefinition })[]> {
  const { data, error } = await sb.from("kpi_template_items")
    .select("*, kpi:kpi_definitions(*)")
    .eq("template_id", templateId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}
export async function addKpiToTemplate(templateId: string, kpiId: string): Promise<void> {
  const { error } = await sb.from("kpi_template_items").insert({ template_id: templateId, kpi_id: kpiId });
  if (error) throw error;
  logActivity({ ...MOD, action_type: "kpi_template_item_added", entity_type: "kpi_template", entity_id: templateId, metadata: { kpi_id: kpiId } });
}
export async function removeKpiFromTemplate(itemId: string, templateId: string): Promise<void> {
  const { error } = await sb.from("kpi_template_items").delete().eq("id", itemId);
  if (error) throw error;
  logActivity({ ...MOD, action_type: "kpi_template_item_removed", entity_type: "kpi_template", entity_id: templateId, metadata: { item_id: itemId } });
}
export async function updateTemplateItem(itemId: string, patch: Partial<KpiTemplateItem>): Promise<void> {
  const { error } = await sb.from("kpi_template_items").update(patch).eq("id", itemId);
  if (error) throw error;
}

// ── Assignments
export async function listAssignmentsForUser(userId: string): Promise<KpiAssignment[]> {
  const { data, error } = await sb.from("kpi_assignments").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function listAllAssignments(): Promise<KpiAssignment[]> {
  const { data, error } = await sb.from("kpi_assignments").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function createAssignment(row: Partial<KpiAssignment>): Promise<KpiAssignment> {
  const { data, error } = await sb.from("kpi_assignments").insert(row).select("*").single();
  if (error) throw error;
  logActivity({ ...MOD, action_type: "kpi_assignment_created", entity_type: "kpi_assignment", entity_id: data.id, target_user_id: data.user_id, metadata: { assignment_type: data.assignment_type, template_id: data.template_id, kpi_id: data.kpi_id } });
  return data;
}
export async function updateAssignment(id: string, patch: Partial<KpiAssignment>): Promise<void> {
  const { error } = await sb.from("kpi_assignments").update(patch).eq("id", id);
  if (error) throw error;
  logActivity({ ...MOD, action_type: "kpi_assignment_updated", entity_type: "kpi_assignment", entity_id: id, new_values: patch });
}
export async function deactivateAssignment(id: string): Promise<void> {
  await updateAssignment(id, { is_active: false });
  logActivity({ ...MOD, action_type: "kpi_assignment_deactivated", entity_type: "kpi_assignment", entity_id: id, severity: "warning" });
}
