import { HOTNESS_LABEL, HOTNESS_STYLE, displayedHotness, type HotnessScore } from "@/lib/leadAttendance";

function fmtMinutes(mins: number): string {
  if (!mins || mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export default function AttendanceBadge({
  score,
  size = "xs",
}: {
  score: HotnessScore | null | undefined;
  size?: "xs" | "sm";
}) {
  if (!score) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border border-line bg-white text-muted-foreground" title="No attendance data">
        No attendance
      </span>
    );
  }
  const grade = displayedHotness(score);
  const s = HOTNESS_STYLE[grade];
  const label = HOTNESS_LABEL[grade];
  const score_num = Math.round(score.score_numeric || 0);
  const mins = score.total_attended_minutes || 0;
  const px = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[9px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${px}`}
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
      title={`Attendance · Grade ${label} · Score ${score_num} · ${fmtMinutes(mins)} attended · ${score.total_sessions_attended || 0} sessions`}
    >
      <span>{s.emoji}</span>
      <span className="truncate">{label}</span>
      <span className="opacity-70">·</span>
      <span>{score_num}</span>
      <span className="opacity-70">·</span>
      <span>{fmtMinutes(mins)}</span>
      {score.manual_override && <span className="opacity-70" title="Manual override">·M</span>}
    </span>
  );
}

export const ATTENDANCE_GRADE_OPTIONS = [
  { value: "super_hot", label: "Super Hot" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
  { value: "inactive", label: "True Absentee" },
];

export const ATTENDANCE_MIN_MINUTES_OPTIONS = [
  { value: 0, label: "Any time" },
  { value: 30, label: "30+ minutes" },
  { value: 60, label: "60+ minutes" },
  { value: 120, label: "120+ minutes" },
  { value: 180, label: "180+ minutes" },
  { value: 300, label: "300+ minutes" },
];

export const ATTENDANCE_DATA_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "has", label: "Has attendance data" },
  { value: "none", label: "No attendance data" },
];
