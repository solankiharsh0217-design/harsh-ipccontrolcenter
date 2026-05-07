import Papa from "papaparse";

export async function fetchPreview(url: string): Promise<{ headers: string[]; error?: string }> {
  let csvUrl = url;
  if (/\/pubhtml/.test(url)) csvUrl = url.replace("/pubhtml", "/pub").replace(/[?#].*$/, "") + "?output=csv";
  else if (/\/pub(\?|$)/.test(url) && !/output=csv/.test(url)) csvUrl = url + (url.includes("?") ? "&" : "?") + "output=csv";

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) return { headers: [], error: `Fetch failed (${res.status})` };
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      const m = text.match(/<table[\s\S]*?<\/table>/i);
      if (!m) return { headers: [], error: "No table found in published page" };
      const firstRow = m[0].match(/<tr[\s\S]*?<\/tr>/i)?.[0] || "";
      const cells = [...firstRow.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => c[1].replace(/<[^>]+>/g, "").trim());
      return { headers: cells.filter(Boolean) };
    }
    const parsed = Papa.parse(text, { header: false, preview: 1, skipEmptyLines: true });
    const first = (parsed.data?.[0] as string[]) || [];
    return { headers: first.map((h) => String(h).trim()).filter(Boolean) };
  } catch (e: any) {
    return { headers: [], error: e.message || "Unknown error" };
  }
}
