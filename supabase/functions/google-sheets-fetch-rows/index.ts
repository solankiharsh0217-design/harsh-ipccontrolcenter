// Fetch all rows from a single tab of a Google Sheet, server-side.
// Input: { spreadsheetId: string, tabName: string, maxRows?: number }
// Output: { headers: string[], rows: Record<string,string>[], totalRows: number, warnings: string[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: claimErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "Google Sheets import is not configured yet. Admin must add Google Sheets API credentials.",
        code: "GOOGLE_SHEETS_CREDENTIALS_MISSING",
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const spreadsheetId: string = String(body?.spreadsheetId || "").trim();
    const tabName: string = String(body?.tabName || "").trim();
    const maxRows: number = Math.min(Math.max(Number(body?.maxRows) || 20000, 1), 50000);

    if (!spreadsheetId || !tabName) {
      return new Response(JSON.stringify({ error: "spreadsheetId and tabName are required", code: "BAD_REQUEST" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Quote tab names so spaces, hyphens, digits, and special chars are handled correctly.
    // Escape single quotes inside the tab name by doubling them (Sheets A1 notation rule).
    const quotedTab = `'${tabName.replace(/'/g, "''")}'`;
    const range = `${quotedTab}!A1:ZZ${maxRows}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      const msg = res.status === 403 || res.status === 404
        ? "Unable to access this Google Sheet. Please share it as 'Anyone with the link can view' or upload a CSV."
        : `Sheets API error (${res.status}): ${txt.slice(0, 200)}`;
      const code = res.status === 403 || res.status === 404 ? "SHEET_NOT_ACCESSIBLE" : "GOOGLE_API_ERROR";
      return new Response(JSON.stringify({ error: msg, code }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const json = await res.json();
    const values: string[][] = json.values || [];
    if (values.length === 0) {
      return new Response(JSON.stringify({ error: "This tab has no rows to import.", code: "TAB_HAS_NO_ROWS" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const rawHeaders = (values[0] || []).map((x) => String(x ?? "").trim());
    if (rawHeaders.every((h) => !h)) {
      return new Response(JSON.stringify({ error: "Header row is missing in the first row of this tab.", code: "HEADER_ROW_MISSING" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // De-duplicate empty/duplicate headers
    const headers: string[] = [];
    const seen = new Map<string, number>();
    for (let i = 0; i < rawHeaders.length; i++) {
      let h = rawHeaders[i] || `col_${i + 1}`;
      if (seen.has(h)) { const n = (seen.get(h) || 1) + 1; seen.set(h, n); h = `${h} (${n})`; }
      else seen.set(h, 1);
      headers.push(h);
    }

    const warnings: string[] = [];
    const rows: Record<string, string>[] = [];
    for (let r = 1; r < values.length; r++) {
      const row = values[r] || [];
      const obj: Record<string, string> = {};
      let nonEmpty = false;
      for (let c = 0; c < headers.length; c++) {
        const v = String(row[c] ?? "").trim();
        if (v) nonEmpty = true;
        obj[headers[c]] = v;
      }
      if (nonEmpty) rows.push(obj);
    }

    return new Response(JSON.stringify({
      headers, rows, totalRows: rows.length, warnings,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Unknown error", code: "IMPORT_FAILED" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
