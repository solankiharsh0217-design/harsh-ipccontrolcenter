export function inr(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "₹0";
  const num = Number(n);
  if (opts.compact && Math.abs(num) >= 100000) {
    if (Math.abs(num) >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
    return `₹${(num / 100000).toFixed(2)}L`;
  }
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(num).replace(/^/, "₹");
}
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0";
  return new Intl.NumberFormat("en-IN").format(Number(n));
}
export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "0%";
  return `${Number(n).toFixed(digits)}%`;
}
export function rel(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return d.toLocaleString("en-IN");
}
