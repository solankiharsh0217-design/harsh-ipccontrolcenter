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
