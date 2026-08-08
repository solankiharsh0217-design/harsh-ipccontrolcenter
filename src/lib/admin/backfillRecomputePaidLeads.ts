/**
 * ONE-OFF REMEDIATION SCRIPT — NOT PART OF THE APPLICATION UI.
 *
 * This module exists solely to re-run the canonical recompute (recomputePaidLead)
 * across the paid pipeline leads that were affected by the is_token correction.
 * It is intentionally NOT wired into any route, page, button, menu or navigation.
 * It is exposed only as window.__ipcBackfillRecompute so an operator can invoke it
 * deliberately from the browser console.
 *
 * Defaults to a dry run. On the dry-run path no write is constructed or issued.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  recomputePaidLead,
  REFUND_TYPES,
  TOKEN_CATEGORIES,
  DROP_STAGES,
  FINAL_STAGES,
} from "@/lib/paidPipeline";

/** Independently captured pre-state fingerprint. Do not recalculate or adjust. */
export const EXPECTED_PRESTATE_SHA256 =
  "6edfe7f1fa46f5bb8fe306f067d4f0ba3c63a9c6b4f623a890a0992bc061800e";

const EXPECTED_EXCLUSION_COUNT = 4;
const EXPECTED_SCOPE_COUNT = 263;

const RECOMPUTE_COLUMNS = [
  "token_amount_collected",
  "total_collected",
  "balance_pending",
  "revenue_to_be_realized",
  "final_revenue_realized",
  "is_final_sale",
  "is_enrolled",
  "is_dropped",
  "payment_status",
] as const;

type RecomputeColumn = (typeof RECOMPUTE_COLUMNS)[number];

const SNAPSHOT_FIELDS = [
  "id",
  "deal_value_including_gst",
  ...RECOMPUTE_COLUMNS,
] as const;

export interface BackfillSummary {
  processed: number;
  written: number;
  skipped: number;
  aborted: boolean;
  indexReached: number;
}

type LeadRow = Record<string, any>;

function serialiseValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(Number(v));
  return String(v);
}

function canonicalLine(row: LeadRow): string {
  return SNAPSHOT_FIELDS.map((f) => {
    const v = row[f];
    if (f === "id" || f === "payment_status") return serialiseValue(v);
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    return String(Number(v));
  }).join(",");
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchAllIds(): Promise<string[]> {
  const ids: string[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("paid_pipeline_leads")
      .select("id")
      .eq("is_deleted", false)
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    const chunk = (data as LeadRow[]) || [];
    ids.push(...chunk.map((r) => r.id as string));
    if (chunk.length < page) break;
  }
  return ids;
}

async function fetchRefundExcludedLeadIds(): Promise<Set<string>> {
  const excluded = new Set<string>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("paid_pipeline_payments")
      .select("paid_pipeline_lead_id")
      .eq("is_deleted", false)
      .eq("payment_category", "Refund")
      .range(from, from + page - 1);
    if (error) throw error;
    const chunk = (data as LeadRow[]) || [];
    for (const r of chunk) {
      if (r.paid_pipeline_lead_id) excluded.add(r.paid_pipeline_lead_id as string);
    }
    if (chunk.length < page) break;
  }
  return excluded;
}

async function fetchSnapshot(ids: string[]): Promise<LeadRow[]> {
  const rows: LeadRow[] = [];
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("paid_pipeline_leads")
      .select(SNAPSHOT_FIELDS.join(","))
      .in("id", slice);
    if (error) throw error;
    rows.push(...(((data as unknown) as LeadRow[]) || []));
  }
  rows.sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  return rows;
}

/** Mirrors recomputePaidLead's derivation so a dry run can diff without writing. */
async function computeTargets(leadId: string): Promise<Record<RecomputeColumn, any> | null> {
  const { data: leadData, error: leadErr } = await supabase
    .from("paid_pipeline_leads")
    .select("deal_value_including_gst, pipeline_stage, revenue_recognition_rule, finance_status")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!leadData) return null;

  const { data: pays, error: payErr } = await supabase
    .from("paid_pipeline_payments")
    .select("amount, payment_type, payment_category, is_token")
    .eq("paid_pipeline_lead_id", leadId)
    .eq("is_deleted", false);
  if (payErr) throw payErr;

  const list = (pays as LeadRow[]) || [];
  let rawTotal = 0;
  let token = 0;
  for (const p of list) {
    const amt = Number(p.amount || 0);
    const isRefund = REFUND_TYPES.includes(p.payment_type) || p.payment_category === "Refund";
    rawTotal += isRefund ? -amt : amt;
    const isTok = p.is_token || TOKEN_CATEGORIES.includes(p.payment_category) || p.payment_type === "Token";
    if (isTok && !isRefund) token += amt;
  }
  const deal = Number((leadData as LeadRow).deal_value_including_gst || 0);
  const total = Math.max(0, rawTotal);
  const balance = Math.max(0, deal - total);
  const stage = (leadData as LeadRow).pipeline_stage || "";
  const isDropped = DROP_STAGES.includes(stage);
  const isFinanceDisbursed = (leadData as LeadRow).finance_status === "Disbursed";
  const isFinal = (deal > 0 && total >= deal) || isFinanceDisbursed || FINAL_STAGES.includes(stage);
  const realized = (() => {
    switch ((leadData as LeadRow).revenue_recognition_rule) {
      case "Token Collected Only":
        return token;
      case "Full Deal Value":
        return isFinal ? deal : 0;
      case "Finance Approved Amount":
        return isFinanceDisbursed ? deal : 0;
      case "Realized Revenue Only":
      default:
        return total;
    }
  })();

  return {
    token_amount_collected: token,
    total_collected: total,
    balance_pending: balance,
    revenue_to_be_realized: isDropped ? 0 : balance,
    final_revenue_realized: realized,
    is_final_sale: isFinal && !isDropped,
    is_enrolled: isFinal && !isDropped,
    is_dropped: isDropped,
    payment_status: isFinal ? "Full Payment Received" : total > 0 ? "Partial Received" : "No Payment",
  };
}

function sameValue(a: any, b: any): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  if (typeof a === "string" || typeof b === "string") {
    if (a === null || a === undefined || b === null || b === undefined) return (a ?? "") === (b ?? "");
    if (typeof a === "string" && typeof b === "string") return a === b;
  }
  return Number(a ?? 0) === Number(b ?? 0);
}

export async function backfillRecomputePaidLeads(
  options: { dryRun?: boolean } = {},
): Promise<BackfillSummary> {
  const dryRun = options.dryRun ?? true;
  console.log(`[backfill] starting — dryRun = ${dryRun}`);

  const allIds = await fetchAllIds();
  const excluded = await fetchRefundExcludedLeadIds();
  const exclusionsInScope = allIds.filter((id) => excluded.has(id));
  const scopeIds = allIds.filter((id) => !excluded.has(id));

  console.log(`[backfill] exclusion set size = ${exclusionsInScope.length}`);
  console.log(`[backfill] final scope size = ${scopeIds.length}`);

  if (exclusionsInScope.length !== EXPECTED_EXCLUSION_COUNT) {
    throw new Error(
      `[backfill] ABORT: exclusion set size ${exclusionsInScope.length}, expected ${EXPECTED_EXCLUSION_COUNT}`,
    );
  }
  if (scopeIds.length !== EXPECTED_SCOPE_COUNT) {
    throw new Error(
      `[backfill] ABORT: scope size ${scopeIds.length}, expected ${EXPECTED_SCOPE_COUNT}`,
    );
  }

  const preRows = await fetchSnapshot(scopeIds);
  if (preRows.length !== EXPECTED_SCOPE_COUNT) {
    throw new Error(
      `[backfill] ABORT: pre-state row count ${preRows.length}, expected ${EXPECTED_SCOPE_COUNT}`,
    );
  }

  const canonical = preRows.map(canonicalLine).join("\n");
  const hash = await sha256Hex(canonical);
  console.log(`[backfill] pre-state sha256 = ${hash}`);
  if (hash !== EXPECTED_PRESTATE_SHA256) {
    throw new Error(
      `[backfill] ABORT: pre-state hash mismatch. computed ${hash}, expected ${EXPECTED_PRESTATE_SHA256}`,
    );
  }

  const totals: Record<string, number> = {};
  for (const col of RECOMPUTE_COLUMNS) {
    totals[col] = preRows.reduce((acc, r) => {
      const v = r[col];
      if (typeof v === "boolean") return acc + (v ? 1 : 0);
      if (typeof v === "string") return acc;
      return acc + Number(v || 0);
    }, 0);
  }
  console.log("[backfill] pre-state aggregate totals (booleans counted as true-count, payment_status omitted as text):", totals);
  const statusBreakdown: Record<string, number> = {};
  for (const r of preRows) {
    const k = String(r.payment_status ?? "");
    statusBreakdown[k] = (statusBreakdown[k] || 0) + 1;
  }
  console.log("[backfill] pre-state payment_status breakdown:", statusBreakdown);

  const preById = new Map(preRows.map((r) => [String(r.id), r]));

  let processed = 0;
  let written = 0;
  let skipped = 0;
  let indexReached = 0;

  for (const leadId of scopeIds) {
    indexReached += 1;
    const label = `[${indexReached}/${EXPECTED_SCOPE_COUNT}] ${leadId}`;
    try {
      const before = preById.get(leadId) as LeadRow;
      const after = await computeTargets(leadId);
      if (!after) throw new Error("lead row not found during recompute");

      const changed: string[] = [];
      for (const col of RECOMPUTE_COLUMNS) {
        if (!sameValue(before?.[col], after[col])) changed.push(col);
      }

      const beforeLog: Record<string, any> = {};
      const afterLog: Record<string, any> = {};
      for (const col of RECOMPUTE_COLUMNS) {
        beforeLog[col] = before?.[col];
        afterLog[col] = after[col];
      }
      console.log(`${label} before:`, beforeLog);
      console.log(`${label} after:`, afterLog);
      console.log(`${label} changed fields: ${changed.length ? changed.join(", ") : "(none)"}`);

      if (changed.length === 0) {
        skipped += 1;
        processed += 1;
        console.log(`${label} SKIPPED`);
        continue;
      }

      if (dryRun) {
        processed += 1;
        console.log(`${label} DRY-RUN (would write ${changed.length} field(s))`);
        continue;
      }

      await recomputePaidLead(leadId);
      written += 1;
      processed += 1;
      console.log(`${label} WRITTEN`);
    } catch (e) {
      console.error(`[backfill] ABORT at ${label}:`, e);
      throw e;
    }
  }

  const summary: BackfillSummary = { processed, written, skipped, aborted: false, indexReached };
  console.log("[backfill] summary:", summary);
  return summary;
}

// One-off remediation script: console-only entry point, deliberately not in the UI.
if (typeof window !== "undefined") {
  (window as any).__ipcBackfillRecompute = backfillRecomputePaidLeads;
}
