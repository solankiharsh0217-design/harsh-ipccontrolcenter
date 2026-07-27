// Completion-time routing for the first Code of Conduct email.
//
// Business rule (fixed):
//   Same day / 1 day  -> "Completed Within 1 Day" template
//   2 days or more    -> "Completed After 1 Day" template
//
// The selected condition and the exact template snapshot are stored on the
// Code of Conduct request by the send edge function so resends stay consistent.

import { supabase } from "@/integrations/supabase/client";

export type CompletionSelection =
  | "same_day"
  | "one_day"
  | "two_days"
  | "three_days"
  | "four_to_seven_days"
  | "more_than_seven_days"
  | "custom";

export type ConditionKey = "completed_within_1_day" | "completed_after_1_day";

export interface CocEmailVariant {
  id: string;
  condition_key: ConditionKey | string;
  condition_name: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  is_active: boolean;
  version: number;
  updated_at: string | null;
  updated_by: string | null;
  created_by: string | null;
}

export const COMPLETION_OPTIONS: { value: CompletionSelection; label: string; days: number | null }[] = [
  { value: "same_day", label: "Same day", days: 0 },
  { value: "one_day", label: "1 day", days: 1 },
  { value: "two_days", label: "2 days", days: 2 },
  { value: "three_days", label: "3 days", days: 3 },
  { value: "four_to_seven_days", label: "4–7 days", days: 5 },
  { value: "more_than_seven_days", label: "More than 7 days", days: 8 },
  { value: "custom", label: "Custom completion date/time", days: null },
];

export const CONDITION_LABELS: Record<string, string> = {
  completed_within_1_day: "Completed Within 1 Day",
  completed_after_1_day: "Completed After 1 Day",
};

export function selectionLabel(selection?: string | null): string {
  if (!selection) return "—";
  return COMPLETION_OPTIONS.find((o) => o.value === selection)?.label || selection.replace(/_/g, " ");
}

export function conditionLabel(key?: string | null): string {
  if (!key) return "—";
  return CONDITION_LABELS[key] || key.replace(/_/g, " ");
}

/** Days elapsed -> condition. 0 and 1 day are "fast", everything else is delayed. */
export function conditionForDays(days: number): ConditionKey {
  return days <= 1 ? "completed_within_1_day" : "completed_after_1_day";
}

/** Selection -> condition. Custom selections must be resolved by elapsed days first. */
export function conditionForSelection(selection: CompletionSelection, customDays?: number | null): ConditionKey {
  if (selection === "custom") return conditionForDays(Math.max(0, Math.floor(customDays ?? 0)));
  const opt = COMPLETION_OPTIONS.find((o) => o.value === selection);
  return conditionForDays(opt?.days ?? 0);
}

export interface ElapsedResult {
  hours: number;
  days: number;
  condition: ConditionKey;
  selection: CompletionSelection;
}

/** Elapsed time between two ISO timestamps, rounded down to whole calendar-ish days. */
export function computeElapsed(startIso: string, endIso: string): ElapsedResult | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const hours = Math.round(((end - start) / 3_600_000) * 100) / 100;
  const days = Math.floor(hours / 24);
  let selection: CompletionSelection = "custom";
  if (days === 0) selection = "same_day";
  else if (days === 1) selection = "one_day";
  else if (days === 2) selection = "two_days";
  else if (days === 3) selection = "three_days";
  else if (days <= 7) selection = "four_to_seven_days";
  else selection = "more_than_seven_days";
  return { hours, days, condition: conditionForDays(days), selection };
}

/** Days implied by a plain selection (used when no reliable start date exists). */
export function daysForSelection(selection: CompletionSelection): number | null {
  return COMPLETION_OPTIONS.find((o) => o.value === selection)?.days ?? null;
}

export async function loadEmailVariants(): Promise<CocEmailVariant[]> {
  const { data, error } = await (supabase as any)
    .from("code_of_conduct_email_variants")
    .select("*")
    .order("condition_key", { ascending: true });
  if (error) throw error;
  return (data || []) as CocEmailVariant[];
}

export async function loadVariantByCondition(key: string): Promise<CocEmailVariant | null> {
  const { data } = await (supabase as any)
    .from("code_of_conduct_email_variants")
    .select("*")
    .eq("condition_key", key)
    .maybeSingle();
  return (data as CocEmailVariant) || null;
}

export function renderPreview(raw: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(v), raw || "");
}

export interface VariantIssue {
  code: string;
  message: string;
}

/** Production send guard — mirrors the checks in the send edge function. */
export function validateVariant(v: CocEmailVariant | null): VariantIssue | null {
  if (!v) return { code: "NO_MATCHING_EMAIL_VARIANT", message: "A matching email template could not be found." };
  if (!v.is_active) return { code: "EMAIL_VARIANT_INACTIVE", message: "The selected email template is inactive." };
  if (!v.subject?.trim() || !v.html_body?.trim()) {
    return { code: "EMAIL_VARIANT_INCOMPLETE", message: "The matched Code of Conduct email template is incomplete. Please update it in Admin Center." };
  }
  if (!v.html_body.includes("{{signing_link}}")) {
    return { code: "EMAIL_VARIANT_MISSING_LINK", message: "The template must include the Code of Conduct link." };
  }
  return null;
}
