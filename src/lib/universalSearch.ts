// Universal Lead Search — queries Calling CRM leads, Paid Pipeline buyers, and
// Operations CRM leads in parallel using shared identity normalization.
// Read-only. RLS does the role-safe filtering on the server.

import { supabase } from "@/integrations/supabase/client";
import { normalizeEmail, normalizePhone, normalizeName, isValidEmail } from "@/lib/identity";

export type UniversalRecordType =
  | "crm_lead_sales"
  | "crm_lead_paid_onboarding"
  | "paid_pipeline_buyer"
  | "operations_lead";

export interface UniversalSearchResult {
  id: string;
  recordType: UniversalRecordType;
  name: string;
  email: string | null;
  phone: string | null;
  pipelineId: string | null;
  pipelineName: string | null;
  stageId: string | null;
  stageName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  batch: string | null;
  // Status hints
  isArchived: boolean;
  isConverted: boolean;
  isHiddenFromSales: boolean;
  paidLinked: boolean;
  cocStatus: string | null;
  // Cross-links
  crmLeadId: string | null;
  paidPipelineLeadId: string | null;
  sourceUnpaidLeadId: string | null;
  // Raw row for advanced actions
  raw: any;
}

export interface UniversalSearchGroup {
  key: "sales_crm" | "paid_onboarding_crm" | "paid_pipeline" | "operations_crm";
  title: string;
  results: UniversalSearchResult[];
  total: number; // total including any beyond the limit
}

export interface UniversalSearchDebug {
  query: string;
  normalizedEmail: string;
  normalizedPhone: string;
  normalizedName: string;
  tablesQueried: string[];
  counts: Record<string, number>;
  includeArchived: boolean;
  includeHidden: boolean;
  scope: "current" | "all";
  errors: Record<string, string>;
}

export interface UniversalSearchOutput {
  groups: UniversalSearchGroup[];
  debug: UniversalSearchDebug;
}

export interface RunUniversalSearchInput {
  query: string;
  includeArchived?: boolean;
  includeHidden?: boolean;
  scope?: "current" | "all";
  currentPipelineId?: string | null;
  perSourceLimit?: number;
  isAdmin?: boolean;
  pipelineNameLookup?: Record<string, string>;
  stageNameLookup?: Record<string, string>;
  agentNameLookup?: Record<string, string>;
}

const PER_SOURCE_DEFAULT = 20;

function shouldSearch(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  if (trimmed.length >= 3) return true;
  if (/^\d+$/.test(trimmed) && trimmed.length >= 5) return true;
  return false;
}

async function searchTable(opts: {
  table: "leads" | "paid_pipeline_leads" | "operations_leads";
  selectCols: string;
  nameCol: "full_name" | "name";
  query: string;
  email: string;
  phone: string;
  name: string;
  limit: number;
  extra?: (q: any) => any;
}): Promise<{ data: any[]; error: any | null }> {
  const { table, selectCols, nameCol, email, phone, name, limit, extra } = opts;

  // Build OR clause with the strongest signal we have. Multiple parallel
  // simple queries beat one giant OR with regex.
  const queries: Promise<{ data: any[] | null; error: any }>[] = [];

  if (email && isValidEmail(email)) {
    // Exact / substring match on full email
    let q = (supabase as any).from(table).select(selectCols).ilike("email", `%${email}%`).limit(limit);
    if (extra) q = extra(q);
    queries.push(q);
    // Local-part prefix match — surfaces typos like vu3ge@... vs vu3geq@...
    const localPart = email.split("@")[0] || "";
    if (localPart && localPart.length >= 3) {
      let q2 = (supabase as any).from(table).select(selectCols).ilike("email", `${localPart}%`).limit(limit);
      if (extra) q2 = extra(q2);
      queries.push(q2);
      // Also try the local part against the name column (often local = name)
      let q3 = (supabase as any).from(table).select(selectCols).ilike(nameCol, `%${localPart}%`).limit(limit);
      if (extra) q3 = extra(q3);
      queries.push(q3);
    }
  }

  if (phone && phone.length >= 5) {
    // last-10 normalized comparison via ILIKE on raw phone (trgm index helps too)
    let q = (supabase as any).from(table).select(selectCols).ilike("phone", `%${phone}%`).limit(limit);
    if (extra) q = extra(q);
    queries.push(q);
  }

  if (name && name.length >= 3 && !(email && isValidEmail(email))) {
    let q = (supabase as any).from(table).select(selectCols).ilike(nameCol, `%${name}%`).limit(limit);
    if (extra) q = extra(q);
    queries.push(q);
  }

  // If the raw query is alphanumeric but not a clean email/phone, still try a
  // generic name ILIKE
  if (queries.length === 0) {
    let q = (supabase as any).from(table).select(selectCols).ilike(nameCol, `%${opts.query.trim()}%`).limit(limit);
    if (extra) q = extra(q);
    queries.push(q);
  }

  try {
    const settled = await Promise.all(queries);
    const merged: Record<string, any> = {};
    let firstError: any = null;
    for (const r of settled) {
      if (r.error && !firstError) firstError = r.error;
      (r.data || []).forEach((row: any) => { if (row?.id) merged[row.id] = row; });
    }
    return { data: Object.values(merged).slice(0, limit), error: firstError };
  } catch (e: any) {
    return { data: [], error: e };
  }
}

export async function runUniversalSearch(input: RunUniversalSearchInput): Promise<UniversalSearchOutput> {
  const query = (input.query || "").trim();
  const includeArchived = !!input.includeArchived && !!input.isAdmin;
  const includeHidden = !!input.includeHidden && !!input.isAdmin;
  const scope = input.scope ?? "all";
  const limit = input.perSourceLimit ?? PER_SOURCE_DEFAULT;
  const isAdmin = !!input.isAdmin;

  const email = normalizeEmail(query);
  const phone = normalizePhone(query);
  const name = normalizeName(query);

  const debug: UniversalSearchDebug = {
    query,
    normalizedEmail: email,
    normalizedPhone: phone,
    normalizedName: name,
    tablesQueried: [],
    counts: {},
    includeArchived,
    includeHidden,
    scope,
    errors: {},
  };

  if (!shouldSearch(query)) {
    return { groups: [], debug };
  }

  // Pipeline/stage/agent lookups: pull them once (lightweight) if not passed in
  let pipelineLookup = input.pipelineNameLookup;
  let stageLookup = input.stageNameLookup;
  let pipelineTypeById: Record<string, string> = {};
  let paidOnboardingPipelineId: string | null = null;
  try {
    const [pRes, sRes] = await Promise.all([
      (supabase as any).from("pipelines").select("id, name, type"),
      pipelineLookup && stageLookup
        ? Promise.resolve({ data: [] as any[] })
        : (supabase as any).from("stages").select("id, name"),
    ]);
    pipelineLookup = pipelineLookup || Object.fromEntries((pRes.data || []).map((p: any) => [p.id, p.name]));
    stageLookup = stageLookup || Object.fromEntries((sRes.data || []).map((s: any) => [s.id, s.name]));
    pipelineTypeById = Object.fromEntries((pRes.data || []).map((p: any) => [p.id, p.type]));
    paidOnboardingPipelineId = (pRes.data || []).find((p: any) => p.type === "paid")?.id || null;
  } catch {
    pipelineLookup = pipelineLookup || {};
    stageLookup = stageLookup || {};
  }
  const agentLookup = input.agentNameLookup || {};

  // Parallel searches
  debug.tablesQueried.push("leads", "paid_pipeline_leads", "operations_leads");

  const [leadsRes, paidRes, opsRes] = await Promise.all([
    searchTable({
      table: "leads",
      selectCols:
        "id, full_name, email, phone, pipeline_id, stage_id, lead_type, assigned_agent_id, webinar_source, archived_at, deleted_at, conversion_status, hide_from_sales_workload, code_of_conduct_status, paid_pipeline_lead_id, converted_to_crm_lead_id",
      nameCol: "full_name",
      query, email, phone, name, limit,
      extra: (q) => {
        let qq = q;
        if (!includeArchived) qq = qq.is("archived_at", null).is("deleted_at", null);
        // Do NOT filter hide_from_sales_workload — Paid Onboarding leads have it true by design.
        return qq;
      },
    }),
    searchTable({
      table: "paid_pipeline_leads",
      selectCols:
        "id, name, email, phone, pipeline_stage, assigned_sales_executive, attributed_media_buyer, source_webinar, is_deleted, deleted_at, is_enrolled, is_dropped, is_refunded, attribution_session_id, attribution_sale_id, crm_lead_id, source_unpaid_lead_id",
      nameCol: "name",
      query, email, phone, name, limit,
      extra: (q) => (includeArchived ? q : q.eq("is_deleted", false)),
    }),
    searchTable({
      table: "operations_leads",
      selectCols:
        "id, name, email, phone, pipeline_id, stage_id, current_stage, assigned_media_buyer_id, assigned_media_buyer_name, batch_name, crm_lead_id, paid_pipeline_lead_id, service_status, onboarding_batch, service_package_name",
      nameCol: "name",
      query, email, phone, name, limit,
    }),
  ]);

  if (leadsRes.error) debug.errors.leads = String(leadsRes.error.message || leadsRes.error);
  if (paidRes.error) debug.errors.paid_pipeline_leads = String(paidRes.error.message || paidRes.error);
  if (opsRes.error) debug.errors.operations_leads = String(opsRes.error.message || opsRes.error);

  // ── LINK-EXPANSION PASS ───────────────────────────────────────────────
  // For every direct match, follow cross-table IDs and fetch any sibling rows
  // not already in the result set. This is what makes "find by phone" surface
  // the Source Unpaid Lead even though only the Paid Pipeline buyer matched.
  const leadIds = new Set<string>(leadsRes.data.map((r: any) => r.id));
  const paidIds = new Set<string>(paidRes.data.map((r: any) => r.id));
  const opsIds = new Set<string>(opsRes.data.map((r: any) => r.id));
  const initialLeadCount = leadIds.size, initialPaidCount = paidIds.size, initialOpsCount = opsIds.size;

  const collectLinks = () => {
    for (const r of leadsRes.data) {
      if (r.paid_pipeline_lead_id) paidIds.add(r.paid_pipeline_lead_id);
      if (r.converted_to_crm_lead_id) leadIds.add(r.converted_to_crm_lead_id);
    }
    for (const r of paidRes.data) {
      if (r.crm_lead_id) leadIds.add(r.crm_lead_id);
      if (r.source_unpaid_lead_id) leadIds.add(r.source_unpaid_lead_id);
    }
    for (const r of opsRes.data) {
      if (r.crm_lead_id) leadIds.add(r.crm_lead_id);
      if (r.paid_pipeline_lead_id) paidIds.add(r.paid_pipeline_lead_id);
    }
  };
  collectLinks();

  const newLeadIds = [...leadIds].filter((id) => !leadsRes.data.find((r: any) => r.id === id));
  const newPaidIds = [...paidIds].filter((id) => !paidRes.data.find((r: any) => r.id === id));
  const newOpsIds  = [...opsIds].filter((id) => !opsRes.data.find((r: any) => r.id === id));

  const extraFetches: Promise<any>[] = [];
  if (newLeadIds.length) extraFetches.push(
    (supabase as any).from("leads")
      .select("id, full_name, email, phone, pipeline_id, stage_id, lead_type, assigned_agent_id, webinar_source, archived_at, deleted_at, conversion_status, hide_from_sales_workload, code_of_conduct_status, paid_pipeline_lead_id, converted_to_crm_lead_id")
      .in("id", newLeadIds)
  );
  if (newPaidIds.length) extraFetches.push(
    (supabase as any).from("paid_pipeline_leads")
      .select("id, name, email, phone, pipeline_stage, assigned_sales_executive, attributed_media_buyer, source_webinar, is_deleted, deleted_at, is_enrolled, is_dropped, is_refunded, attribution_session_id, attribution_sale_id, crm_lead_id, source_unpaid_lead_id")
      .in("id", newPaidIds)
  );
  if (newOpsIds.length) extraFetches.push(
    (supabase as any).from("operations_leads")
      .select("id, name, email, phone, pipeline_id, stage_id, current_stage, assigned_media_buyer_id, assigned_media_buyer_name, batch_name, crm_lead_id, paid_pipeline_lead_id, service_status, onboarding_batch, service_package_name")
      .in("id", newOpsIds)
  );
  if (extraFetches.length) {
    const settled = await Promise.all(extraFetches);
    let ix = 0;
    if (newLeadIds.length) { (settled[ix++].data || []).forEach((r: any) => { if (!leadsRes.data.find((x: any) => x.id === r.id)) leadsRes.data.push(r); }); }
    if (newPaidIds.length) { (settled[ix++].data || []).forEach((r: any) => { if (!paidRes.data.find((x: any) => x.id === r.id)) paidRes.data.push(r); }); }
    if (newOpsIds.length)  { (settled[ix++].data || []).forEach((r: any) => { if (!opsRes.data.find((x: any) => x.id === r.id)) opsRes.data.push(r); }); }
  }
  (debug as any).linkExpansion = {
    extraLeads: leadsRes.data.length - initialLeadCount,
    extraPaid: paidRes.data.length - initialPaidCount,
    extraOps: opsRes.data.length - initialOpsCount,
  };

  // Split CRM leads into Sales vs Paid Onboarding using PIPELINE TYPE
  // (lead_type alone is unreliable; the truth is the pipeline.type column).
  const salesLeads: UniversalSearchResult[] = [];
  const paidOnboardingLeads: UniversalSearchResult[] = [];
  for (const r of leadsRes.data) {
    const isPaidOnboarding =
      (paidOnboardingPipelineId && r.pipeline_id === paidOnboardingPipelineId)
      || pipelineTypeById[r.pipeline_id] === "paid"
      || r.lead_type === "paid";
    const out: UniversalSearchResult = {
      id: r.id,
      recordType: isPaidOnboarding ? "crm_lead_paid_onboarding" : "crm_lead_sales",
      name: r.full_name || "(no name)",
      email: r.email,
      phone: r.phone,
      pipelineId: r.pipeline_id,
      pipelineName: r.pipeline_id ? pipelineLookup![r.pipeline_id] || null : null,
      stageId: r.stage_id,
      stageName: r.stage_id ? stageLookup![r.stage_id] || null : null,
      ownerId: r.assigned_agent_id,
      ownerName: r.assigned_agent_id ? agentLookup[r.assigned_agent_id] || null : null,
      batch: r.webinar_source,
      isArchived: !!r.archived_at,
      isConverted: r.conversion_status === "converted" || !!r.converted_to_crm_lead_id,
      isHiddenFromSales: !!r.hide_from_sales_workload,
      paidLinked: !!r.paid_pipeline_lead_id,
      cocStatus: r.code_of_conduct_status || null,
      crmLeadId: r.id,
      paidPipelineLeadId: r.paid_pipeline_lead_id,
      sourceUnpaidLeadId: null,
      raw: r,
    };
    if (isPaidOnboarding) paidOnboardingLeads.push(out); else salesLeads.push(out);
  }


  const paidPipelineResults: UniversalSearchResult[] = paidRes.data.map((r: any) => ({
    id: r.id,
    recordType: "paid_pipeline_buyer",
    name: r.name || "(no name)",
    email: r.email,
    phone: r.phone,
    pipelineId: null,
    pipelineName: "Paid Pipeline",
    stageId: null,
    stageName: r.pipeline_stage || null,
    ownerId: r.assigned_sales_executive,
    ownerName: r.assigned_sales_executive ? agentLookup[r.assigned_sales_executive] || null : null,
    batch: r.source_webinar || null,
    isArchived: !!r.is_deleted,
    isConverted: !!r.is_enrolled,
    isHiddenFromSales: false,
    paidLinked: true,
    cocStatus: null,
    crmLeadId: r.crm_lead_id || null,
    paidPipelineLeadId: r.id,
    sourceUnpaidLeadId: r.source_unpaid_lead_id || null,
    raw: r,
  }));


  const operationsResults: UniversalSearchResult[] = opsRes.data.map((r: any) => ({
    id: r.id,
    recordType: "operations_lead",
    name: r.name || "(no name)",
    email: r.email,
    phone: r.phone,
    pipelineId: r.pipeline_id,
    pipelineName: r.pipeline_id ? pipelineLookup![r.pipeline_id] || "Operations CRM" : "Operations CRM",
    stageId: r.stage_id,
    stageName: (r.stage_id ? stageLookup![r.stage_id] : null) || r.current_stage || null,
    ownerId: r.assigned_media_buyer_id,
    ownerName: r.assigned_media_buyer_name || (r.assigned_media_buyer_id ? agentLookup[r.assigned_media_buyer_id] : null) || null,
    batch: r.batch_name || r.onboarding_batch || null,
    isArchived: false,
    isConverted: r.service_status === "completed",
    isHiddenFromSales: false,
    paidLinked: !!r.paid_pipeline_lead_id,
    cocStatus: null,
    crmLeadId: r.crm_lead_id,
    paidPipelineLeadId: r.paid_pipeline_lead_id,
    sourceUnpaidLeadId: null,
    raw: r,
  }));

  debug.counts.sales_crm = salesLeads.length;
  debug.counts.paid_onboarding_crm = paidOnboardingLeads.length;
  debug.counts.paid_pipeline = paidPipelineResults.length;
  debug.counts.operations_crm = operationsResults.length;

  // Scope = current view: bubble current pipeline results to the top of their group
  const sortByCurrent = (arr: UniversalSearchResult[]) => {
    if (scope !== "current" || !input.currentPipelineId) return arr;
    return [...arr].sort((a, b) => {
      const am = a.pipelineId === input.currentPipelineId ? 0 : 1;
      const bm = b.pipelineId === input.currentPipelineId ? 0 : 1;
      return am - bm;
    });
  };

  const groups: UniversalSearchGroup[] = [];
  if (salesLeads.length) groups.push({ key: "sales_crm", title: "Sales Pipeline / Calling CRM", results: sortByCurrent(salesLeads), total: salesLeads.length });
  if (paidOnboardingLeads.length) groups.push({ key: "paid_onboarding_crm", title: "Paid — Onboarding CRM", results: sortByCurrent(paidOnboardingLeads), total: paidOnboardingLeads.length });
  if (operationsResults.length) groups.push({ key: "operations_crm", title: "Operations CRM", results: operationsResults, total: operationsResults.length });
  if (paidPipelineResults.length) groups.push({ key: "paid_pipeline", title: "Paid Pipeline", results: paidPipelineResults, total: paidPipelineResults.length });

  return { groups, debug };
}
