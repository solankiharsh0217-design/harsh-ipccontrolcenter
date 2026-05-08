// Pure normalization helpers for the deterministic ROAS attribution engine.
// Never mutates inputs.

export function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).trim().toLowerCase().replace(/\s+/g, "");
}

export function normalizePhone(raw: string | null | undefined): { phone: string; weak: boolean } {
  if (raw == null) return { phone: "", weak: true };
  let s = String(raw).replace(/\D/g, "");
  if (s.length > 10 && s.startsWith("91")) s = s.slice(s.length - 10);
  if (s.length > 10) s = s.slice(s.length - 10);
  if (s.length === 0) return { phone: "", weak: true };
  return { phone: s, weak: s.length < 10 };
}

export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function nameTokens(n: string): string[] {
  return n.split(" ").filter((w) => w.length >= 2);
}

export function parseRevenue(raw: string | number | null | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  const s = String(raw).replace(/[₹,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Stable FNV-1a 32-bit hash → hex string. Used for snapshot/output checksums.
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function hashJSON(value: unknown): string {
  // Deterministic JSON via sorted keys
  const seen = new WeakSet<object>();
  const stringify = (v: unknown): string => {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (seen.has(v as object)) return '"[circular]"';
    seen.add(v as object);
    if (Array.isArray(v)) return "[" + v.map(stringify).join(",") + "]";
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stringify((v as Record<string, unknown>)[k])).join(",") + "}";
  };
  return hashString(stringify(value));
}

// Word-level fuzzy similarity for names. Returns 0..1.
// Token overlap (Jaccard) with substring boost. Designed for short personal names.
export function nameSimilarity(a: string, b: string): number {
  const an = normalizeName(a);
  const bn = normalizeName(b);
  if (!an || !bn) return 0;
  if (an === bn) return 1;
  const at = nameTokens(an);
  const bt = nameTokens(bn);
  if (!at.length || !bt.length) return 0;
  const A = new Set(at);
  const B = new Set(bt);
  let inter = 0;
  A.forEach((t) => { if (B.has(t)) inter++; });
  const jaccard = inter / (A.size + B.size - inter);
  // require at least one token of length>=4 in common to avoid short-name false positives
  let strongShared = false;
  A.forEach((t) => { if (t.length >= 4 && B.has(t)) strongShared = true; });
  const boost = strongShared ? 0.15 : 0;
  return Math.min(1, jaccard + boost);
}
