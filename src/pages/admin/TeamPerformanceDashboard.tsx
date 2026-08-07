import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, differenceInHours } from "date-fns";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  listActiveTeamMembers,
  fetchEntriesForUserRange,
  computeScorecard,
  type EntryWithMeta,
  type Scorecard,
} from "@/lib/kpiReview";
import { inr } from "@/lib/format";

const sb: any = supabase;

type RangePreset = "today" | "yesterday" | "week" | "month" | "custom";

interface FilterState {
  preset: RangePreset;
  from: string;
  to: string;
  userId: string;
  role: string;
  cadence: string;
  status: string;
}

function rangeForPreset(p: RangePreset, from: string, to: string): { from: string; to: string } {
  const now = new Date();
  if (p === "today") { const d = format(now, "yyyy-MM-dd"); return { from: d, to: d }; }
  if (p === "yesterday") { const d = format(subDays(now, 1), "yyyy-MM-dd"); return { from: d, to: d }; }
  if (p === "week") return { from: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd") };
  if (p === "month") return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
  return { from, to };
}

interface TeamMember { id: string; full_name: string | null; email: string | null; role?: string | null; department?: string | null; }
interface AttendanceRow { id: string; user_id: string; work_date: string; check_in_at: string | null; check_out_at: string | null; total_minutes: number | null; status: string | null; }
interface EntryLite { id: string; user_id: string; kpi_id: string; assignment_id: string; period_start: string; period_end: string; due_at: string | null; status: string; kpi?: { name: string; cadence: string } | null; }
interface SubmissionLite { id: string; user_id: string; entry_id: string; submitted_at: string; proof_url: string | null; notes: string | null; status: string; entry?: { kpi?: { name: string; proof_required: boolean } | null } | null; }
interface RewardLite { id: string; user_id: string; period_type: string; period_start: string; score: number | null; reward_points: number | null; cash_amount: number | null; badge_name: string | null; status: string; }

const Card = ({ label, value, sub, onClick, tone }: { label: string; value: string | number; sub?: string; onClick?: () => void; tone?: "danger" | "warn" }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`text-left rounded-lg border bg-card px-3 py-2.5 transition-colors ${onClick ? "hover:border-foreground cursor-pointer" : "cursor-default"} ${tone === "danger" ? "border-danger/40" : tone === "warn" ? "border-warn/40" : "border-line"}`}
  >
    <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
    <div className={`font-serif text-[19px] mt-0.5 leading-tight ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-foreground"}`}>{value}</div>
    {sub && <div className="font-sans text-[11px] text-muted-foreground mt-1">{sub}</div>}
  </button>
);

const Panel = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-line bg-card overflow-hidden ${className}`}>{children}</div>
);

const FilterSelect = ({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { v: string; l: string }[] }) => (
  <select className="h-9 border border-line rounded-md px-2 text-[12.5px] bg-card" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{label}</option>
    {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
);

const StatusPill = ({ status }: { status: string }) => {
  const cls: Record<string, string> = {
    approved: "bg-success/10 text-success border-success/30",
    submitted: "bg-accent text-accent-foreground border-line",
    pending: "bg-off text-muted-foreground border-line",
    rejected: "bg-danger/10 text-danger border-danger/30",
    missed: "bg-warn/10 text-warn border-warn/30",
    waived: "bg-off text-muted-foreground border-line",
    pending_approval: "bg-accent text-accent-foreground border-line",
    paid: "bg-success/10 text-success border-success/30",
    cancelled: "bg-off text-muted-foreground border-line",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-[4px] font-sans text-[10px] font-medium capitalize border ${cls[status] ?? "bg-off border-line text-muted-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
};


export default function TeamPerformanceDashboard() {
  const nav = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();

  const [filters, setFilters] = useState<FilterState>(() => {
    const t = format(new Date(), "yyyy-MM-dd");
    return { preset: "today", from: t, to: t, userId: "", role: "", cadence: "", status: "" };
  });

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [entries, setEntries] = useState<EntryLite[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionLite[]>([]);
  const [rewards, setRewards] = useState<RewardLite[]>([]);
  const [scorecards, setScorecards] = useState<Record<string, { daily?: Scorecard; weekly?: Scorecard; monthly?: Scorecard }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (p: RangePreset) => {
    const r = rangeForPreset(p, filters.from, filters.to);
    setFilters((f) => ({ ...f, preset: p, from: r.from, to: r.to }));
  };

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { from, to } = filters;
        const team = (await listActiveTeamMembers()) as TeamMember[];
        // Enrich role/department
        const { data: profs } = await sb.from("profiles").select("id, role, department").in("id", team.map((t) => t.id));
        const pmap = new Map<string, { role: string | null; department: string | null }>();
        (profs ?? []).forEach((p: any) => pmap.set(p.id, { role: p.role ?? null, department: p.department ?? null }));
        const teamFull = team.map((m) => ({ ...m, role: pmap.get(m.id)?.role ?? null, department: pmap.get(m.id)?.department ?? null }));

        const [att, ent, subs, rew] = await Promise.all([
          sb.from("attendance_sessions").select("id, user_id, work_date, check_in_at, check_out_at, total_minutes, status").gte("work_date", from).lte("work_date", to),
          sb.from("kpi_entries").select("id, user_id, kpi_id, assignment_id, period_start, period_end, due_at, status, kpi:kpi_definitions(name, cadence)").lte("period_start", to).gte("period_end", from).limit(2000),
          sb.from("kpi_submissions").select("id, user_id, entry_id, submitted_at, proof_url, notes, status, entry:kpi_entries!inner(kpi:kpi_definitions(name, proof_required))").eq("status", "submitted").order("submitted_at", { ascending: true }).limit(300),
          sb.from("kpi_reward_earnings").select("id, user_id, period_type, period_start, score, reward_points, cash_amount, badge_name, status").order("period_start", { ascending: false }).limit(500),
        ]);

        if (cancelled) return;
        setMembers(teamFull);
        setAttendance((att.data ?? []) as AttendanceRow[]);
        setEntries((ent.data ?? []) as EntryLite[]);
        setSubmissions((subs.data ?? []) as SubmissionLite[]);
        setRewards((rew.data ?? []) as RewardLite[]);

        // Per-user scorecards: daily(today), weekly, monthly
        const today = new Date();
        const dailyRange = { from: format(today, "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
        const weeklyRange = { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd") };
        const monthlyRange = { from: format(startOfMonth(today), "yyyy-MM-dd"), to: format(endOfMonth(today), "yyyy-MM-dd") };

        const scMap: Record<string, { daily?: Scorecard; weekly?: Scorecard; monthly?: Scorecard }> = {};
        await Promise.all(teamFull.map(async (m) => {
          try {
            const [d, w, mo] = await Promise.all([
              fetchEntriesForUserRange(m.id, dailyRange.from, dailyRange.to),
              fetchEntriesForUserRange(m.id, weeklyRange.from, weeklyRange.to),
              fetchEntriesForUserRange(m.id, monthlyRange.from, monthlyRange.to),
            ]);
            scMap[m.id] = {
              daily: computeScorecard(d as EntryWithMeta[]),
              weekly: computeScorecard(w as EntryWithMeta[]),
              monthly: computeScorecard(mo as EntryWithMeta[]),
            };
          } catch { /* per-user failure ignored */ }
        }));
        if (!cancelled) setScorecards(scMap);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, filters.from, filters.to]);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (filters.userId && m.id !== filters.userId) return false;
      if (filters.role && (m.role || "").toLowerCase() !== filters.role.toLowerCase()) return false;
      return true;
    });
  }, [members, filters.userId, filters.role]);

  const memberIds = useMemo(() => new Set(filteredMembers.map((m) => m.id)), [filteredMembers]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (!memberIds.has(e.user_id)) return false;
      if (filters.cadence && e.kpi?.cadence !== filters.cadence) return false;
      if (filters.status && e.status !== filters.status) return false;
      return true;
    });
  }, [entries, memberIds, filters.cadence, filters.status]);

  const filteredAttendance = useMemo(() => attendance.filter((a) => memberIds.has(a.user_id)), [attendance, memberIds]);

  const attendanceByUser = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    filteredAttendance.forEach((a) => map.set(a.user_id, a));
    return map;
  }, [filteredAttendance]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isToday = filters.from === todayStr && filters.to === todayStr;

  // Attendance summary
  const attSummary = useMemo(() => {
    const totalMembers = filteredMembers.length;
    let checkedIn = 0, checkedOut = 0, totalMinutes = 0, worked = 0;
    filteredMembers.forEach((m) => {
      const a = attendanceByUser.get(m.id);
      if (a?.check_in_at) checkedIn += 1;
      if (a?.check_out_at) checkedOut += 1;
      if (a?.total_minutes != null) { totalMinutes += Number(a.total_minutes); worked += 1; }
    });
    const notCheckedIn = totalMembers - checkedIn;
    const avgMin = worked > 0 ? Math.round(totalMinutes / worked) : 0;
    return { totalMembers, checkedIn, notCheckedIn, checkedOut, avgMin };
  }, [filteredMembers, attendanceByUser]);

  // KPI completion summary
  const kpiSummary = useMemo(() => {
    let total = 0, approved = 0, submitted = 0, pending = 0, rejected = 0, missed = 0, waived = 0;
    filteredEntries.forEach((e) => {
      total += 1;
      switch (e.status) {
        case "approved": approved += 1; break;
        case "submitted": submitted += 1; break;
        case "pending": pending += 1; break;
        case "rejected": rejected += 1; break;
        case "missed": missed += 1; break;
        case "waived": waived += 1; break;
      }
    });
    const denom = total - waived;
    const rate = denom > 0 ? Math.round((approved / denom) * 1000) / 10 : 0;
    return { total, approved, submitted, pending, rejected, missed, waived, rate };
  }, [filteredEntries]);

  const filteredPendingSubs = useMemo(() => submissions.filter((s) => memberIds.has(s.user_id)), [submissions, memberIds]);
  const pendingReview = useMemo(() => {
    const oldest = filteredPendingSubs[0]?.submitted_at ?? null;
    const users = new Set(filteredPendingSubs.map((s) => s.user_id));
    const proofPending = filteredPendingSubs.filter((s) => s.entry?.kpi?.proof_required).length;
    return { count: filteredPendingSubs.length, oldest, users: users.size, proofPending };
  }, [filteredPendingSubs]);

  // Team scores summary
  const scoreSummary = useMemo(() => {
    const vals = { daily: [] as number[], weekly: [] as number[], monthly: [] as number[] };
    filteredMembers.forEach((m) => {
      const s = scorecards[m.id];
      if (s?.daily && s.daily.required_weight > 0) vals.daily.push(s.daily.score_pct);
      if (s?.weekly && s.weekly.required_weight > 0) vals.weekly.push(s.weekly.score_pct);
      if (s?.monthly && s.monthly.required_weight > 0) vals.monthly.push(s.monthly.score_pct);
    });
    const avg = (arr: number[]) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
    return { daily: avg(vals.daily), weekly: avg(vals.weekly), monthly: avg(vals.monthly) };
  }, [filteredMembers, scorecards]);

  const rewardsFiltered = useMemo(() => rewards.filter((r) => memberIds.has(r.user_id)), [rewards, memberIds]);
  const rewardSummary = useMemo(() => {
    let pending = 0, approved = 0, paid = 0, points = 0, cashLiability = 0, cashPaid = 0;
    rewardsFiltered.forEach((r) => {
      const cash = Number(r.cash_amount || 0);
      const pts = Number(r.reward_points || 0);
      if (r.status === "pending_approval") pending += 1;
      if (r.status === "approved") { approved += 1; cashLiability += cash; }
      if (r.status === "paid") { paid += 1; cashPaid += cash; }
      if (r.status === "approved" || r.status === "paid") points += pts;
    });
    return { pending, approved, paid, points, cashLiability, cashPaid };
  }, [rewardsFiltered]);

  // Needs Attention
  const attention = useMemo(() => {
    const list: Array<{ id: string; name: string; role: string | null; reasons: string[]; action: string }> = [];
    filteredMembers.forEach((m) => {
      const reasons: string[] = [];
      const a = attendanceByUser.get(m.id);
      if (isToday && !a?.check_in_at) reasons.push("No check-in today");
      const sc = scorecards[m.id]?.daily;
      if (sc && sc.required_weight > 0 && sc.score_pct < 70) reasons.push(`Daily score ${sc.score_pct}%`);
      const userEntries = filteredEntries.filter((e) => e.user_id === m.id);
      const pending = userEntries.filter((e) => e.status === "pending").length;
      const overdue = userEntries.filter((e) => e.status === "pending" && e.due_at && new Date(e.due_at) < new Date()).length;
      const rejected = userEntries.filter((e) => e.status === "rejected").length;
      const missed = userEntries.filter((e) => e.status === "missed").length;
      if (overdue >= 1) reasons.push(`${overdue} overdue KPI${overdue > 1 ? "s" : ""}`);
      else if (pending >= 3) reasons.push(`${pending} pending KPIs`);
      if (rejected > 0) reasons.push(`${rejected} rejected KPI${rejected > 1 ? "s" : ""}`);
      if (missed > 0) reasons.push(`${missed} missed KPI${missed > 1 ? "s" : ""}`);
      const oldSub = filteredPendingSubs.find((s) => s.user_id === m.id && differenceInHours(new Date(), new Date(s.submitted_at)) >= 24);
      if (oldSub) reasons.push("Review pending >24h");
      if (reasons.length > 0) list.push({ id: m.id, name: m.full_name || m.email || "—", role: m.role ?? null, reasons, action: "View scorecard" });
    });
    return list;
  }, [filteredMembers, attendanceByUser, scorecards, filteredEntries, filteredPendingSubs, isToday]);

  const uniqueRoles = useMemo(() => Array.from(new Set(members.map((m) => (m.role || "").trim()).filter(Boolean))).sort(), [members]);

  if (authLoading) return <div className="p-8 font-sans text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <Navigate to="/my-today" replace />;

  return (
    <div className="max-w-[1280px]">
      <PageHead title="Team Performance Dashboard" sub="Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required." />

      {/* ── Filter bar (standardized pattern) ─────────────────── */}
      <SectionLabel>Filters</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
        <div className="col-span-2 flex gap-1">
          {(["today", "yesterday", "week", "month"] as RangePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`h-9 flex-1 text-[12px] font-medium px-2 rounded-md border transition-colors ${filters.preset === p ? "bg-foreground text-background border-foreground" : "bg-card text-foreground border-line hover:border-foreground"}`}
            >
              {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : p === "week" ? "This Week" : "This Month"}
            </button>
          ))}
        </div>
        <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, preset: "custom", from: e.target.value }))} className="h-9 border border-line rounded-md px-2 text-[12.5px] bg-card" />
        <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, preset: "custom", to: e.target.value }))} className="h-9 border border-line rounded-md px-2 text-[12.5px] bg-card" />
        <FilterSelect
          value={filters.userId}
          onChange={(v) => setFilters((f) => ({ ...f, userId: v }))}
          label="All team members"
          options={members.map((m) => ({ v: m.id, l: m.full_name || m.email || "—" }))}
        />
        <FilterSelect
          value={filters.role}
          onChange={(v) => setFilters((f) => ({ ...f, role: v }))}
          label="All roles"
          options={uniqueRoles.map((r) => ({ v: r, l: r }))}
        />
        <FilterSelect
          value={filters.cadence}
          onChange={(v) => setFilters((f) => ({ ...f, cadence: v }))}
          label="All cadences"
          options={[{ v: "daily", l: "Daily" }, { v: "weekly", l: "Weekly" }, { v: "monthly", l: "Monthly" }, { v: "recurring", l: "Recurring" }]}
        />
        <FilterSelect
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          label="All statuses"
          options={[
            { v: "pending", l: "Pending" }, { v: "submitted", l: "Submitted" }, { v: "approved", l: "Approved" },
            { v: "rejected", l: "Rejected" }, { v: "missed", l: "Missed" }, { v: "waived", l: "Waived" },
          ]}
        />
      </div>

      {error && <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-sans text-[12px] text-danger">{error}</div>}
      {loading && <div className="mb-4 font-sans text-[12px] text-muted-foreground">Loading data…</div>}

      {/* ── Layer 1: headline KPIs ────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
        <Card label="Completion" value={`${kpiSummary.rate}%`} />
        <Card label="Avg daily score" value={scoreSummary.daily != null ? `${scoreSummary.daily}%` : "—"} />
        <Card label="Avg weekly score" value={scoreSummary.weekly != null ? `${scoreSummary.weekly}%` : "—"} />
        <Card label="Avg monthly score" value={scoreSummary.monthly != null ? `${scoreSummary.monthly}%` : "—"} />
        <Card label="Pending review" value={pendingReview.count} onClick={() => nav("/team-performance/review")} tone={pendingReview.count > 0 ? "warn" : undefined} />
        <Card label="Cash liability" value={inr(rewardSummary.cashLiability)} tone={rewardSummary.cashLiability > 0 ? "warn" : undefined} />
      </div>
      <Panel className="px-4 py-3 mb-8">
        <div className="flex items-center justify-between mb-1.5">
          <div className="font-sans text-[11px] text-muted-foreground">Completion rate (approved / non-waived)</div>
          <div className="font-sans text-[11px] font-medium">{kpiSummary.rate}%</div>
        </div>
        <div className="w-full h-2 rounded-full bg-off overflow-hidden">
          <div className="h-full bg-foreground transition-all" style={{ width: `${Math.min(100, kpiSummary.rate)}%` }} />
        </div>
      </Panel>

      {/* ── Layer 2: breakdowns ───────────────────────────────── */}
      <SectionLabel>KPI Completion</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-8">
        <Card label="Total due" value={kpiSummary.total} />
        <Card label="Approved" value={kpiSummary.approved} />
        <Card label="Submitted" value={kpiSummary.submitted} />
        <Card label="Pending" value={kpiSummary.pending} />
        <Card label="Rejected" value={kpiSummary.rejected} tone={kpiSummary.rejected > 0 ? "danger" : undefined} />
        <Card label="Missed" value={kpiSummary.missed} tone={kpiSummary.missed > 0 ? "warn" : undefined} />
        <Card label="Completion" value={`${kpiSummary.rate}%`} />
      </div>

      <SectionLabel>Attendance</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-8">
        <Card label="Team members" value={attSummary.totalMembers} />
        <Card label="Checked in" value={attSummary.checkedIn} />
        <Card label="Not checked in" value={attSummary.notCheckedIn} tone={attSummary.notCheckedIn > 0 && isToday ? "warn" : undefined} />
        <Card label="Checked out" value={attSummary.checkedOut} />
        <Card label="Avg work time" value={`${Math.floor(attSummary.avgMin / 60)}h ${attSummary.avgMin % 60}m`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div>
          <SectionLabel>Team Score Overview</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <Card label="Avg daily" value={scoreSummary.daily != null ? `${scoreSummary.daily}%` : "—"} />
            <Card label="Avg weekly" value={scoreSummary.weekly != null ? `${scoreSummary.weekly}%` : "—"} />
            <Card label="Avg monthly" value={scoreSummary.monthly != null ? `${scoreSummary.monthly}%` : "—"} />
          </div>
        </div>
        <div>
          <SectionLabel>Reward Liability</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <Card label="Pending approval" value={rewardSummary.pending} onClick={() => nav("/team-performance/rewards")} />
            <Card label="Approved (unpaid)" value={rewardSummary.approved} onClick={() => nav("/team-performance/rewards")} />
            <Card label="Paid" value={rewardSummary.paid} onClick={() => nav("/team-performance/rewards")} />
            <Card label="Points earned" value={rewardSummary.points} />
            <Card label="Cash liability" value={inr(rewardSummary.cashLiability)} tone={rewardSummary.cashLiability > 0 ? "warn" : undefined} />
            <Card label="Cash paid" value={inr(rewardSummary.cashPaid)} />
          </div>
        </div>
      </div>

      {/* ── Layer 3: per-person scoreboard, queues, history ───── */}
      <SectionLabel>Team Performance Scoreboard</SectionLabel>
      <Panel className="mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] font-sans">
            <thead className="bg-off">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium text-right">Daily</th>
                <th className="px-3 py-2 font-medium text-right">Weekly</th>
                <th className="px-3 py-2 font-medium text-right">Monthly</th>
                <th className="px-3 py-2 font-medium text-right">Due</th>
                <th className="px-3 py-2 font-medium text-right">Appr.</th>
                <th className="px-3 py-2 font-medium text-right">Pend.</th>
                <th className="px-3 py-2 font-medium text-right">Subm.</th>
                <th className="px-3 py-2 font-medium text-right">Rej.</th>
                <th className="px-3 py-2 font-medium text-right">Miss.</th>
                <th className="px-3 py-2 font-medium">Attendance</th>
                <th className="px-3 py-2 font-medium text-right">Rewards</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m) => {
                const sc = scorecards[m.id];
                const userEnt = filteredEntries.filter((e) => e.user_id === m.id);
                const cnt = (st: string) => userEnt.filter((e) => e.status === st).length;
                const att = attendanceByUser.get(m.id);
                const userRewards = rewardsFiltered.filter((r) => r.user_id === m.id).length;
                const attLabel = !att?.check_in_at ? "Not checked in" : att.check_out_at ? "Checked out" : "Present";
                return (
                  <tr key={m.id} className="border-t border-line">
                    <td className="px-3 py-2 font-medium">{m.full_name || m.email || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.role ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{sc?.daily && sc.daily.required_weight > 0 ? `${sc.daily.score_pct}%` : "—"}</td>
                    <td className="px-3 py-2 text-right">{sc?.weekly && sc.weekly.required_weight > 0 ? `${sc.weekly.score_pct}%` : "—"}</td>
                    <td className="px-3 py-2 text-right">{sc?.monthly && sc.monthly.required_weight > 0 ? `${sc.monthly.score_pct}%` : "—"}</td>
                    <td className="px-3 py-2 text-right">{userEnt.length}</td>
                    <td className="px-3 py-2 text-right text-success">{cnt("approved")}</td>
                    <td className="px-3 py-2 text-right">{cnt("pending")}</td>
                    <td className="px-3 py-2 text-right">{cnt("submitted")}</td>
                    <td className="px-3 py-2 text-right text-danger">{cnt("rejected")}</td>
                    <td className="px-3 py-2 text-right text-warn">{cnt("missed")}</td>
                    <td className="px-3 py-2"><StatusPill status={attLabel === "Present" ? "approved" : attLabel === "Checked out" ? "waived" : "pending"} /> <span className="ml-1 text-[10px] text-muted-foreground">{attLabel}</span></td>
                    <td className="px-3 py-2 text-right">{userRewards}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => nav("/team-performance/review")} className="text-[11px] font-medium underline underline-offset-2 hover:text-foreground">Scorecard →</button>
                    </td>
                  </tr>
                );
              })}
              {filteredMembers.length === 0 && (
                <tr><td colSpan={14} className="px-3 py-6 text-center text-muted-foreground">No team members match filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <div>
          <SectionLabel>Needs Attention</SectionLabel>
          <Panel>
            {attention.length === 0 ? (
              <div className="px-4 py-6 font-sans text-[12px] text-muted-foreground">Everyone is on track.</div>
            ) : (
              <table className="w-full text-[12px] font-sans">
                <thead className="bg-off">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Member</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {attention.slice(0, 20).map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        {r.role && <div className="text-[10px] text-muted-foreground">{r.role}</div>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.reasons.join(" · ")}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => nav("/team-performance/review")} className="text-[11px] font-medium underline underline-offset-2 hover:text-foreground">Review →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
        <div>
          <SectionLabel>Pending Review</SectionLabel>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Card label="Pending" value={pendingReview.count} onClick={() => nav("/team-performance/review")} tone={pendingReview.count > 0 ? "warn" : undefined} />
            <Card label="Users" value={pendingReview.users} />
            <Card label="Proof required" value={pendingReview.proofPending} />
            <Card label="Oldest pending" value={pendingReview.oldest ? `${differenceInHours(new Date(), new Date(pendingReview.oldest))}h ago` : "—"} />
          </div>
          <Panel>
            {filteredPendingSubs.length === 0 ? (
              <div className="px-4 py-6 font-sans text-[12px] text-muted-foreground">No submissions awaiting review.</div>
            ) : (
              <table className="w-full text-[12px] font-sans">
                <thead className="bg-off">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Member</th>
                    <th className="px-3 py-2 font-medium">KPI</th>
                    <th className="px-3 py-2 font-medium">Submitted</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPendingSubs.slice(0, 10).map((s) => {
                    const m = members.find((x) => x.id === s.user_id);
                    return (
                      <tr key={s.id} className="border-t border-line">
                        <td className="px-3 py-2">{m?.full_name || m?.email || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.entry?.kpi?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{format(new Date(s.submitted_at), "d MMM, HH:mm")}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => nav("/team-performance/review")} className="text-[11px] font-medium underline underline-offset-2 hover:text-foreground">Open →</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
