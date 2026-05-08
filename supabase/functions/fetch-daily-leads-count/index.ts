// Fetch lead row count from a Google Sheet tab for a specific date.
// Input: { sheetUrl, tabName, sheetId?, reportDate (YYYY-MM-DD), dateColumn?, timezone? }
// Output: { spreadsheetId, spreadsheetTitle, tabName, dateColumn, totalRows,
//           matchingRows, validLeadRows, sampleRows, warnings, errors }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

function lc(s: string) { return (s || "").toLowerCase().trim(); }

const DATE_HEADER_KW = [
  "date", "timestamp", "created at", "registration date", "reg date",
  "date/time", "datetime", "submitted at",
];
const NAME_KW = ["name", "full name", "lead name"];
const EMAIL_KW = ["email", "email address", "mail"];
const PHONE_KW = ["phone", "mobile", "whatsapp", "wa number", "contact"];

function findHeader(headers: string[], kws: string[]): string | null {
  const lh = headers.map(lc);
  for (let i = 0; i < lh.length; i++) {
    if (kws.includes(lh[i])) return headers[i];
  }
  for (let i = 0; i < lh.length; i++) {
    if (kws.some((k) => lh[i].includes(k))) return headers[i];
  }
  return null;
}

// Parse a date cell into YYYY-MM-DD (Asia/Kolkata semantics: we just take date portion).
// Supports DD/MM/YYYY, D/M/YYYY (with optional time), YYYY-MM-DD (with optional time).
function parseDateCell(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // ISO YYYY-MM-DD or YYYY-MM-DDTHH:mm
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = m[1], mo = m[2].padStart(2, "0"), d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  // DD/MM/YYYY (Indian preference) or MM/DD/YYYY ambiguity → assume DD/MM
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
    // If first part > 12, definitely DD/MM. Else assume DD/MM (Indian).
    if (d > 31 || mo > 31) return null;
    if (d > 12 && mo > 12) return null;
    if (mo > 12) { const t = d; d = mo; mo = t; }
    if (y < 100) y += 2000;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // Fallback Date parse
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: claimErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GOOGLE_SHEETS_API_KEY missing." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const sheetUrl: string = body?.sheetUrl || "";
    const tabName: string = body?.tabName || "";
    const reportDate: string = body?.reportDate || "";
    let dateColumn: string = body?.dateColumn || "";

    if (!sheetUrl || !tabName || !reportDate) {
      return new Response(JSON.stringify({
        error: "sheetUrl, tabName and reportDate are required.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      return new Response(JSON.stringify({ error: "Invalid Google Sheet URL." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch metadata for title
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false&key=${apiKey}`
    );
    if (!metaRes.ok) {
      const msg = metaRes.status === 403 || metaRes.status === 404
        ? "Could not access this Google Sheet. Please share it as 'Anyone with the link can view'."
        : `Sheets API error (${metaRes.status})`;
      return new Response(JSON.stringify({ error: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const meta = await metaRes.json();
    const spreadsheetTitle: string = meta.properties?.title || "";

    // Fetch values
    const range = `${tabName}!A1:ZZ100000`;
    const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
    const valRes = await fetch(valuesUrl);
    if (!valRes.ok) {
      return new Response(JSON.stringify({ error: `Could not read tab '${tabName}' (${valRes.status}).` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const valJson = await valRes.json();
    const values: string[][] = valJson.values || [];
    const warnings: string[] = [];
    if (values.length === 0) {
      return new Response(JSON.stringify({
        spreadsheetId, spreadsheetTitle, tabName,
        dateColumn: dateColumn || "", totalRows: 0, matchingRows: 0,
        validLeadRows: 0, sampleRows: [], warnings: ["Empty tab"], errors: [],
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const headers = (values[0] || []).map((x) => String(x || ""));
    const rows = values.slice(1);

    // Resolve date column
    let dateColIdx = -1;
    if (dateColumn) {
      dateColIdx = headers.findIndex((h) => lc(h) === lc(dateColumn));
    }
    if (dateColIdx < 0) {
      const auto = findHeader(headers, DATE_HEADER_KW);
      if (auto) {
        dateColumn = auto;
        dateColIdx = headers.findIndex((h) => h === auto);
      } else {
        dateColumn = headers[0] || "Column A";
        dateColIdx = 0;
        warnings.push("Date column not detected. Defaulted to first column. Please review.");
      }
    }

    const nameCol = findHeader(headers, NAME_KW);
    const emailCol = findHeader(headers, EMAIL_KW);
    const phoneCol = findHeader(headers, PHONE_KW);
    if (!nameCol && !emailCol && !phoneCol) {
      warnings.push("Lead identity columns (Name/Email/Phone) were not detected. Count is based on date matches only.");
    }
    const nameIdx = nameCol ? headers.findIndex((h) => h === nameCol) : -1;
    const emailIdx = emailCol ? headers.findIndex((h) => h === emailCol) : -1;
    const phoneIdx = phoneCol ? headers.findIndex((h) => h === phoneCol) : -1;

    let matchingRows = 0;
    let validLeadRows = 0;
    const sampleRows: string[][] = [];
    for (const row of rows) {
      if (!row || row.every((c) => !c || !String(c).trim())) continue;
      const cell = row[dateColIdx] || "";
      const parsed = parseDateCell(String(cell));
      if (parsed === reportDate) {
        matchingRows++;
        const hasIdentity =
          (nameIdx >= 0 && row[nameIdx] && String(row[nameIdx]).trim()) ||
          (emailIdx >= 0 && row[emailIdx] && String(row[emailIdx]).trim()) ||
          (phoneIdx >= 0 && row[phoneIdx] && String(row[phoneIdx]).trim());
        if (hasIdentity || (nameIdx < 0 && emailIdx < 0 && phoneIdx < 0)) {
          validLeadRows++;
          if (sampleRows.length < 3) sampleRows.push(row);
        }
      }
    }

    return new Response(JSON.stringify({
      spreadsheetId, spreadsheetTitle, tabName, dateColumn,
      totalRows: rows.length, matchingRows, validLeadRows,
      sampleRows, warnings, errors: [],
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
