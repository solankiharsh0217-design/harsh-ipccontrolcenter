// Stage chip color helper. Uses stored color when present, falls back to a
// stable hash-based palette so the same stage name always renders the same
// chip across the app.

export interface StageChip { bg: string; text: string; border: string; dot: string; }

// Curated keyword → chip map for the most common Calling CRM stages.
const KEYWORD_CHIPS: Array<{ test: RegExp; chip: StageChip }> = [
  { test: /payment confirmed|paid/i,           chip: c("#DCFCE7", "#166534", "#86EFAC", "#16A34A") },
  { test: /welcome call pending|welcome pending/i, chip: c("#FEF3C7", "#92400E", "#FDE68A", "#D97706") },
  { test: /welcome call done|welcome done/i,   chip: c("#DBEAFE", "#1E3A8A", "#93C5FD", "#2563EB") },
  { test: /onboarding call done|onboarding done/i, chip: c("#E0E7FF", "#3730A3", "#C7D2FE", "#4F46E5") },
  { test: /documents requested|docs requested/i, chip: c("#FFEDD5", "#9A3412", "#FED7AA", "#EA580C") },
  { test: /documents received|docs received/i, chip: c("#CCFBF1", "#115E59", "#99F6E4", "#0D9488") },
  { test: /bajaj.*submitted|finance submitted/i, chip: c("#EDE9FE", "#5B21B6", "#DDD6FE", "#7C3AED") },
  { test: /bajaj|finance docs|finance documents/i, chip: c("#F3E8FF", "#6B21A8", "#E9D5FF", "#9333EA") },
  { test: /finance approved|approved/i,        chip: c("#D1FAE5", "#065F46", "#A7F3D0", "#059669") },
  { test: /code of conduct|coc/i,              chip: c("#CFFAFE", "#155E75", "#A5F3FC", "#0891B2") },
  { test: /access given|access granted/i,      chip: c("#E0F2FE", "#075985", "#BAE6FD", "#0284C7") },
  { test: /onboarding completed|completed/i,   chip: c("#DCFCE7", "#166534", "#86EFAC", "#16A34A") },
  { test: /issue|escalation/i,                 chip: c("#FEE2E2", "#991B1B", "#FCA5A5", "#DC2626") },
  { test: /dropped|refund|lost/i,              chip: c("#F3F4F6", "#374151", "#E5E7EB", "#6B7280") },
  { test: /hot|super hot|urgent/i,             chip: c("#FEE2E2", "#991B1B", "#FCA5A5", "#DC2626") },
  { test: /warm/i,                             chip: c("#FFEDD5", "#9A3412", "#FED7AA", "#EA580C") },
  { test: /cold|nurture/i,                     chip: c("#DBEAFE", "#1E40AF", "#93C5FD", "#2563EB") },
  { test: /follow.?up/i,                       chip: c("#FEF3C7", "#92400E", "#FDE68A", "#D97706") },
  { test: /token paid/i,                       chip: c("#DCFCE7", "#166534", "#86EFAC", "#16A34A") },
  { test: /token pending/i,                    chip: c("#FEF3C7", "#92400E", "#FDE68A", "#D97706") },
];

// Stable hash palette fallback (12 distinct soft chips).
const HASH_PALETTE: StageChip[] = [
  c("#FEE2E2", "#991B1B", "#FCA5A5", "#DC2626"),
  c("#FEF3C7", "#92400E", "#FDE68A", "#D97706"),
  c("#DCFCE7", "#166534", "#86EFAC", "#16A34A"),
  c("#DBEAFE", "#1E3A8A", "#93C5FD", "#2563EB"),
  c("#E0E7FF", "#3730A3", "#C7D2FE", "#4F46E5"),
  c("#F3E8FF", "#6B21A8", "#E9D5FF", "#9333EA"),
  c("#CCFBF1", "#115E59", "#99F6E4", "#0D9488"),
  c("#FFEDD5", "#9A3412", "#FED7AA", "#EA580C"),
  c("#CFFAFE", "#155E75", "#A5F3FC", "#0891B2"),
  c("#E0F2FE", "#075985", "#BAE6FD", "#0284C7") ,
  c("#FCE7F3", "#9D174D", "#FBCFE8", "#DB2777"),
  c("#F3F4F6", "#374151", "#E5E7EB", "#6B7280"),
];

function c(bg: string, text: string, border: string, dot: string): StageChip {
  return { bg, text, border, dot };
}

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

/** Returns chip colors for a stage. If `storedColor` is a hex/HSL, derives a soft chip. */
export function stageChip(name: string | null | undefined, storedColor?: string | null): StageChip {
  const n = (name || "").trim();
  if (!n) return HASH_PALETTE[HASH_PALETTE.length - 1];
  // Honor a meaningful stored color (not the default gray).
  if (storedColor && /^#?[0-9a-f]{6}$/i.test(storedColor) && storedColor.toLowerCase() !== "#e8e5de") {
    const hex = storedColor.startsWith("#") ? storedColor : `#${storedColor}`;
    return { bg: hex + "22", text: darken(hex), border: hex + "55", dot: hex };
  }
  for (const k of KEYWORD_CHIPS) if (k.test.test(n)) return k.chip;
  return HASH_PALETTE[hashIndex(n.toLowerCase(), HASH_PALETTE.length)];
}

function darken(hex: string): string {
  const v = hex.replace("#", "");
  const r = Math.max(0, parseInt(v.slice(0, 2), 16) - 80);
  const g = Math.max(0, parseInt(v.slice(2, 4), 16) - 80);
  const b = Math.max(0, parseInt(v.slice(4, 6), 16) - 80);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
