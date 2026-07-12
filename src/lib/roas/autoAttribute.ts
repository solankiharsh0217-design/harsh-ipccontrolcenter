// Thin orchestrator that fetches Google-Sheet tabs into rows and delegates
// matching to the deterministic shared engine.

import { fetchTabAsRows, resolveSheetCsvUrl } from "./sheetFetch";
import {
  calculateAttribution,
  toLegacyPayload,
  DEAL_VALUE,
  type AttributionResult,
  type AttributionSnapshot,
  type ColumnMapping as EngineColumnMapping,
  type RevenueConfig,
} from "./attributionEngine";
import type { SaleDetail } from "@/lib/roasExport";

export type ColumnOverride = EngineColumnMapping & {
  paymentDate?: string | null;
  registrationDate?: string | null;
  webinarName?: string | null;
  source?: string | null;
};

export type TabMapping = {
  role: "media_buyer_leads" | "sales" | "ad_spends";
  mediaBuyerName?: string;
  tabName: string;
  tabInput: string; // raw input — URL / gid / CSV URL
  columnOverride?: ColumnOverride | null;
};

export type AutoAttribInput = {
  masterSheetUrl: string;
  webinarDate: string;
  salesTab: TabMapping;
  mediaBuyerTabs: TabMapping[];
  adSpends: Record<string, number>;
  adSpendTab?: TabMapping | null;
  // optional: caller may override the priority order; otherwise insertion order
  mediaBuyerOrder?: string[];
  revenueConfig?: RevenueConfig | null;
};

export type AttrRow = { name: string; spend: number; leads: number; matched: number; revenue: number };

export type AutoAttribResult = {
  rows: AttrRow[];
  salesDetail: SaleDetail[];
  totals: { spend: number; revenue: number; sales: number; leads: number };
  fetchStatus: { tabName: string; ok: boolean; error?: string; rowCount?: number; gid?: string }[];
  engineResult: AttributionResult;
};

function newCalcId() {
  return "calc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
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
    else allTabs.push({ mapping: m, error: (r as { ok: false; error: string }).error });
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

  const get = (m: TabMapping) => fetched.find((f) => f.mapping === m)!;
  fetched.forEach((f) => {
    fetchStatus.push({
      tabName: f.mapping.tabName, ok: !f.err && f.rows.length > 0,
      error: f.err, rowCount: f.rows.length, gid: f.gid,
    });
  });

  const salesRes = get(input.salesTab);
  if (salesRes.err || salesRes.rows.length === 0) {
    throw new Error(`Sales tab could not be fetched: ${salesRes.err || "no rows"}`);
  }

  // Build snapshot
  onProgress?.("Building deterministic snapshot…");
  const mediaBuyers = input.mediaBuyerTabs.map((m, i) => {
    const f = get(m);
    return {
      id: `auto:${m.tabName}:${i}`,
      name: (m.mediaBuyerName || m.tabName).toLowerCase(),
      displayName: m.mediaBuyerName || m.tabName,
      sourceType: "google_sheet_auto_fetch" as const,
      sourceName: m.tabName,
      adSpend: input.adSpends[m.mediaBuyerName || m.tabName] || 0,
      sheet: { rows: f.rows ? [...f.rows] : [], columnMapping: m.columnOverride || null },
    };
  });

  const order = input.mediaBuyerOrder && input.mediaBuyerOrder.length === mediaBuyers.length
    ? input.mediaBuyerOrder
    : mediaBuyers.map((m) => m.id);

  const snapshot: AttributionSnapshot = {
    calculationId: newCalcId(),
    calculationMethod: "automatic_master_sheet",
    webinarDetails: {},
    webinarDate: input.webinarDate,
    mediaBuyerOrder: order,
    mediaBuyers,
    sales: {
      sourceName: input.salesTab.tabName,
      sourceType: "google_sheet_auto_fetch",
      sheet: { rows: [...salesRes.rows], columnMapping: input.salesTab.columnOverride || null },
    },
    dealValue: DEAL_VALUE,
  };

  onProgress?.("Calculating attribution…");
  const engineResult = calculateAttribution(snapshot);
  const legacy = toLegacyPayload(engineResult, {
    webinarName: "", webinarDate: input.webinarDate, webinarType: "",
  });

  // eslint-disable-next-line no-console
  console.debug("[ROAS] auto calc", {
    calcId: engineResult.calculationId,
    inputHash: engineResult.inputSnapshotHash,
    outputHash: engineResult.outputHash,
    salesRows: engineResult.summary.totalSales,
    leads: engineResult.summary.totalLeads,
    order,
  });

  return {
    rows: legacy.rows,
    salesDetail: legacy.salesDetail,
    totals: legacy.totals,
    fetchStatus,
    engineResult,
  };
}
