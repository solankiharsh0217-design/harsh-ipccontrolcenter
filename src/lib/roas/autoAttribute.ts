// Orchestrates automatic master-sheet attribution. Reuses the same matching
// algorithm shape as the manual flow so AttributionResultsView renders identically.
import { fetchTabAsRows, resolveSheetCsvUrl } from "./sheetFetch";
import type { SaleDetail } from "@/lib/roasExport";

const DEAL_VALUE = 118000;

export type TabMapping = {
  role: "media_buyer_leads" | "sales" | "ad_spends";
  mediaBuyerName?: string;
  tabName: string;
  tabInput: string; // raw input from user (URL / gid / CSV URL)
};

export type AutoAttribInput = {
  masterSheetUrl: string;
  webinarDate: string;
  salesTab: TabMapping;
  mediaBuyerTabs: TabMapping[];
  adSpends: Record<string, number>; // mediaBuyerName -> spend
  adSpendTab?: TabMapping | null;
};

export type AttrRow = { name: string; spend: number; leads: number; matched: number; revenue: number };

export type AutoAttribResult = {
  rows: AttrRow[];
  salesDetail: SaleDetail[];
  totals: { spend: number; revenue: number; sales: number; leads: number };
  fetchStatus: { tabName: string; ok: boolean; error?: string; rowCount?: number; gid?: string }[];
};

type Person = { name: string; email: string; phone: string };

const cleanPhone = (p: string) =>
  (p || "").replace(/['"+ \-()]/g, "").replace(/^91/, "").replace(/^0/, "").trim();
const normName = (n: string) => (n || "").toLowerCase().trim().replace(/\s+/g, " ");

function findCol(headers: string[], kws: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || "").toLowerCase().trim();
    if (kws.some((k) => h.includes(k))) return i;
  }
  return -1;
}
function getHeader(rows: string[][]) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i].join(" ").toLowerCase();
    if (r.includes("email") || r.includes("name") || r.includes("phone")) return { idx: i, headers: rows[i] };
  }
  return { idx: 0, headers: rows[0] || [] };
}
function extractPeople(rows: string[][]): Person[] {
  const { idx, headers } = getHeader(rows);
  const eC = findCol(headers, ["email", "mail"]);
  const pC = findCol(headers, ["phone", "mobile", "contact", "number", "whatsapp", "mob"]);
  const nC = findCol(headers, ["name", "attendee", "participant", "buyer", "customer", "student"]);
  return rows.slice(idx + 1).map((r) => ({
    name: nC >= 0 ? r[nC] || "" : "",
    email: eC >= 0 ? (r[eC] || "").toLowerCase().trim() : "",
    phone: pC >= 0 ? cleanPhone(r[pC] || "") : "",
  })).filter((p) => p.email || p.phone || p.name);
}
function extractAdSpends(rows: string[][]): Record<string, number> {
  const { idx, headers } = getHeader(rows);
  const nC = findCol(headers, ["media buyer", "buyer", "advertiser", "name"]);
  const sC = findCol(headers, ["spend", "amount spent", "cost"]);
  const out: Record<string, number> = {};
  if (nC < 0 || sC < 0) return out;
  rows.slice(idx + 1).forEach((r) => {
    const n = (r[nC] || "").trim();
    const v = parseFloat((r[sC] || "").replace(/[₹,\s]/g, ""));
    if (n && Number.isFinite(v)) out[n.toLowerCase()] = v;
  });
  return out;
}

export async function runAutoAttribution(
  input: AutoAttribInput,
  onProgress?: (msg: string) => void,
): Promise<AutoAttribResult> {
  const fetchStatus: AutoAttribResult["fetchStatus"] = [];

  // Resolve all tabs
  onProgress?.("Reading master sheet mappings…");
  const allTabs: { mapping: TabMapping; csvUrl?: string; error?: string; gid?: string }[] = [];
  const all = [input.salesTab, ...input.mediaBuyerTabs, ...(input.adSpendTab ? [input.adSpendTab] : [])];
  for (const m of all) {
    const r = resolveSheetCsvUrl(input.masterSheetUrl, m.tabInput);
    if (r.ok) allTabs.push({ mapping: m, csvUrl: r.csvUrl, gid: r.gid });
    else allTabs.push({ mapping: m, error: r.error });
  }

  // Fetch in parallel
  onProgress?.("Fetching media buyer lead tabs…");
  const fetched = await Promise.all(
    allTabs.map(async (t) => {
      if (!t.csvUrl) return { ...t, rows: [] as string[][], err: t.error };
      try {
        const rows = await fetchTabAsRows(t.csvUrl);
        return { ...t, rows, err: undefined as string | undefined };
      } catch (e: any) {
        return { ...t, rows: [] as string[][], err: e?.message || "Fetch failed" };
      }
    }),
  );

  // Index back
  const get = (m: TabMapping) => fetched.find((f) => f.mapping === m)!;

  // Status report
  fetched.forEach((f) => {
    fetchStatus.push({
      tabName: f.mapping.tabName,
      ok: !f.err && f.rows.length > 0,
      error: f.err,
      rowCount: f.rows.length,
      gid: f.gid,
    });
  });

  onProgress?.("Normalizing emails and phone numbers…");
  const salesRes = get(input.salesTab);
  if (salesRes.err || salesRes.rows.length === 0) {
    throw new Error(`Sales tab could not be fetched: ${salesRes.err || "no rows"}`);
  }
  const salesPeople = extractPeople(salesRes.rows);

  const buyerLists = input.mediaBuyerTabs.map((m) => {
    const f = get(m);
    return { name: m.mediaBuyerName || m.tabName, tab: m, people: f.err ? [] : extractPeople(f.rows) };
  });

  // Ad spends — fetched override
  let spends = { ...input.adSpends };
  if (input.adSpendTab) {
    const f = get(input.adSpendTab);
    if (!f.err) {
      const map = extractAdSpends(f.rows);
      buyerLists.forEach((b) => {
        const v = map[b.name.toLowerCase()];
        if (v != null && (spends[b.name] == null || spends[b.name] === 0)) spends[b.name] = v;
      });
    }
  }

  onProgress?.("Matching sales by email, phone, name…");
  const tally: AttrRow[] = buyerLists.map((b) => ({
    name: b.name,
    spend: spends[b.name] || 0,
    leads: b.people.length,
    matched: 0,
    revenue: 0,
  }));
  const salesDetail: SaleDetail[] = [];

  salesPeople.forEach((sale) => {
    let attrIdx = -1;
    let method: SaleDetail["matchMethod"] = "unmatched";
    for (let i = 0; i < buyerLists.length; i++) {
      const list = buyerLists[i].people;
      if (sale.email && list.find((p) => p.email && p.email === sale.email)) { attrIdx = i; method = "email"; break; }
      if (sale.phone && sale.phone.length >= 8 && list.find((p) => p.phone && p.phone === sale.phone)) { attrIdx = i; method = "phone"; break; }
      if (sale.name && sale.name.length > 2) {
        const sn = normName(sale.name);
        const m = list.find((p) => {
          const pn = normName(p.name); if (!pn) return false;
          if (pn === sn) return true;
          const sp = sn.split(" "), pp = pn.split(" ");
          return sp.some((s) => s.length > 3 && pp.some((q) => q === s));
        });
        if (m) { attrIdx = i; method = "name"; break; }
      }
    }
    if (attrIdx >= 0) {
      tally[attrIdx].matched++;
      tally[attrIdx].revenue += DEAL_VALUE;
      salesDetail.push({
        name: sale.name, email: sale.email, phone: sale.phone,
        attributedTo: tally[attrIdx].name, matchMethod: method,
        revenue: DEAL_VALUE, webinarDate: input.webinarDate,
      });
    } else {
      salesDetail.push({
        name: sale.name, email: sale.email, phone: sale.phone,
        attributedTo: null, matchMethod: "unmatched",
        revenue: 0, webinarDate: input.webinarDate,
      });
    }
  });

  onProgress?.("Calculating media buyer ROAS…");
  const totals = {
    spend: tally.reduce((a, b) => a + b.spend, 0),
    revenue: tally.reduce((a, b) => a + b.revenue, 0),
    sales: tally.reduce((a, b) => a + b.matched, 0),
    leads: tally.reduce((a, b) => a + b.leads, 0),
  };
  return { rows: tally, salesDetail, totals, fetchStatus };
}
