import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";

export interface ParsedRow {
  name: string;
  email: string | null;
  phone: string | null;
  brand_name: string | null;
  product_name: string | null;
  batch_name: string | null;
  notes: string | null;
  raw: Record<string, any>;
}

export interface ImportPreview {
  rows: ParsedRow[];
  totalRows: number;
  detectedColumns: Record<string, string | null>; // mapped target -> source header
  warnings: string[];
}

const HEADER_MAP: Record<string, string[]> = {
  name: ["name", "full_name", "client_name", "client", "customer"],
  email: ["email", "email_address", "e-mail"],
  phone: ["phone", "mobile", "phone_number", "contact", "whatsapp"],
  brand_name: ["brand", "brand_name", "business", "business_name", "company"],
  product_name: ["product", "program", "package", "service"],
  batch_name: ["batch", "batch_name", "cohort"],
  notes: ["notes", "note", "remarks", "comments"],
};

function norm(s: string) {
  return (s || "").toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function detectColumns(headers: string[]): Record<string, string | null> {
  const normalized = headers.map((h) => ({ raw: h, key: norm(h) }));
  const out: Record<string, string | null> = {};
  for (const [target, candidates] of Object.entries(HEADER_MAP)) {
    out[target] = null;
    for (const cand of candidates) {
      const hit = normalized.find((n) => n.key === cand);
      if (hit) { out[target] = hit.raw; break; }
    }
  }
  return out;
}

function pickValue(row: Record<string, any>, header: string | null): string | null {
  if (!header) return null;
  const v = row[header];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function parseCsvText(text: string): ImportPreview {
  const parsed = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields ?? [];
  const detected = detectColumns(headers);
  const warnings: string[] = [];
  if (!detected.name) warnings.push("Could not detect a 'name' column — required.");
  if (!detected.email && !detected.phone) warnings.push("No 'email' or 'phone' column detected — duplicates cannot be matched.");

  const rows: ParsedRow[] = [];
  for (const raw of parsed.data) {
    const name = pickValue(raw, detected.name);
    if (!name) continue;
    rows.push({
      name,
      email: pickValue(raw, detected.email),
      phone: pickValue(raw, detected.phone),
      brand_name: pickValue(raw, detected.brand_name),
      product_name: pickValue(raw, detected.product_name),
      batch_name: pickValue(raw, detected.batch_name),
      notes: pickValue(raw, detected.notes),
      raw,
    });
  }
  return { rows, totalRows: parsed.data.length, detectedColumns: detected, warnings };
}

export function normalizePhoneLast10(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  if (digits.length < 10) return digits || null;
  return digits.slice(-10);
}

export interface ImportResult {
  imported: number;
  skipped: number;
  updated: number;
  errors: string[];
}

export async function importRows(
  rows: ParsedRow[],
  options: {
    source: "csv" | "sheet_link" | "manual";
    fileName?: string;
    sheetUrl?: string;
    templateId?: string | null;
    createdBy: string | null;
  },
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, updated: 0, errors: [] };
  if (rows.length === 0) return result;

  // Pre-fetch existing ops leads' contact keys to dedup client-side
  const { data: existing } = await supabase
    .from("operations_leads" as any)
    .select("id, name, email, phone, brand_name, product_name, batch_name, notes");
  const exList = (existing ?? []) as any[];
  const byEmail = new Map<string, any>();
  const byPhone = new Map<string, any>();
  for (const e of exList) {
    if (e.email) byEmail.set(String(e.email).toLowerCase(), e);
    const p = normalizePhoneLast10(e.phone);
    if (p) byPhone.set(p, e);
  }

  for (const r of rows) {
    try {
      const emailKey = r.email ? r.email.toLowerCase() : null;
      const phoneKey = normalizePhoneLast10(r.phone);
      const dupe = (emailKey && byEmail.get(emailKey)) || (phoneKey && byPhone.get(phoneKey));
      if (dupe) {
        // Update only null fields
        const updates: any = {};
        if (!dupe.email && r.email) updates.email = r.email;
        if (!dupe.phone && r.phone) updates.phone = r.phone;
        if (!dupe.brand_name && r.brand_name) updates.brand_name = r.brand_name;
        if (!dupe.product_name && r.product_name) updates.product_name = r.product_name;
        if (!dupe.batch_name && r.batch_name) updates.batch_name = r.batch_name;
        if (!dupe.notes && r.notes) updates.notes = r.notes;
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from("operations_leads" as any).update(updates).eq("id", dupe.id);
          if (error) throw error;
          result.updated++;
        } else {
          result.skipped++;
        }
        continue;
      }
      const insert: any = {
        name: r.name,
        email: r.email,
        phone: r.phone,
        brand_name: r.brand_name,
        product_name: r.product_name,
        batch_name: r.batch_name,
        notes: r.notes,
        intake_status: "intake",
        intake_source: options.source,
        process_template_id: options.templateId ?? null,
        service_status: "not_started",
        created_by: options.createdBy,
      };
      const { data: inserted, error } = await supabase
        .from("operations_leads" as any).insert(insert).select("id, email, phone").single();
      if (error) throw error;
      result.imported++;
      // Track for dedup within the same import batch
      if (r.email) byEmail.set(r.email.toLowerCase(), inserted);
      const p = normalizePhoneLast10(r.phone);
      if (p) byPhone.set(p, inserted);
    } catch (err: any) {
      result.errors.push(`${r.name}: ${err.message || err}`);
      result.skipped++;
    }
  }

  // Log import
  await supabase.from("operations_intake_imports" as any).insert({
    source: options.source,
    file_name: options.fileName ?? null,
    sheet_url: options.sheetUrl ?? null,
    imported_count: result.imported,
    skipped_count: result.skipped,
    updated_count: result.updated,
    total_rows: rows.length,
    raw_summary: { errors: result.errors.slice(0, 50) },
    created_by: options.createdBy,
  } as any);

  return result;
}

/** Convert Google Sheets share URL to public CSV export URL (best effort). */
export function googleSheetUrlToCsv(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("docs.google.com")) return null;
    // Match /spreadsheets/d/<id>/...
    const m = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!m) return null;
    const id = m[1];
    const gid = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get("gid") ?? "0";
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  } catch {
    return null;
  }
}

export async function fetchSheetCsv(url: string): Promise<string> {
  // Try direct fetch first (works for fully public sheets via export URL)
  const csvUrl = googleSheetUrlToCsv(url) || url;
  const res = await fetch(csvUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch sheet (${res.status}). Make sure the link is public (Anyone with the link).`);
  const text = await res.text();
  if (text.trim().startsWith("<")) throw new Error("Got HTML instead of CSV. Ensure the sheet is published or 'Anyone with link' viewer access.");
  return text;
}
