// Completion-time routing for the first Code of Conduct email.
//
// Business rule (fixed):
//   Same day / 1 day  -> "Completed Within 1 Day" template
//   2 days or more    -> "Completed After 1 Day" template
//
// The selected condition and the exact template snapshot are stored on the
// Code of Conduct request by the send edge function so resends stay consistent.

import { supabase } from "@/integrations/supabase/client";

export type CompletionSelection = "same_day" | "next_day_or_later";

export type ConditionKey = "completed_within_1_day" | "completed_after_1_day";

export interface CocEmailVariant {
  id: string;
  condition_key: ConditionKey | string;
  condition_name: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  from_email: string | null;
  from_name: string | null;
  reply_to_email: string | null;
  test_recipient_email: string | null;
  access_link: string | null;
  access_duration_months: number | null;
  support_duration_months: number | null;
  is_active: boolean;
  version: number;
  updated_at: string | null;
  updated_by: string | null;
  created_by: string | null;
}

export const COMPLETION_OPTIONS: { value: CompletionSelection; label: string; description: string; days: number }[] = [
  { value: "same_day", label: "Same Day", description: "Customer completed the onboarding today.", days: 0 },
  { value: "next_day_or_later", label: "Next Day or Later", description: "Customer completed after the same day.", days: 1 },
];

/** Labels for historical selections stored before the flow was simplified. */
const LEGACY_SELECTION_LABELS: Record<string, string> = {
  one_day: "1 day",
  two_days: "2 days",
  three_days: "3 days",
  four_to_seven_days: "4–7 days",
  more_than_seven_days: "More than 7 days",
  custom: "Custom completion date/time",
};

export const CONDITION_LABELS: Record<string, string> = {
  completed_within_1_day: "Completed Within 1 Day",
  completed_after_1_day: "Completed After 1 Day",
};

export function selectionLabel(selection?: string | null): string {
  if (!selection) return "—";
  return COMPLETION_OPTIONS.find((o) => o.value === selection)?.label
    || LEGACY_SELECTION_LABELS[selection]
    || selection.replace(/_/g, " ");
}

export function conditionLabel(key?: string | null): string {
  if (!key) return "—";
  return CONDITION_LABELS[key] || key.replace(/_/g, " ");
}

/** Days elapsed -> condition. Same calendar day is "fast", anything later is delayed. */
export function conditionForDays(days: number): ConditionKey {
  return days <= 0 ? "completed_within_1_day" : "completed_after_1_day";
}

/** Selection -> condition. Only two scenarios exist. */
export function conditionForSelection(selection: CompletionSelection): ConditionKey {
  return selection === "same_day" ? "completed_within_1_day" : "completed_after_1_day";
}

export interface ElapsedResult {
  hours: number;
  days: number;
  condition: ConditionKey;
  selection: CompletionSelection;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Elapsed time between two ISO timestamps, using calendar-day difference. */
export function computeElapsed(startIso: string, endIso: string): ElapsedResult | null {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const s = start.getTime();
  const e = end.getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  const hours = Math.round(((e - s) / 3_600_000) * 100) / 100;
  const days = Math.max(0, Math.round((startOfDay(end) - startOfDay(start)) / 86_400_000));
  const selection: CompletionSelection = days === 0 ? "same_day" : "next_day_or_later";
  return { hours, days, condition: conditionForSelection(selection), selection };
}

/** Days implied by a selection (used when no reliable start date exists). */
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
  if (!v.access_link?.trim()) {
    return { code: "EMAIL_VARIANT_MISSING_ACCESS_LINK", message: "Access / Next Steps link is required." };
  }
  if (!v.access_duration_months) {
    return { code: "EMAIL_VARIANT_MISSING_ACCESS_DURATION", message: "Access duration is required." };
  }
  if (!v.support_duration_months) {
    return { code: "EMAIL_VARIANT_MISSING_SUPPORT_DURATION", message: "Support duration is required." };
  }
  return null;
}
