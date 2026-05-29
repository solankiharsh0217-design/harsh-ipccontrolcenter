// Shared identity normalization for Lead Qualifier, CRM import, and batch repair.
// One source of truth so dedup is consistent everywhere.

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common typo domains we warn about but never auto-correct (Part 2).
const SUSPICIOUS_DOMAINS = new Set([
  "gamil.com", "gmial.com", "gmai.com", "gmal.com", "gnail.com",
  "yahho.com", "yaho.com", "hotnail.com", "hotmial.com", "outlok.com",
]);

export function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(ZERO_WIDTH_RE, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return !!email && EMAIL_RE.test(email);
}

export function suspiciousEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1);
  return SUSPICIOUS_DOMAINS.has(domain) ? domain : null;
}

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).replace(/\D/g, "");
  if (!s) return "";
  if (s.length > 10 && s.startsWith("91")) s = s.slice(s.length - 10);
  if (s.length > 10) s = s.slice(s.length - 10);
  return s;
}

export function isValidPhone(phone: string): boolean {
  return phone.length === 10;
}

export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).replace(ZERO_WIDTH_RE, "").trim().replace(/\s+/g, " ").toLowerCase();
}

export interface Identity {
  key: string;
  kind: "email" | "phone" | "name";
  weak: boolean;
  email: string;
  phone: string;
  name: string;
}

export function buildIdentity(
  raw: { email?: string | null; phone?: string | null; name?: string | null },
): Identity {
  const email = normalizeEmail(raw.email);
  const phone = normalizePhone(raw.phone);
  const name = normalizeName(raw.name);

  if (email && isValidEmail(email)) {
    return { key: `email:${email}`, kind: "email", weak: false, email, phone, name };
  }
  if (phone && isValidPhone(phone)) {
    return { key: `phone:${phone}`, kind: "phone", weak: false, email, phone, name };
  }
  if (name) {
    return { key: `name:${name}`, kind: "name", weak: true, email, phone, name };
  }
  return { key: "", kind: "name", weak: true, email, phone, name };
}

// "Best row" tiebreaker used by both registration dedup and CRM batch repair.
// Higher score wins. Caller passes already-built identities for both rows.
export function bestRowScore(row: {
  email: string;
  phone: string;
  name: string;
  hasExtras?: boolean;
  receivedAt?: string | number | Date | null;
}): number {
  let s = 0;
  if (row.email && row.phone) s += 1000;
  else if (row.email) s += 600;
  else if (row.phone) s += 400;
  if (row.name && row.name.length >= 3) s += 50;
  if (row.hasExtras) s += 25;
  const t = row.receivedAt ? new Date(row.receivedAt).getTime() : 0;
  if (Number.isFinite(t)) s += Math.min(20, t / 1e13); // tiny recency boost
  return s;
}
