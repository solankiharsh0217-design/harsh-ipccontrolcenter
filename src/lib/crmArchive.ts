import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";

type LeadLite = {
  id: string;
  full_name?: string | null;
  webinar_source?: string | null;
  webinar_date?: string | null;
  pipeline_id?: string | null;
  paid_pipeline_lead_id?: string | null;
};

async function getActorId(): Promise<string | null> {
  try { const { data } = await supabase.auth.getUser(); return data?.user?.id ?? null; }
  catch { return null; }
}

/** How many of the given CRM leads are linked to Paid Pipeline / active Operations CRM. */
export async function getLeadLinks(leadIds: string[]): Promise<{ paid: number; ops: number }> {
  if (!leadIds.length) return { paid: 0, ops: 0 };
  const { data: l } = await supabase.from("leads").select("id, paid_pipeline_lead_id").in("id", leadIds);
  const paid = (l || []).filter((x: any) => x.paid_pipeline_lead_id).length;
  const { data: ops } = await (supabase as any).from("operations_leads")
    .select("crm_lead_id, service_status").in("crm_lead_id", leadIds);
  const opsActive = (ops || []).filter((x: any) => x.service_status !== "stopped" && x.service_status !== "completed").length;
  return { paid, ops: opsActive };
}

// ─────────── Single lead ───────────
export async function archiveLead(lead: LeadLite, reason?: string) {
  const uid = await getActorId();
  const { error } = await supabase.from("leads").update({
    archived_at: new Date().toISOString(), archived_by: uid, archive_reason: reason ?? null,
  } as any).eq("id", lead.id);
  if (error) throw error;
  logActivity({
    module_key: "calling_crm", action_type: "crm_lead_archived",
    entity_type: "crm_lead", entity_id: lead.id, entity_label: lead.full_name ?? undefined,
    severity: "warning", summary: `${lead.full_name ?? "Lead"} archived.`,
    metadata: { reason: reason ?? null, batch_name: lead.webinar_source ?? null },
  }).catch(() => {});
}

export async function restoreLead(lead: LeadLite) {
  const { error } = await supabase.from("leads").update({
    archived_at: null, archived_by: null, archive_reason: null,
  } as any).eq("id", lead.id);
  if (error) throw error;
  logActivity({
    module_key: "calling_crm", action_type: "crm_lead_restored",
    entity_type: "crm_lead", entity_id: lead.id, entity_label: lead.full_name ?? undefined,
    summary: `${lead.full_name ?? "Lead"} restored from archive.`,
  }).catch(() => {});
}

export async function permanentlyDeleteLead(lead: LeadLite, reason?: string) {
  const { paid, ops } = await getLeadLinks([lead.id]);
  if (paid > 0 || ops > 0) {
    throw new Error(`Cannot permanently delete — lead is linked to ${paid ? "Paid Pipeline" : ""}${paid && ops ? " and " : ""}${ops ? "Operations CRM" : ""}. Archive instead.`);
  }
  const { error } = await supabase.from("leads").delete().eq("id", lead.id);
  if (error) throw error;
  logActivity({
    module_key: "calling_crm", action_type: "crm_lead_permanently_deleted",
    entity_type: "crm_lead", entity_id: lead.id, entity_label: lead.full_name ?? undefined,
    severity: "critical", summary: `${lead.full_name ?? "Lead"} permanently deleted.`,
    metadata: { reason: reason ?? null },
  }).catch(() => {});
}

// ─────────── Bulk ───────────
export async function bulkArchiveLeads(ids: string[], reason?: string, pipelineId?: string | null) {
  if (!ids.length) return;
  const uid = await getActorId();
  const { error } = await supabase.from("leads").update({
    archived_at: new Date().toISOString(), archived_by: uid, archive_reason: reason ?? null,
  } as any).in("id", ids);
  if (error) throw error;
  logActivity({
    module_key: "calling_crm", action_type: "crm_leads_bulk_archived",
    entity_type: "crm_lead", severity: "warning",
    summary: `${ids.length} CRM lead${ids.length === 1 ? "" : "s"} archived.`,
    metadata: { selected_count: ids.length, pipeline_id: pipelineId ?? null, reason: reason ?? null, lead_ids: ids },
  }).catch(() => {});
}

// ─────────── Batch ───────────
export async function archiveBatch(args: {
  batchName: string; batchDate: string | null; pipelineId: string | null; leadIds: string[]; reason?: string;
}) {
  const { batchName, batchDate, pipelineId, leadIds, reason } = args;
  if (!leadIds.length) throw new Error("Batch has no active leads.");
  const uid = await getActorId();
  const now = new Date().toISOString();
  const { error } = await supabase.from("leads").update({
    archived_at: now, archived_by: uid, archive_reason: reason ?? `Batch archived: ${batchName}`,
  } as any).in("id", leadIds);
  if (error) throw error;
  await (supabase as any).from("crm_batch_archives").insert({
    pipeline_id: pipelineId, batch_name: batchName, batch_date: batchDate,
    archived_by: uid, archive_reason: reason ?? null, affected_lead_count: leadIds.length,
  });
  logActivity({
    module_key: "calling_crm", action_type: "crm_batch_archived",
    entity_type: "crm_batch", entity_label: batchName, severity: "warning",
    summary: `Batch "${batchName}" archived (${leadIds.length} leads).`,
    metadata: { batch_name: batchName, batch_date: batchDate, pipeline_id: pipelineId, affected_count: leadIds.length, reason: reason ?? null },
  }).catch(() => {});
}

export async function restoreBatch(args: {
  batchName: string; batchDate: string | null; pipelineId: string | null;
}) {
  const { batchName, batchDate, pipelineId } = args;
  let q = supabase.from("leads").update({ archived_at: null, archived_by: null, archive_reason: null } as any)
    .eq("webinar_source", batchName).not("archived_at", "is", null);
  q = batchDate ? q.eq("webinar_date", batchDate) : q.is("webinar_date", null);
  if (pipelineId) q = q.eq("pipeline_id", pipelineId);
  const { error } = await q;
  if (error) throw error;
  const uid = await getActorId();
  await (supabase as any).from("crm_batch_archives").update({
    restored_at: new Date().toISOString(), restored_by: uid,
  }).eq("batch_name", batchName).is("restored_at", null);
  logActivity({
    module_key: "calling_crm", action_type: "crm_batch_restored",
    entity_type: "crm_batch", entity_label: batchName,
    summary: `Batch "${batchName}" restored.`,
    metadata: { batch_name: batchName, pipeline_id: pipelineId },
  }).catch(() => {});
}

export async function permanentlyDeleteBatch(args: {
  batchName: string; batchDate: string | null; pipelineId: string | null; leadIds: string[]; reason?: string;
}) {
  const { batchName, leadIds, reason, pipelineId } = args;
  const { paid, ops } = await getLeadLinks(leadIds);
  if (paid > 0 || ops > 0) throw new Error(`Cannot permanently delete — ${paid} lead(s) linked to Paid Pipeline and ${ops} to Operations CRM. Archive instead.`);
  const { error } = await supabase.from("leads").delete().in("id", leadIds);
  if (error) throw error;
  logActivity({
    module_key: "calling_crm", action_type: "crm_batch_permanently_deleted",
    entity_type: "crm_batch", entity_label: batchName, severity: "critical",
    summary: `Batch "${batchName}" permanently deleted (${leadIds.length} leads).`,
    metadata: { batch_name: batchName, pipeline_id: pipelineId, affected_count: leadIds.length, reason: reason ?? null },
  }).catch(() => {});
}

/** Reset = soft-archive all active leads in the batch and mark them reimport-safe. Linked Paid Pipeline / Operations records stay intact. */
export async function resetBatchForReimport(args: {
  batchName: string; batchDate: string | null; pipelineId: string | null; leadIds: string[]; reason?: string;
}) {
  const { batchName, batchDate, pipelineId, leadIds, reason } = args;
  if (!leadIds.length) throw new Error("Batch has no active leads to reset.");
  const links = await getLeadLinks(leadIds);
  const uid = await getActorId();
  const now = new Date().toISOString();
  const archiveReason = `[RESET FOR RE-IMPORT] ${reason || `Batch "${batchName}" reset`}`;
  const { error } = await supabase.from("leads").update({
    archived_at: now, archived_by: uid, archive_reason: archiveReason,
  } as any).in("id", leadIds);
  if (error) throw error;
  await (supabase as any).from("crm_batch_archives").insert({
    pipeline_id: pipelineId, batch_name: batchName, batch_date: batchDate,
    archived_by: uid, archive_reason: archiveReason, affected_lead_count: leadIds.length,
  });
  logActivity({
    module_key: "calling_crm", action_type: "crm_batch_reset_for_reimport",
    entity_type: "crm_batch", entity_label: batchName, severity: "warning",
    summary: `Batch "${batchName}" reset for re-import (${leadIds.length} leads archived).`,
    metadata: {
      batch_name: batchName, pipeline_id: pipelineId, affected_lead_count: leadIds.length,
      linked_paid_pipeline_count: links.paid, linked_operations_count: links.ops,
      reset_by: uid, reason: reason ?? null,
    },
  }).catch(() => {});
  return { affected: leadIds.length, linkedPaid: links.paid, linkedOps: links.ops };
}

/** Permanently delete only leads with no Paid Pipeline / Operations link. Unsafe active leads are archived instead. */
export async function safePermanentDeleteBatch(args: {
  batchName: string; batchDate: string | null; pipelineId: string | null; leadIds: string[]; reason?: string;
}) {
  const { batchName, batchDate, pipelineId, leadIds, reason } = args;
  if (!leadIds.length) throw new Error("Batch has no leads.");
  const { data: ll } = await supabase.from("leads").select("id, paid_pipeline_lead_id, archived_at").in("id", leadIds);
  const { data: opsRows } = await (supabase as any).from("operations_leads")
    .select("crm_lead_id, service_status").in("crm_lead_id", leadIds);
  const opsLinked = new Set<string>((opsRows || [])
    .filter((x: any) => x.service_status !== "stopped" && x.service_status !== "completed")
    .map((x: any) => x.crm_lead_id));
  const safeIds: string[] = [];
  const unsafeActiveIds: string[] = [];
  let alreadyArchivedLinked = 0;
  (ll || []).forEach((l: any) => {
    const linked = !!l.paid_pipeline_lead_id || opsLinked.has(l.id);
    if (linked) { if (!l.archived_at) unsafeActiveIds.push(l.id); else alreadyArchivedLinked++; }
    else safeIds.push(l.id);
  });

  let deleted = 0, archived = 0;
  if (safeIds.length) {
    const { error } = await supabase.from("leads").delete().in("id", safeIds);
    if (error) throw error;
    deleted = safeIds.length;
  }
  if (unsafeActiveIds.length) {
    const uid = await getActorId();
    await supabase.from("leads").update({
      archived_at: new Date().toISOString(), archived_by: uid,
      archive_reason: `[SAFE DELETE - LINKED] Batch ${batchName} cleanup`,
    } as any).in("id", unsafeActiveIds);
    archived = unsafeActiveIds.length;
  }
  logActivity({
    module_key: "calling_crm", action_type: "crm_batch_safe_permanent_delete_completed",
    entity_type: "crm_batch", entity_label: batchName, severity: "critical",
    summary: `Batch "${batchName}" safe-cleanup: ${deleted} deleted, ${archived} archived, ${alreadyArchivedLinked} already archived.`,
    metadata: {
      batch_name: batchName, batch_date: batchDate, pipeline_id: pipelineId,
      deleted_count: deleted, archived_count: archived, skipped_already_archived: alreadyArchivedLinked,
      total: leadIds.length, reason: reason ?? null,
    },
  }).catch(() => {});
  return { deleted, archived, alreadyArchivedLinked, total: leadIds.length };
}

// ─────────── Paid Pipeline ───────────
export async function archivePaidBuyer(lead: { id: string; name?: string | null }, reason?: string) {
  const uid = await getActorId();
  const { error } = await supabase.from("paid_pipeline_leads").update({
    archived_at: new Date().toISOString(), archived_by: uid, archive_reason: reason ?? null,
  } as any).eq("id", lead.id);
  if (error) throw error;
  logActivity({
    module_key: "paid_pipeline", action_type: "paid_pipeline_buyer_archived",
    entity_type: "paid_pipeline_lead", entity_id: lead.id, entity_label: lead.name ?? undefined,
    severity: "warning", summary: `${lead.name ?? "Buyer"} archived from Paid Pipeline.`,
    metadata: { reason: reason ?? null },
  }).catch(() => {});
}

export async function restorePaidBuyer(lead: { id: string; name?: string | null }) {
  const { error } = await supabase.from("paid_pipeline_leads").update({
    archived_at: null, archived_by: null, archive_reason: null,
  } as any).eq("id", lead.id);
  if (error) throw error;
  logActivity({
    module_key: "paid_pipeline", action_type: "paid_pipeline_buyer_restored",
    entity_type: "paid_pipeline_lead", entity_id: lead.id, entity_label: lead.name ?? undefined,
    summary: `${lead.name ?? "Buyer"} restored.`,
  }).catch(() => {});
}
