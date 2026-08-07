import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, differenceInHours } from "date-fns";
...
  const uniqueRoles = useMemo(() => Array.from(new Set(members.map((m) => (m.role || "").trim()).filter(Boolean))).sort(), [members]);

  if (authLoading) return <div className="p-8 font-sans text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />Loading…</div>;
  if (!isAdmin) return <Navigate to="/my-today" replace />;

  return (
    <div className="max-w-[1280px]">
      <PageHead title="Team Performance Dashboard" sub="Attendance, KPI completion, scores, pending reviews, and reward liability at a glance." />

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
      {loading && <div className="mb-4 font-sans text-[12px] text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>}

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
