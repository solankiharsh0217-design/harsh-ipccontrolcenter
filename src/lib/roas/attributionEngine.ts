// Deterministic shared attribution engine.
// Same input + same media buyer order + same column mapping = same output.
// Pure functions only — no React state, no mutation of inputs.

import {
  hashJSON, hashString,
  nameSimilarity, normalizeEmail, normalizeName, normalizePhone, parseRevenue,
} from "./normalize";

export const DEAL_VALUE = 118000;
export const NAME_MATCH_THRESHOLD = 0.85;
export const ENGINE_VERSION = "deterministic_v2_revenue";

export type ColumnMapping = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  amount?: string | null;
};

export type RawSheet = {
  // arbitrary CSV/sheet rows where rows[0] may be header
  rows: string[][];
  columnMapping?: ColumnMapping | null;
};

export type SnapshotMediaBuyer = {
  id: string;            // stable id — for manual: "mb-<n>"; for auto: sheetId
  name: string;          // normalized for matching/comparison
  displayName: string;   // user spelling kept for UI
  sourceType: "manual_upload" | "google_sheet_auto_fetch";
  sourceName: string;    // file name / tab name
  adSpend: number;
  sheet: RawSheet;
};

// Revenue / Product Price configuration. Optional for backward compat.
// When absent, engine falls back to legacy behavior (uses parsed amount col with dealValue fallback).
export type RevenueMode = "fixed_product_price" | "deal_value_from_sheet" | "token_from_sheet";
export type ProductGstMode = "inclusive" | "exclusive";
export type RoasRevenueBasis = "gross" | "net";

export type RevenueConfig = {
  mode: RevenueMode;
  productPrice?: number;              // required when mode === "fixed_product_price"
  productName?: string;
  productGstMode: ProductGstMode;     // default "inclusive"
  productGstPercent: number;          // default 18
  roasRevenueBasis: RoasRevenueBasis; // default "gross"
};

export const DEFAULT_REVENUE_CONFIG: RevenueConfig = {
  mode: "fixed_product_price",
  productPrice: 0,
  productName: "",
  productGstMode: "inclusive",
  productGstPercent: 18,
  roasRevenueBasis: "gross",
};

export type AttributionSnapshot = {
  calculationId: string;
  calculationMethod: "manual" | "automatic_master_sheet";
  webinarDetails: Record<string, unknown>;
  webinarDate: string;
  mediaBuyerOrder: string[]; // ids in priority order
  mediaBuyers: SnapshotMediaBuyer[];
  sales: {
    sourceName: string;
    sourceType: "manual_upload" | "google_sheet_auto_fetch";
    sheet: RawSheet;
  };
  dealValue: number;
  revenueConfig?: RevenueConfig | null;
};

// Break gross <-> net based on GST mode/rate.
export function splitRevenueByGst(
  amount: number,
  gstMode: ProductGstMode,
  gstPercent: number,
): { gross: number; net: number; gst: number } {
  const a = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const r = Number.isFinite(gstPercent) && gstPercent > 0 ? gstPercent : 0;
  if (r === 0) return { gross: a, net: a, gst: 0 };
  if (gstMode === "inclusive") {
    const net = a / (1 + r / 100);
    return { gross: a, net, gst: a - net };
  }
  const gst = (a * r) / 100;
  return { gross: a + gst, net: a, gst };
}

export type NormalizedLead = {
  leadId: string;
  mediaBuyerId: string;
  mediaBuyerDisplay: string;
  sourceName: string;
  rowIndex: number;
  rawName: string;
  rawEmail: string;
  rawPhone: string;
  normalizedName: string;
  normalizedEmail: string;
  normalizedPhone: string;
  phoneWeak: boolean;
  rowHash: string;
};

export type NormalizedSale = {
  saleId: string;
  rowIndex: number;
  rawName: string;
  rawEmail: string;
  rawPhone: string;
  rawAmount: string;
  normalizedName: string;
  normalizedEmail: string;
  normalizedPhone: string;
  phoneWeak: boolean;
  revenue: number;         // basis-preferred revenue used for aggregation & ROAS
  revenueGross: number;
  revenueNet: number;
  revenueGst: number;
  tokenCollected: number;  // parsed from mapped amount col regardless of mode (display only)
  rowHash: string;
};

export type MatchMethod = "email" | "phone" | "name" | "unmatched";

export type AuditRow = {
  saleId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  attributedTo: string | null;
  attributedToMediaBuyerId: string | null;
  matchMethod: MatchMethod;
  matchedLeadId: string | null;
  matchedLeadName: string | null;
  matchedLeadEmail: string | null;
  matchedLeadPhone: string | null;
  sourceMediaBuyer: string | null;
  sourceRowIndex: number | null;
  competingMatches: Array<{ mediaBuyer: string; leadId: string; rowIndex: number }>;
  confidenceScore: number;
  matchReason: string;
  needsReview: boolean;
  revenue: number;           // basis-preferred
  revenueGross: number;
  revenueNet: number;
  revenueGst: number;
  tokenCollected: number;
  webinarDate: string;
};

export type DuplicateConflict = {
  conflictId: string;
  conflictType: "email" | "phone" | "name";
  normalizedValue: string;
  mediaBuyersFound: string[];
  leadRows: Array<{ mediaBuyer: string; leadId: string; rowIndex: number; rawName: string; rawEmail: string; rawPhone: string }>;
  winnerIfMatched: string | null;
  tieBreakerReason: string;
};

export type MediaBuyerBreakdown = {
  mediaBuyerId: string;
  mediaBuyerName: string;       // displayName
  leads: number;
  salesAttributed: number;
  revenue: number;              // basis-preferred (kept for legacy consumers)
  revenueGross: number;
  revenueNet: number;
  revenueGst: number;
  tokenCollected: number;
  adSpend: number;
  cpl: number;
  conversionRate: number;
  roas: number;
};

export type AttributionResult = {
  calculationId: string;
  inputSnapshotHash: string;
  outputHash: string;
  engineVersion: string;
  calculatedAt: string;
  hashes: {
    leadRowsHash: string;
    salesRowsHash: string;
    mediaBuyerOrderHash: string;
    columnMappingHash: string;
  };
  summary: {
    totalLeads: number;
    totalSales: number;
    totalMatchedSales: number;
    totalUnmatchedSales: number;
    totalRevenue: number;
    totalAdSpend: number;
    overallRoas: number;
  };
  mediaBuyerBreakdown: MediaBuyerBreakdown[];
  salesAttribution: AuditRow[];   // every sale, including unmatched
  unmatchedSales: AuditRow[];
  duplicateLeadConflicts: DuplicateConflict[];
  auditLog: AuditRow[];
};

// ---------- Header / column resolution ----------

function findHeaderRow(rows: string[][]): { idx: number; headers: string[] } {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = (rows[i] || []).join(" ").toLowerCase();
    if (r.includes("email") || r.includes("name") || r.includes("phone")) {
      return { idx: i, headers: rows[i] || [] };
    }
  }
  return { idx: 0, headers: rows[0] || [] };
}

function pickCol(headers: string[], kws: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || "").toLowerCase().trim();
    if (kws.some((k) => h.includes(k))) return i;
  }
  return -1;
}

function resolveColumns(headers: string[], override?: ColumnMapping | null): {
  nameCol: number; emailCol: number; phoneCol: number; amountCol: number;
} {
  const findOv = (col?: string | null) => {
    if (!col) return -1;
    const lc = col.toLowerCase().trim();
    return headers.findIndex((h) => (h || "").toLowerCase().trim() === lc);
  };
  const nOv = findOv(override?.name);
  const eOv = findOv(override?.email);
  const pOv = findOv(override?.phone);
  const aOv = findOv(override?.amount);
  return {
    nameCol: nOv >= 0 ? nOv : pickCol(headers, ["name", "attendee", "participant", "buyer", "customer", "student"]),
    emailCol: eOv >= 0 ? eOv : pickCol(headers, ["email", "mail"]),
    phoneCol: pOv >= 0 ? pOv : pickCol(headers, ["phone", "mobile", "contact", "number", "whatsapp", "mob"]),
    amountCol: aOv >= 0 ? aOv : pickCol(headers, ["amount", "revenue", "price", "paid"]),
  };
}

// ---------- Normalization (immutable) ----------

function normalizeMBLeads(mb: SnapshotMediaBuyer): NormalizedLead[] {
  const rows = mb.sheet.rows || [];
  if (rows.length === 0) return [];
  const { idx, headers } = findHeaderRow(rows);
  const cols = resolveColumns(headers, mb.sheet.columnMapping);
  const out: NormalizedLead[] = [];
  for (let i = idx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const rawName = cols.nameCol >= 0 ? (r[cols.nameCol] || "") : "";
    const rawEmail = cols.emailCol >= 0 ? (r[cols.emailCol] || "") : "";
    const rawPhone = cols.phoneCol >= 0 ? (r[cols.phoneCol] || "") : "";
    if (!rawName && !rawEmail && !rawPhone) continue;
    const ph = normalizePhone(rawPhone);
    const lead: NormalizedLead = {
      leadId: `${mb.id}:${i}`,
      mediaBuyerId: mb.id,
      mediaBuyerDisplay: mb.displayName,
      sourceName: mb.sourceName,
      rowIndex: i,
      rawName, rawEmail, rawPhone,
      normalizedName: normalizeName(rawName),
      normalizedEmail: normalizeEmail(rawEmail),
      normalizedPhone: ph.phone,
      phoneWeak: ph.weak,
      rowHash: hashString(`${mb.id}|${i}|${rawName}|${rawEmail}|${rawPhone}`),
    };
    out.push(lead);
  }
  return out;
}

function normalizeSales(snap: AttributionSnapshot): NormalizedSale[] {
  const rows = snap.sales.sheet.rows || [];
  if (rows.length === 0) return [];
  const { idx, headers } = findHeaderRow(rows);
  const cols = resolveColumns(headers, snap.sales.sheet.columnMapping);
  const out: NormalizedSale[] = [];
  for (let i = idx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const rawName = cols.nameCol >= 0 ? (r[cols.nameCol] || "") : "";
    const rawEmail = cols.emailCol >= 0 ? (r[cols.emailCol] || "") : "";
    const rawPhone = cols.phoneCol >= 0 ? (r[cols.phoneCol] || "") : "";
    const rawAmount = cols.amountCol >= 0 ? (r[cols.amountCol] || "") : "";
    if (!rawName && !rawEmail && !rawPhone) continue;
    const ph = normalizePhone(rawPhone);
    out.push({
      saleId: `sale:${i}`,
      rowIndex: i,
      rawName, rawEmail, rawPhone, rawAmount,
      normalizedName: normalizeName(rawName),
      normalizedEmail: normalizeEmail(rawEmail),
      normalizedPhone: ph.phone,
      phoneWeak: ph.weak,
      revenue: parseRevenue(rawAmount, snap.dealValue),
      rowHash: hashString(`sale|${i}|${rawName}|${rawEmail}|${rawPhone}|${rawAmount}`),
    });
  }
  return out;
}

// ---------- Sorted indexes ----------

type LeadSortKey = (l: NormalizedLead) => [number, number, string];

function buildLeadComparator(order: string[]): (a: NormalizedLead, b: NormalizedLead) => number {
  const priority: Record<string, number> = {};
  order.forEach((id, i) => { priority[id] = i; });
  const key: LeadSortKey = (l) => [
    priority[l.mediaBuyerId] ?? Number.MAX_SAFE_INTEGER,
    l.rowIndex,
    l.mediaBuyerDisplay,
  ];
  return (a, b) => {
    const ka = key(a), kb = key(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0;
  };
}

type Indexes = {
  emailIndex: Map<string, NormalizedLead[]>;
  phoneIndex: Map<string, NormalizedLead[]>;
  nameTokenIndex: Map<string, NormalizedLead[]>;
};

function buildIndexes(leads: NormalizedLead[], compare: (a: NormalizedLead, b: NormalizedLead) => number): Indexes {
  const emailIndex = new Map<string, NormalizedLead[]>();
  const phoneIndex = new Map<string, NormalizedLead[]>();
  const nameTokenIndex = new Map<string, NormalizedLead[]>();
  for (const l of leads) {
    if (l.normalizedEmail) {
      const arr = emailIndex.get(l.normalizedEmail) || [];
      arr.push(l); emailIndex.set(l.normalizedEmail, arr);
    }
    if (l.normalizedPhone) {
      const arr = phoneIndex.get(l.normalizedPhone) || [];
      arr.push(l); phoneIndex.set(l.normalizedPhone, arr);
    }
    if (l.normalizedName) {
      // index by each token >=4 for fast candidate lookup
      const tokens = l.normalizedName.split(" ").filter((t) => t.length >= 4);
      for (const t of tokens) {
        const arr = nameTokenIndex.get(t) || [];
        arr.push(l); nameTokenIndex.set(t, arr);
      }
    }
  }
  // Sort every bucket deterministically
  emailIndex.forEach((arr) => arr.sort(compare));
  phoneIndex.forEach((arr) => arr.sort(compare));
  nameTokenIndex.forEach((arr) => arr.sort(compare));
  return { emailIndex, phoneIndex, nameTokenIndex };
}

// ---------- Main engine ----------

export function calculateAttribution(snapshot: AttributionSnapshot): AttributionResult {
  const calculatedAt = new Date().toISOString();

  // 1) Normalize all leads + sales (no mutation of inputs)
  const allLeads: NormalizedLead[] = [];
  for (const mb of snapshot.mediaBuyers) {
    const leads = normalizeMBLeads(mb);
    for (const l of leads) allLeads.push(l);
  }
  const sales = normalizeSales(snapshot);

  // 2) Stable comparator + indexes
  const compare = buildLeadComparator(snapshot.mediaBuyerOrder);
  const idx = buildIndexes(allLeads, compare);

  // 3) Detect duplicate lead conflicts
  const duplicates: DuplicateConflict[] = [];
  const pushDup = (
    type: "email" | "phone" | "name",
    value: string,
    arr: NormalizedLead[],
  ) => {
    const buyers = Array.from(new Set(arr.map((l) => l.mediaBuyerDisplay)));
    if (buyers.length < 2) return;
    duplicates.push({
      conflictId: `${type}:${value}`,
      conflictType: type,
      normalizedValue: value,
      mediaBuyersFound: buyers,
      leadRows: arr.map((l) => ({
        mediaBuyer: l.mediaBuyerDisplay, leadId: l.leadId, rowIndex: l.rowIndex,
        rawName: l.rawName, rawEmail: l.rawEmail, rawPhone: l.rawPhone,
      })),
      winnerIfMatched: arr[0]?.mediaBuyerDisplay ?? null,
      tieBreakerReason: "Same match strength found in multiple media buyer sources. Winner selected based on media buyer priority order.",
    });
  };
  idx.emailIndex.forEach((arr, k) => pushDup("email", k, arr));
  idx.phoneIndex.forEach((arr, k) => pushDup("phone", k, arr));
  // name conflicts: only flag where full normalized name appears in 2+ buyers
  const fullNameMap = new Map<string, NormalizedLead[]>();
  for (const l of allLeads) {
    if (!l.normalizedName) continue;
    const arr = fullNameMap.get(l.normalizedName) || [];
    arr.push(l); fullNameMap.set(l.normalizedName, arr);
  }
  fullNameMap.forEach((arr, k) => {
    arr.sort(compare);
    pushDup("name", k, arr);
  });

  // 4) Strict rounds
  const audits: AuditRow[] = new Array(sales.length);
  const matchedSet = new Set<number>(); // indices of sales matched

  // Round 1: email
  for (let i = 0; i < sales.length; i++) {
    const s = sales[i];
    if (!s.normalizedEmail) continue;
    const candidates = idx.emailIndex.get(s.normalizedEmail);
    if (!candidates || candidates.length === 0) continue;
    const winner = candidates[0];
    audits[i] = makeAudit(s, winner, "email", candidates, snapshot.webinarDate, 1.0,
      `Exact email match found in ${winner.mediaBuyerDisplay} tab.${candidates.length > 1 ? " Multiple matching leads — winner selected by media buyer priority order." : ""}`);
    matchedSet.add(i);
  }

  // Round 2: phone
  for (let i = 0; i < sales.length; i++) {
    if (matchedSet.has(i)) continue;
    const s = sales[i];
    if (!s.normalizedPhone) continue;
    const candidates = idx.phoneIndex.get(s.normalizedPhone);
    if (!candidates || candidates.length === 0) continue;
    const winner = candidates[0];
    const weak = s.phoneWeak || winner.phoneWeak;
    audits[i] = makeAudit(s, winner, "phone", candidates, snapshot.webinarDate, weak ? 0.6 : 0.95,
      `No email match found. Exact phone match found in ${winner.mediaBuyerDisplay} tab.${weak ? " Phone is weak (<10 digits) — flagged for review." : ""}${candidates.length > 1 ? " Multiple matching leads — winner selected by media buyer priority order." : ""}`,
      weak);
    matchedSet.add(i);
  }

  // Round 3: name fuzzy
  for (let i = 0; i < sales.length; i++) {
    if (matchedSet.has(i)) continue;
    const s = sales[i];
    if (!s.normalizedName) continue;
    const tokens = s.normalizedName.split(" ").filter((t) => t.length >= 4);
    if (tokens.length === 0) continue;
    const seen = new Set<string>();
    const candidatePool: NormalizedLead[] = [];
    for (const t of tokens) {
      const arr = idx.nameTokenIndex.get(t);
      if (!arr) continue;
      for (const l of arr) {
        if (seen.has(l.leadId)) continue;
        seen.add(l.leadId);
        candidatePool.push(l);
      }
    }
    if (candidatePool.length === 0) continue;
    // Score each candidate
    type Scored = { lead: NormalizedLead; score: number };
    const scored: Scored[] = candidatePool
      .map((l) => ({ lead: l, score: nameSimilarity(s.normalizedName, l.normalizedName) }))
      .filter((x) => x.score >= NAME_MATCH_THRESHOLD);
    if (scored.length === 0) continue;
    // Highest score; tie → media buyer priority order then rowIndex
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compare(a.lead, b.lead);
    });
    const top = scored[0];
    const competing = scored.filter((x) => x.score === top.score).map((x) => x.lead);
    const needsReview = competing.length > 1 && new Set(competing.map((c) => c.mediaBuyerId)).size > 1;
    audits[i] = makeAudit(s, top.lead, "name", competing, snapshot.webinarDate, top.score,
      `No email or phone match found. Fuzzy name match (score ${top.score.toFixed(2)}) in ${top.lead.mediaBuyerDisplay} tab.${needsReview ? " Multiple equally-strong matches across media buyers — flagged for review, winner by priority order." : ""}`,
      needsReview);
    matchedSet.add(i);
  }

  // Round 4: unmatched
  for (let i = 0; i < sales.length; i++) {
    if (matchedSet.has(i)) continue;
    const s = sales[i];
    audits[i] = {
      saleId: s.saleId,
      buyerName: s.rawName, buyerEmail: s.rawEmail, buyerPhone: s.rawPhone,
      attributedTo: null, attributedToMediaBuyerId: null,
      matchMethod: "unmatched",
      matchedLeadId: null, matchedLeadName: null, matchedLeadEmail: null, matchedLeadPhone: null,
      sourceMediaBuyer: null, sourceRowIndex: null,
      competingMatches: [], confidenceScore: 0,
      matchReason: "No email, phone, or valid name match found in any media buyer tab.",
      needsReview: false,
      revenue: 0,
      webinarDate: snapshot.webinarDate,
    };
  }

  // 5) Aggregate per media buyer
  const leadCountByMB: Record<string, number> = {};
  for (const l of allLeads) leadCountByMB[l.mediaBuyerId] = (leadCountByMB[l.mediaBuyerId] || 0) + 1;
  const breakdown: MediaBuyerBreakdown[] = snapshot.mediaBuyerOrder.map((mbId) => {
    const mb = snapshot.mediaBuyers.find((m) => m.id === mbId)!;
    const matched = audits.filter((a) => a.attributedToMediaBuyerId === mbId);
    const sales = matched.length;
    const revenue = matched.reduce((acc, a) => acc + a.revenue, 0);
    const leads = leadCountByMB[mbId] || 0;
    const adSpend = mb.adSpend || 0;
    return {
      mediaBuyerId: mbId,
      mediaBuyerName: mb.displayName,
      leads, salesAttributed: sales, revenue, adSpend,
      cpl: leads > 0 ? adSpend / leads : 0,
      conversionRate: leads > 0 ? (sales / leads) * 100 : 0,
      roas: adSpend > 0 ? revenue / adSpend : 0,
    };
  });

  const totalLeads = breakdown.reduce((a, b) => a + b.leads, 0);
  const totalSales = audits.length;
  const totalMatched = audits.filter((a) => a.matchMethod !== "unmatched").length;
  const totalRevenue = breakdown.reduce((a, b) => a + b.revenue, 0);
  const totalAdSpend = breakdown.reduce((a, b) => a + b.adSpend, 0);

  // 6) Hashes
  const leadRowsHash = hashJSON(snapshot.mediaBuyers.map((mb) => ({ id: mb.id, rows: mb.sheet.rows })));
  const salesRowsHash = hashJSON(snapshot.sales.sheet.rows);
  const mediaBuyerOrderHash = hashJSON(snapshot.mediaBuyerOrder);
  const columnMappingHash = hashJSON({
    sales: snapshot.sales.sheet.columnMapping || null,
    buyers: snapshot.mediaBuyers.map((m) => ({ id: m.id, mapping: m.sheet.columnMapping || null })),
  });
  const inputSnapshotHash = hashString([leadRowsHash, salesRowsHash, mediaBuyerOrderHash, columnMappingHash].join("|"));
  const outputCore = audits.map((a) => `${a.saleId}|${a.attributedToMediaBuyerId || ""}|${a.matchMethod}|${a.matchedLeadId || ""}`).join("\n");
  const outputHash = hashString(outputCore);

  return {
    calculationId: snapshot.calculationId,
    inputSnapshotHash,
    outputHash,
    engineVersion: ENGINE_VERSION,
    calculatedAt,
    hashes: { leadRowsHash, salesRowsHash, mediaBuyerOrderHash, columnMappingHash },
    summary: {
      totalLeads,
      totalSales,
      totalMatchedSales: totalMatched,
      totalUnmatchedSales: totalSales - totalMatched,
      totalRevenue,
      totalAdSpend,
      overallRoas: totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0,
    },
    mediaBuyerBreakdown: breakdown,
    salesAttribution: audits,
    unmatchedSales: audits.filter((a) => a.matchMethod === "unmatched"),
    duplicateLeadConflicts: duplicates,
    auditLog: audits,
  };
}

function makeAudit(
  s: NormalizedSale,
  winner: NormalizedLead,
  method: MatchMethod,
  candidates: NormalizedLead[],
  webinarDate: string,
  confidence: number,
  reason: string,
  needsReview = false,
): AuditRow {
  return {
    saleId: s.saleId,
    buyerName: s.rawName, buyerEmail: s.rawEmail, buyerPhone: s.rawPhone,
    attributedTo: winner.mediaBuyerDisplay,
    attributedToMediaBuyerId: winner.mediaBuyerId,
    matchMethod: method,
    matchedLeadId: winner.leadId,
    matchedLeadName: winner.rawName,
    matchedLeadEmail: winner.rawEmail,
    matchedLeadPhone: winner.rawPhone,
    sourceMediaBuyer: winner.mediaBuyerDisplay,
    sourceRowIndex: winner.rowIndex,
    competingMatches: candidates
      .filter((c) => c.leadId !== winner.leadId)
      .slice(0, 10)
      .map((c) => ({ mediaBuyer: c.mediaBuyerDisplay, leadId: c.leadId, rowIndex: c.rowIndex })),
    confidenceScore: Number(confidence.toFixed(3)),
    matchReason: reason,
    needsReview,
    revenue: s.revenue,
    webinarDate,
  };
}

// ---------- Adapter to legacy AttributionPayload (for AttributionResultsView) ----------

import type { AttrRow, AttributionPayload, SaleDetail } from "@/lib/roasExport";

export function toLegacyPayload(
  result: AttributionResult,
  meta: { webinarName: string; webinarDate: string; webinarType: string },
): AttributionPayload {
  const rows: AttrRow[] = result.mediaBuyerBreakdown.map((b) => ({
    name: b.mediaBuyerName,
    spend: b.adSpend,
    leads: b.leads,
    matched: b.salesAttributed,
    revenue: b.revenue,
  }));
  const salesDetail: SaleDetail[] = result.auditLog.map((a) => ({
    name: a.buyerName, email: a.buyerEmail, phone: a.buyerPhone,
    attributedTo: a.attributedTo, matchMethod: a.matchMethod,
    revenue: a.revenue, webinarDate: a.webinarDate,
  }));
  return {
    webinarName: meta.webinarName,
    webinarDate: meta.webinarDate,
    webinarType: meta.webinarType,
    totals: {
      spend: result.summary.totalAdSpend,
      revenue: result.summary.totalRevenue,
      sales: result.summary.totalMatchedSales,
      leads: result.summary.totalLeads,
    },
    rows,
    salesDetail,
  };
}
