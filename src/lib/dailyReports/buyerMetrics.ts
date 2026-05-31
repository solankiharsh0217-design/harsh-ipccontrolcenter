// Shared media-buyer aggregation for Daily Reports.
// USED BY: DailyHistoryView (buyer filter), MediaBuyerComparisonView, exports, summaries.
// RULE: Buyer CPL = sum(buyer spend) / sum(buyer leads). Never average daily CPLs.
//       Multi-buyer "combined" rows that lack a per-buyer split are EXCLUDED from
//       individual buyer totals by default (toggleable via includeUnallocatedCombined).
//       All spend values are normalized to GST-inclusive (gross) so values match
//       Comparison and other ROAS surfaces.

import { normalizeMediaBuyerListSync } from "@/lib/mediaBuyers";
import { getGstAwareAdSpend } from "@/lib/roas/gst";

export type BuyerSplit = { name: string; spend: number; leads: number };

export type ReportLike = {
  id: string;
  date: string;
  name?: string;
  notes?: string;
  template?: string | null;
  adAccounts?: string[];
  totalSpend: number;
  totalLeads: number;
  mediaBuyers: BuyerSplit[];
};

export type ExcludedReport = { id: string; date: string; reason: string };

export type BuyerMetrics = {
  buyer: string | null;
  spend: number;
  leads: number;
  cpl: number | null;
  reportIdsIncluded: string[];
  reportsExcluded: ExcludedReport[];
  perDate: { date: string; spend: number; leads: number; cpl: number | null }[];
  hadCombinedReports: number;
  formula: string;
};

const norm = (s: string) => (s || "").trim().toLowerCase();

function toGross(raw: number): number {
  return getGstAwareAdSpend({ total_ad_spend: Number(raw) || 0 }).grossAdSpend;
}

export type BuyerMetricsOptions = {
  reports: ReportLike[];
  buyer?: string | null;
  from?: string;
  to?: string;
  account?: string;
  template?: string;
  search?: string;
  /** If true, multi-buyer "combined" rows are added in full to the buyer's totals. */
  includeUnallocatedCombined?: boolean;
};

/**
 * Resolve a single report's contribution to a buyer.
 * Returns null when the report doesn't apply, plus the reason.
 */
export function resolveReportForBuyer(
  r: ReportLike,
  buyer: string | null,
  includeUnallocatedCombined: boolean,
): { spend: number; leads: number; isCombined: boolean; matched: boolean; reason?: string } {
  if (!buyer) {
    return {
      spend: toGross(Number(r.totalSpend) || 0),
      leads: Number(r.totalLeads) || 0,
      isCombined: (r.mediaBuyers || []).length > 1,
      matched: true,
    };
  }
  const b = norm(buyer);
  const mbs = r.mediaBuyers || [];

  // Exact per-buyer row (single canonical name == buyer).
  const exact = mbs.find((m) => {
    const split = normalizeMediaBuyerListSync(m.name);
    return split.length === 1 && norm(split[0]) === b;
  });
  if (exact) {
    return {
      spend: toGross(Number(exact.spend) || 0),
      leads: Number(exact.leads) || 0,
      isCombined: false,
      matched: true,
    };
  }

  // Combined multi-buyer row containing this buyer.
  const combined = mbs.find((m) => {
    const split = normalizeMediaBuyerListSync(m.name);
    return split.length > 1 && split.some((n) => norm(n) === b);
  });
  if (combined) {
    if (includeUnallocatedCombined) {
      return {
        spend: toGross(Number(combined.spend) || 0),
        leads: Number(combined.leads) || 0,
        isCombined: true,
        matched: true,
      };
    }
    return {
      spend: 0, leads: 0, isCombined: true, matched: false,
      reason: "Combined / buyer-level split unavailable",
    };
  }

  return { spend: 0, leads: 0, isCombined: false, matched: false, reason: "Buyer not in report" };
}

export function calculateBuyerMetrics(opts: BuyerMetricsOptions): BuyerMetrics {
  const { reports, from, to, account, template, search } = opts;
  const buyer = opts.buyer && opts.buyer.trim() ? opts.buyer.trim() : null;
  const includeUnallocated = !!opts.includeUnallocatedCombined;
  const q = (search || "").trim().toLowerCase();
  const acc = (account || "").trim().toLowerCase();

  const filtered: ReportLike[] = [];
  for (const r of reports) {
    if (from && r.date < from) continue;
    if (to && r.date > to) continue;
    if (acc && !(r.adAccounts || []).some((a) => (a || "").trim().toLowerCase() === acc)) continue;
    if (template && r.template !== template) continue;
    if (q) {
      const hay = `${r.name || ""} ${r.notes || ""} ${(r.adAccounts || []).join(" ")} ${r.template || ""} ${r.date}`.toLowerCase();
      const bs = (r.mediaBuyers || []).map((m) => m.name).join(" ").toLowerCase();
      if (!hay.includes(q) && !bs.includes(q)) continue;
    }
    filtered.push(r);
  }

  let spend = 0, leads = 0, hadCombined = 0;
  const included: string[] = [];
  const excluded: ExcludedReport[] = [];
  const perDateMap = new Map<string, { date: string; spend: number; leads: number }>();

  for (const r of filtered) {
    const res = resolveReportForBuyer(r, buyer, includeUnallocated);
    if (!res.matched) {
      excluded.push({ id: r.id, date: r.date, reason: res.reason || "Not matched" });
      continue;
    }
    if (res.isCombined) hadCombined++;
    spend += res.spend; leads += res.leads;
    included.push(r.id);
    const e = perDateMap.get(r.date) || { date: r.date, spend: 0, leads: 0 };
    e.spend += res.spend; e.leads += res.leads;
    perDateMap.set(r.date, e);
  }

  const cpl = leads > 0 ? spend / leads : null;
  const perDate = Array.from(perDateMap.values())
    .map((d) => ({ ...d, cpl: d.leads ? d.spend / d.leads : null }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    buyer,
    spend, leads, cpl,
    reportIdsIncluded: included,
    reportsExcluded: excluded,
    perDate,
    hadCombinedReports: hadCombined,
    formula: `CPL = totalSpend(${spend.toFixed(2)}) / totalLeads(${leads}) = ${cpl == null ? "n/a" : cpl.toFixed(2)}`,
  };
}
