import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SHEETS = [
  {
    source: "diamond",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSv8jEjX6EyndWvqcJ3A6L3lck17q46mPajtl8TAHYQ2-aB3sdrIhq1PDSUHQNbSMTw07GJFcO1b_bw/pub?gid=1507599502&single=true&output=csv",
    nameCol: "Diamond Member",
    emailCol: "Email",
    phoneCol: "Number",
  },
  {
    source: "members",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSv8jEjX6EyndWvqcJ3A6L3lck17q46mPajtl8TAHYQ2-aB3sdrIhq1PDSUHQNbSMTw07GJFcO1b_bw/pub?gid=281382417&single=true&output=csv",
    nameCol: "Full Name",
    emailCol: "Email ID",
    phoneCol: "Without Country Code",
    phoneFallbackCol: "Contact",
  },
];

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supaUrl, serviceKey);
    const { data: prof } = await admin.from("profiles").select("status").eq("id", user.id).maybeSingle();
    if (!prof || prof.status !== "active") {
      return new Response(JSON.stringify({ error: "Active members only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: Record<string, { total: number; imported: number }> = {};

    for (const sheet of SHEETS) {
      const res = await fetch(sheet.url);
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length < 2) { results[sheet.source] = { total: 0, imported: 0 }; continue; }
      const header = rows[0].map((h) => h.trim());
      const idx = (name: string) => header.indexOf(name);
      const ni = idx(sheet.nameCol);
      const ei = idx(sheet.emailCol);
      const pi = idx(sheet.phoneCol);
      const pfi = sheet.phoneFallbackCol ? idx(sheet.phoneFallbackCol) : -1;

      const records: any[] = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const name = (ni >= 0 ? row[ni] || "" : "").trim();
        const email = (ei >= 0 ? row[ei] || "" : "").trim().toLowerCase();
        let phoneRaw = pi >= 0 ? row[pi] || "" : "";
        if (!phoneRaw && pfi >= 0) phoneRaw = row[pfi] || "";
        const phone = normalizePhone(phoneRaw);
        if (!name && !email && !phone) continue;
        const search_text = `${name} ${email} ${phone}`.toLowerCase();
        records.push({ source: sheet.source, full_name: name || null, email: email || null, phone: phone || null, search_text });
      }

      // dedupe within sheet using contact key (email|phone). Blank-contact rows kept individually.
      const seen = new Set<string>();
      const deduped: any[] = [];
      let dupSkipped = 0;
      for (const rec of records) {
        const key = (rec.email || "") + "|" + (rec.phone || "");
        if (key === "|") { deduped.push(rec); continue; }
        if (seen.has(key)) { dupSkipped++; continue; }
        seen.add(key);
        deduped.push(rec);
      }

      // wipe existing rows for this source
      await admin.from("students").delete().eq("source", sheet.source);

      // chunk insert; on conflict/error fall back to row-by-row so one bad row can't kill a batch
      let imported = 0;
      let failedRows = 0;
      const chunkSize = 500;
      for (let i = 0; i < deduped.length; i += chunkSize) {
        const chunk = deduped.slice(i, i + chunkSize);
        const { error } = await admin.from("students").insert(chunk);
        if (error) {
          for (const row of chunk) {
            const { error: e2 } = await admin.from("students").insert(row);
            if (e2) { failedRows++; } else { imported++; }
          }
        } else {
          imported += chunk.length;
        }
      }
      results[sheet.source] = { total: records.length, deduped: deduped.length, dupSkipped, imported, failedRows };
    }

    return new Response(JSON.stringify({ ok: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
