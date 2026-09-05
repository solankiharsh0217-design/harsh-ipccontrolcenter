import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { format, formatDistanceStrict } from "date-fns";
import { ExternalLink, Bell, Check, X } from "lucide-react";
import {
  fetchMyAttendance, checkIn, checkOut, fetchMyTodayEntries,
  generateMyEntriesForDate, countMyActiveAssignments,
  todayStr, type AttendanceSession, type MyKpiEntry,
} from "@/lib/myToday";
import { fetchSubmissionsForEntries, type KpiSubmission } from "@/lib/kpiSubmissions";
import { logActivity } from "@/lib/auditLog";
import SubmitKpiModal from "@/components/team-performance/SubmitKpiModal";
import { fetchMyTodayReminders, generateMyReminders, markReminderRead, dismissReminder, fetchTpSettings, type TpReminder } from "@/lib/tpReminders";
import { useActivityHeartbeat } from "@/hooks/useActivityHeartbeat";
import { evaluateActiveWorkKpis, isActiveWorkKpi, activeWorkTarget } from "@/lib/activeWorkAutoApprove";
import { LoadingState } from "@/components/ui-bits";

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

const REVIEWED_STATUSES = ["approved", "rejected", "missed", "waived"];

function actionLabel(entryStatus: string): string {
  if (entryStatus === "pending") return "Submit KPI";
  if (entryStatus === "submitted") return "Edit submission";
  if (entryStatus === "approved") return "View submission";
  if (entryStatus === "rejected") return "View feedback";
  return "View details";
}

export default function MyToday() {
  const { user, profile, isAdmin } = useAuth();
  const uid = user?.id;
  const today = useMemo(() => todayStr(), []);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [entries, setEntries] = useState<MyKpiEntry[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, KpiSubmission>>({});
  const [reviewers, setReviewers] = useState<Record<string, string>>({});
  const [assignmentCount, setAssignmentCount] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<MyKpiEntry | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<TpReminder[]>([]);
  const [tpSettings, setTpSettings] = useState<{ active_tracking_enabled: boolean; active_minutes_daily_target: number; idle_timeout_minutes: number } | null>(null);

  // Heartbeat: only when admin has enabled it and the user has a check-in session for today
  useActivityHeartbeat({
    enabled: !!tpSettings?.active_tracking_enabled && !!session && !!session.check_in_at && !session.check_out_at,
    idleTimeoutMinutes: tpSettings?.idle_timeout_minutes ?? 5,
    onTick: () => { void refreshActiveWork(); },
  });

  useEffect(() => {
    if (!uid) return;
    logActivity({ ...MOD, action_type: "my_today_opened", entity_type: "my_today", metadata: { date: today } }).catch(() => {});
  }, [uid, today]);

  const loadSubmissions = async (rows: MyKpiEntry[]) => {
    if (rows.length === 0) { setSubmissions({}); setReviewers({}); return; }
    try {
      const map = await fetchSubmissionsForEntries(rows.map(r => r.id));
      setSubmissions(map);
      const reviewerIds = Array.from(new Set(Object.values(map).map((s) => s.reviewed_by).filter(Boolean) as string[]));
      if (reviewerIds.length > 0) {
        const { data: profs } = await (await import("@/integrations/supabase/client")).supabase
          .from("profiles").select("id, full_name, email").in("id", reviewerIds);
        const rm: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { rm[p.id] = p.full_name || p.email || "Reviewer"; });
        setReviewers(rm);
      } else {
        setReviewers({});
      }
    } catch { /* non-fatal */ }
  };

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
      let final = existing;
      if (existing.length === 0 && count > 0) {
        try {
          await generateMyEntriesForDate(today);
          final = await fetchMyTodayEntries(uid, today);
          setGenError(null);
        } catch (e: any) {
          final = [];
          setGenError(e?.message ?? "Failed to generate KPIs");
        }
      } else {
        setGenError(null);
      }
      setEntries(final);
      const subMap = final.length > 0 ? await (async () => {
        try {
          const m = await fetchSubmissionsForEntries(final.map(r => r.id));
          return m;
        } catch { return {} as Record<string, KpiSubmission>; }
      })() : {} as Record<string, KpiSubmission>;
      setSubmissions(subMap);
      // Reminders + active-tracking settings
      let settingsLocal: any = null;
      try {
        settingsLocal = await fetchTpSettings();
        setTpSettings(settingsLocal ? {
          active_tracking_enabled: !!settingsLocal.active_tracking_enabled,
          active_minutes_daily_target: settingsLocal.active_minutes_daily_target ?? 360,
          idle_timeout_minutes: settingsLocal.idle_timeout_minutes ?? 5,
        } : null);
        if (settingsLocal?.daily_reminder_enabled) {
          await generateMyReminders(uid, today).catch(() => {});
        }
        const rems = await fetchMyTodayReminders(uid, today);
        setReminders(rems);
      } catch { /* non-fatal */ }

      // Auto-approve active-work KPIs if target already reached
      if (settingsLocal?.active_tracking_enabled && att) {
        const activeMinutes = Number((att as any).active_minutes ?? 0);
        const fallback = Number(settingsLocal.active_minutes_daily_target ?? 360);
        const res = await evaluateActiveWorkKpis({
          userId: uid,
          entries: final,
          submissions: subMap,
          activeMinutes,
          fallbackTarget: fallback,
          trackingEnabled: true,
        });
        if (res.approvedEntryIds.length > 0) {
          setEntries((prev) => prev.map((e) => res.approvedEntryIds.includes(e.id) ? { ...e, status: "approved" } : e));
          setSubmissions((prev) => ({ ...prev, ...res.submissionsByEntry }));
        }
      }

      // Reviewers (post-approval-aware)
      try {
        const currentSubs = { ...subMap };
        const reviewerIds = Array.from(new Set(Object.values(currentSubs).map((s) => s.reviewed_by).filter(Boolean) as string[]));
        if (reviewerIds.length > 0) {
          const { data: profs } = await (await import("@/integrations/supabase/client")).supabase
            .from("profiles").select("id, full_name, email").in("id", reviewerIds);
          const rm: Record<string, string> = {};
          (profs ?? []).forEach((p: any) => { rm[p.id] = p.full_name || p.email || "Reviewer"; });
          setReviewers(rm);
        }
      } catch { /* non-fatal */ }
    } finally {
      setLoading(false);
    }
  };

  // Lightweight refresh triggered after a heartbeat records a new active minute.
  const refreshActiveWork = async () => {
    if (!uid) return;
    if (!tpSettings?.active_tracking_enabled) return;
    try {
      const att = await fetchMyAttendance(uid, today);
      if (!att) return;
      setSession(att);
      const activeMinutes = Number((att as any).active_minutes ?? 0);
      const res = await evaluateActiveWorkKpis({
        userId: uid,
        entries,
        submissions,
        activeMinutes,
        fallbackTarget: tpSettings.active_minutes_daily_target,
        trackingEnabled: true,
      });
      if (res.approvedEntryIds.length > 0) {
        setEntries((prev) => prev.map((e) => res.approvedEntryIds.includes(e.id) ? { ...e, status: "approved" } : e));
        setSubmissions((prev) => ({ ...prev, ...res.submissionsByEntry }));
      }
    } catch { /* non-fatal */ }
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

  const handleSubmissionSaved = (sub: KpiSubmission, entryStatus: string) => {
    setSubmissions((prev) => ({ ...prev, [sub.entry_id]: sub }));
    setEntries((prev) => prev.map((e) => e.id === sub.entry_id ? { ...e, status: entryStatus } : e));
  };

  const doMarkRead = async (r: TpReminder) => {
    try {
      await markReminderRead(r.id);
      setReminders((prev) => prev.map((x) => x.id === r.id ? { ...x, status: "read" } : x));
    } catch (e: any) { toast.error(e?.message ?? "Could not mark read"); }
  };
  const doDismiss = async (r: TpReminder) => {
    try {
      await dismissReminder(r.id);
      setReminders((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e: any) { toast.error(e?.message ?? "Could not dismiss"); }
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
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/accountability-board">My Rewards & Ranking</Link>
          </Button>
          {isAdmin && (
            <Button asChild variant="outline" size="sm">
              <Link to="/team-performance/admin">Open Team Performance Admin</Link>
            </Button>
          )}
        </div>
      </div>

      <ScoreHero />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Attendance card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-sans">Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <LoadingState />
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
                  <span className="text-[10px] text-muted-foreground">
                    Source: {session.source === "login" ? "Login (auto)" : session.source === "manual" ? "Manual" : session.source}
                  </span>
                  {!session.check_out_at ? (
                    <Button size="sm" onClick={doCheckOut} disabled={busy}>Check out</Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Day complete</span>
                  )}
                </div>
                {tpSettings?.active_tracking_enabled && (
                  <div className="pt-2 border-t">
                    {(() => {
                      const am = (session as any).active_minutes ?? 0;
                      const target = tpSettings.active_minutes_daily_target ?? 360;
                      const pct = Math.min(100, Math.round((am / Math.max(1, target)) * 100));
                      return (
                        <>
                          <div className="flex items-baseline justify-between">
                            <div className="text-xs text-muted-foreground">Active work time</div>
                            <div className="text-xs text-muted-foreground">{am} / {target} min</div>
                          </div>
                          <div className="text-lg font-medium">{Math.floor(am/60)}h {am%60}m <span className="text-xs text-muted-foreground font-normal">active today</span></div>
                          <Progress value={pct} className="h-1.5 mt-1" />
                          <div className="text-[10px] text-muted-foreground mt-1">Counts only when this tab is visible and focused. No keystrokes, screenshots, or content are stored.</div>
                        </>
                      );
                    })()}
                  </div>
                )}
                {!tpSettings?.active_tracking_enabled && (
                  <div className="pt-2 border-t text-[10px] text-muted-foreground">Active time tracking is off.</div>
                )}
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
              <LoadingState />
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

      {/* Today's Reminders */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-sans flex items-center gap-2">
            <Bell className="w-4 h-4" /> Today's Reminders
            {reminders.filter((r) => r.status === "unread").length > 0 && (
              <Badge variant="secondary" className="ml-1">{reminders.filter((r) => r.status === "unread").length} unread</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reminders.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">No reminders right now.</div>
          ) : (
            <ul className="space-y-2">
              {reminders.map((r) => {
                const typeColor =
                  r.reminder_type === "overdue" ? "bg-rose-50 border-rose-200 text-rose-800" :
                  r.reminder_type === "due_soon" ? "bg-amber-50 border-amber-200 text-amber-800" :
                  r.reminder_type === "rejected_feedback" ? "bg-rose-50 border-rose-200 text-rose-800" :
                  "bg-sky-50 border-sky-200 text-sky-800";
                const unread = r.status === "unread";
                return (
                  <li key={r.id} className={`rounded-md border px-3 py-2 flex items-start justify-between gap-3 ${unread ? typeColor : "bg-muted/30 border-border text-foreground/70"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{r.title}</div>
                      <div className="text-xs mt-0.5">{r.message}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(r.generated_at), "hh:mm a")} · <span className="capitalize">{r.reminder_type.replace("_", " ")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {unread && (
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => doMarkRead(r)} title="Mark as read">
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => doDismiss(r)} title="Dismiss">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* KPI list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-sans">Today's tasks</CardTitle>
        </CardHeader>
        <CardContent>
        {loading ? (
          <div className="py-6"><LoadingState /></div>
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
                const sub = submissions[e.id];
                const reviewed = REVIEWED_STATUSES.includes(e.status);
                return (
                  <li key={e.id} className="py-3 px-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
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

                        {isActiveWorkKpi(e) && (() => {
                          const target = activeWorkTarget(e, tpSettings?.active_minutes_daily_target ?? 360);
                          const am = Number((session as any)?.active_minutes ?? 0);
                          const trackingOn = !!tpSettings?.active_tracking_enabled;
                          if (!trackingOn) {
                            return (
                              <div className="mt-2 text-[11px] text-muted-foreground">
                                Active tracking is off. This KPI cannot auto-complete.
                              </div>
                            );
                          }
                          if (e.status === "approved") {
                            return (
                              <div className="mt-2 text-[11px] text-emerald-700">
                                Approved automatically from active work time.
                              </div>
                            );
                          }
                          const pct = Math.min(100, Math.round((am / Math.max(1, target)) * 100));
                          return (
                            <div className="mt-2">
                              <div className="flex items-baseline justify-between">
                                <div className="text-[11px] text-muted-foreground">Active Work</div>
                                <div className="text-[11px] text-muted-foreground">{am} / {target} min</div>
                              </div>
                              <Progress value={pct} className="h-1 mt-0.5" />
                            </div>
                          );
                        })()}

                        {sub && (
                          <div className="mt-2 rounded-md bg-muted/40 border border-border px-2.5 py-1.5 text-xs space-y-0.5">
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                              {sub.submitted_value != null && (
                                <span>Value: <span className="font-medium">{sub.submitted_value}{e.kpi?.target_unit ? ` ${e.kpi.target_unit}` : ""}</span></span>
                              )}
                              <span className="text-muted-foreground">
                                Submitted {format(new Date(sub.submitted_at), "d MMM, hh:mm a")}
                              </span>
                              {sub.proof_url && (
                                <a
                                  href={sub.proof_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                                  onClick={(ev) => ev.stopPropagation()}
                                >
                                  Proof <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            {sub.notes && (
                              <div className="text-muted-foreground line-clamp-1">Notes: {sub.notes}</div>
                            )}
                            {sub.reviewed_at && (
                              <div className="text-muted-foreground">
                                {e.status === "approved" ? "Approved" : e.status === "rejected" ? "Rejected" : "Reviewed"}{" "}
                                {format(new Date(sub.reviewed_at), "d MMM, hh:mm a")}
                                {reviewers[sub.reviewed_by ?? ""] ? ` by ${reviewers[sub.reviewed_by!]}` : ""}
                              </div>
                            )}
                            {e.status === "rejected" && sub.review_notes && (
                              <div className="text-rose-700">Feedback: {sub.review_notes}</div>
                            )}
                            {e.status === "approved" && sub.review_notes && (
                              <div className="text-emerald-700">Note: {sub.review_notes}</div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded border capitalize ${statusChipClass(e.status, overdue)}`}>
                          {e.status}
                        </span>
                        {overdue && (
                          <span className="text-[10px] text-amber-700">Overdue</span>
                        )}
                        <Button
                          size="sm"
                          variant={reviewed ? "outline" : "default"}
                          className="mt-1 h-7 text-xs"
                          onClick={() => setSelected(e)}
                        >
                          {actionLabel(e.status)}
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {selected && uid && (
        <SubmitKpiModal
          entry={selected}
          actorId={uid}
          onClose={() => setSelected(null)}
          onSaved={handleSubmissionSaved}
        />
      )}
    </div>
  );
}
