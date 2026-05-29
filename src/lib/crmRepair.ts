// Calling CRM — Batch Repair / Deduplicate
// Pure logic + apply. Reuses identity normalization from src/lib/identity.ts
// and archive primitives from src/lib/crmArchive.ts.
//
// Safety guarantees:
// - Never hard-deletes. Duplicates are archived + deassigned (assigned_agent_id = null).
// - Protected records (paid_pipeline_lead_id, CoC request, follow-ups, payments via
//   paid link) are ALWAYS kept and never archived as duplicates.
// - The single "kept" record per identity is preserved exactly as-is.

import { supabase } from "@/integrations/supabase/client";
import { buildIdentity } from "@/lib/identity";
import { logActivity } from "@/lib/auditLog";

export type RepairLeadRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  webinar_source: string | null;
  webinar_date: string | null;
  assigned_agent_id: string | null;
  paid_pipeline_lead_id: string | null;
  code_of_conduct_request_id: string | null;
  archived_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

export type RepairAction = "keep" | "archive_duplicate" | "protected_duplicate" | "weak_review";

export type RepairPlanItem = {
  lead: RepairLeadRow;
  identityKey: string;
  identityKind: "email" | "phone" | "name";
  action: RepairAction;
  reason: string;
  followUpCount: number;
  hasPaidLink: boolean;
  hasCoc: boolean;
};

export type RepairDryRun = {
  batchName: string;
  batchDate: string | null;
  pipelineId: string | null;
  activeCount: number;
  uniqueIdentities: number;
  duplicateIdentities: number;
  duplicateRecords: number;
  protectedDuplicates: number;
  safeToArchive: number;
  weakReview: number;
  plan: RepairPlanItem[];
};

// Score for picking the BEST record among duplicates. Higher wins.
function scoreKeep(it: { lead: RepairLeadRow; followUpCount: number; hasPaidLink: boolean; hasCoc: boolean }) {
  let s = 0;
  if (it.hasPaidLink) s += 100_000;
  if (it.hasCoc) s += 50_000;
  if (it.followUpCount > 0) s += 10_000 + it.followUpCount;
  if (it.lead.assigned_agent_id) s += 5_000;
  // contact completeness
  if (it.lead.email) s += 200;
  if (it.lead.phone) s += 200;
  if (it.lead.full_name) s += 50;
  const t = it.lead.updated_at ? new Date(it.lead.updated_at).getTime() : it.lead.created_at ? new Date(it.lead.created_at).getTime() : 0;
  if (Number.isFinite(t)) s += Math.min(1000, t / 1e11);
  return s;
}

export async function dryRunBatchRepair(args: {
  batchName: string;
  batchDate: string | null;
  pipelineId: string | null;
}): Promise<RepairDryRun> {
  const { batchName, batchDate, pipelineId } = args;

  // Load active leads in the batch
  let q: any = (supabase as any)
    .from("leads")
    .select("id, full_name, email, phone, pipeline_id, stage_id, webinar_source, webinar_date, assigned_agent_id, paid_pipeline_lead_id, code_of_conduct_request_id, archived_at, updated_at, created_at")
    .eq("webinar_source", batchName)
    .is("archived_at", null);
  q = batchDate ? q.eq("webinar_date", batchDate) : q.is("webinar_date", null);
  if (pipelineId) q = q.eq("pipeline_id", pipelineId);
  const { data: leads, error } = await q;
  if (error) throw error;
  const rows = (leads || []) as RepairLeadRow[];

  // Followups per lead
  const ids = rows.map((r) => r.id);
  const followCount = new Map<string, number>();
  if (ids.length) {
    const { data: fr } = await (supabase as any).from("follow_up_reminders").select("crm_lead_id").in("crm_lead_id", ids);
    (fr || []).forEach((f: any) => {
      if (f.crm_lead_id) followCount.set(f.crm_lead_id, (followCount.get(f.crm_lead_id) || 0) + 1);
    });
  }

  // Bucket by identity
  type Bucket = { key: string; kind: "email" | "phone" | "name"; weak: boolean; items: { lead: RepairLeadRow; followUpCount: number; hasPaidLink: boolean; hasCoc: boolean }[] };
  const buckets = new Map<string, Bucket>();
  for (const l of rows) {
    const id = buildIdentity({ email: l.email, phone: l.phone, name: l.full_name });
    const key = id.key || `lead:${l.id}`;
    if (!buckets.has(key)) buckets.set(key, { key, kind: id.kind, weak: id.weak, items: [] });
    buckets.get(key)!.items.push({
      lead: l,
      followUpCount: followCount.get(l.id) || 0,
      hasPaidLink: !!l.paid_pipeline_lead_id,
      hasCoc: !!l.code_of_conduct_request_id,
    });
  }

  const plan: RepairPlanItem[] = [];
  let uniqueIdentities = 0;
  let duplicateIdentities = 0;
  let duplicateRecords = 0;
  let protectedDuplicates = 0;
  let safeToArchive = 0;
  let weakReview = 0;

  for (const b of buckets.values()) {
    if (b.items.length === 1) {
      uniqueIdentities++;
      const only = b.items[0];
      plan.push({
        lead: only.lead, identityKey: b.key, identityKind: b.kind,
        action: b.weak ? "keep" : "keep",
        reason: b.weak ? "Unique (weak identity – name only)" : "Unique identity",
        followUpCount: only.followUpCount, hasPaidLink: only.hasPaidLink, hasCoc: only.hasCoc,
      });
      continue;
    }
    duplicateIdentities++;
    if (b.weak) {
      // Don't auto-archive weak (name-only) duplicates — flag for manual review
      for (const it of b.items) {
        weakReview++;
        plan.push({
          lead: it.lead, identityKey: b.key, identityKind: b.kind,
          action: "weak_review",
          reason: "Weak identity match (name-only) — manual review",
          followUpCount: it.followUpCount, hasPaidLink: it.hasPaidLink, hasCoc: it.hasCoc,
        });
      }
      continue;
    }
    // Strong duplicates: pick best, archive rest
    const sorted = [...b.items].sort((a, z) => scoreKeep(z) - scoreKeep(a));
    const keeper = sorted[0];
    plan.push({
      lead: keeper.lead, identityKey: b.key, identityKind: b.kind,
      action: "keep",
      reason: `Best record kept (${keeper.hasPaidLink ? "paid link" : keeper.hasCoc ? "CoC" : keeper.followUpCount ? "follow-ups" : keeper.lead.assigned_agent_id ? "assigned" : "most complete"})`,
      followUpCount: keeper.followUpCount, hasPaidLink: keeper.hasPaidLink, hasCoc: keeper.hasCoc,
    });
    for (const dup of sorted.slice(1)) {
      duplicateRecords++;
      const isProtected = dup.hasPaidLink || dup.hasCoc || dup.followUpCount > 0;
      if (isProtected) {
        protectedDuplicates++;
        plan.push({
          lead: dup.lead, identityKey: b.key, identityKind: b.kind,
          action: "protected_duplicate",
          reason: `Duplicate but PROTECTED (${dup.hasPaidLink ? "paid link" : dup.hasCoc ? "CoC" : "follow-ups"}) — kept active`,
          followUpCount: dup.followUpCount, hasPaidLink: dup.hasPaidLink, hasCoc: dup.hasCoc,
        });
      } else {
        safeToArchive++;
        plan.push({
          lead: dup.lead, identityKey: b.key, identityKind: b.kind,
          action: "archive_duplicate",
          reason: "Duplicate of kept record — safe to archive + deassign",
          followUpCount: dup.followUpCount, hasPaidLink: dup.hasPaidLink, hasCoc: dup.hasCoc,
        });
      }
    }
  }

  return {
    batchName, batchDate, pipelineId,
    activeCount: rows.length,
    uniqueIdentities,
    duplicateIdentities,
    duplicateRecords,
    protectedDuplicates,
    safeToArchive,
    weakReview,
    plan,
  };
}

export async function applyBatchRepair(plan: RepairPlanItem[], meta: { batchName: string; batchDate: string | null; pipelineId: string | null; reason?: string }) {
  const archiveIds = plan.filter((p) => p.action === "archive_duplicate").map((p) => p.lead.id);
  if (!archiveIds.length) {
    await logActivity({
      module_key: "calling_crm", action_type: "crm_batch_repair_completed",
      entity_type: "crm_batch", entity_label: meta.batchName, severity: "info",
      summary: `Batch "${meta.batchName}" repair: no safe duplicates to archive.`,
      metadata: { batch_name: meta.batchName, batch_date: meta.batchDate, pipeline_id: meta.pipelineId, archived_count: 0, weak_review_count: plan.filter(p => p.action === "weak_review").length, protected_duplicate_count: plan.filter(p => p.action === "protected_duplicate").length },
    }).catch(() => {});
    return { archived: 0 };
  }

  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;
  const reason = meta.reason || `Duplicate of kept record in batch "${meta.batchName}"`;

  // Archive + deassign in one update
  const { error } = await supabase.from("leads").update({
    archived_at: new Date().toISOString(),
    archived_by: uid,
    archive_reason: `[BATCH REPAIR] ${reason}`,
    assigned_agent_id: null,
  } as any).in("id", archiveIds);
  if (error) throw error;

  await logActivity({
    module_key: "calling_crm", action_type: "crm_batch_repair_completed",
    entity_type: "crm_batch", entity_label: meta.batchName, severity: "warning",
    summary: `Batch "${meta.batchName}" repair: ${archiveIds.length} duplicate(s) archived & deassigned.`,
    metadata: {
      batch_name: meta.batchName, batch_date: meta.batchDate, pipeline_id: meta.pipelineId,
      archived_count: archiveIds.length,
      weak_review_count: plan.filter(p => p.action === "weak_review").length,
      protected_duplicate_count: plan.filter(p => p.action === "protected_duplicate").length,
      lead_ids: archiveIds,
    },
  }).catch(() => {});

  return { archived: archiveIds.length };
}

export function planToCsv(plan: RepairPlanItem[], agentNames: Map<string, string> = new Map()): string {
  const header = ["lead_id","name","email","phone","action","reason","identity_kind","identity_key","assigned_agent","paid_link","coc","follow_ups","webinar_source","webinar_date"];
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = plan.map((p) => [
    p.lead.id,
    p.lead.full_name || "",
    p.lead.email || "",
    p.lead.phone || "",
    p.action,
    p.reason,
    p.identityKind,
    p.identityKey,
    p.lead.assigned_agent_id ? (agentNames.get(p.lead.assigned_agent_id) || p.lead.assigned_agent_id) : "",
    p.hasPaidLink ? "yes" : "",
    p.hasCoc ? "yes" : "",
    p.followUpCount,
    p.lead.webinar_source || "",
    p.lead.webinar_date || "",
  ].map(esc).join(","));
  return [header.join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ─── Bulk de-assign helper (used by CRM bulk bar + Team manager) ───
export async function bulkDeassignLeads(leadIds: string[], context?: { source?: string; userAffectedId?: string | null; userAffectedName?: string | null }) {
  if (!leadIds.length) return { deassigned: 0 };
  const { error } = await supabase.from("leads").update({ assigned_agent_id: null } as any).in("id", leadIds);
  if (error) throw error;
  await logActivity({
    module_key: "calling_crm", action_type: "crm_leads_deassigned",
    entity_type: "crm_lead", severity: "warning",
    summary: `${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} de-assigned${context?.userAffectedName ? ` from ${context.userAffectedName}` : ""}.`,
    metadata: {
      source: context?.source || "bulk_deassign",
      affected_user_id: context?.userAffectedId ?? null,
      affected_user_name: context?.userAffectedName ?? null,
      lead_ids: leadIds,
      affected_count: leadIds.length,
    },
  }).catch(() => {});
  return { deassigned: leadIds.length };
}
