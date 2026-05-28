// Detect tabs of a Google Sheets workbook server-side and classify each tab
// as Sales / Media Buyer / Ignore based on tab name + headers.
// Input: { masterSheetUrl: string }
// Output: { spreadsheetId, spreadsheetTitle, tabs: [...], errors: [], warnings: [] }

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

const SALES_NAME_KW = [
  "sales", "sale", "payment", "payments", "paid", "enrollments",
  "closed won", "buyers", "students", "conversions", "purchases",
];
const SALES_HEADER_KW = [
  "name", "full name", "email", "phone", "payment date", "amount",
  "revenue", "program", "paid amount", "deal value", "sale date",
];
const LEAD_HEADER_KW = ["name", "full name", "lead name", "participant name",
  "customer name", "email", "email address", "phone", "mobile", "mobile number",
  "contact", "whatsapp", "registration date", "webinar name", "source"];
const IGNORE_NAME_KW = [
  "dashboard", "summary", "config", "instructions", "readme",
  "template", "sample", "pivot", "report", "analysis", "notes",
  "data validation", "settings",
];

function lc(s: string) { return (s || "").toLowerCase().trim(); }

function classifyTab(tabName: string, headers: string[]) {
  const ln = lc(tabName);
  const lh = headers.map(lc);
  if (IGNORE_NAME_KW.some((k) => ln.includes(k))) {
    return { role: "ignore", confidence: 0.85 };
  }
  if (SALES_NAME_KW.some((k) => ln.includes(k))) {
    return { role: "sales", confidence: 0.95 };
  }
  const salesHeaderHits = SALES_HEADER_KW.filter((k) =>
    lh.some((h) => h.includes(k))).length;
  if (salesHeaderHits >= 4 && lh.some((h) => h.includes("amount") || h.includes("revenue") || h.includes("payment"))) {
    return { role: "sales", confidence: 0.7 };
  }
  // Media buyer: needs at least 2 of name/email/phone-ish
  const mbHits = ["name", "email", "phone", "mobile", "whatsapp", "contact"]
    .filter((k) => lh.some((h) => h.includes(k))).length;
  if (mbHits >= 2) return { role: "media_buyer", confidence: 0.7 };
  if (lh.length === 0) return { role: "unknown", confidence: 0 };
  return { role: "unknown", confidence: 0.3 };
}

function detectColumnMapping(headers: string[]) {
  const lh = headers.map(lc);
  const find = (kws: string[]) => {
    for (let i = 0; i < lh.length; i++) {
      if (kws.some((k) => lh[i] === k)) return headers[i];
    }
    for (let i = 0; i < lh.length; i++) {
      if (kws.some((k) => lh[i].includes(k))) return headers[i];
    }
    return null;
  };
  return {
    name: find(["full name", "name", "lead name", "participant name", "customer name", "buyer name", "student name"]),
    email: find(["email address", "email", "mail"]),
    phone: find(["mobile number", "contact number", "phone", "mobile", "whatsapp", "contact"]),
    amount: find(["paid amount", "amount", "revenue", "deal value", "payment"]),
    paymentDate: find(["payment date", "paid date", "sale date", "date"]),
    registrationDate: find(["registration date", "reg date"]),
    webinarName: find(["webinar name", "webinar"]),
    source: find(["source", "utm_source", "campaign"]),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth check
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
      return new Response(JSON.stringify({
        error: "Google Sheets API key is missing. Please configure GOOGLE_SHEETS_API_KEY in Supabase Edge Function environment variables.",
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const masterSheetUrl: string = body?.masterSheetUrl || "";
    const spreadsheetId = extractSpreadsheetId(masterSheetUrl);
    if (!spreadsheetId) {
      return new Response(JSON.stringify({
        error: "This does not look like a valid Google Sheet URL. Please paste a link from docs.google.com/spreadsheets.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch metadata
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false&key=${apiKey}`;
    const metaRes = await fetch(metaUrl);
    if (!metaRes.ok) {
      const txt = await metaRes.text();
      const msg = metaRes.status === 403 || metaRes.status === 404
        ? "We could not access this Google Sheet. Please share it as 'Anyone with the link can view' or connect Google authentication later."
        : `Sheets API error (${metaRes.status}): ${txt.slice(0, 200)}`;
      return new Response(JSON.stringify({ error: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const meta = await metaRes.json();
    const spreadsheetTitle: string = meta.properties?.title || "";
    const sheets: any[] = meta.sheets || [];
    if (!sheets.length) {
      return new Response(JSON.stringify({ error: "No tabs were found in this spreadsheet." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // For each sheet, fetch first 20 rows
    const tabs = await Promise.all(sheets.map(async (s) => {
      const sheetId = String(s.properties?.sheetId ?? "");
      const tabName: string = s.properties?.title || "";
      // Quote tab names so spaces, hyphens, digits, and special chars are handled correctly.
      const quotedTab = `'${tabName.replace(/'/g, "''")}'`;
      const headerRange = `${quotedTab}!A1:Z5`;
      const countRange = `${quotedTab}!A1:A20000`;
      const warnings: string[] = [];
      let detectedHeaders: string[] = [];
      let sampleRows: string[][] = [];
      let validRowsCount = 0;
      try {
        const [hRes, cRes] = await Promise.all([
          fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(headerRange)}?key=${apiKey}`),
          fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(countRange)}?key=${apiKey}`),
        ]);
        if (hRes.ok) {
          const j = await hRes.json();
          const values: string[][] = j.values || [];
          if (values.length > 0) {
            detectedHeaders = (values[0] || []).map((x) => String(x || ""));
            sampleRows = values.slice(1, 6);
          } else {
            warnings.push("Empty tab");
          }
        } else {
          warnings.push(`Could not read values (${hRes.status})`);
        }
        if (cRes.ok) {
          const j = await cRes.json();
          const colA: string[][] = j.values || [];
          // Subtract 1 for header row if any data row exists
          validRowsCount = Math.max(0, colA.length - (colA.length > 0 ? 1 : 0));
        }
      } catch (e) {
        warnings.push("Read error: " + (e as Error).message);
      }
      const guess = classifyTab(tabName, detectedHeaders);
      const detectedColumnMapping = detectColumnMapping(detectedHeaders);
      return {
        sheetId, tabName,
        guessedRole: guess.role,
        confidence: guess.confidence,
        detectedHeaders, sampleRows, validRowsCount,
        detectedColumnMapping, warnings,
      };
    }));

    return new Response(JSON.stringify({
      spreadsheetId, spreadsheetTitle, tabs, errors: [], warnings: [],
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
