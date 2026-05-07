import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchPublishedSheet, type SheetRow } from "../_shared/roas-fetchSheet.ts";
import { cleanPhone, cleanEmail, cleanName, cleanMoney, parseDate, rowHash } from "../_shared/roas-clean.ts";
import { attributeEnrollment } from "../_shared/roas-attribute.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Mapping { [internal: string]: string; }
function pick(row: SheetRow, mapping: Mapping, key: string): string | null {
  const col = mapping[key];
  if (!col) return null;
  const v = row[col];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

async function syncSource(supabase: any, sourceId: string, triggeredBy: string) {
  const { data: log } = await supabase.from("roas_sync_logs").insert({ data_source_id: sourceId, triggered_by: triggeredBy, sync_status: "running" }).select("id").single();
  const logId = log?.id;
  try {
    const { data: src, error: srcErr } = await supabase.from("roas_data_sources").select("*").eq("id", sourceId).single();
    if (srcErr || !src) throw new Error("Data source not found");
    const rows = await fetchPublishedSheet(src.published_sheet_url);
    const mapping: Mapping = src.column_mapping_json || {};
    let imported = 0, updated = 0, dupSkipped = 0;
    const newEnrollmentIds: string[] = [];

    if (src.source_type === "lead_sheet") {
      for (const row of rows) {
        const phoneRaw = pick(row, mapping, "phone");
        const emailRaw = pick(row, mapping, "email");
        const phone = cleanPhone(phoneRaw);
        const email = cleanEmail(emailRaw);
        if (!phone.valid && !email.valid) { dupSkipped++; continue; }
        const dateRaw = pick(row, mapping, "created_at");
        const date = parseDate(dateRaw);
        const flags: string[] = [];
        if (!phone.valid) flags.push("invalid_phone");
        if (!email.valid) flags.push("invalid_email");
        if (dateRaw && !date) flags.push("date_error");
        const hash = rowHash([src.id, phone.clean, email.clean, date?.toISOString() ?? ""]);
        const payload: any = {
          media_buyer_id: src.media_buyer_id, data_source_id: src.id,
          lead_name: cleanName(pick(row, mapping, "lead_name")),
          raw_phone: phoneRaw, clean_phone: phone.clean,
          raw_email: emailRaw, clean_email: email.clean,
          created_at_from_sheet: date?.toISOString() ?? null,
          webinar_date: parseDate(pick(row, mapping, "webinar_date"))?.toISOString().slice(0, 10) ?? null,
          landing_page: pick(row, mapping, "landing_page"),
          campaign_name: pick(row, mapping, "campaign_name"),
          adset_name: pick(row, mapping, "adset_name"),
          ad_name: pick(row, mapping, "ad_name"),
          utm_source: pick(row, mapping, "utm_source"),
          utm_campaign: pick(row, mapping, "utm_campaign"),
          utm_content: pick(row, mapping, "utm_content"),
          city: pick(row, mapping, "city"), state: pick(row, mapping, "state"),
          lead_status: pick(row, mapping, "lead_status"),
          notes: pick(row, mapping, "notes"),
          source_row_hash: hash, data_flags: flags,
        };
        const { data: existing } = await supabase.from("roas_leads").select("id").eq("data_source_id", src.id).eq("source_row_hash", hash).maybeSingle();
        if (existing) { await supabase.from("roas_leads").update(payload).eq("id", existing.id); updated++; }
        else {
          const { error: insErr } = await supabase.from("roas_leads").insert(payload);
          if (insErr) dupSkipped++; else imported++;
        }
      }
      await tagDuplicateLeads(supabase);
    } else {
      for (const row of rows) {
        const phoneRaw = pick(row, mapping, "phone");
        const emailRaw = pick(row, mapping, "email");
        const phone = cleanPhone(phoneRaw);
        const email = cleanEmail(emailRaw);
        if (!phone.valid && !email.valid) { dupSkipped++; continue; }
        const flags: string[] = [];
        if (!phone.valid) flags.push("invalid_phone");
        if (!email.valid) flags.push("invalid_email");
        const amountPaid = cleanMoney(pick(row, mapping, "amount_paid")) ?? 0;
        const programPriceRaw = cleanMoney(pick(row, mapping, "program_price"));
        const gstRaw = cleanMoney(pick(row, mapping, "gst_amount"));
        const totalRaw = cleanMoney(pick(row, mapping, "total_invoice_value"));
        let programPrice: number, gstAmount: number, totalInvoice: number;
        if (programPriceRaw !== null) {
          programPrice = programPriceRaw;
          gstAmount = gstRaw ?? Math.round(programPrice * 0.18);
          totalInvoice = totalRaw ?? programPrice + gstAmount;
        } else if (totalRaw !== null) {
          totalInvoice = totalRaw;
          gstAmount = gstRaw ?? Math.round(totalInvoice - totalInvoice / 1.18);
          programPrice = totalInvoice - gstAmount;
        } else {
          totalInvoice = amountPaid;
          gstAmount = gstRaw ?? Math.round(amountPaid - amountPaid / 1.18);
          programPrice = Math.max(0, amountPaid - gstAmount);
        }
        let netRevenue = 0;
        if (amountPaid > 0) {
          const ratio = totalInvoice > 0 ? amountPaid / totalInvoice : 1;
          netRevenue = Math.round(programPrice * ratio);
        }
        const rawStatus = pick(row, mapping, "payment_status");
        const paymentStatus = rawStatus ?? (amountPaid > 0 ? "paid" : null);
        const paymentDate = parseDate(pick(row, mapping, "payment_date"));
        if (pick(row, mapping, "payment_date") && !paymentDate) flags.push("date_error");
        const hash = rowHash([src.id, phone.clean, email.clean, paymentDate?.toISOString() ?? "", amountPaid]);
        const payload: any = {
          data_source_id: src.id, buyer_name: cleanName(pick(row, mapping, "buyer_name")),
          raw_phone: phoneRaw, clean_phone: phone.clean,
          raw_email: emailRaw, clean_email: email.clean,
          amount_paid: amountPaid, program_price: programPrice,
          gst_amount: gstAmount, total_invoice_value: totalInvoice, net_revenue: netRevenue,
          payment_date: paymentDate?.toISOString() ?? null,
          payment_gateway: pick(row, mapping, "payment_gateway"),
          transaction_id: pick(row, mapping, "transaction_id"),
          webinar_date: parseDate(pick(row, mapping, "webinar_date"))?.toISOString().slice(0, 10) ?? null,
          payment_status: paymentStatus,
          salesperson: pick(row, mapping, "salesperson"),
          remarks: pick(row, mapping, "remarks"),
          source_row_hash: hash, data_flags: flags,
        };
        const { data: existing } = await supabase.from("roas_enrollments").select("id, manual_override").eq("data_source_id", src.id).eq("source_row_hash", hash).maybeSingle();
        let enrollmentId: string | undefined;
        if (existing) {
          await supabase.from("roas_enrollments").update(payload).eq("id", existing.id);
          enrollmentId = existing.id;
          updated++;
          if (!existing.manual_override) newEnrollmentIds.push(existing.id);
        } else {
          const { data: ins, error: insErr } = await supabase.from("roas_enrollments").insert(payload).select("id").single();
          if (insErr || !ins) dupSkipped++;
          else { enrollmentId = ins.id; imported++; newEnrollmentIds.push(ins.id); }
        }
      }
      for (const id of newEnrollmentIds) await attributeEnrollment(supabase, id);
    }

    const finishedAt = new Date().toISOString();
    await supabase.from("roas_sync_logs").update({
      sync_completed_at: finishedAt, sync_status: "success",
      rows_fetched: rows.length, rows_imported: imported, rows_updated: updated, duplicate_rows_skipped: dupSkipped,
    }).eq("id", logId);
    await supabase.from("roas_data_sources").update({
      last_synced_at: finishedAt, last_sync_status: "success", last_sync_error: null,
      last_rows_fetched: rows.length, last_rows_imported: imported, last_duplicates_skipped: dupSkipped,
    }).eq("id", src.id);
    return { ok: true, rowsFetched: rows.length, imported, updated, duplicates: dupSkipped };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("roas_sync_logs").update({ sync_completed_at: new Date().toISOString(), sync_status: "error", error_message: msg }).eq("id", logId);
    await supabase.from("roas_data_sources").update({ last_synced_at: new Date().toISOString(), last_sync_status: "error", last_sync_error: msg }).eq("id", sourceId);
    return { ok: false, error: msg };
  }
}

async function tagDuplicateLeads(supabase: any) {
  const { data: leads } = await supabase.from("roas_leads").select("id, media_buyer_id, clean_phone, clean_email, created_at_from_sheet, duplicate_status");
  if (!leads) return;
  const byPhone = new Map<string, any[]>();
  const byEmail = new Map<string, any[]>();
  for (const l of leads) {
    if (l.clean_phone) { const a = byPhone.get(l.clean_phone) || []; a.push(l); byPhone.set(l.clean_phone, a); }
    if (l.clean_email) { const a = byEmail.get(l.clean_email) || []; a.push(l); byEmail.set(l.clean_email, a); }
  }
  const updates = new Map<string, string>();
  const apply = (group: any[]) => {
    if (group.length < 2) return;
    const buyers = new Set(group.map((g) => g.media_buyer_id));
    const status = buyers.size > 1 ? "Cross Buyer Duplicate" : "Same Buyer Duplicate";
    for (const g of group) {
      const existing = updates.get(g.id);
      if (existing === "Cross Buyer Duplicate") continue;
      updates.set(g.id, status);
    }
  };
  byPhone.forEach(apply); byEmail.forEach(apply);
  for (const [id, status] of updates.entries()) {
    const lead = leads.find((l: any) => l.id === id);
    if (lead && lead.duplicate_status !== status) await supabase.from("roas_leads").update({ duplicate_status: status }).eq("id", id);
  }
  for (const l of leads) {
    if (!updates.has(l.id) && l.duplicate_status !== "unique") await supabase.from("roas_leads").update({ duplicate_status: "unique" }).eq("id", l.id);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { sourceId, allActive } = await req.json().catch(() => ({}));
    const triggeredBy = req.headers.get("x-triggered-by") || "manual";
    if (allActive) {
      const { data: sources } = await supabase.from("roas_data_sources").select("id").eq("status", "active");
      const results: any[] = [];
      for (const s of sources || []) results.push({ sourceId: s.id, ...(await syncSource(supabase, s.id, triggeredBy)) });
      return new Response(JSON.stringify({ ok: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!sourceId) return new Response(JSON.stringify({ error: "sourceId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const result = await syncSource(supabase, sourceId, triggeredBy);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
