import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";

const sb: any = supabase;
const MOD = { module_key: "team_performance", module_label: "Team Performance" };

export interface KpiSubmission {
  id: string;
  entry_id: string;
  user_id: string;
  submitted_value: number | null;
  proof_url: string | null;
  notes: string | null;
  submitted_at: string;
  status: "submitted" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionInput {
  submitted_value?: number | null;
  proof_url?: string | null;
  notes?: string | null;
}

export interface KpiEntryForSubmission {
  id: string;
  user_id: string;
  kpi_id: string;
  status: string;
  kpi?: {
    id: string;
    name: string;
    measurement_type: string;
    proof_required: boolean;
    approval_required: boolean;
  };
}

export function isValidHttpUrl(v: string): boolean {
  if (!v) return false;
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function measurementNeedsValue(mt: string | undefined): boolean {
  return ["number", "percentage", "currency", "time", "quality_score"].includes(mt || "");
}

export async function fetchSubmissionForEntry(entryId: string): Promise<KpiSubmission | null> {
  const { data, error } = await sb
    .from("kpi_submissions")
    .select("*")
    .eq("entry_id", entryId)
    .maybeSingle();
  if (error) throw error;
  return (data as KpiSubmission) ?? null;
}

export async function fetchSubmissionsForEntries(entryIds: string[]): Promise<Record<string, KpiSubmission>> {
  if (entryIds.length === 0) return {};
  const { data, error } = await sb
    .from("kpi_submissions")
    .select("*")
    .in("entry_id", entryIds);
  if (error) throw error;
  const map: Record<string, KpiSubmission> = {};
  (data ?? []).forEach((s: KpiSubmission) => { map[s.entry_id] = s; });
  return map;
}

export interface SubmitParams {
  entry: KpiEntryForSubmission;
  input: SubmissionInput;
  actorId: string;
}

export interface SubmitResult {
  submission: KpiSubmission;
  entryStatus: string;
  autoApproved: boolean;
}

/**
 * Create or update the single submission for a KPI entry. Applies proof rules,
 * auto-approves when approval isn't required, and updates the entry status.
 */
export async function submitKpi({ entry, input, actorId }: SubmitParams): Promise<SubmitResult> {
  const kpi = entry.kpi;
  if (!kpi) throw new Error("KPI definition missing");
  if (entry.user_id !== actorId) throw new Error("You can only submit your own KPIs");

  const nonEditable = ["approved", "rejected", "missed", "waived"];
  if (nonEditable.includes(entry.status)) {
    throw new Error("This KPI has already been reviewed and cannot be edited.");
  }

  const proofUrl = (input.proof_url ?? "").trim();
  const notes = (input.notes ?? "").trim();
  if (kpi.proof_required && !proofUrl && !notes) {
    throw new Error("Proof is required. Provide a proof URL or notes.");
  }
  if (proofUrl && !isValidHttpUrl(proofUrl)) {
    throw new Error("Proof URL must be a valid http(s) link.");
  }

  const autoApprove = !kpi.approval_required;
  const nowIso = new Date().toISOString();
  const submissionStatus = autoApprove ? "approved" : "submitted";
  const entryStatus = autoApprove ? "approved" : "submitted";

  // Fetch existing to decide insert vs update (RLS blocks update after review).
  const existing = await fetchSubmissionForEntry(entry.id);
  const oldStatus = existing?.status ?? null;

  const payload: any = {
    entry_id: entry.id,
    user_id: actorId,
    submitted_value: input.submitted_value ?? null,
    proof_url: proofUrl || null,
    notes: notes || null,
    submitted_at: nowIso,
    status: submissionStatus,
    reviewed_at: autoApprove ? nowIso : null,
    reviewed_by: null,
    review_notes: existing?.review_notes ?? null,
  };

  let saved: KpiSubmission;
  if (existing) {
    const { data, error } = await sb
      .from("kpi_submissions")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    saved = data as KpiSubmission;
  } else {
    const { data, error } = await sb
      .from("kpi_submissions")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    saved = data as KpiSubmission;
  }

  // Update entry status
  const { error: entryErr } = await sb
    .from("kpi_entries")
    .update({ status: entryStatus })
    .eq("id", entry.id);
  if (entryErr) throw entryErr;

  // Audit logs
  const baseMeta = {
    entry_id: entry.id,
    kpi_id: kpi.id,
    kpi_name: kpi.name,
    has_proof_url: !!proofUrl,
    has_notes: !!notes,
    submitted_value: input.submitted_value ?? null,
    approval_required: kpi.approval_required,
  };
  try {
    await logActivity({
      ...MOD,
      action_type: existing ? "kpi_submission_updated" : "kpi_submission_created",
      entity_type: "kpi_submission",
      entity_id: saved.id,
      metadata: { ...baseMeta, old_status: oldStatus, new_status: submissionStatus },
      summary: existing ? `Updated submission for ${kpi.name}` : `Submitted ${kpi.name}`,
    });
    if (autoApprove) {
      await logActivity({
        ...MOD,
        action_type: "kpi_submission_auto_approved",
        entity_type: "kpi_submission",
        entity_id: saved.id,
        metadata: baseMeta,
        summary: `Auto-approved ${kpi.name}`,
      });
    }
    await logActivity({
      ...MOD,
      action_type: "kpi_entry_status_updated",
      entity_type: "kpi_entry",
      entity_id: entry.id,
      metadata: { ...baseMeta, old_status: entry.status, new_status: entryStatus },
    });
  } catch { /* non-fatal */ }

  return { submission: saved, entryStatus, autoApproved: autoApprove };
}
