export function cleanPhone(raw: string | null | undefined): { clean: string | null; valid: boolean } {
  if (!raw) return { clean: null, valid: false };
  let s = String(raw).replace(/\D/g, "");
  if (s.startsWith("91") && s.length > 10) s = s.slice(s.length - 10);
  if (s.length > 10) s = s.slice(s.length - 10);
  if (s.length !== 10) return { clean: s || null, valid: false };
  return { clean: s, valid: true };
}
export function cleanEmail(raw: string | null | undefined): { clean: string | null; valid: boolean } {
  if (!raw) return { clean: null, valid: false };
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  return { clean: s || null, valid: ok };
}
export function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return String(raw).trim().replace(/\s+/g, " ") || null;
}
export function cleanMoney(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw;
  const s = String(raw).replace(/[₹,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return iso;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, dd, mm, yyyyRaw, hh, mi, ss] = m;
    let yyyy = parseInt(yyyyRaw);
    if (yyyy < 100) yyyy += 2000;
    const d = new Date(Date.UTC(yyyy, parseInt(mm) - 1, parseInt(dd), parseInt(hh || "0"), parseInt(mi || "0"), parseInt(ss || "0")));
    if (!isNaN(d.getTime())) return d;
  }
  const fb = new Date(s);
  return isNaN(fb.getTime()) ? null : fb;
}
export function rowHash(parts: (string | number | null | undefined)[]): string {
  const s = parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
