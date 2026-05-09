// Attendee list helpers — parse CSV uploads, fetch sheet tabs, persist to Supabase.

import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { fetchTabAsRows, resolveSheetCsvUrl } from "@/lib/roas/sheetFetch";

export type SlotType = "day" | "sales_pitch";
export type SourceKind = "csv_upload" | "google_sheet";

// Cap parsed rows stored as JSONB to keep the table fast.
const MAX_PARSED_ROWS = 5000;

export type AttendeeColumnMapping = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  duration?: string | null;
};

export type ParsedSource = {
  headers: string[];
  rows: string[][]; // includes header? no — body only
  rowCount: number;
  columnMapping: AttendeeColumnMapping;
};

export type AttendeeSlot = {
  // local id used by UI only
  uid: string;
  slotType: SlotType;
  slotLabel: string;
  slotDate: string | null;
  source: AttendeeSlotSource | null;
  notes?: string;
};

export type AttendeeSlotSource =
  | {
      kind: "csv_upload";
      file: File;
      fileName: string;
      fileSizeBytes: number;
      parsed: ParsedSource;
    }
  | {
      kind: "google_sheet";
      sheetUrl: string;
      sheetId?: string | null;
      tabName?: string | null;
      tabGid?: string | null;
      parsed: ParsedSource;
    };

function guessHeader(headers: string[], keywords: string[]): string | null {
  const lower = headers.map((h) => (h || "").toLowerCase().trim());
  for (const kw of keywords) {
    const i = lower.findIndex((h) => h.includes(kw));
    if (i !== -1) return headers[i];
  }
  return null;
}

export function autoMapColumns(headers: string[]): AttendeeColumnMapping {
  return {
    name: guessHeader(headers, ["name", "attendee", "participant"]),
    email: guessHeader(headers, ["email", "e-mail", "mail"]),
    phone: guessHeader(headers, ["phone", "mobile", "contact", "whatsapp"]),
    duration: guessHeader(headers, ["duration", "time in session", "minutes"]),
  };
}

function rowsFromArrays(rows: string[][]): ParsedSource {
  const cleaned = rows.filter((r) => r.some((c) => (c || "").trim()));
  const headers = (cleaned[0] || []).map((h) => (h || "").trim());
  const body = cleaned.slice(1);
  return {
    headers,
    rows: body.slice(0, MAX_PARSED_ROWS),
    rowCount: body.length,
    columnMapping: autoMapColumns(headers),
  };
}

export async function parseCsvFile(file: File): Promise<ParsedSource> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        try {
          resolve(rowsFromArrays(res.data as unknown as string[][]));
        } catch (e: any) {
          reject(e);
        }
      },
      error: (err) => reject(err),
    });
  });
}

export async function parseSheetUrl(sheetUrl: string): Promise<ParsedSource & { sheetId: string | null; tabGid: string | null }> {
  const r = resolveSheetCsvUrl(sheetUrl, sheetUrl);
  if (!r.ok) throw new Error((r as { ok: false; error: string }).error);
  const rows = await fetchTabAsRows(r.csvUrl);
  const parsed = rowsFromArrays(rows);
  const sidMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return {
    ...parsed,
    sheetId: sidMatch ? sidMatch[1] : null,
    tabGid: r.gid || null,
  };
}

export function defaultSlotsForDates(dates: string[]): AttendeeSlot[] {
  const dayLabel = (i: number, n: number) => (n === 1 ? "Webinar Day" : `Day ${i + 1}`);
  const days: AttendeeSlot[] = (dates.length ? dates : [""]).map((d, i, arr) => ({
    uid: `slot_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
    slotType: "day",
    slotLabel: dayLabel(i, arr.length),
    slotDate: d || null,
    source: null,
  }));
  const pitch: AttendeeSlot = {
    uid: `slot_${Date.now()}_pitch_${Math.random().toString(36).slice(2, 7)}`,
    slotType: "sales_pitch",
    slotLabel: "Sales Pitch",
    slotDate: null,
    source: null,
  };
  return [...days, pitch];
}

export function newDaySlot(index: number): AttendeeSlot {
  return {
    uid: `slot_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
    slotType: "day",
    slotLabel: `Day ${index + 1}`,
    slotDate: null,
    source: null,
  };
}
export function newPitchSlot(): AttendeeSlot {
  return {
    uid: `slot_${Date.now()}_pitch_${Math.random().toString(36).slice(2, 7)}`,
    slotType: "sales_pitch",
    slotLabel: "Sales Pitch",
    slotDate: null,
    source: null,
  };
}

export function slotsAllReady(slots: AttendeeSlot[]): boolean {
  if (slots.length === 0) return false;
  return slots.every((s) => !!s.source);
}

// ---------- Persistence ----------

export async function persistAttendeeSlots(sessionId: string, slots: AttendeeSlot[]): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0, failed = 0;
  const errors: string[] = [];

  await Promise.all(
    slots.map(async (slot, idx) => {
      if (!slot.source) return;
      try {
        let filePath: string | null = null;
        let fileName: string | null = null;
        let fileSize: number | null = null;
        let sheetUrl: string | null = null;
        let sheetId: string | null = null;
        let tabName: string | null = null;
        let tabGid: string | null = null;

        if (slot.source.kind === "csv_upload") {
          const safe = slot.source.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${sessionId}/${slot.uid}-${safe}`;
          const up = await supabase.storage.from("roas-attendees").upload(path, slot.source.file, { upsert: true });
          if (up.error) throw new Error(`upload failed: ${up.error.message}`);
          filePath = path;
          fileName = slot.source.fileName;
          fileSize = slot.source.fileSizeBytes;
        } else {
          sheetUrl = slot.source.sheetUrl;
          sheetId = slot.source.sheetId || null;
          tabName = slot.source.tabName || null;
          tabGid = slot.source.tabGid || null;
        }

        const parsed = slot.source.parsed;
        const { error } = await (supabase as any).from("attribution_attendee_lists").insert({
          session_id: sessionId,
          slot_type: slot.slotType,
          slot_label: slot.slotLabel,
          slot_date: slot.slotDate || null,
          slot_order: idx,
          source_kind: slot.source.kind,
          file_path: filePath,
          file_name: fileName,
          file_size_bytes: fileSize,
          sheet_url: sheetUrl,
          sheet_id: sheetId,
          tab_name: tabName,
          tab_gid: tabGid,
          headers: parsed.headers,
          row_count: parsed.rowCount,
          parsed_rows: parsed.rows,
          column_mapping: parsed.columnMapping,
          notes: slot.notes || null,
        });
        if (error) throw new Error(error.message);
        ok++;
      } catch (e: any) {
        failed++;
        errors.push(`${slot.slotLabel}: ${e?.message || e}`);
      }
    }),
  );

  return { ok, failed, errors };
}

export async function fetchAttendeeLists(sessionId: string) {
  const { data, error } = await (supabase as any)
    .from("attribution_attendee_lists")
    .select("*")
    .eq("session_id", sessionId)
    .order("slot_order", { ascending: true });
  if (error) throw error;
  return (data || []) as Array<{
    id: string;
    session_id: string;
    slot_type: SlotType;
    slot_label: string;
    slot_date: string | null;
    source_kind: SourceKind;
    file_path: string | null;
    file_name: string | null;
    file_size_bytes: number | null;
    sheet_url: string | null;
    tab_name: string | null;
    headers: string[] | null;
    row_count: number;
    parsed_rows: string[][] | null;
    column_mapping: AttendeeColumnMapping | null;
    notes: string | null;
    uploaded_at: string;
  }>;
}

export async function getSignedAttendeeUrl(filePath: string): Promise<string | null> {
  const { data } = await supabase.storage.from("roas-attendees").createSignedUrl(filePath, 60 * 10);
  return data?.signedUrl || null;
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => {
    const s = (v ?? "").toString();
    if (/["\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  return lines.join("\n");
}

export function downloadAttendeeCsv(name: string, headers: string[], rows: string[][]) {
  const csv = rowsToCsv(headers, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name.endsWith(".csv") ? name : name + ".csv";
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}
