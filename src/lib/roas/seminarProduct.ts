// Seminar ROAS — product pricing & GST helpers.
// Shared between Step 1 selection UI, Step 4 sales entry (Part 2), and Step 5 summaries.
// Reuses program_products as the canonical catalogue. Never mutates catalogue rows.

import { supabase } from "@/integrations/supabase/client";

export type ProductGstMode = "includes_gst" | "excludes_gst";
export type SeminarRevenueBasis = "gross_revenue" | "net_revenue" | "cash_collected";

export const REVENUE_BASIS_LABEL: Record<SeminarRevenueBasis, string> = {
  gross_revenue: "Gross Revenue",
  net_revenue: "Net Revenue",
  cash_collected: "Cash Collected",
};

export const REVENUE_BASIS_HELP: Record<SeminarRevenueBasis, string> = {
  gross_revenue: "Uses the full sale value including GST.",
  net_revenue: "Uses the sale value excluding GST.",
  cash_collected: "Uses only payments actually collected.",
};

export type CatalogProduct = {
  id: string;
  product_name: string;
  business_unit: string | null;
  program_id: string | null;
  product_price_including_gst: number;
  gst_applicable: boolean;
  gst_rate: number;
  is_active: boolean;
};

/** Selection row on the Seminar wizard. Report-level values may override catalogue defaults. */
export type SeminarProductRow = {
  // client-side id used for React key + duplicate detection
  rowKey: string;
  productId: string | null;              // null while user is typing a brand-new one
  productName: string;
  programme: string | null;              // snapshot of business unit / programme
  unitPrice: number;                     // what user entered (interpreted by gstMode)
  gstMode: ProductGstMode;
  gstPercent: number;
  isPriceTier: boolean;                  // user opted into a duplicate as a separate tier
};

export function emptySeminarProductRow(): SeminarProductRow {
  return {
    rowKey: cryptoRandomId(),
    productId: null,
    productName: "",
    programme: null,
    unitPrice: 0,
    gstMode: "excludes_gst",
    gstPercent: 18,
    isPriceTier: false,
  };
}

export function cryptoRandomId(): string {
  try {
    // @ts-ignore
    return crypto.randomUUID();
  } catch {
    return "row-" + Math.random().toString(36).slice(2, 10);
  }
}

/**
 * Compute per-sale gross/net/GST for a given entered price.
 * Rules:
 *   excludes_gst: entered = Net.  Gross = Net × (1 + rate/100).  GST = Gross − Net.
 *   includes_gst: entered = Gross. Net = Gross ÷ (1 + rate/100). GST = Gross − Net.
 * If gstPercent is 0 or invalid, gross = net = entered, gst = 0.
 */
export function computeProductGst(
  price: number,
  mode: ProductGstMode,
  gstPercent: number,
): { gross: number; net: number; gst: number } {
  const p = Number.isFinite(price) && price > 0 ? price : 0;
  const r = Number.isFinite(gstPercent) && gstPercent > 0 ? gstPercent : 0;
  if (r === 0 || p === 0) return { gross: p, net: p, gst: 0 };
  if (mode === "includes_gst") {
    const net = p / (1 + r / 100);
    return { gross: p, net, gst: p - net };
  }
  const gst = (p * r) / 100;
  return { gross: p + gst, net: p, gst };
}

/** For a product, revenue-per-sale on the chosen ROAS basis (used later by Step 4/5 in Part 2). */
export function revenuePerSale(
  price: number,
  mode: ProductGstMode,
  gstPercent: number,
  basis: SeminarRevenueBasis,
): number {
  const { gross, net } = computeProductGst(price, mode, gstPercent);
  // cash_collected has no product-price basis of its own — Part 2 sums collected payments
  // directly. Here we fall back to gross so previews are never zero.
  if (basis === "net_revenue") return net;
  return gross;
}

// ─────────────────────────────────────────────────────────────
// Catalogue access (reuses program_products; RLS-enforced)
// ─────────────────────────────────────────────────────────────

export async function listActiveCatalogProducts(): Promise<CatalogProduct[]> {
  const { data, error } = await (supabase as any)
    .from("program_products")
    .select("id, product_name, business_unit, program_id, product_price_including_gst, gst_applicable, gst_rate, is_active, is_deleted")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .order("product_name", { ascending: true });
  if (error) throw error;
  return (data || []) as CatalogProduct[];
}

export async function listAllCatalogProductsForAdmin(): Promise<CatalogProduct[]> {
  const { data, error } = await (supabase as any)
    .from("program_products")
    .select("id, product_name, business_unit, program_id, product_price_including_gst, gst_applicable, gst_rate, is_active, is_deleted")
    .eq("is_deleted", false)
    .order("is_active", { ascending: false })
    .order("product_name", { ascending: true });
  if (error) throw error;
  return (data || []) as CatalogProduct[];
}

export type CatalogUpsertInput = {
  id?: string | null;
  product_name: string;
  business_unit?: string | null;
  price: number;
  gstMode: ProductGstMode;
  gstPercent: number;
  is_active?: boolean;
};

/**
 * Create or update a catalogue product.
 * We store the price as `product_price_including_gst` (existing column semantics),
 * converting from the entered value based on gstMode so the catalogue stays consistent.
 */
export async function upsertCatalogProduct(input: CatalogUpsertInput, userId: string | null): Promise<CatalogProduct> {
  const { gross } = computeProductGst(input.price, input.gstMode, input.gstPercent);
  const row: any = {
    product_name: input.product_name.trim(),
    business_unit: (input.business_unit || "IPC").trim() || "IPC",
    product_price_including_gst: gross,
    gst_applicable: input.gstPercent > 0,
    gst_rate: input.gstPercent,
    is_active: input.is_active ?? true,
  };
  if (input.id) {
    const { data, error } = await (supabase as any)
      .from("program_products")
      .update(row)
      .eq("id", input.id)
      .select()
      .single();
    if (error) throw error;
    return data as CatalogProduct;
  }
  row.created_by = userId ?? null;
  const { data, error } = await (supabase as any)
    .from("program_products")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as CatalogProduct;
}

export async function archiveCatalogProduct(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("program_products")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreCatalogProduct(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("program_products")
    .update({ is_active: true })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Detect duplicate selections that are not explicitly marked as price tiers.
 * Two rows collide when they share productId (or productName+price if unlinked).
 */
export function findDuplicateRow(rows: SeminarProductRow[]): number {
  const seen = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.isPriceTier) continue;
    const key = r.productId
      ? `id:${r.productId}`
      : `nm:${r.productName.trim().toLowerCase()}|${r.unitPrice}|${r.gstMode}`;
    if (!r.productName.trim()) continue;
    if (seen.has(key)) return i;
    seen.set(key, i);
  }
  return -1;
}

/** Step 1 gate — returns first error message or null. */
export function validateSeminarProducts(rows: SeminarProductRow[]): string | null {
  const active = rows.filter((r) => r.productName.trim() || r.unitPrice > 0);
  if (active.length === 0) return "Add at least one product or offer.";
  for (const r of active) {
    if (!r.productName.trim()) return "Enter a valid product name.";
    if (!(r.unitPrice > 0)) return "Enter a valid product price.";
    if (r.gstMode !== "includes_gst" && r.gstMode !== "excludes_gst")
      return "Select whether the product price includes or excludes GST.";
    if (!(r.gstPercent >= 0)) return "GST percentage is invalid.";
  }
  const dup = findDuplicateRow(active);
  if (dup >= 0) return "Resolve the duplicate product before continuing.";
  return null;
}

// ─────────────────────────────────────────────────────────────
// Sales rows (Step 4) + per-product & multi-product totals
// ─────────────────────────────────────────────────────────────

export type SeminarSalesRow = {
  productKey: string;            // matches SeminarProductRow.rowKey
  unitsSold: number;
  fullPaymentCount: number;
  tokenSalesCount: number;
  commonTokenAmount: number;     // per-sale
  directTokenCollected: number;  // absolute total; takes precedence when > 0
  otherCollected: number;
  refundCount: number;
  refundAmount: number;
  notes: string;
};

export function emptySeminarSalesRow(productKey: string): SeminarSalesRow {
  return {
    productKey,
    unitsSold: 0,
    fullPaymentCount: 0,
    tokenSalesCount: 0,
    commonTokenAmount: 0,
    directTokenCollected: 0,
    otherCollected: 0,
    refundCount: 0,
    refundAmount: 0,
    notes: "",
  };
}

/** Keep the sales record aligned with the current products list. */
export function syncSalesToProducts(
  products: SeminarProductRow[],
  sales: Record<string, SeminarSalesRow>,
): Record<string, SeminarSalesRow> {
  const next: Record<string, SeminarSalesRow> = {};
  for (const p of products) {
    next[p.rowKey] = sales[p.rowKey] ?? emptySeminarSalesRow(p.rowKey);
  }
  return next;
}

export type PerProductTotals = {
  productKey: string;
  productName: string;
  unitPrice: number;
  gstMode: ProductGstMode;
  gstPercent: number;
  grossPerSale: number;
  netPerSale: number;
  gstPerSale: number;
  unitsSold: number;
  grossBooked: number;
  netBooked: number;
  revenueGst: number;
  tokenCollected: number;
  tokenSource: "direct" | "computed" | "none";
  fullPaymentCollected: number;
  otherCollected: number;
  refundAmount: number;
  cashCollected: number;
  outstanding: number;
  warnings: string[];
};

/** Choose token amount by precedence: direct > count × common > 0. */
export function resolveTokenCollected(sale: SeminarSalesRow): { value: number; source: "direct" | "computed" | "none" } {
  const direct = Number(sale.directTokenCollected) || 0;
  if (direct > 0) return { value: direct, source: "direct" };
  const count = Number(sale.tokenSalesCount) || 0;
  const common = Number(sale.commonTokenAmount) || 0;
  if (count > 0 && common > 0) return { value: count * common, source: "computed" };
  return { value: 0, source: "none" };
}

export function computeProductTotals(product: SeminarProductRow, sale: SeminarSalesRow): PerProductTotals {
  const per = computeProductGst(Number(product.unitPrice) || 0, product.gstMode, Number(product.gstPercent) || 0);
  const units = Math.max(0, Number(sale.unitsSold) || 0);
  const grossBooked = per.gross * units;
  const netBooked = per.net * units;
  const revenueGst = grossBooked - netBooked;

  const fullCount = Math.max(0, Number(sale.fullPaymentCount) || 0);
  const tokenCount = Math.max(0, Number(sale.tokenSalesCount) || 0);
  const tok = resolveTokenCollected(sale);
  const fullCollected = fullCount * per.gross;
  const other = Math.max(0, Number(sale.otherCollected) || 0);
  const refund = Math.max(0, Number(sale.refundAmount) || 0);
  const cashCollected = Math.max(0, fullCollected + tok.value + other - refund);
  const outstanding = Math.max(0, grossBooked - cashCollected);

  const warnings: string[] = [];
  if (units > 0 && !(product.unitPrice > 0)) warnings.push("Units entered but product price is missing.");
  if (fullCount + tokenCount > units) warnings.push("Full-payment + token counts exceed units sold.");
  if (Number(sale.directTokenCollected) < 0 || Number(sale.commonTokenAmount) < 0) warnings.push("Token amount cannot be negative.");
  if (Number(sale.directTokenCollected) > 0 && tokenCount > 0 && Number(sale.commonTokenAmount) > 0) {
    warnings.push("Both direct token total and count×common are set. Using direct total.");
  }
  if (refund > cashCollected + refund) warnings.push("Refunds exceed collected.");
  if (grossBooked > 0 && cashCollected > grossBooked) warnings.push("Cash collected exceeds gross booked revenue.");

  return {
    productKey: product.rowKey,
    productName: product.productName,
    unitPrice: Number(product.unitPrice) || 0,
    gstMode: product.gstMode,
    gstPercent: Number(product.gstPercent) || 0,
    grossPerSale: per.gross,
    netPerSale: per.net,
    gstPerSale: per.gst,
    unitsSold: units,
    grossBooked,
    netBooked,
    revenueGst,
    tokenCollected: tok.value,
    tokenSource: tok.source,
    fullPaymentCollected: fullCollected,
    otherCollected: other,
    refundAmount: refund,
    cashCollected,
    outstanding,
    warnings,
  };
}

export type MultiProductTotals = {
  perProduct: PerProductTotals[];
  totalUnits: number;
  grossBooked: number;
  netBooked: number;
  revenueGst: number;
  tokenCollected: number;
  cashCollected: number;
  outstanding: number;
  refundAmount: number;
};

export function computeMultiProductTotals(
  products: SeminarProductRow[],
  sales: Record<string, SeminarSalesRow>,
): MultiProductTotals {
  const perProduct = products
    .filter((p) => p.productName.trim() || p.unitPrice > 0)
    .map((p) => computeProductTotals(p, sales[p.rowKey] ?? emptySeminarSalesRow(p.rowKey)));
  const sum = (fn: (t: PerProductTotals) => number) => perProduct.reduce((a, t) => a + fn(t), 0);
  return {
    perProduct,
    totalUnits: sum((t) => t.unitsSold),
    grossBooked: sum((t) => t.grossBooked),
    netBooked: sum((t) => t.netBooked),
    revenueGst: sum((t) => t.revenueGst),
    tokenCollected: sum((t) => t.tokenCollected),
    cashCollected: sum((t) => t.cashCollected),
    outstanding: sum((t) => t.outstanding),
    refundAmount: sum((t) => t.refundAmount),
  };
}

/** ROAS numerator per basis. */
export function revenueForRoasBasis(totals: MultiProductTotals, basis: SeminarRevenueBasis): number {
  if (basis === "net_revenue") return totals.netBooked;
  if (basis === "cash_collected") return totals.cashCollected;
  return totals.grossBooked;
}

export function roasLabelForBasis(basis: SeminarRevenueBasis): string {
  if (basis === "cash_collected") return "Cash-Collected ROAS";
  if (basis === "net_revenue") return "Net Booked-Revenue ROAS";
  return "Gross Booked-Revenue ROAS";
}

