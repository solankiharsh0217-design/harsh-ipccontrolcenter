import { supabase } from "@/integrations/supabase/client";

export type OfferItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  default_duration_value: number | null;
  default_duration_unit: string | null;
  default_quantity: number | null;
  is_active: boolean;
};

export type OfferPreset = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type OfferPresetItem = {
  id: string;
  preset_id: string;
  offer_item_id: string | null;
  title: string | null;
  duration_value: number | null;
  duration_unit: string | null;
  quantity: number | null;
  notes: string | null;
};

export type PaidLeadOfferItem = {
  id: string;
  paid_pipeline_lead_id: string | null;
  crm_lead_id: string | null;
  operations_lead_id: string | null;
  offer_item_id: string | null;
  source_preset_id: string | null;
  title: string;
  duration_value: number | null;
  duration_unit: string | null;
  quantity: number | null;
  notes: string | null;
  source_context: string | null;
  created_at: string;
};

export type DraftOffer = {
  offer_item_id: string | null;
  title: string;
  duration_value: number | null;
  duration_unit: string | null;
  quantity: number | null;
  notes: string | null;
  source_preset_id?: string | null;
};

export const DURATION_UNITS = ["days", "weeks", "months", "sessions", "hours", "custom"] as const;

export async function listOfferItems(includeInactive = false): Promise<OfferItem[]> {
  let q = (supabase as any).from("offer_items").select("*").order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as OfferItem[]) || [];
}

export async function createOfferItem(input: Partial<OfferItem>): Promise<OfferItem> {
  const { data, error } = await (supabase as any).from("offer_items").insert({
    name: input.name,
    description: input.description ?? null,
    category: input.category ?? null,
    default_duration_value: input.default_duration_value ?? null,
    default_duration_unit: input.default_duration_unit ?? null,
    default_quantity: input.default_quantity ?? null,
    is_active: input.is_active ?? true,
  }).select("*").single();
  if (error) throw error;
  return data as OfferItem;
}

export async function updateOfferItem(id: string, patch: Partial<OfferItem>) {
  const { error } = await (supabase as any).from("offer_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function canDeleteOfferItem(id: string): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc("can_delete_offer_item", { _id: id });
  if (error) return false;
  return !!data;
}

export async function deleteOfferItem(id: string) {
  const { error } = await (supabase as any).from("offer_items").delete().eq("id", id);
  if (error) throw error;
}

export async function listPresets(includeInactive = false): Promise<OfferPreset[]> {
  let q = (supabase as any).from("offer_presets").select("*").order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as OfferPreset[]) || [];
}

export async function getPresetItems(presetId: string): Promise<OfferPresetItem[]> {
  const { data, error } = await (supabase as any)
    .from("offer_preset_items").select("*").eq("preset_id", presetId);
  if (error) throw error;
  return (data as OfferPresetItem[]) || [];
}

export async function createPreset(name: string, description: string | null, items: DraftOffer[]): Promise<OfferPreset> {
  const { data: p, error: pe } = await (supabase as any).from("offer_presets")
    .insert({ name, description }).select("*").single();
  if (pe) throw pe;
  if (items.length > 0) {
    const rows = items.map((it) => ({
      preset_id: p.id,
      offer_item_id: it.offer_item_id,
      title: it.title,
      duration_value: it.duration_value,
      duration_unit: it.duration_unit,
      quantity: it.quantity,
      notes: it.notes,
    }));
    const { error: ie } = await (supabase as any).from("offer_preset_items").insert(rows);
    if (ie) throw ie;
  }
  return p as OfferPreset;
}

export async function updatePreset(id: string, patch: Partial<OfferPreset>, items?: DraftOffer[]) {
  const { error } = await (supabase as any).from("offer_presets").update(patch).eq("id", id);
  if (error) throw error;
  if (items) {
    await (supabase as any).from("offer_preset_items").delete().eq("preset_id", id);
    if (items.length > 0) {
      const rows = items.map((it) => ({
        preset_id: id,
        offer_item_id: it.offer_item_id,
        title: it.title,
        duration_value: it.duration_value,
        duration_unit: it.duration_unit,
        quantity: it.quantity,
        notes: it.notes,
      }));
      const { error: ie } = await (supabase as any).from("offer_preset_items").insert(rows);
      if (ie) throw ie;
    }
  }
}

export async function deletePreset(id: string) {
  const { error } = await (supabase as any).from("offer_presets").delete().eq("id", id);
  if (error) throw error;
}

export async function attachOffersToPaidLead(opts: {
  paidPipelineLeadId?: string | null;
  crmLeadId?: string | null;
  operationsLeadId?: string | null;
  offers: DraftOffer[];
  sourceContext?: string | null;
  createdBy?: string | null;
}) {
  if (!opts.offers || opts.offers.length === 0) return;
  const rows = opts.offers.map((o) => ({
    paid_pipeline_lead_id: opts.paidPipelineLeadId ?? null,
    crm_lead_id: opts.crmLeadId ?? null,
    operations_lead_id: opts.operationsLeadId ?? null,
    offer_item_id: o.offer_item_id,
    source_preset_id: o.source_preset_id ?? null,
    title: o.title,
    duration_value: o.duration_value,
    duration_unit: o.duration_unit,
    quantity: o.quantity,
    notes: o.notes,
    source_context: opts.sourceContext ?? null,
    created_by: opts.createdBy ?? null,
  }));
  // Use upsert with onConflict on dedup unique index to skip duplicates
  const { error } = await (supabase as any)
    .from("paid_lead_offer_items")
    .upsert(rows, { onConflict: "paid_pipeline_lead_id,offer_item_id,source_context", ignoreDuplicates: true });
  if (error) {
    // Fallback to plain insert ignoring duplicate errors per-row
    for (const r of rows) {
      await (supabase as any).from("paid_lead_offer_items").insert(r).then(() => {}, () => {});
    }
  }
}

export async function listOffersForLead(opts: {
  paidPipelineLeadId?: string | null;
  crmLeadId?: string | null;
  operationsLeadId?: string | null;
}): Promise<PaidLeadOfferItem[]> {
  const ids: string[] = [];
  if (opts.paidPipelineLeadId) ids.push(`paid_pipeline_lead_id.eq.${opts.paidPipelineLeadId}`);
  if (opts.crmLeadId) ids.push(`crm_lead_id.eq.${opts.crmLeadId}`);
  if (opts.operationsLeadId) ids.push(`operations_lead_id.eq.${opts.operationsLeadId}`);
  if (ids.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from("paid_lead_offer_items")
    .select("*")
    .or(ids.join(","))
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as PaidLeadOfferItem[]) || [];
}

export function formatOffer(o: { duration_value: number | null; duration_unit: string | null; quantity: number | null }): string {
  const bits: string[] = [];
  if (o.duration_value != null && o.duration_unit) bits.push(`${o.duration_value} ${o.duration_unit}`);
  if (o.quantity != null) bits.push(`× ${o.quantity}`);
  return bits.join(" · ");
}
