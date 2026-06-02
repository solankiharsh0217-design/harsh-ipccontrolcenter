import { supabase } from "@/integrations/supabase/client";

export interface ProcessTemplate {
  id: string;
  name: string;
  description: string | null;
  default_owner_rule: "unassigned" | "single" | "round_robin";
  default_owner_id: string | null;
  default_service_duration_days: number | null;
  is_active: boolean;
  is_seed: boolean;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  template_id: string;
  label: string;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  note: string | null;
}

export type FieldType = "text" | "number" | "date" | "dropdown" | "checkbox" | "link" | "textarea";

export interface TemplateField {
  id: string;
  template_id: string;
  field_key: string;
  label: string;
  field_type: FieldType;
  options: any;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

export type CommTemplateType = "email" | "form_link" | "call_link" | "instruction";

export interface CommunicationTemplate {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  template_type: CommTemplateType;
  is_active: boolean;
  is_seed: boolean;
}

export interface ChecklistState {
  id: string;
  operations_lead_id: string;
  checklist_item_id: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  note: string | null;
}

export interface CustomValue {
  id: string;
  operations_lead_id: string;
  field_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_bool: boolean | null;
}

export async function listProcessTemplates(activeOnly = true): Promise<ProcessTemplate[]> {
  let q = supabase.from("operations_process_templates" as any).select("*").order("created_at", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as any;
}

export async function getChecklistItems(templateId: string): Promise<ChecklistItem[]> {
  const { data, error } = await supabase
    .from("operations_template_checklist_items" as any)
    .select("*")
    .eq("template_id", templateId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function getTemplateFields(templateId: string): Promise<TemplateField[]> {
  const { data, error } = await supabase
    .from("operations_template_fields" as any)
    .select("*")
    .eq("template_id", templateId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function listCommunicationTemplates(activeOnly = true): Promise<CommunicationTemplate[]> {
  let q = supabase.from("operations_communication_templates" as any).select("*").order("created_at", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as any;
}

export async function getChecklistState(leadId: string): Promise<ChecklistState[]> {
  const { data, error } = await supabase
    .from("operations_lead_checklist_state" as any)
    .select("*")
    .eq("operations_lead_id", leadId);
  if (error) throw error;
  return (data ?? []) as any;
}

export async function setChecklistItemChecked(
  leadId: string, itemId: string, checked: boolean, userId: string | null, note?: string,
) {
  const payload: any = {
    operations_lead_id: leadId,
    checklist_item_id: itemId,
    is_checked: checked,
    checked_by: checked ? userId : null,
    checked_at: checked ? new Date().toISOString() : null,
  };
  if (note !== undefined) payload.note = note || null;
  const { error } = await supabase
    .from("operations_lead_checklist_state" as any)
    .upsert(payload, { onConflict: "operations_lead_id,checklist_item_id" });
  if (error) throw error;
}

export async function getCustomValues(leadId: string): Promise<CustomValue[]> {
  const { data, error } = await supabase
    .from("operations_lead_custom_values" as any)
    .select("*")
    .eq("operations_lead_id", leadId);
  if (error) throw error;
  return (data ?? []) as any;
}

export async function setCustomValue(
  leadId: string, fieldId: string, type: FieldType, raw: any, userId: string | null,
) {
  const payload: any = {
    operations_lead_id: leadId,
    field_id: fieldId,
    value_text: null,
    value_number: null,
    value_date: null,
    value_bool: null,
    updated_by: userId,
  };
  if (type === "number") payload.value_number = raw === "" || raw == null ? null : Number(raw);
  else if (type === "date") payload.value_date = raw || null;
  else if (type === "checkbox") payload.value_bool = !!raw;
  else payload.value_text = raw == null ? null : String(raw);
  const { error } = await supabase
    .from("operations_lead_custom_values" as any)
    .upsert(payload, { onConflict: "operations_lead_id,field_id" });
  if (error) throw error;
}

/**
 * Compute readiness:
 * - required-only ratio drives ready-to-start
 * - returns { totalRequired, checkedRequired, totalOptional, checkedOptional, pct, blocked }
 */
export function computeReadiness(items: ChecklistItem[], state: ChecklistState[]) {
  const stateMap = new Map(state.map((s) => [s.checklist_item_id, s]));
  let totalRequired = 0, checkedRequired = 0, totalOptional = 0, checkedOptional = 0;
  for (const it of items) {
    const checked = !!stateMap.get(it.id)?.is_checked;
    if (it.is_required) { totalRequired++; if (checked) checkedRequired++; }
    else { totalOptional++; if (checked) checkedOptional++; }
  }
  const totalAll = totalRequired + totalOptional;
  const checkedAll = checkedRequired + checkedOptional;
  const pct = totalAll === 0 ? 0 : Math.round((checkedAll / totalAll) * 100);
  return { totalRequired, checkedRequired, totalOptional, checkedOptional, pct, blocked: checkedRequired < totalRequired };
}

export function interpolateTemplate(body: string, vars: Record<string, string | null | undefined>): string {
  return body.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

/** Seed a default IPC template the first time the system is opened. Idempotent. */
export async function ensureSeedTemplate(): Promise<void> {
  const { data: existing } = await supabase
    .from("operations_process_templates" as any)
    .select("id, is_seed")
    .eq("is_seed", true)
    .maybeSingle();
  if (existing) return;

  const { data: tpl, error: tplErr } = await supabase
    .from("operations_process_templates" as any)
    .insert({
      name: "IPC Diamond Member Operations",
      description: "Default operations process template. Edit or duplicate as needed.",
      default_owner_rule: "unassigned",
      default_service_duration_days: 60,
      is_seed: true,
    })
    .select("id")
    .single();
  if (tplErr || !tpl) return;
  const tplId = (tpl as any).id as string;

  const checklist = [
    { label: "Payment completed", is_required: true },
    { label: "Finance / Bajaj completed", is_required: false },
    { label: "Training attended", is_required: true },
    { label: "Code of Conduct signed", is_required: true },
    { label: "Onboarding form filled", is_required: true },
    { label: "Access given", is_required: true },
    { label: "Kickoff call scheduled", is_required: false },
  ].map((it, i) => ({ ...it, template_id: tplId, sort_order: i }));
  await supabase.from("operations_template_checklist_items" as any).insert(checklist as any);

  const fields = [
    { field_key: "brand_name", label: "Brand name", field_type: "text", sort_order: 0 },
    { field_key: "instagram_handle", label: "Instagram handle", field_type: "text", sort_order: 1 },
    { field_key: "business_category", label: "Business category", field_type: "text", sort_order: 2 },
    { field_key: "form_link", label: "Onboarding form link", field_type: "link", sort_order: 3 },
    { field_key: "call_link", label: "Call booking link", field_type: "link", sort_order: 4 },
  ].map((f) => ({ ...f, template_id: tplId, is_required: false, is_active: true }));
  await supabase.from("operations_template_fields" as any).insert(fields as any);

  // Communication templates (global, not tied to a process template)
  const { data: commExisting } = await supabase
    .from("operations_communication_templates" as any)
    .select("id").eq("is_seed", true).limit(1);
  if (!commExisting || commExisting.length === 0) {
    await supabase.from("operations_communication_templates" as any).insert([
      {
        name: "Welcome email",
        subject: "Welcome to {{program_name}}, {{client_name}}",
        body: "Hi {{client_name}},\n\nWelcome aboard! Your program {{program_name}} is now active.\n\nNext step: please fill the onboarding form here — {{form_link}}\n\n— {{owner_name}}",
        template_type: "email",
        is_seed: true,
      },
      {
        name: "Onboarding form",
        subject: null,
        body: "Hi {{client_name}}, please fill the onboarding form: {{form_link}}",
        template_type: "form_link",
        is_seed: true,
      },
      {
        name: "Kickoff call link",
        subject: null,
        body: "Hi {{client_name}}, book your kickoff call: {{call_link}}",
        template_type: "call_link",
        is_seed: true,
      },
    ] as any);
  }
}
