import { supabase } from "@/integrations/supabase/client";
import type { TaxCode } from "./types";

const db = supabase as any;

export async function searchTaxCodes(query: string, opts?: { type?: "SAC" | "HSN"; limit?: number }): Promise<TaxCode[]> {
  const term = (query || "").trim();
  let q = db.from("tax_code_master").select("*").eq("is_active", true).limit(opts?.limit ?? 25);
  if (opts?.type) q = q.eq("type", opts.type);
  if (term.length >= 3) {
    // OR across code / description / keywords
    q = q.or(
      `code.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%,keywords.cs.{${term.toLowerCase()}}`
    );
  }
  const { data } = await q;
  return (data || []) as TaxCode[];
}

export async function listAllTaxCodes(opts?: { type?: "SAC" | "HSN" }): Promise<TaxCode[]> {
  let q = db.from("tax_code_master").select("*").order("code");
  if (opts?.type) q = q.eq("type", opts.type);
  const { data } = await q;
  return (data || []) as TaxCode[];
}

export async function upsertTaxCode(c: Partial<TaxCode>) {
  if (c.id) {
    const { data, error } = await db.from("tax_code_master").update(c).eq("id", c.id).select().maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("tax_code_master").insert(c).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteTaxCode(id: string) {
  const { error } = await db.from("tax_code_master").delete().eq("id", id);
  if (error) throw error;
}
