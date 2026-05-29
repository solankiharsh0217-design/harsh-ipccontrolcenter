import { supabase } from "@/integrations/supabase/client";
import type { InvoiceCatalogItem, InvoiceItemCategory } from "./types";

const db = supabase as any;

export async function listItemCategories(): Promise<InvoiceItemCategory[]> {
  const { data } = await db
    .from("invoice_item_categories")
    .select("*")
    .eq("is_active", true)
    .order("name");
  return (data || []) as InvoiceItemCategory[];
}

export async function listAllItemCategories(): Promise<InvoiceItemCategory[]> {
  const { data } = await db.from("invoice_item_categories").select("*").order("name");
  return (data || []) as InvoiceItemCategory[];
}

export async function upsertItemCategory(c: Partial<InvoiceItemCategory>) {
  if (c.id) {
    const { data, error } = await db.from("invoice_item_categories").update(c).eq("id", c.id).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("invoice_item_categories").insert(c).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteItemCategory(id: string) {
  const { error } = await db.from("invoice_item_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function listCatalogItems(opts?: { search?: string; categoryId?: string }): Promise<InvoiceCatalogItem[]> {
  let q = db.from("invoice_items").select("*").eq("is_active", true).order("item_name");
  if (opts?.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts?.search) q = q.ilike("item_name", `%${opts.search}%`);
  const { data } = await q;
  return (data || []) as InvoiceCatalogItem[];
}

export async function listAllCatalogItems(): Promise<InvoiceCatalogItem[]> {
  const { data } = await db.from("invoice_items").select("*").order("item_name");
  return (data || []) as InvoiceCatalogItem[];
}

export async function upsertCatalogItem(i: Partial<InvoiceCatalogItem>) {
  const payload: any = { ...i };
  // Mirror default_price into legacy default_rate
  if (payload.default_price != null) payload.default_rate = payload.default_price;
  if (i.id) {
    const { data, error } = await db.from("invoice_items").update(payload).eq("id", i.id).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("invoice_items").insert(payload).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteCatalogItem(id: string) {
  const { error } = await db.from("invoice_items").delete().eq("id", id);
  if (error) throw error;
}
