import { HOTNESS_LABEL, HOTNESS_STYLE, type Hotness } from "@/lib/leadAttendance";

export default function HotnessChip({ grade, size = "sm", manual = false }: { grade: Hotness; size?: "sm" | "xs"; manual?: boolean }) {
  const s = HOTNESS_STYLE[grade];
  const px = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${px}`}
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
      title={manual ? "Manual override" : undefined}
    >
      <span>{s.emoji}</span>
      <span>{HOTNESS_LABEL[grade]}</span>
      {manual && <span className="opacity-70">·M</span>}
    </span>
  );
}
