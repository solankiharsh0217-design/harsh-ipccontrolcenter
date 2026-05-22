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

// ──────────────────────────────────────────────────────────────────────────
// System-wide GST-aware helpers (PART 2 of GST audit)
// Aliases that accept the human-readable mode names used across the app:
//   "excludes_gst" | "exclusive"   → ad spend entered net of GST
//   "includes_gst" | "inclusive"   → ad spend entered gross of GST
//   "no_gst"       | "none"        → no GST applied
// ──────────────────────────────────────────────────────────────────────────

export type TaxModeAlias =
  | AdSpendTaxMode
  | "excludes_gst"
  | "includes_gst"
  | "no_gst";

export function normalizeTaxMode(mode: TaxModeAlias | string | null | undefined): AdSpendTaxMode {
  const m = String(mode || "").toLowerCase();
  if (m === "inclusive" || m === "includes_gst") return "inclusive";
  if (m === "none" || m === "no_gst") return "none";
  return "exclusive"; // default + alias for "excludes_gst"
}

/** Safely parse currency strings like "₹4,01,484", "4,01,484", "  401484  ", numbers, null. */
export function parseCurrencyValue(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^\d.\-]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export type GstAwareSpend = {
  enteredSpend: number;
  netAdSpend: number;
  gstRate: number;
  gstAmount: number;
  grossAdSpend: number;
  taxMode: AdSpendTaxMode;
};

export function calculateGstAwareSpend(input: {
  enteredSpend: unknown;
  taxMode?: TaxModeAlias | string | null;
  gstRate?: unknown;
}): GstAwareSpend {
  const entered = parseCurrencyValue(input.enteredSpend);
  const mode = normalizeTaxMode(input.taxMode);
  const rate = parseCurrencyValue(input.gstRate);
  const b = computeSpend(entered, mode, rate);
  return {
    enteredSpend: b.entered,
    netAdSpend: b.net,
    gstRate: rate,
    gstAmount: b.gst,
    grossAdSpend: b.gross,
    taxMode: mode,
  };
}

export type GstStatus = "captured" | "estimated_legacy" | "no_gst";

export type GstAwareRecordResult = GstAwareSpend & { gstStatus: GstStatus };

/**
 * Resolve GST-aware spend for a saved or legacy report record.
 * Looks up canonical fields first; falls back to "estimated_legacy" with default rate
 * when the record predates GST capture. Never mutates the record.
 */
export function getGstAwareAdSpend(
  record: Record<string, any> | null | undefined,
  options?: { defaultGstRate?: number; defaultTaxMode?: TaxModeAlias },
): GstAwareRecordResult {
  const defaults = loadGstDefaults();
  const defaultRate = options?.defaultGstRate ?? defaults.gstRate ?? DEFAULT_GST_RATE;
  const defaultMode = normalizeTaxMode(options?.defaultTaxMode ?? defaults.taxMode);
  const r = record || {};

  // Canonical (new reports)
  const totalGross = r.total_gross_ad_spend ?? r.totalGrossAdSpend ?? r.gross_ad_spend ?? r.grossAdSpend;
  const totalNet = r.total_net_ad_spend ?? r.totalNetAdSpend ?? r.net_ad_spend ?? r.netAdSpend;
  const totalGst = r.total_gst_amount ?? r.totalGstAmount ?? r.gst_amount ?? r.gstAmount;
  const savedMode = r.ad_spend_tax_mode ?? r.adSpendTaxMode ?? r.taxMode;
  const savedRate = r.gst_rate ?? r.gstRate;

  if (totalGross != null && totalNet != null) {
    return {
      enteredSpend: parseCurrencyValue(r.total_entered_ad_spend ?? r.total_ad_spend ?? totalNet),
      netAdSpend: parseCurrencyValue(totalNet),
      gstRate: parseCurrencyValue(savedRate ?? defaultRate),
      gstAmount: parseCurrencyValue(totalGst ?? (parseCurrencyValue(totalGross) - parseCurrencyValue(totalNet))),
      grossAdSpend: parseCurrencyValue(totalGross),
      taxMode: normalizeTaxMode(savedMode ?? defaultMode),
      gstStatus: normalizeTaxMode(savedMode ?? defaultMode) === "none" ? "no_gst" : "captured",
    };
  }

  if (savedMode != null) {
    const entered = parseCurrencyValue(r.total_entered_ad_spend ?? r.total_ad_spend ?? r.ad_spend ?? r.adSpend);
    const computed = calculateGstAwareSpend({ enteredSpend: entered, taxMode: savedMode, gstRate: savedRate ?? defaultRate });
    return { ...computed, gstStatus: computed.taxMode === "none" ? "no_gst" : "captured" };
  }

  // Legacy fallback: assume entered spend is net excluding GST at default rate.
  const entered = parseCurrencyValue(r.total_ad_spend ?? r.ad_spend ?? r.adSpend ?? r.spend);
  const computed = calculateGstAwareSpend({ enteredSpend: entered, taxMode: defaultMode, gstRate: defaultRate });
  return { ...computed, gstStatus: defaultMode === "none" ? "no_gst" : "estimated_legacy" };
}

export function calculateRoas(revenue: unknown, grossAdSpend: unknown): number | null {
  const r = parseCurrencyValue(revenue);
  const s = parseCurrencyValue(grossAdSpend);
  if (s <= 0) return null;
  return r / s;
}

export function calculateCpl(grossAdSpend: unknown, leads: unknown): number | null {
  const s = parseCurrencyValue(grossAdSpend);
  const l = parseCurrencyValue(leads);
  if (l <= 0) return null;
  return s / l;
}

export function calculateCostPerSale(grossAdSpend: unknown, sales: unknown): number | null {
  const s = parseCurrencyValue(grossAdSpend);
  const n = parseCurrencyValue(sales);
  if (n <= 0) return null;
  return s / n;
}

export const GST_TRUST_NOTE =
  "Financial metrics use Gross Ad Spend including GST where applicable. Legacy reports estimate GST at the default rate.";

