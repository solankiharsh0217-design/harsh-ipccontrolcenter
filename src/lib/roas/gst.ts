// GST / tax helpers for ROAS ad spend.
// Keeps math centralized so Wizard, Save, Results, Reports, Exports all agree.

export type AdSpendTaxMode = "exclusive" | "inclusive" | "none";
export type RoasSpendBasis = "gross" | "net";

export const DEFAULT_GST_RATE = 18;
export const DEFAULT_TAX_MODE: AdSpendTaxMode = "exclusive";
export const DEFAULT_SPEND_BASIS: RoasSpendBasis = "gross";

const SETTINGS_KEY = "ipc_roas_gst_defaults_v1";

export type GstDefaults = {
  taxMode: AdSpendTaxMode;
  gstRate: number;
  spendBasis: RoasSpendBasis;
};

export function loadGstDefaults(): GstDefaults {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { taxMode: DEFAULT_TAX_MODE, gstRate: DEFAULT_GST_RATE, spendBasis: DEFAULT_SPEND_BASIS };
    const j = JSON.parse(raw);
    return {
      taxMode: (j.taxMode as AdSpendTaxMode) || DEFAULT_TAX_MODE,
      gstRate: Number.isFinite(Number(j.gstRate)) ? Number(j.gstRate) : DEFAULT_GST_RATE,
      spendBasis: (j.spendBasis as RoasSpendBasis) || DEFAULT_SPEND_BASIS,
    };
  } catch {
    return { taxMode: DEFAULT_TAX_MODE, gstRate: DEFAULT_GST_RATE, spendBasis: DEFAULT_SPEND_BASIS };
  }
}

export function saveGstDefaults(d: GstDefaults) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(d)); } catch { /* */ }
}

export type SpendBreakdown = {
  entered: number;
  net: number;
  gst: number;
  gross: number;
};

export function computeSpend(entered: number, mode: AdSpendTaxMode, gstRate: number): SpendBreakdown {
  const e = Number.isFinite(entered) ? Math.max(0, entered) : 0;
  const r = Number.isFinite(gstRate) ? Math.max(0, gstRate) : 0;
  if (mode === "none" || r === 0) {
    return { entered: e, net: e, gst: 0, gross: e };
  }
  if (mode === "inclusive") {
    const net = e / (1 + r / 100);
    const gst = e - net;
    return { entered: e, net, gst, gross: e };
  }
  // exclusive
  const gst = (e * r) / 100;
  return { entered: e, net: e, gst, gross: e + gst };
}

export function effectiveSpendForBasis(b: SpendBreakdown, basis: RoasSpendBasis): number {
  return basis === "net" ? b.net : b.gross;
}

export function taxModeLabel(mode: AdSpendTaxMode): string {
  if (mode === "exclusive") return "Ad Spend Excludes GST";
  if (mode === "inclusive") return "Ad Spend Includes GST";
  return "No GST / Not Applicable";
}
