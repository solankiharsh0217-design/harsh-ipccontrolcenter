// Tab role classification + media buyer name cleaning helpers (mirrors edge fn rules
// so the UI can re-classify locally if a user reuses a saved mapping).

const SALES_NAME_KW = ["sales", "sale", "payment", "payments", "paid", "enrollments",
  "closed won", "buyers", "students", "conversions", "purchases"];
const IGNORE_NAME_KW = ["dashboard", "summary", "config", "instructions", "readme",
  "template", "sample", "pivot", "report", "analysis", "notes", "data validation", "settings"];

export type TabRole = "sales" | "media_buyer" | "ignore" | "unknown";

export function cleanMediaBuyerName(tabName: string): string {
  return (tabName || "")
    .replace(/^mb[_\-\s]+/i, "")
    .replace(/[_\-\s]+leads?$/i, "")
    .replace(/[_\-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function guessRole(tabName: string, headers: string[]): TabRole {
  const ln = (tabName || "").toLowerCase();
  const lh = headers.map((h) => (h || "").toLowerCase());
  if (IGNORE_NAME_KW.some((k) => ln.includes(k))) return "ignore";
  if (SALES_NAME_KW.some((k) => ln.includes(k))) return "sales";
  const mbHits = ["name", "email", "phone", "mobile", "whatsapp", "contact"]
    .filter((k) => lh.some((h) => h.includes(k))).length;
  if (mbHits >= 2) return "media_buyer";
  return "unknown";
}
