import Papa from "https://esm.sh/papaparse@5.4.1";

export type SheetRow = Record<string, string>;

export async function fetchPublishedSheet(url: string): Promise<SheetRow[]> {
  let csvUrl = url;
  if (/\/pubhtml/.test(url)) {
    csvUrl = url.replace("/pubhtml", "/pub").replace(/[?#].*$/, "") + "?output=csv";
  } else if (/\/pub(\?|$)/.test(url) && !/output=csv/.test(url)) {
    csvUrl = url + (url.includes("?") ? "&" : "?") + "output=csv";
  } else if (/docs\.google\.com\/spreadsheets\/d\/[^/]+\/edit/.test(url)) {
    throw new Error("This looks like an /edit URL. Use File → Share → Publish to web and paste the published URL.");
  }
  const res = await fetch(csvUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch sheet (${res.status} ${res.statusText})`);
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("text/csv") || /^[^<]/.test(text.trimStart())) return parseCsv(text);
  const rows = parseHtmlTable(text);
  if (rows.length === 0) return parseCsv(text);
  return rows;
}
function parseCsv(text: string): SheetRow[] {
  const result = Papa.parse<SheetRow>(text, { header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim() });
  return (result.data || []).filter((r) => Object.values(r).some((v) => v && String(v).trim() !== ""));
}
function parseHtmlTable(html: string): SheetRow[] {
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];
  const table = tableMatch[0];
  const rowMatches = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  if (rowMatches.length === 0) return [];
  const cellsOf = (tr: string) => [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => stripHtml(m[1]).trim());
  let headerIdx = 0;
  for (let i = 0; i < rowMatches.length; i++) {
    if (cellsOf(rowMatches[i]).some((x) => x !== "")) { headerIdx = i; break; }
  }
  const headers = cellsOf(rowMatches[headerIdx]);
  const out: SheetRow[] = [];
  for (let i = headerIdx + 1; i < rowMatches.length; i++) {
    const cells = cellsOf(rowMatches[i]);
    if (cells.every((c) => c === "")) continue;
    const row: SheetRow = {};
    headers.forEach((h, idx) => { row[h || `col_${idx}`] = cells[idx] ?? ""; });
    out.push(row);
  }
  return out;
}
function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
