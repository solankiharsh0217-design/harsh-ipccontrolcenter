// Tiny CSV helper for Operations CRM Phase D exports.
function escape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, any>[], columns?: string[]): string {
  if (!rows.length) return columns ? columns.join(",") + "\n" : "";
  const cols = columns ?? Object.keys(rows[0]);
  const head = cols.join(",");
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
