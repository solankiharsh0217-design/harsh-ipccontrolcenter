// Shared resolver that, for a given lead identity (CRM lead, paid buyer, or
// operations lead), discovers all sibling records across:
//   - Source unpaid CRM lead (Sales Pipeline)
//   - Paid Onboarding CRM lead (Paid — Onboarding pipeline)
//   - Paid Pipeline buyer (finance row)
//   - Operations CRM lead
//
// Used by Universal Search (link-expansion), the Lead Drawer's "Linked
// Records" panel, and the Move / Copy / Link wizard. Read-only.

import { supabase } from "@/integrations/supabase/client";
import { normalizeEmail, normalizePhone } from "@/lib/identity";

export type SiblingKind =
  | "source_unpaid_crm"
  | "paid_onboarding_crm"
  | "paid_pipeline_buyer"
  | "operations_lead";

export interface SiblingRef {
  kind: SiblingKind;
  id: string;
  name: string | null;
  pipelineId: string | null;
  pipelineName: string | null;
  stageId: string | null;
  stageName: string | null;
  archived: boolean;
  raw: any;
}

export interface LinkBundle {
  source_unpaid_crm: SiblingRef[];
  paid_onboarding_crm: SiblingRef[];
  paid_pipeline_buyer: SiblingRef[];
  operations_lead: SiblingRef[];
  missing: {
    paid_onboarding_crm: boolean; // there is a paid buyer but no paid onboarding CRM lead
    paid_pipeline_buyer: boolean; // converted source lead but no paid buyer
    crm_link_repair_needed: boolean; // paid_pipeline_lead.crm_lead_id missing or points to source unpaid
  };
}

export interface ResolveOpts {
  // Optionally seed with the row we already have
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  operationsLeadId?: string | null;
  email?: string | null;
  phone?: string | null;
  pipelineNameLookup?: Record<string, string>;
  stageNameLookup?: Record<string, string>;
}

const EMPTY: LinkBundle = {
  source_unpaid_crm: [],
  paid_onboarding_crm: [],
  paid_pipeline_buyer: [],
  operations_lead: [],
  missing: { paid_onboarding_crm: false, paid_pipeline_buyer: false, crm_link_repair_needed: false },
};

async function fetchLookups(opts: ResolveOpts) {
  let pipelineLookup = opts.pipelineNameLookup;
  let stageLookup = opts.stageNameLookup;
  let paidOnboardingPipelineId: string | null = null;
  if (!pipelineLookup || !stageLookup) {
    const [pRes, sRes] = await Promise.all([
      (supabase as any).from("pipelines").select("id, name, type"),
      (supabase as any).from("stages").select("id, name"),
    ]);
    pipelineLookup = Object.fromEntries((pRes.data || []).map((p: any) => [p.id, p.name]));
    stageLookup = Object.fromEntries((sRes.data || []).map((s: any) => [s.id, s.name]));
    paidOnboardingPipelineId = (pRes.data || []).find((p: any) => p.type === "paid")?.id || null;
  } else {
    const { data } = await (supabase as any).from("pipelines").select("id, type").eq("type", "paid").maybeSingle();
    paidOnboardingPipelineId = (data as any)?.id || null;
  }
  return { pipelineLookup, stageLookup, paidOnboardingPipelineId };
}

const LEAD_COLS =
  "id, full_name, email, phone, pipeline_id, stage_id, lead_type, archived_at, deleted_at, conversion_status, hide_from_sales_workload, paid_pipeline_lead_id, converted_to_crm_lead_id";
const PAID_COLS =
  "id, name, email, phone, pipeline_stage, crm_lead_id, source_unpaid_lead_id, is_deleted, deleted_at, deal_value_including_gst";
const OPS_COLS =
  "id, name, email, phone, pipeline_id, stage_id, current_stage, crm_lead_id, paid_pipeline_lead_id";

export async function resolveLinkBundle(opts: ResolveOpts): Promise<LinkBundle> {
  const { pipelineLookup, stageLookup, paidOnboardingPipelineId } = await fetchLookups(opts);
  const normEmail = normalizeEmail(opts.email || "");
  const normPhone = normalizePhone(opts.phone || "");

  // Step 1: discover all candidate IDs via the seeds + identity
  const leadIds = new Set<string>();
  const paidIds = new Set<string>();
  const opsIds = new Set<string>();
  if (opts.crmLeadId) leadIds.add(opts.crmLeadId);
  if (opts.paidPipelineLeadId) paidIds.add(opts.paidPipelineLeadId);
  if (opts.operationsLeadId) opsIds.add(opts.operationsLeadId);

  // Identity-based seed
  const identityClauses: string[] = [];
  if (normEmail) identityClauses.push(`email.ilike.${normEmail}`);
  if (normPhone && normPhone.length >= 5) identityClauses.push(`phone.ilike.%${normPhone}%`);

  if (identityClauses.length) {
    const [lRes, pRes, oRes] = await Promise.all([
      (supabase as any).from("leads").select("id").or(identityClauses.join(",")).limit(30),
      (supabase as any).from("paid_pipeline_leads").select("id").or(identityClauses.join(",")).limit(30),
      (supabase as any).from("operations_leads").select("id").or(identityClauses.join(",")).limit(30),
    ]);
    (lRes.data || []).forEach((r: any) => leadIds.add(r.id));
    (pRes.data || []).forEach((r: any) => paidIds.add(r.id));
    (oRes.data || []).forEach((r: any) => opsIds.add(r.id));
  }

  // Step 2: hydrate and follow links iteratively (max 2 passes)
  const leadsById = new Map<string, any>();
  const paidById = new Map<string, any>();
  const opsById = new Map<string, any>();

  for (let pass = 0; pass < 2; pass++) {
    const newLeadIds = [...leadIds].filter((id) => !leadsById.has(id));
    const newPaidIds = [...paidIds].filter((id) => !paidById.has(id));
    const newOpsIds = [...opsIds].filter((id) => !opsById.has(id));
    if (!newLeadIds.length && !newPaidIds.length && !newOpsIds.length) break;
    const fetches: Promise<any>[] = [];
    if (newLeadIds.length) fetches.push((supabase as any).from("leads").select(LEAD_COLS).in("id", newLeadIds));
    if (newPaidIds.length) fetches.push((supabase as any).from("paid_pipeline_leads").select(PAID_COLS).in("id", newPaidIds));
    if (newOpsIds.length) fetches.push((supabase as any).from("operations_leads").select(OPS_COLS).in("id", newOpsIds));
    const results = await Promise.all(fetches);
    let idx = 0;
    if (newLeadIds.length) { (results[idx++].data || []).forEach((r: any) => leadsById.set(r.id, r)); }
    if (newPaidIds.length) { (results[idx++].data || []).forEach((r: any) => paidById.set(r.id, r)); }
    if (newOpsIds.length) { (results[idx++].data || []).forEach((r: any) => opsById.set(r.id, r)); }

    // Discover further links
    for (const l of leadsById.values()) {
      if (l.paid_pipeline_lead_id) paidIds.add(l.paid_pipeline_lead_id);
      if (l.converted_to_crm_lead_id) leadIds.add(l.converted_to_crm_lead_id);
    }
    for (const p of paidById.values()) {
      if (p.crm_lead_id) leadIds.add(p.crm_lead_id);
      if (p.source_unpaid_lead_id) leadIds.add(p.source_unpaid_lead_id);
    }
    for (const o of opsById.values()) {
      if (o.crm_lead_id) leadIds.add(o.crm_lead_id);
      if (o.paid_pipeline_lead_id) paidIds.add(o.paid_pipeline_lead_id);
    }
  }

  // Step 3: classify
  const bundle: LinkBundle = {
    source_unpaid_crm: [], paid_onboarding_crm: [], paid_pipeline_buyer: [], operations_lead: [],
    missing: { paid_onboarding_crm: false, paid_pipeline_buyer: false, crm_link_repair_needed: false },
  };

  for (const l of leadsById.values()) {
    const isPaidOnboarding =
      (paidOnboardingPipelineId && l.pipeline_id === paidOnboardingPipelineId) || l.lead_type === "paid";
    const ref: SiblingRef = {
      kind: isPaidOnboarding ? "paid_onboarding_crm" : "source_unpaid_crm",
      id: l.id,
      name: l.full_name,
      pipelineId: l.pipeline_id,
      pipelineName: l.pipeline_id ? pipelineLookup[l.pipeline_id] || null : null,
      stageId: l.stage_id,
      stageName: l.stage_id ? stageLookup[l.stage_id] || null : null,
      archived: !!l.archived_at || !!l.deleted_at,
      raw: l,
    };
    (isPaidOnboarding ? bundle.paid_onboarding_crm : bundle.source_unpaid_crm).push(ref);
  }
  for (const p of paidById.values()) {
    bundle.paid_pipeline_buyer.push({
      kind: "paid_pipeline_buyer",
      id: p.id,
      name: p.name,
      pipelineId: null,
      pipelineName: "Paid Pipeline",
      stageId: null,
      stageName: p.pipeline_stage || null,
      archived: !!p.is_deleted,
      raw: p,
    });
  }
  for (const o of opsById.values()) {
    bundle.operations_lead.push({
      kind: "operations_lead",
      id: o.id,
      name: o.name,
      pipelineId: o.pipeline_id,
      pipelineName: o.pipeline_id ? pipelineLookup[o.pipeline_id] || "Operations CRM" : "Operations CRM",
      stageId: o.stage_id,
      stageName: (o.stage_id ? stageLookup[o.stage_id] : null) || o.current_stage || null,
      archived: false,
      raw: o,
    });
  }

  // Step 4: missing-record detection
  if (bundle.paid_pipeline_buyer.length > 0 && bundle.paid_onboarding_crm.length === 0) {
    bundle.missing.paid_onboarding_crm = true;
    bundle.missing.crm_link_repair_needed = true;
  }
  // crm_lead_id missing or pointing to source unpaid (not paid onboarding)
  for (const p of paidById.values()) {
    if (!p.crm_lead_id) { bundle.missing.crm_link_repair_needed = true; continue; }
    const linked = leadsById.get(p.crm_lead_id);
    if (!linked) continue;
    const linkedIsPaidOnboarding =
      (paidOnboardingPipelineId && linked.pipeline_id === paidOnboardingPipelineId) || linked.lead_type === "paid";
    if (!linkedIsPaidOnboarding) bundle.missing.crm_link_repair_needed = true;
  }
  // Converted source with no paid buyer
  const hasConvertedSource = bundle.source_unpaid_crm.some(
    (s) => s.raw?.conversion_status === "converted" || s.raw?.paid_pipeline_lead_id,
  );
  if (hasConvertedSource && bundle.paid_pipeline_buyer.length === 0) {
    bundle.missing.paid_pipeline_buyer = true;
  }

  return bundle.source_unpaid_crm.length + bundle.paid_onboarding_crm.length + bundle.paid_pipeline_buyer.length + bundle.operations_lead.length === 0
    ? EMPTY
    : bundle;
}
