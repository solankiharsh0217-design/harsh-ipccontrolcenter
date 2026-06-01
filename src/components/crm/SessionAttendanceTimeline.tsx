import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  listAttendanceForLead,
  getHotnessForLead,
  recalculateHotness,
  setManualOverride,
  displayedHotness,
  type AttendanceRow,
  type HotnessScore,
  type Hotness,
  HOTNESS_LABEL,
} from "@/lib/leadAttendance";
import HotnessChip from "./HotnessChip";

interface LegacyAttendance {
  grade?: "hot" | "warm" | "cold" | "absent" | string | null;
  is_super_hot?: boolean | null;
  score?: number | null;
  attendance_pct?: number | null;
  sessions_count?: number | null;
  total_minutes?: number | null;
  webinar_count?: number | null;
  webinar_source?: string | null;
  webinar_date?: string | null;
}

interface Props {
  leadId: string;
  isAdmin?: boolean;
  legacy?: LegacyAttendance;
}

export default function SessionAttendanceTimeline({ leadId, isAdmin = false, legacy }: Props) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [hotness, setHotness] = useState<HotnessScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideGrade, setOverrideGrade] = useState<Hotness>("hot");
  const [overrideReason, setOverrideReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [r, h] = await Promise.all([listAttendanceForLead(leadId), getHotnessForLead(leadId)]);
      setRows(r);
      setHotness(h);
    } catch (e: any) {
      console.warn("attendance load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [leadId]);

  const recalc = async () => {
    try {
      const h = await recalculateHotness(leadId);
      setHotness(h);
      toast.success("Hotness recalculated");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const saveOverride = async (clear = false) => {
    try {
      await setManualOverride(leadId, clear ? null : overrideGrade, clear ? null : overrideReason, profile?.id || null);
      toast.success(clear ? "Override cleared" : "Override saved");
      setShowOverride(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const grade = displayedHotness(hotness);
  const visible = expanded ? rows : rows.slice(0, 3);

  return (
    <div className="px-6 py-4 border-b border-line">
      <div className="section-divider flex items-center justify-between">
        <span>Attendance Intelligence</span>
        {isAdmin && (
          <button onClick={recalc} className="text-[10px] text-muted-foreground hover:text-black underline">
            Recalculate
          </button>
        )}
      </div>

      <div className="rounded-lg border border-line bg-off/30 p-3 mb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <HotnessChip grade={grade} manual={!!hotness?.manual_override} />
          <div className="text-[10px] text-muted-foreground">
            Score: <b className="text-foreground">{hotness?.score_numeric ?? 0}</b>/100
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div><span className="text-muted-foreground">Attendance %:</span> <b>{hotness?.cumulative_attendance_percentage ?? 0}%</b></div>
          <div><span className="text-muted-foreground">Sessions:</span> <b>{hotness?.total_sessions_attended ?? 0}</b></div>
          <div><span className="text-muted-foreground">Total attended:</span> <b>{hotness?.total_attended_minutes ?? 0} min</b></div>
          <div><span className="text-muted-foreground">Total possible:</span> <b>{hotness?.total_possible_minutes ?? 0} min</b></div>
          <div><span className="text-muted-foreground">Webinars:</span> <b>{hotness?.total_webinars_attended ?? 0}</b></div>
          <div><span className="text-muted-foreground">Best session:</span> <b>{hotness?.highest_attendance_percentage ?? 0}%</b></div>
          <div className="col-span-2"><span className="text-muted-foreground">Last attended:</span> <b>{hotness?.last_attended_at ? new Date(hotness.last_attended_at).toLocaleDateString() : "—"}</b></div>
          <div className="col-span-2"><span className="text-muted-foreground">Identity matched by:</span> <b>{rows[0]?.normalized_email ? "email" : rows[0]?.normalized_phone ? "phone" : rows.length ? "name (weak)" : "—"}</b></div>
        </div>

        {isAdmin && (
          <div className="mt-2 pt-2 border-t border-line">
            {!showOverride ? (
              <button onClick={() => setShowOverride(true)} className="text-[10px] text-muted-foreground hover:text-black underline">
                {hotness?.manual_override ? "Edit manual override" : "Set manual override"}
              </button>
            ) : (
              <div className="space-y-2">
                <select className="ipc-input !h-8 !text-[11px]" value={overrideGrade} onChange={(e) => setOverrideGrade(e.target.value as Hotness)}>
                  {(["super_hot","hot","warm","cold","inactive"] as Hotness[]).map((g) => (
                    <option key={g} value={g}>{HOTNESS_LABEL[g]}</option>
                  ))}
                </select>
                <input className="ipc-input !h-8 !text-[11px]" placeholder="Reason" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => saveOverride(false)} className="ipc-btn !h-7 !text-[10px]">Save</button>
                  {hotness?.manual_override && <button onClick={() => saveOverride(true)} className="ipc-btn ipc-btn-ghost !h-7 !text-[10px]">Clear</button>}
                  <button onClick={() => setShowOverride(false)} className="ipc-btn ipc-btn-ghost !h-7 !text-[10px]">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-[11px] text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">No session attendance recorded yet.</div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((r) => (
            <div key={r.id} className="rounded-md border border-line bg-white p-2 text-[11px]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium truncate">{r.webinar_name || r.webinar_id || "Session"}{r.session_day ? ` · Day ${r.session_day}` : ""}</div>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${
                  r.attendance_grade === "hot" ? "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]" :
                  r.attendance_grade === "warm" ? "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" :
                  r.attendance_grade === "cold" ? "bg-[#DBEAFE] text-[#1E3A8A] border-[#93C5FD]" :
                  "bg-[#F3F4F6] text-[#374151] border-[#E5E7EB]"
                }`}>{r.attendance_grade}</span>
              </div>
              <div className="text-muted-foreground mt-0.5">
                {r.session_date || "—"} · {r.attended_minutes_capped}/{r.session_duration_minutes} min · {r.attendance_percentage}% · {r.join_count} join{r.join_count > 1 ? "s" : ""} · <span className="uppercase">{r.source}</span>
              </div>
            </div>
          ))}
          {rows.length > 3 && (
            <button onClick={() => setExpanded(!expanded)} className="text-[10px] text-muted-foreground hover:text-black underline">
              {expanded ? "Show less" : `View all ${rows.length} sessions`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
