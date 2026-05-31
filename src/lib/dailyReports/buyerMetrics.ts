// Shared media-buyer aggregation for Daily Reports.
// USED BY: DailyHistoryView (buyer filter), MediaBuyerComparisonView, exports, summaries.
//
// RULES:
// - Buyer CPL = sum(buyer spend) / sum(buyer leads). Never average daily CPLs.
// - Multi-buyer "combined" rows that lack a per-buyer split are EXCLUDED from
//   individual buyer totals by default (toggleable via includeUnallocatedCombined).
// - Spend basis is EXPLICIT — caller picks "net" (platform spend, default) or
//   "gross" (GST-inclusive). The helper NEVER silently normalizes to gross.

import { normalizeMediaBuyerListSync } from "@/lib/mediaBuyers";
import { getGstAwareAdSpend } from "@/lib/roas/gst";

export type SpendBasis = "net" | "gross";

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
  spendBasis: SpendBasis;
  spend: number;
  leads: number;
  cpl: number | null;
  netSpend: number;
  grossSpend: number;
  gstAmount: number;
  cplNet: number | null;
  cplGross: number | null;
  reportIdsIncluded: string[];
  reportsExcluded: ExcludedReport[];
  perDate: { date: string; spend: number; leads: number; cpl: number | null }[];
  hadCombinedReports: number;
  formula: string;
};

const norm = (s: string) => (s || "").trim().toLowerCase();

/** Returns net+gross+gst for a raw entered spend value, using saved tax metadata when present. */
function splitSpend(raw: number): { net: number; gross: number; gst: number } {
  const r = getGstAwareAdSpend({ total_ad_spend: Number(raw) || 0 });
  return { net: r.netAdSpend, gross: r.grossAdSpend, gst: r.gstAmount };
}

function pickByBasis(raw: number, basis: SpendBasis): number {
  const s = splitSpend(raw);
  return basis === "gross" ? s.gross : s.net;
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
  /** Default "net" — platform spend excluding GST. Set "gross" for GST-inclusive. */
  spendBasis?: SpendBasis;
};

/**
 * Resolve a single report's contribution to a buyer for a given spend basis.
 */
export function resolveReportForBuyer(
  r: ReportLike,
  buyer: string | null,
  includeUnallocatedCombined: boolean,
  spendBasis: SpendBasis = "net",
): { spend: number; leads: number; isCombined: boolean; matched: boolean; reason?: string } {
  if (!buyer) {
    return {
      spend: pickByBasis(Number(r.totalSpend) || 0, spendBasis),
      leads: Number(r.totalLeads) || 0,
      isCombined: (r.mediaBuyers || []).length > 1,
      matched: true,
    };
  }
  const b = norm(buyer);
  const mbs = r.mediaBuyers || [];

  const exact = mbs.find((m) => {
    const split = normalizeMediaBuyerListSync(m.name);
    return split.length === 1 && norm(split[0]) === b;
  });
  if (exact) {
    return {
      spend: pickByBasis(Number(exact.spend) || 0, spendBasis),
      leads: Number(exact.leads) || 0,
      isCombined: false,
      matched: true,
    };
  }

  const combined = mbs.find((m) => {
    const split = normalizeMediaBuyerListSync(m.name);
    return split.length > 1 && split.some((n) => norm(n) === b);
  });
  if (combined) {
    if (includeUnallocatedCombined) {
      return {
        spend: pickByBasis(Number(combined.spend) || 0, spendBasis),
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
  const spendBasis: SpendBasis = opts.spendBasis === "gross" ? "gross" : "net";
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

  let netSpend = 0, grossSpend = 0, gstAmount = 0, leads = 0, hadCombined = 0;
  const included: string[] = [];
  const excluded: ExcludedReport[] = [];
  const perDateMap = new Map<string, { date: string; spend: number; leads: number }>();

  for (const r of filtered) {
    // Determine matched/combined status using the basis-agnostic path.
    const probe = resolveReportForBuyer(r, buyer, includeUnallocated, "net");
    if (!probe.matched) {
      excluded.push({ id: r.id, date: r.date, reason: probe.reason || "Not matched" });
      continue;
    }
    // Compute net + gross from the raw entered figure that probe used.
    // We re-derive raw by getting the matching record again.
    let rawSpend = 0;
    if (!buyer) {
      rawSpend = Number(r.totalSpend) || 0;
    } else {
      const b = norm(buyer);
      const mbs = r.mediaBuyers || [];
      const exact = mbs.find((m) => {
        const split = normalizeMediaBuyerListSync(m.name);
        return split.length === 1 && norm(split[0]) === b;
      });
      if (exact) rawSpend = Number(exact.spend) || 0;
      else {
        const combined = mbs.find((m) => {
          const split = normalizeMediaBuyerListSync(m.name);
          return split.length > 1 && split.some((n) => norm(n) === b);
        });
        if (combined && includeUnallocated) rawSpend = Number(combined.spend) || 0;
      }
    }
    const s = splitSpend(rawSpend);
    if (probe.isCombined) hadCombined++;
    netSpend += s.net;
    grossSpend += s.gross;
    gstAmount += s.gst;
    leads += probe.leads;
    included.push(r.id);
    const chosen = spendBasis === "gross" ? s.gross : s.net;
    const e = perDateMap.get(r.date) || { date: r.date, spend: 0, leads: 0 };
    e.spend += chosen; e.leads += probe.leads;
    perDateMap.set(r.date, e);
  }

  const cplNet = leads > 0 ? netSpend / leads : null;
  const cplGross = leads > 0 ? grossSpend / leads : null;
  const spend = spendBasis === "gross" ? grossSpend : netSpend;
  const cpl = spendBasis === "gross" ? cplGross : cplNet;

  const perDate = Array.from(perDateMap.values())
    .map((d) => ({ ...d, cpl: d.leads ? d.spend / d.leads : null }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const basisLabel = spendBasis === "gross" ? "Gross / GST-Inclusive" : "Net / Platform";
  return {
    buyer,
    spendBasis,
    spend, leads, cpl,
    netSpend, grossSpend, gstAmount,
    cplNet, cplGross,
    reportIdsIncluded: included,
    reportsExcluded: excluded,
    perDate,
    hadCombinedReports: hadCombined,
    formula: `CPL (${basisLabel}) = ${spend.toFixed(2)} / ${leads} = ${cpl == null ? "n/a" : cpl.toFixed(2)}`,
  };
}
