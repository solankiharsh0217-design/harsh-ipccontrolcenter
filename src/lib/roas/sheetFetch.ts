// Resolve a tab input (full CSV URL, full tab URL with gid, or raw gid)
// against an optional master sheet URL into a fetchable CSV URL.

export type ResolveResult =
  | { ok: true; csvUrl: string; gid?: string }
  | { ok: false; error: string };

export function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

export function extractGid(input: string): string | null {
  if (!input) return null;
  const m = input.match(/[?&#]gid=(\d+)/);
  return m ? m[1] : null;
}

export function resolveSheetCsvUrl(masterSheetUrl: string, tabInput: string): ResolveResult {
  const t = (tabInput || "").trim();
  if (!t) return { ok: false, error: "Tab URL or gid is required" };

  // 1. Already a CSV URL (published or export?format=csv)
  if (/output=csv|format=csv/i.test(t)) {
    return { ok: true, csvUrl: t, gid: extractGid(t) || undefined };
  }

  // 2. Raw numeric gid
  if (/^\d+$/.test(t)) {
    const sid = extractSpreadsheetId(masterSheetUrl);
    if (!sid) return { ok: false, error: "Master sheet URL is invalid — cannot build export URL from gid alone" };
    return { ok: true, csvUrl: `https://docs.google.com/spreadsheets/d/${sid}/export?format=csv&gid=${t}`, gid: t };
  }

  // 3. Full Google Sheet tab URL with gid in the hash/query
  const gid = extractGid(t);
  const sidFromInput = extractSpreadsheetId(t);
  const sid = sidFromInput || extractSpreadsheetId(masterSheetUrl);
  if (sid && gid) {
    return { ok: true, csvUrl: `https://docs.google.com/spreadsheets/d/${sid}/export?format=csv&gid=${gid}`, gid };
  }
  if (sid && !gid) {
    // Default tab (gid=0)
    return { ok: true, csvUrl: `https://docs.google.com/spreadsheets/d/${sid}/export?format=csv&gid=0`, gid: "0" };
  }

  return { ok: false, error: "This tab cannot be fetched yet. Please paste the tab URL, gid, or published CSV URL." };
}

function parseCSV(text: string): string[][] {
  return text.split(/\r?\n/).map((line) => {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQ = !inQ;
      else if (c === "," && !inQ) {
        cols.push(cur.trim().replace(/^"|"$/g, ""));
        cur = "";
      } else cur += c;
    }
    cols.push(cur.trim().replace(/^"|"$/g, ""));
    return cols;
  }).filter((r) => r.some((c) => c.trim()));
}

export async function fetchTabAsRows(csvUrl: string): Promise<string[][]> {
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const text = await res.text();
  // Reject HTML responses (private sheets often return a sign-in HTML page)
  if (/^\s*<!DOCTYPE html|^\s*<html/i.test(text)) {
    throw new Error("Sheet is private. Make sure it is shared 'Anyone with the link can view' or published to the web.");
  }
  return parseCSV(text);
}
