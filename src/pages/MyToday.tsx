import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, formatDistanceStrict } from "date-fns";
import {
  fetchMyAttendance, checkIn, checkOut, fetchMyTodayEntries,
  generateMyEntriesForDate, countMyActiveAssignments,
  todayStr, type AttendanceSession, type MyKpiEntry,
} from "@/lib/myToday";
import { logActivity } from "@/lib/auditLog";

const MOD = { module_key: "team_performance", module_label: "Team Performance" };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function statusChipClass(status: string, overdue: boolean): string {
  if (overdue && status === "pending") return "bg-amber-100 text-amber-800 border-amber-200";
  switch (status) {
    case "approved": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "submitted": return "bg-sky-100 text-sky-800 border-sky-200";
    case "rejected": return "bg-rose-100 text-rose-800 border-rose-200";
    case "missed": return "bg-rose-100 text-rose-800 border-rose-200";
    case "waived": return "bg-neutral-100 text-neutral-700 border-neutral-200";
    default: return "bg-muted text-foreground/70 border-border";
  }
}

export default function MyToday() {
  const { user, profile, isAdmin } = useAuth();
  const uid = user?.id;
  const today = useMemo(() => todayStr(), []);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [entries, setEntries] = useState<MyKpiEntry[]>([]);
  const [assignmentCount, setAssignmentCount] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<MyKpiEntry | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    logActivity({ ...MOD, action_type: "my_today_opened", entity_type: "my_today", metadata: { date: today } }).catch(() => {});
  }, [uid, today]);

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [att, existing, count] = await Promise.all([
        fetchMyAttendance(uid, today),
        fetchMyTodayEntries(uid, today),
        countMyActiveAssignments(uid, today),
      ]);
      setSession(att);
      setAssignmentCount(count);
      if (existing.length === 0 && count > 0) {
        try {
          await generateMyEntriesForDate(today);
          const refreshed = await fetchMyTodayEntries(uid, today);
          setEntries(refreshed);
          setGenError(null);
        } catch (e: any) {
          setEntries([]);
          setGenError(e?.message ?? "Failed to generate KPIs");
        }
      } else {
        setEntries(existing);
        setGenError(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uid, today]);

  const doCheckIn = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      const s = await checkIn(uid);
      setSession(s);
      toast.success("Checked in");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not check in");
    } finally { setBusy(false); }
  };

  const doCheckOut = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const s = await checkOut(session);
      setSession(s);
      toast.success("Checked out");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not check out");
    } finally { setBusy(false); }
  };

  const stats = useMemo(() => {
    const total = entries.length;
    const pending = entries.filter((e) => e.status === "pending").length;
    const approved = entries.filter((e) => e.status === "approved").length;
    const submitted = entries.filter((e) => e.status === "submitted").length;
    const rejected = entries.filter((e) => e.status === "rejected").length;
    const missed = entries.filter((e) => e.status === "missed").length;
    const done = total - pending;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, pending, approved, submitted, rejected, missed, pct };
  }, [entries]);

  const firstName = (profile?.full_name || user?.email || "").split(" ")[0] || "there";
  const now = new Date();

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-serif text-3xl md:text-4xl">{greeting()}, {firstName}</div>
          <div className="font-sans text-sm text-muted-foreground mt-1">
            {format(now, "EEEE, d MMMM yyyy")}
          </div>
        </div>
        {isAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link to="/team-performance/admin">Open Team Performance Admin</Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Attendance card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-sans">Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !session ? (
              <>
                <div className="text-sm text-muted-foreground">Start your day by checking in.</div>
                <Button onClick={doCheckIn} disabled={busy}>Check in</Button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Check-in</div>
                    <div className="font-medium">{session.check_in_at ? format(new Date(session.check_in_at), "hh:mm a") : "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Check-out</div>
                    <div className="font-medium">{session.check_out_at ? format(new Date(session.check_out_at), "hh:mm a") : "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Working</div>
                    <div className="font-medium">
                      {session.check_out_at && session.total_minutes != null
                        ? `${Math.floor(session.total_minutes/60)}h ${session.total_minutes%60}m`
                        : session.check_in_at
                          ? formatDistanceStrict(new Date(session.check_in_at), now)
                          : "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">{session.status}</Badge>
                  {!session.check_out_at ? (
                    <Button size="sm" onClick={doCheckOut} disabled={busy}>Check out</Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Day complete</span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* KPI progress card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-sans">Today's KPIs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : stats.total === 0 ? (
              <div className="text-sm text-muted-foreground">
                {assignmentCount === 0
                  ? "No KPIs assigned yet. Your admin will assign your daily, weekly, or monthly KPIs."
                  : "No KPIs scheduled for today."}
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-serif">{stats.pct}%</div>
                  <div className="text-xs text-muted-foreground">progress</div>
                </div>
                <Progress value={stats.pct} />
                <div className="flex flex-wrap gap-2 text-xs pt-1">
                  <Badge variant="outline">{stats.total} total</Badge>
                  <Badge variant="outline">{stats.pending} pending</Badge>
                  {stats.submitted > 0 && <Badge variant="outline">{stats.submitted} submitted</Badge>}
                  {stats.approved > 0 && <Badge variant="outline">{stats.approved} approved</Badge>}
                  {stats.rejected > 0 && <Badge variant="outline">{stats.rejected} rejected</Badge>}
                  {stats.missed > 0 && <Badge variant="outline">{stats.missed} missed</Badge>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KPI list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-sans">Today's tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-6">Loading…</div>
          ) : genError ? (
            <div className="text-sm text-rose-600 py-6">
              Could not load today's KPIs. Please refresh or contact admin.
            </div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">
              {assignmentCount === 0
                ? "No KPIs assigned yet."
                : "Nothing scheduled for today."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((e) => {
                const overdue = e.status === "pending" && e.due_at != null && new Date(e.due_at) < now;
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => setSelected(e)}
                      className="w-full text-left py-3 px-1 hover:bg-muted/40 transition-colors rounded-md flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{e.kpi?.name ?? "KPI"}</div>
                        {e.kpi?.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">{e.kpi.description}</div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <Badge variant="outline" className="text-[10px] capitalize">{e.period_type}</Badge>
                          {e.target_value != null && (
                            <Badge variant="outline" className="text-[10px]">
                              Target: {e.target_value}{e.kpi?.target_unit ? ` ${e.kpi.target_unit}` : ""}
                            </Badge>
                          )}
                          {e.due_at && (
                            <Badge variant="outline" className="text-[10px]">
                              Due {format(new Date(e.due_at), "hh:mm a")}
                            </Badge>
                          )}
                          {e.kpi?.proof_required && <Badge variant="outline" className="text-[10px]">Proof</Badge>}
                          {e.kpi?.approval_required && <Badge variant="outline" className="text-[10px]">Approval</Badge>}
                          {e.assignment?.assignment_type && (
                            <Badge variant="outline" className="text-[10px] capitalize">{e.assignment.assignment_type}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded border capitalize ${statusChipClass(e.status, overdue)}`}>
                          {e.status}
                        </span>
                        {overdue && (
                          <span className="text-[10px] text-amber-700">Overdue</span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{selected?.kpi?.name ?? "KPI"}</DialogTitle>
            {selected?.kpi?.description && (
              <DialogDescription>{selected.kpi.description}</DialogDescription>
            )}
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Cadence</div>
                  <div className="capitalize">{selected.period_type}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Target</div>
                  <div>{selected.target_value ?? "—"}{selected.kpi?.target_unit ? ` ${selected.kpi.target_unit}` : ""}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Period</div>
                  <div>{format(new Date(selected.period_start), "d MMM")} – {format(new Date(selected.period_end), "d MMM")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Due</div>
                  <div>{selected.due_at ? format(new Date(selected.due_at), "d MMM, hh:mm a") : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Proof required</div>
                  <div>{selected.kpi?.proof_required ? "Yes" : "No"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Approval required</div>
                  <div>{selected.kpi?.approval_required ? "Yes" : "No"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="capitalize">{selected.status}</div>
                </div>
              </div>
              <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
                Submission will be available in the next phase.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
