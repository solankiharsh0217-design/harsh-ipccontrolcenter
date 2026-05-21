// Canonical media buyer source + alias-aware normalization.
// Single source of truth: quick_save_entries (field_key = "media_buyer_name")
// plus media_buyer_aliases for misspelling → canonical mapping.
import { supabase } from "@/integrations/supabase/client";

export interface MediaBuyerAlias {
  id: string;
  alias_name: string;
  canonical_name: string;
  reason: string | null;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

const FIELD_KEY = "media_buyer_name";

// In-memory cache shared across the app
let canonicalCache: string[] | null = null;
let aliasCache: Map<string, string> | null = null; // lower(trim(alias)) -> canonical
let loadPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify() { subscribers.forEach((cb) => { try { cb(); } catch {} }); }

function norm(s: string) { return s.trim().toLowerCase(); }

async function loadAll(force = false) {
  if (!force && canonicalCache && aliasCache) return;
  if (loadPromise && !force) return loadPromise;
  loadPromise = (async () => {
    const [{ data: qs }, { data: aliases }] = await Promise.all([
      supabase
        .from("quick_save_entries")
        .select("value")
        .eq("field_key", FIELD_KEY)
        .eq("is_active", true),
      (supabase as any)
        .from("media_buyer_aliases")
        .select("alias_name, canonical_name, is_active, is_deleted"),
    ]);
    const seen = new Map<string, string>();
    (qs || []).forEach((r: any) => {
      const v = String(r.value || "").trim();
      if (!v) return;
      if (!seen.has(norm(v))) seen.set(norm(v), v);
    });
    canonicalCache = Array.from(seen.values()).sort((a, b) => a.localeCompare(b));

    const m = new Map<string, string>();
    (aliases || []).forEach((a: any) => {
      if (a.is_deleted || a.is_active === false) return;
      const k = norm(String(a.alias_name || ""));
      const c = String(a.canonical_name || "").trim();
      if (k && c) m.set(k, c);
    });
    aliasCache = m;
    notify();
  })();
  try { await loadPromise; } finally { loadPromise = null; }
}

export async function getCanonicalMediaBuyers(): Promise<string[]> {
  await loadAll();
  return canonicalCache ? [...canonicalCache] : [];
}

export async function getMediaBuyerAliasMap(): Promise<Map<string, string>> {
  await loadAll();
  return aliasCache ? new Map(aliasCache) : new Map();
}

export async function refreshMediaBuyerCache() {
  await loadAll(true);
}

export function subscribeMediaBuyers(cb: () => void) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

// ── Sync helpers (use cache; safe if loadAll() ran at least once)

export function normalizeMediaBuyerNameSync(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const key = trimmed.toLowerCase();
  // 1) alias hit
  const aliasHit = aliasCache?.get(key);
  if (aliasHit) return aliasHit;
  // 2) canonical match case-insensitive
  if (canonicalCache) {
    const hit = canonicalCache.find((c) => c.toLowerCase() === key);
    if (hit) return hit;
  }
  // 3) cleaned original
  return trimmed.replace(/\s+/g, " ");
}

export async function normalizeMediaBuyerName(raw: string | null | undefined): Promise<string> {
  await loadAll();
  return normalizeMediaBuyerNameSync(raw);
}

// Split a value into a list of names (handles strings, arrays, JSON arrays,
// comma/plus/slash/and separators). Does NOT split inside email addresses.
function splitRaw(val: any): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.flatMap((v) => splitRaw(v));
  }
  const s = String(val).trim();
  if (!s) return [];
  // Try JSON
  if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith("{") && s.endsWith("}"))) {
    try { return splitRaw(JSON.parse(s)); } catch { /* fallthrough */ }
  }
  // If it looks like an email, do not split
  if (/^\S+@\S+\.\S+$/.test(s)) return [s];
  return s.split(/[,+\/&]| and /i).map((p) => p.trim()).filter(Boolean);
}

export function normalizeMediaBuyerListSync(value: any): string[] {
  const parts = splitRaw(value);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const n = normalizeMediaBuyerNameSync(p);
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

export async function normalizeMediaBuyerList(value: any): Promise<string[]> {
  await loadAll();
  return normalizeMediaBuyerListSync(value);
}

// Simple similarity (Levenshtein-based ratio) used for "did you mean…" warnings.
function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[] = Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

export function findSimilarMediaBuyer(candidate: string): string | null {
  if (!candidate || !canonicalCache) return null;
  const c = candidate.trim().toLowerCase();
  if (!c) return null;
  // Exact match -> not "similar"; caller already has it.
  if (canonicalCache.some((x) => x.toLowerCase() === c)) return null;
  let best: { name: string; score: number } | null = null;
  for (const name of canonicalCache) {
    const n = name.toLowerCase();
    const d = levenshtein(c, n);
    const max = Math.max(c.length, n.length);
    const ratio = 1 - d / max;
    if (ratio >= 0.75 || (d <= 2 && max >= 4)) {
      if (!best || ratio > best.score) best = { name, score: ratio };
    }
  }
  return best?.name ?? null;
}

// Eagerly warm the cache on import (best-effort; non-blocking).
loadAll().catch(() => {});
