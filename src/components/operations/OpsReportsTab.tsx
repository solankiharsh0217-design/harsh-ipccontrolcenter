import { useEffect, useMemo, useState } from "react";

import { Download } from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  getActiveRewardRule, getMonthlyCountsByBuyer, listAllRewardProgressForMonth,
  listConversionsBetween, currentMonthStr, monthBounds,
  type RewardRule,
} from "@/lib/operationsConversions";
import { computeServiceCalc, SERVICE_STATUS_LABELS } from "@/lib/operationsCrm";
import { toCsv, downloadCsv } from "@/lib/operationsExport";

interface OpsLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  service_package_name: string | null;
  service_status: string;
  assigned_media_buyer_id: string | null;
  assigned_media_buyer_name: string | null;
  service_months: number | null;
  service_days_committed: number | null;
  total_active_days: number;
  total_paused_days: number;
  current_active_start_date: string | null;
  last_paused_at: string | null;
  service_end_target_date: string | null;
  ad_launch_date: string | null;
  created_at: string;
  stage_id: string | null;
}

interface Props {
  leads: OpsLead[];
  onOpenLead: (id: string) => void;
  isAdmin?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  not_started: "#94a3b8",
  active: "#16a34a",
  paused: "#eab308",
  stopped: "#dc2626",
  completed: "#3b82f6",
};

export default function OpsReportsTab({ leads, onOpenLead }: Props) {
  const [month, setMonth] = useState<string>(currentMonthStr());
  const [buyerFilter, setBuyerFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [convStatusFilter, setConvStatusFilter] = useState<string>("all");
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all"); // all | assigned | unassigned

  const [rule, setRule] = useState<RewardRule | null>(null);
  const [counts, setCounts] = useState<Map<string, { approved: number; pending: number; rejected: number; value: number }>>(new Map());
  const [achievedSet, setAchievedSet] = useState<Set<string>>(new Set());
  const [trend, setTrend] = useState<{ date: string; approved: number; pending: number; rejected: number }[]>([]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [r, c, p] = await Promise.all([
        getActiveRewardRule(),
        getMonthlyCountsByBuyer(month),
        listAllRewardProgressForMonth(month),
      ]);
      if (cancel) return;
      setRule(r);
      setCounts(c);
      const s = new Set<string>();
      for (const row of p) {
        if (row.reward_status === "achieved" || row.reward_status === "paid") s.add(row.media_buyer_id);
      }
      setAchievedSet(s);

      // Trend last 30 days
      const today = new Date();
      const start = new Date(today); start.setDate(today.getDate() - 29);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const list = await listConversionsBetween(fmt(start), fmt(today));
      if (cancel) return;
      const map = new Map<string, { approved: number; pending: number; rejected: number }>();
      for (let i = 0; i < 30; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        map.set(fmt(d), { approved: 0, pending: 0, rejected: 0 });
      }
      for (const conv of list) {
        const k = conv.conversion_date;
        const e = map.get(k); if (!e) continue;
        if (conv.verification_status === "approved") e.approved += conv.conversion_count;
        else if (conv.verification_status === "pending") e.pending += conv.conversion_count;
        else if (conv.verification_status === "rejected") e.rejected += conv.conversion_count;
      }
      setTrend(Array.from(map.entries()).map(([date, v]) => ({ date: date.slice(5), ...v })));
    })();
    return () => { cancel = true; };
  }, [month]);

  const buyers = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of leads) if (l.assigned_media_buyer_id) map.set(l.assigned_media_buyer_id, l.assigned_media_buyer_name ?? "—");
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [leads]);

  const packages = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) if (l.service_package_name) s.add(l.service_package_name);
    return Array.from(s);
  }, [leads]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (buyerFilter !== "all" && l.assigned_media_buyer_id !== buyerFilter) return false;
      if (statusFilter !== "all" && l.service_status !== statusFilter) return false;
      if (packageFilter !== "all" && l.service_package_name !== packageFilter) return false;
      if (assignedFilter === "assigned" && !l.assigned_media_buyer_id) return false;
      if (assignedFilter === "unassigned" && l.assigned_media_buyer_id) return false;
      return true;
    });
  }, [leads, buyerFilter, statusFilter, packageFilter, assignedFilter]);

  // Top metrics
  const metrics = useMemo(() => {
    let totalApproved = 0, totalPending = 0;
    for (const c of counts.values()) { totalApproved += c.approved; totalPending += c.pending; }
    const totalConvThisMonth = Array.from(counts.values()).reduce((s, v) => s + v.approved + v.pending + v.rejected, 0);
    let activeDaysSum = 0, activeCount = 0;
    const today = new Date();
    let endingSoon = 0;
    for (const l of filtered) {
      const calc = computeServiceCalc(l);
      if (calc.activeDaysUsed > 0) { activeDaysSum += calc.activeDaysUsed; activeCount++; }
      if (calc.estimatedEndDate && (l.service_status === "active" || l.service_status === "paused")) {
        const end = new Date(calc.estimatedEndDate);
        const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff <= 14) endingSoon++;
      }
    }
    return {
      total: filtered.length,
      active: filtered.filter((l) => l.service_status === "active").length,
      paused: filtered.filter((l) => l.service_status === "paused").length,
      stopped: filtered.filter((l) => l.service_status === "stopped").length,
      completed: filtered.filter((l) => l.service_status === "completed").length,
      notStarted: filtered.filter((l) => l.service_status === "not_started").length,
      convThisMonth: totalConvThisMonth,
      approved: totalApproved,
      pending: totalPending,
      rewards: achievedSet.size,
      avgActiveDays: activeCount > 0 ? Math.round(activeDaysSum / activeCount) : 0,
      endingSoon,
    };
  }, [filtered, counts, achievedSet]);

  const filteredBuyerCounts = useMemo(() => {
    const m = new Map<string, { approved: number; pending: number; rejected: number; value: number }>();
    for (const [bId, v] of counts.entries()) {
      if (buyerFilter !== "all" && bId !== buyerFilter) continue;
      // also restrict by conv status filter (informational)
      m.set(bId, v);
    }
    return m;
  }, [counts, buyerFilter]);

  // Buyer comparison rows (PART 2)
  const buyerRows = useMemo(() => {
    const target = rule?.target_count ?? 10;
    const map = new Map<string, {
      id: string; name: string;
      assigned: number; active: number; paused: number; stopped: number; completed: number;
      reported: number; approved: number; pending: number; rejected: number;
    }>();
    for (const l of filtered) {
      if (!l.assigned_media_buyer_id) continue;
      const id = l.assigned_media_buyer_id;
      const e = map.get(id) ?? { id, name: l.assigned_media_buyer_name ?? "—",
        assigned: 0, active: 0, paused: 0, stopped: 0, completed: 0,
        reported: 0, approved: 0, pending: 0, rejected: 0 };
      e.assigned++;
      if (l.service_status === "active") e.active++;
      else if (l.service_status === "paused") e.paused++;
      else if (l.service_status === "stopped") e.stopped++;
      else if (l.service_status === "completed") e.completed++;
      map.set(id, e);
    }
    for (const [id, c] of filteredBuyerCounts.entries()) {
      const e = map.get(id) ?? { id, name: "—",
        assigned: 0, active: 0, paused: 0, stopped: 0, completed: 0,
        reported: 0, approved: 0, pending: 0, rejected: 0 };
      e.approved = c.approved; e.pending = c.pending; e.rejected = c.rejected;
      e.reported = c.approved + c.pending + c.rejected;
      map.set(id, e);
    }
    let rows = Array.from(map.values()).map((r) => {
      const reviewed = r.approved + r.rejected;
      const approvalRate = reviewed > 0 ? Math.round((r.approved / reviewed) * 100) : 0;
      const pct = Math.min(100, Math.round((r.approved / target) * 100));
      return { ...r, approvalRate, pct, achieved: achievedSet.has(r.id) || r.approved >= target };
    });
    if (convStatusFilter !== "all") {
      rows = rows.filter((r) => {
        if (convStatusFilter === "approved") return r.approved > 0;
        if (convStatusFilter === "pending") return r.pending > 0;
        if (convStatusFilter === "rejected") return r.rejected > 0;
        return true;
      });
    }
    rows.sort((a, b) => b.approved - a.approved);
    return rows;
  }, [filtered, filteredBuyerCounts, rule, achievedSet, convStatusFilter]);

  // Charts data
  const chartApprovedByBuyer = useMemo(
    () => buyerRows.slice(0, 10).map((r) => ({ name: r.name, approved: r.approved })),
    [buyerRows]);
  const chartActiveByBuyer = useMemo(
    () => buyerRows.slice(0, 10).map((r) => ({ name: r.name, active: r.active })),
    [buyerRows]);
  const chartRewardByBuyer = useMemo(
    () => buyerRows.slice(0, 10).map((r) => ({ name: r.name, pct: r.pct })),
    [buyerRows]);
  const chartStatus = useMemo(() => ([
    { name: "Not started", value: metrics.notStarted, color: STATUS_COLORS.not_started },
    { name: "Active", value: metrics.active, color: STATUS_COLORS.active },
    { name: "Paused", value: metrics.paused, color: STATUS_COLORS.paused },
    { name: "Stopped", value: metrics.stopped, color: STATUS_COLORS.stopped },
    { name: "Completed", value: metrics.completed, color: STATUS_COLORS.completed },
  ].filter((s) => s.value > 0)), [metrics]);

  // Service health groups
  const today = new Date();
  const health = useMemo(() => {
    const groups = {
      not_started: [] as OpsLead[],
      active: [] as OpsLead[],
      paused: [] as OpsLead[],
      stopped: [] as OpsLead[],
      ending7: [] as OpsLead[],
      ending30: [] as OpsLead[],
      noActivity: [] as OpsLead[],
      noConversion: [] as OpsLead[],
    };
    // Build set of lead ids with any conversion this month
    const reportedLeadIds = new Set<string>();
    // (We don't have lead ids per buyer in `counts`; rely on absence of conv check via service tracking only)
    for (const l of filtered) {
      if (l.service_status === "not_started") groups.not_started.push(l);
      else if (l.service_status === "active") groups.active.push(l);
      else if (l.service_status === "paused") groups.paused.push(l);
      else if (l.service_status === "stopped") groups.stopped.push(l);

      if (l.service_status === "active" || l.service_status === "paused") {
        const calc = computeServiceCalc(l);
        if (calc.estimatedEndDate) {
          const end = new Date(calc.estimatedEndDate);
          const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diff >= 0 && diff <= 7) groups.ending7.push(l);
          else if (diff > 7 && diff <= 30) groups.ending30.push(l);
        }
      }

      const lastTouch = l.current_active_start_date ?? l.last_paused_at ?? l.ad_launch_date ?? l.created_at;
      if (lastTouch) {
        const diff = Math.ceil((today.getTime() - new Date(lastTouch).getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 14 && (l.service_status === "active" || l.service_status === "paused")) groups.noActivity.push(l);
      }
      if (l.service_status === "active" && !reportedLeadIds.has(l.id)) {
        // We don't fetch per-lead conversions here for perf; flag actives whose buyer has 0 approved this month.
        const bc = l.assigned_media_buyer_id ? counts.get(l.assigned_media_buyer_id) : null;
        if (!bc || bc.approved === 0) groups.noConversion.push(l);
      }
    }
    return groups;
  }, [filtered, counts]);

  // Exports
  const exportOpsLeads = () => {
    const rows = filtered.map((l) => {
      const calc = computeServiceCalc(l);
      return {
        name: l.name,
        email: l.email ?? "",
        phone: l.phone ?? "",
        package: l.service_package_name ?? "",
        status: SERVICE_STATUS_LABELS[l.service_status] ?? l.service_status,
        media_buyer: l.assigned_media_buyer_name ?? "",
        committed_days: calc.committedDays,
        active_days: calc.activeDaysUsed,
        paused_days: calc.pausedDays,
        remaining_days: calc.remainingDays,
        estimated_end: calc.estimatedEndDate ?? "",
        created_at: l.created_at,
      };
    });
    downloadCsv(`operations-leads-${month}.csv`, toCsv(rows));
  };
  const exportBuyerPerf = () => {
    const rows = buyerRows.map((r) => ({
      media_buyer: r.name,
      assigned: r.assigned, active: r.active, paused: r.paused, stopped: r.stopped, completed: r.completed,
      reported: r.reported, approved: r.approved, pending: r.pending, rejected: r.rejected,
      approval_rate_pct: r.approvalRate, reward_pct: r.pct, reward_achieved: r.achieved ? "yes" : "no",
    }));
    downloadCsv(`media-buyer-performance-${month}.csv`, toCsv(rows));
  };
  const exportConversions = async () => {
    const { start, end } = monthBounds(month);
    // end is exclusive day after; subtract one day for inclusive lte
    const endD = new Date(end); endD.setDate(endD.getDate() - 1);
    const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
    const all = await listConversionsBetween(start, endStr);
    const filt = all.filter((c) => {
      if (buyerFilter !== "all" && c.media_buyer_id !== buyerFilter) return false;
      if (convStatusFilter !== "all" && c.verification_status !== convStatusFilter) return false;
      return true;
    });
    const rows = filt.map((c) => ({
      conversion_date: c.conversion_date,
      client: c.lead_name ?? c.client_name ?? "",
      media_buyer: c.media_buyer_name ?? "",
      count: c.conversion_count,
      value: c.conversion_value ?? "",
      campaign: c.campaign_name ?? "",
      status: c.verification_status,
      proof: c.proof_url ?? "",
      notes: c.notes ?? "",
      verification_note: c.verification_note ?? "",
    }));
    downloadCsv(`conversions-${month}.csv`, toCsv(rows));
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-line rounded-lg p-2.5">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ipc-input !h-8 !text-xs" />
        <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} className="ipc-input !h-8 !text-xs">
          <option value="all">All media buyers</option>
          {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ipc-input !h-8 !text-xs">
          <option value="all">All service statuses</option>
          {Object.entries(SERVICE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={convStatusFilter} onChange={(e) => setConvStatusFilter(e.target.value)} className="ipc-input !h-8 !text-xs">
          <option value="all">All conversion statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)} className="ipc-input !h-8 !text-xs">
          <option value="all">All packages</option>
          {packages.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} className="ipc-input !h-8 !text-xs">
          <option value="all">Assigned + Unassigned</option>
          <option value="assigned">Assigned only</option>
          <option value="unassigned">Unassigned only</option>
        </select>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={exportOpsLeads} className="ipc-btn ipc-btn-ghost !h-8 !text-xs"><Download className="w-3 h-3" /> Leads</button>
          <button onClick={exportBuyerPerf} className="ipc-btn ipc-btn-ghost !h-8 !text-xs"><Download className="w-3 h-3" /> Performance</button>
          <button onClick={exportConversions} className="ipc-btn ipc-btn-ghost !h-8 !text-xs"><Download className="w-3 h-3" /> Conversions</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: "Total clients", value: metrics.total },
          { label: "Active ads", value: metrics.active },
          { label: "Paused", value: metrics.paused },
          { label: "Stopped", value: metrics.stopped },
          { label: "Completed", value: metrics.completed },
          { label: "Not started", value: metrics.notStarted },
          { label: "Conversions (month)", value: metrics.convThisMonth },
          { label: "Approved", value: metrics.approved },
          { label: "Pending approvals", value: metrics.pending, tone: metrics.pending > 0 ? "amber" : undefined },
          { label: "Rewards achieved", value: metrics.rewards },
          { label: "Avg active days", value: metrics.avgActiveDays },
          { label: "Ending in 14d", value: metrics.endingSoon, tone: metrics.endingSoon > 0 ? "amber" : undefined },
        ].map((m: any) => (
          <div key={m.label} className="bg-white border border-line rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
            <div className={`font-serif text-xl mt-0.5 ${m.tone === "amber" ? "text-[#92400E]" : "text-black"}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Media buyer performance table */}
      <div className="bg-white border border-line rounded-lg">
        <div className="px-3 py-2 border-b border-line flex items-center justify-between">
          <div className="font-serif text-sm">Media buyer performance · {month}</div>
          {rule && <div className="text-[10px] text-muted-foreground">Target: {rule.target_count} approved · Reward: {rule.currency} {Number(rule.reward_amount).toLocaleString()}</div>}
        </div>
        {buyerRows.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">No media buyers with assigned clients for current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-line">
                  <th className="px-3 py-2">Media buyer</th>
                  <th className="px-2 py-2 text-right">Assigned</th>
                  <th className="px-2 py-2 text-right">Active</th>
                  <th className="px-2 py-2 text-right">Paused</th>
                  <th className="px-2 py-2 text-right">Stopped</th>
                  <th className="px-2 py-2 text-right">Completed</th>
                  <th className="px-2 py-2 text-right">Reported</th>
                  <th className="px-2 py-2 text-right">Approved</th>
                  <th className="px-2 py-2 text-right">Pending</th>
                  <th className="px-2 py-2 text-right">Rejected</th>
                  <th className="px-2 py-2 text-right">Approval %</th>
                  <th className="px-3 py-2">Reward</th>
                  <th className="px-2 py-2">Achieved</th>
                </tr>
              </thead>
              <tbody>
                {buyerRows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-off/40">
                    <td className="px-3 py-2 truncate max-w-[160px]">{r.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.assigned}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.active}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.paused}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.stopped}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.completed}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.reported}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.approved}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.pending}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.rejected}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.approvalRate}%</td>
                    <td className="px-3 py-2 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded bg-off overflow-hidden">
                          <div className={`h-full ${r.achieved ? "bg-[#16a34a]" : "bg-foreground"}`} style={{ width: `${r.pct}%` }} />
                        </div>
                        <span className="tabular-nums text-[11px]">{r.approved}/{rule?.target_count ?? 10}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {r.achieved
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#166534] uppercase tracking-wider">Yes</span>
                        : <span className="text-[10px] text-muted-foreground">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border border-line rounded-lg p-3">
          <div className="font-serif text-sm mb-2">Approved conversions by media buyer</div>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={chartApprovedByBuyer}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="approved" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white border border-line rounded-lg p-3">
          <div className="font-serif text-sm mb-2">Active clients by media buyer</div>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={chartActiveByBuyer}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="active" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white border border-line rounded-lg p-3">
          <div className="font-serif text-sm mb-2">Reward progress by media buyer (%)</div>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={chartRewardByBuyer}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="pct" fill="#eab308" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white border border-line rounded-lg p-3">
          <div className="font-serif text-sm mb-2">Clients by service status</div>
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartStatus} dataKey="value" nameKey="name" outerRadius={80} label>
                  {chartStatus.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white border border-line rounded-lg p-3 lg:col-span-2">
          <div className="font-serif text-sm mb-2">Conversions trend (last 30 days)</div>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="approved" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="pending" stroke="#eab308" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="rejected" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Service health */}
      <div className="bg-white border border-line rounded-lg">
        <div className="px-3 py-2 border-b border-line font-serif text-sm">Client service health</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-3">
          {([
            ["Not started", health.not_started],
            ["Active", health.active],
            ["Paused", health.paused],
            ["Stopped", health.stopped],
            ["Ending in 7 days", health.ending7],
            ["Ending in 30 days", health.ending30],
            ["No recent activity (14+ days)", health.noActivity],
            ["No conversion this month", health.noConversion],
          ] as [string, OpsLead[]][]).map(([label, items]) => (
            <div key={label} className="border border-line rounded-md">
              <div className="px-2.5 py-1.5 border-b border-line flex items-center justify-between bg-off">
                <div className="text-[11px] font-medium">{label}</div>
                <div className="text-[10px] text-muted-foreground">{items.length}</div>
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-line">
                {items.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground p-2 text-center">None</div>
                ) : items.slice(0, 50).map((l) => (
                  <button key={l.id} onClick={() => onOpenLead(l.id)}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-off/60 transition">
                    <div className="text-[11px] truncate">{l.name}</div>
                    <div className="text-[9px] text-muted-foreground truncate">
                      {l.assigned_media_buyer_name ?? "Unassigned"} · {SERVICE_STATUS_LABELS[l.service_status] ?? l.service_status}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
