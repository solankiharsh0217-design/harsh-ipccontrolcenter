import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHead } from "@/components/ui-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import {
  listReviewSubmissions, approveSubmission, rejectSubmission, markEntryMissed,
  fetchEntriesForUserRange, computeScorecard, computePeriodRange, fetchReviewSummary,
  listOverduePendingEntries, listActiveTeamMembers, fetchAttendanceForDate,
  type ReviewSubmissionRow, type EntryWithMeta, type Scorecard, type ScorecardPeriod,
  type ReviewSummary,
} from "@/lib/kpiReview";
import { listKpiDefinitions, type KpiDefinition } from "@/lib/teamPerformance";

function statusChipClass(status: string): string {
  switch (status) {
    case "approved": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "submitted": return "bg-sky-100 text-sky-800 border-sky-200";
    case "rejected": return "bg-rose-100 text-rose-800 border-rose-200";
    case "missed": return "bg-rose-100 text-rose-800 border-rose-200";
    case "waived": return "bg-neutral-100 text-neutral-700 border-neutral-200";
    case "pending": return "bg-amber-100 text-amber-800 border-amber-200";
    default: return "bg-muted text-foreground/70 border-border";
  }
}

function nameOf(p: { full_name: string | null; email: string | null } | null | undefined): string {
  if (!p) return "Unknown";
  return p.full_name || p.email || "Unknown";
}

export default function TeamPerformanceReview() {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState("queue");

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6 text-center">
        <div className="font-serif text-2xl mb-2">Access restricted</div>
        <p className="text-sm text-muted-foreground">KPI Review is available to admins only.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 md:px-6 space-y-6">
      <PageHead title="KPI Review & Scorecard" sub="Review submitted proofs, approve or reject KPIs, and inspect team scorecards." />
      <SummaryCards />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue">Review Queue</TabsTrigger>
          <TabsTrigger value="scorecard">Team Scorecard</TabsTrigger>
          <TabsTrigger value="overdue">Overdue Pending</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-4">
          <ReviewQueue actorId={user?.id ?? ""} />
        </TabsContent>
        <TabsContent value="scorecard" className="mt-4">
          <TeamScorecardTab />
        </TabsContent>
        <TabsContent value="overdue" className="mt-4">
          <OverduePendingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function SummaryCards() {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  useEffect(() => {
    fetchReviewSummary().then(setSummary).catch(() => setSummary(null));
  }, []);
  const cell = (label: string, value: React.ReactNode) => (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-serif">{value ?? "—"}</div>
    </Card>
  );
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cell("Pending Review", summary?.pending_review ?? "—")}
      {cell("Approved Today", summary?.approved_today ?? "—")}
      {cell("Rejected Today", summary?.rejected_today ?? "—")}
      {cell("Team Avg Daily Score", summary?.team_avg_daily_score != null ? `${summary.team_avg_daily_score}%` : "—")}
      {cell("People With Pending", summary?.people_with_pending ?? "—")}
      {cell("Low Score (<50%)", summary?.people_with_low_score ?? "—")}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Review Queue

function ReviewQueue({ actorId }: { actorId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReviewSubmissionRow[]>([]);
  const [team, setTeam] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);

  const [status, setStatus] = useState<string>("submitted");
  const [userId, setUserId] = useState<string>("all");
  const [kpiId, setKpiId] = useState<string>("all");
  const [cadence, setCadence] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [proofOnly, setProofOnly] = useState<string>("any");
  const [approvalOnly, setApprovalOnly] = useState<string>("any");

  const [action, setAction] = useState<{ row: ReviewSubmissionRow; kind: "approve" | "reject" } | null>(null);
  const [viewRow, setViewRow] = useState<ReviewSubmissionRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await listReviewSubmissions({
        status: status === "all" ? null : status,
        userId: userId === "all" ? null : userId,
        kpiId: kpiId === "all" ? null : kpiId,
        cadence: cadence === "all" ? null : cadence,
        from: from || undefined,
        to: to || undefined,
        proofRequired: proofOnly === "any" ? null : proofOnly === "yes",
        approvalRequired: approvalOnly === "any" ? null : approvalOnly === "yes",
      });
      setRows(rows);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    listActiveTeamMembers().then(setTeam).catch(() => {});
    listKpiDefinitions().then(setKpis).catch(() => {});
  }, []);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, userId, kpiId, cadence, from, to, proofOnly, approvalOnly]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 text-sm">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Member</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                {team.map((t) => <SelectItem key={t.id} value={t.id}>{nameOf(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">KPI</Label>
            <Select value={kpiId} onValueChange={setKpiId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All KPIs</SelectItem>
                {kpis.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cadence</Label>
            <Select value={cadence} onValueChange={setCadence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Proof required</Label>
            <Select value={proofOnly} onValueChange={setProofOnly}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Approval required</Label>
            <Select value={approvalOnly} onValueChange={setApprovalOnly}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">{rows.length} submission{rows.length === 1 ? "" : "s"}</CardTitle>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Member</th>
                <th className="text-left py-2 pr-3">KPI</th>
                <th className="text-left py-2 pr-3">Period</th>
                <th className="text-left py-2 pr-3">Due</th>
                <th className="text-left py-2 pr-3">Submitted</th>
                <th className="text-left py-2 pr-3">Value / Target</th>
                <th className="text-left py-2 pr-3">Proof</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-right py-2 pl-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No submissions match these filters.</td></tr>
              ) : rows.map((r) => {
                const k = r.entry?.kpi;
                return (
                  <tr key={r.id} className="border-b align-top hover:bg-muted/30">
                    <td className="py-2 pr-3">{nameOf(r.user_profile)}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{k?.name ?? "KPI"}</div>
                      <div className="flex gap-1 mt-0.5">
                        {k?.cadence && <Badge variant="outline" className="text-[10px] capitalize">{k.cadence}</Badge>}
                        {k?.proof_required && <Badge variant="outline" className="text-[10px]">Proof</Badge>}
                        {k?.approval_required && <Badge variant="outline" className="text-[10px]">Approval</Badge>}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">
                      {r.entry?.period_start === r.entry?.period_end
                        ? r.entry?.period_start
                        : `${r.entry?.period_start} → ${r.entry?.period_end}`}
                    </td>
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">{r.entry?.due_at ? format(new Date(r.entry.due_at), "d MMM, HH:mm") : "—"}</td>
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">{format(new Date(r.submitted_at), "d MMM, HH:mm")}</td>
                    <td className="py-2 pr-3 text-xs">
                      {r.submitted_value != null ? <span className="font-medium">{r.submitted_value}{k?.target_unit ? ` ${k.target_unit}` : ""}</span> : "—"}
                      {r.entry?.target_value != null && <span className="text-muted-foreground"> / {r.entry.target_value}</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {r.proof_url ? (
                        <a href={r.proof_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline">
                          Link <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : r.notes ? <span className="text-muted-foreground">Notes only</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded border capitalize ${statusChipClass(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setViewRow(r)}>View</Button>
                      {r.status === "submitted" && (
                        <>
                          <Button size="sm" variant="default" className="ml-1" onClick={() => setAction({ row: r, kind: "approve" })}>Approve</Button>
                          <Button size="sm" variant="outline" className="ml-1" onClick={() => setAction({ row: r, kind: "reject" })}>Reject</Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {action && (
        <ReviewActionDialog
          row={action.row}
          kind={action.kind}
          actorId={actorId}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); load(); }}
        />
      )}
      {viewRow && <ViewSubmissionDialog row={viewRow} onClose={() => setViewRow(null)} />}
    </div>
  );
}

function ReviewActionDialog({ row, kind, actorId, onClose, onDone }: {
  row: ReviewSubmissionRow; kind: "approve" | "reject"; actorId: string;
  onClose: () => void; onDone: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const kpiName = row.entry?.kpi?.name;

  const submit = async () => {
    setBusy(true);
    try {
      if (kind === "approve") {
        await approveSubmission({ submissionId: row.id, entryId: row.entry_id, reviewNotes: notes, actorId, kpiName });
        toast.success("Approved");
      } else {
        if (!notes.trim()) { toast.error("Rejection reason required"); setBusy(false); return; }
        await rejectSubmission({ submissionId: row.id, entryId: row.entry_id, reviewNotes: notes, actorId, kpiName });
        toast.success("Rejected");
      }
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === "approve" ? "Approve submission" : "Reject submission"}</DialogTitle>
          <DialogDescription>
            {kpiName ?? "KPI"} — submitted by {nameOf(row.user_profile)} on {format(new Date(row.submitted_at), "d MMM, HH:mm")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {row.submitted_value != null && <div>Value: <b>{row.submitted_value}</b></div>}
          {row.proof_url && (
            <div>
              <a href={row.proof_url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline inline-flex items-center gap-1">
                View proof <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          {row.notes && <div className="text-muted-foreground">Notes: {row.notes}</div>}
          <div>
            <Label className="text-xs">{kind === "reject" ? "Rejection reason (required)" : "Review notes (optional)"}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={busy || (kind === "reject" && !notes.trim())}
            variant={kind === "reject" ? "destructive" : "default"}
          >
            {busy ? "Saving…" : (kind === "approve" ? "Approve" : "Reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewSubmissionDialog({ row, onClose }: { row: ReviewSubmissionRow; onClose: () => void }) {
  const k = row.entry?.kpi;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{k?.name ?? "Submission"}</DialogTitle>
          <DialogDescription>Submitted by {nameOf(row.user_profile)}</DialogDescription>
        </DialogHeader>
        <div className="text-sm space-y-2">
          <div>Status: <span className={`text-[10px] px-2 py-0.5 rounded border capitalize ${statusChipClass(row.status)}`}>{row.status}</span></div>
          <div>Submitted: {format(new Date(row.submitted_at), "d MMM yyyy, HH:mm")}</div>
          {row.submitted_value != null && <div>Value: <b>{row.submitted_value}</b>{k?.target_unit ? ` ${k.target_unit}` : ""}</div>}
          {row.entry?.target_value != null && <div>Target: {row.entry.target_value}</div>}
          {row.proof_url && (
            <div>
              Proof:{" "}
              <a href={row.proof_url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline inline-flex items-center gap-1">
                {row.proof_url} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          {row.notes && <div>Notes: {row.notes}</div>}
          {row.reviewed_at && <div>Reviewed: {format(new Date(row.reviewed_at), "d MMM yyyy, HH:mm")}{row.reviewer_profile ? ` by ${nameOf(row.reviewer_profile)}` : ""}</div>}
          {row.review_notes && <div className="rounded bg-muted/40 border border-border p-2">Review notes: {row.review_notes}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Team Scorecard tab

function TeamScorecardTab() {
  const [team, setTeam] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [userId, setUserId] = useState<string>("");
  const [refDate, setRefDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const [daily, setDaily] = useState<{ entries: EntryWithMeta[]; score: Scorecard } | null>(null);
  const [weekly, setWeekly] = useState<{ entries: EntryWithMeta[]; score: Scorecard } | null>(null);
  const [monthly, setMonthly] = useState<{ entries: EntryWithMeta[]; score: Scorecard } | null>(null);
  const [attendance, setAttendance] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { listActiveTeamMembers().then((t) => { setTeam(t); if (t.length > 0 && !userId) setUserId(t[0].id); }); /* eslint-disable-next-line */ }, []);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const base = new Date(refDate + "T12:00:00");
      const dRange = computePeriodRange("daily", base);
      const wRange = computePeriodRange("weekly", base);
      const mRange = computePeriodRange("monthly", base);
      const [dE, wE, mE, att] = await Promise.all([
        fetchEntriesForUserRange(userId, dRange.from, dRange.to),
        fetchEntriesForUserRange(userId, wRange.from, wRange.to),
        fetchEntriesForUserRange(userId, mRange.from, mRange.to),
        fetchAttendanceForDate(userId, dRange.from),
      ]);
      setDaily({ entries: dE, score: computeScorecard(dE) });
      setWeekly({ entries: wE, score: computeScorecard(wE) });
      setMonthly({ entries: mE, score: computeScorecard(mE) });
      setAttendance(att);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load scorecard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId, refDate]);

  const memberName = useMemo(() => nameOf(team.find((t) => t.id === userId) ?? null), [team, userId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3 items-end">
          <div className="min-w-[240px]">
            <Label className="text-xs">Team member</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
              <SelectContent>
                {team.map((t) => <SelectItem key={t.id} value={t.id}>{nameOf(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Reference date</Label>
            <Input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading || !userId}>{loading ? "Loading…" : "Refresh"}</Button>
        </CardContent>
      </Card>

      {!userId ? (
        <div className="text-sm text-muted-foreground">Select a team member.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ScoreCardBlock title="Daily" data={daily} />
            <ScoreCardBlock title="Weekly" data={weekly} />
            <ScoreCardBlock title="Monthly" data={monthly} />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Attendance ({refDate})</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {!attendance ? <div className="text-muted-foreground">No attendance record.</div> : (
                <div className="flex flex-wrap gap-4">
                  <div>Status: <Badge variant="secondary" className="capitalize">{attendance.status}</Badge></div>
                  <div>Check-in: {attendance.check_in_at ? format(new Date(attendance.check_in_at), "HH:mm") : "—"}</div>
                  <div>Check-out: {attendance.check_out_at ? format(new Date(attendance.check_out_at), "HH:mm") : "—"}</div>
                  <div>Total: {attendance.total_minutes != null ? `${Math.floor(attendance.total_minutes/60)}h ${attendance.total_minutes%60}m` : "—"}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{memberName} — KPI breakdown (monthly range)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <KpiBreakdownTable entries={monthly?.entries ?? []} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ScoreCardBlock({ title, data }: { title: string; data: { entries: EntryWithMeta[]; score: Scorecard } | null }) {
  if (!data) return <Card><CardContent className="pt-4 text-sm text-muted-foreground">Loading…</CardContent></Card>;
  const s = data.score;
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-sm font-sans">{title} score</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-serif">{s.score_pct}%</div>
        <div className="text-xs text-muted-foreground">{s.approved} of {s.total - s.waived} approved{s.waived > 0 ? ` · ${s.waived} waived` : ""}</div>
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <Badge variant="outline">{s.total} total</Badge>
          <Badge variant="outline" className="bg-emerald-50">{s.approved} approved</Badge>
          {s.submitted > 0 && <Badge variant="outline" className="bg-sky-50">{s.submitted} pending review</Badge>}
          {s.pending > 0 && <Badge variant="outline" className="bg-amber-50">{s.pending} pending</Badge>}
          {s.rejected > 0 && <Badge variant="outline" className="bg-rose-50">{s.rejected} rejected</Badge>}
          {s.missed > 0 && <Badge variant="outline" className="bg-rose-50">{s.missed} missed</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiBreakdownTable({ entries }: { entries: EntryWithMeta[] }) {
  if (entries.length === 0) return <div className="text-sm text-muted-foreground py-4">No KPI entries in this period.</div>;
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr className="border-b">
          <th className="text-left py-2 pr-3">KPI</th>
          <th className="text-left py-2 pr-3">Cadence</th>
          <th className="text-left py-2 pr-3">Period</th>
          <th className="text-left py-2 pr-3">Target</th>
          <th className="text-left py-2 pr-3">Value</th>
          <th className="text-left py-2 pr-3">Due</th>
          <th className="text-left py-2 pr-3">Submitted</th>
          <th className="text-left py-2 pr-3">Proof</th>
          <th className="text-left py-2 pr-3">Status</th>
          <th className="text-left py-2 pr-3">Review notes</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id} className="border-b align-top">
            <td className="py-2 pr-3 font-medium">{e.kpi.name}</td>
            <td className="py-2 pr-3 capitalize text-xs">{e.kpi.cadence}</td>
            <td className="py-2 pr-3 text-xs whitespace-nowrap">{e.period_start === e.period_end ? e.period_start : `${e.period_start}→${e.period_end}`}</td>
            <td className="py-2 pr-3 text-xs">{e.target_value ?? "—"}</td>
            <td className="py-2 pr-3 text-xs">{e.submission?.submitted_value ?? "—"}</td>
            <td className="py-2 pr-3 text-xs whitespace-nowrap">{e.due_at ? format(new Date(e.due_at), "d MMM HH:mm") : "—"}</td>
            <td className="py-2 pr-3 text-xs whitespace-nowrap">{e.submission ? format(new Date(e.submission.submitted_at), "d MMM HH:mm") : "—"}</td>
            <td className="py-2 pr-3 text-xs">
              {e.submission?.proof_url ? (
                <a href={e.submission.proof_url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline inline-flex items-center gap-1">Link<ExternalLink className="w-3 h-3" /></a>
              ) : "—"}
            </td>
            <td className="py-2 pr-3"><span className={`text-[10px] px-2 py-0.5 rounded border capitalize ${statusChipClass(e.status)}`}>{e.status}</span></td>
            <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[240px]">{e.submission?.review_notes ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────
// Overdue pending tab

function OverduePendingTab() {
  const [rows, setRows] = useState<EntryWithMeta[]>([]);
  const [members, setMembers] = useState<Map<string, { full_name: string | null; email: string | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<EntryWithMeta | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listOverduePendingEntries();
      setRows(r);
      const team = await listActiveTeamMembers();
      setMembers(new Map(team.map((t) => [t.id, { full_name: t.full_name, email: t.email }])));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load overdue");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const doMissed = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await markEntryMissed({ entryId: confirming.id, userId: confirming.user_id, kpiName: confirming.kpi.name });
      toast.success("Marked missed");
      setConfirming(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">Overdue pending KPIs</CardTitle>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Member</th>
                <th className="text-left py-2 pr-3">KPI</th>
                <th className="text-left py-2 pr-3">Period</th>
                <th className="text-left py-2 pr-3">Due</th>
                <th className="text-right py-2 pl-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No overdue pending KPIs.</td></tr>
              ) : rows.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="py-2 pr-3">{nameOf(members.get(e.user_id) ?? null)}</td>
                  <td className="py-2 pr-3">{e.kpi.name} <Badge variant="outline" className="text-[10px] capitalize ml-1">{e.kpi.cadence}</Badge></td>
                  <td className="py-2 pr-3 text-xs">{e.period_start === e.period_end ? e.period_start : `${e.period_start}→${e.period_end}`}</td>
                  <td className="py-2 pr-3 text-xs text-rose-700">{e.due_at ? format(new Date(e.due_at), "d MMM HH:mm") : "—"}</td>
                  <td className="py-2 pl-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setConfirming(e)}>Mark missed</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {confirming && (
        <Dialog open onOpenChange={(o) => !o && setConfirming(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark KPI as missed?</DialogTitle>
              <DialogDescription>
                {confirming.kpi.name} for {nameOf(members.get(confirming.user_id) ?? null)}. This cannot be edited by the team member afterwards.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(null)} disabled={busy}>Cancel</Button>
              <Button variant="destructive" onClick={doMissed} disabled={busy}>{busy ? "Saving…" : "Mark missed"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
