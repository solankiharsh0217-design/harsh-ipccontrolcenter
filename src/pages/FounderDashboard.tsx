import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHead, SectionLabel, EmptyRow } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { getGstAwareAdSpend } from "@/lib/roas/gst";
import { inr } from "@/lib/paidPipeline";

type RangeKey = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "custom", label: "Custom" },
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function rangeBounds(key: RangeKey, customStart?: string, customEnd?: string): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === "today") return { start: isoDay(today), end: isoDay(today) };
  if (key === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { start: isoDay(y), end: isoDay(y) };
  }
  if (key === "last7") {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { start: isoDay(s), end: isoDay(today) };
  }
  if (key === "thisMonth") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: isoDay(s), end: isoDay(e) };
  }
  if (key === "lastMonth") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: isoDay(s), end: isoDay(e) };
  }
  return { start: customStart || isoDay(today), end: customEnd || isoDay(today) };
}

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
  tone?: "default" | "gold" | "alert";
}
const MetricCard = ({ label, value, sub, onClick, tone = "default" }: MetricCardProps) => {
  const cls =
    tone === "gold"
      ? "bg-gold-pale border-gold-mid"
      : tone === "alert"
      ? "bg-[#FEF2F2] border-[#FECACA]"
      : "bg-off border-line";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left rounded-xl py-[18px] px-5 border ${cls} ${onClick ? "cursor-pointer hover:border-[#bbb] transition-colors" : "cursor-default"}`}
    >
      <div className="uppercase-label mb-2 text-[9px] tracking-[0.14em] text-muted-foreground font-sans">{label}</div>
      <div className={`font-serif text-[26px] font-medium leading-none mb-1 ${tone === "gold" ? "text-gold" : "text-black"}`}>{value}</div>
      {sub && <div className="font-sans text-[10px] text-muted-foreground">{sub}</div>}
    </button>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-9">
    <SectionLabel>{title}</SectionLabel>
    {children}
  </div>
);

const NA = "—";

interface DashboardData {
  // Today
  leadsToday: number;
  spendToday: number;
  tokenToday: number;
  realizedToday: number;
  balanceOverall: number;
  followupsToday: number;
  financePending: number;
  // Monthly
  monthRevenue: number;
  monthRealized: number;
  monthToBeRealized: number;
  monthTokens: number;
  monthBalance: number;
  monthSpend: number;
  // Pipeline
  ppTotal: number;
  ppToken: number;
  ppBalance: number;
  ppFinancePending: number;
  ppFinal: number;
  ppDropped: number;
  ppHotPending: number;
  ppOverdue: number;
  topPending: any[];
  // Team
  team: Record<string, any>;
  // Marketing
  marketing: Record<string, any>;
  // Finance
  finance: Record<string, number>;
  financePartners: Record<string, any>;
  // Alerts
  alerts: { title: string; count: number; explain: string; action?: () => void; actionLabel?: string }[];
  hasDailyReports: boolean;
}

export default function FounderDashboard() {
  const { isAdmin, hasModule } = useAuth();
  const nav = useNavigate();
  const allowed = isAdmin || hasModule("founder_dashboard") || hasModule("founder-dashboard");

  const [rangeKey, setRangeKey] = useState<RangeKey>("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  const bounds = useMemo(() => rangeBounds(rangeKey, customStart, customEnd), [rangeKey, customStart, customEnd]);
  const todayIso = isoDay(new Date());
  const isTodayFilter = rangeKey === "today";
  const snapshotTitle = isTodayFilter ? "Today's Business Snapshot" : "Selected Period Snapshot";
  const moneyTitle = isTodayFilter ? "Today's Money View" : "Selected Period Money View";
  const rangeLabel = RANGES.find((r) => r.key === rangeKey)?.label || "Selected Period";

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    let canceled = false;
    (async () => {
      setLoading(true);
      try {
        // Paid pipeline leads (all active for snapshot)
        const { data: leads = [] } = await supabase
          .from("paid_pipeline_leads")
          .select("*")
          .eq("is_deleted", false);
        // Payments
        const { data: pays = [] } = await supabase
          .from("paid_pipeline_payments" as any)
          .select("amount, payment_type, payment_category, payment_date, paid_pipeline_lead_id, is_token")
          .eq("is_deleted", false);
        // Followups
        const { data: followups = [] } = await supabase
          .from("paid_pipeline_followups")
          .select("follow_up_date, status, paid_pipeline_lead_id");
        // Finance details
        const { data: financeDetails = [] } = await supabase
          .from("paid_pipeline_finance_details")
          .select("finance_partner, finance_status, loan_amount, paid_pipeline_lead_id, application_date, approval_date, disbursement_date, updated_at, created_at");
        // Daily lead reports
        const { data: dailyReports = [] } = await supabase
          .from("daily_lead_reports")
          .select("id, report_date, total_leads, total_ad_spend")
          .eq("is_deleted", false);
        // Profiles for sales executive names
        const { data: profs = [] } = await supabase.from("profiles").select("id, full_name");
        const profMap = new Map((profs as any[]).map((p) => [p.id, p.full_name]));

        if (canceled) return;

        const S = bounds.start;
        const E = bounds.end;
        const inRange = (d: string | null | undefined) => !!d && d >= S && d <= E;
        const dayOnly = (v: any) => (typeof v === "string" ? v.slice(0, 10) : "");

        const isRefund = (p: any) =>
          p.payment_type === "Refund" || p.payment_category === "Refund";
        const isTokenPay = (p: any) =>
          p.is_token || p.payment_type === "Token" ||
          p.payment_category === "Token Amount" || p.payment_category === "Second Token";

        // Payments in selected range — prefer payment_date, fallback created_at
        const payDate = (p: any) => dayOnly(p.payment_date) || dayOnly(p.created_at);
        const rangePays = (pays as any[]).filter((p) => inRange(payDate(p)));
        const tokenInRange = rangePays.filter(isTokenPay)
          .reduce((a, p) => a + Number(p.amount || 0), 0);
        const realizedInRange = rangePays.reduce(
          (a, p) => a + (isRefund(p) ? -Number(p.amount || 0) : Number(p.amount || 0)),
          0,
        );

        // Daily reports in selected range
        const rangeDR = (dailyReports as any[]).filter((r) => inRange(dayOnly(r.report_date)));
        const leadsInRange = rangeDR.reduce((a, r) => a + (r.total_leads || 0), 0);
        const spendInRange = rangeDR.reduce((a, r) => a + getGstAwareAdSpend({ total_ad_spend: r.total_ad_spend }).grossAdSpend, 0);

        // Follow-ups in selected range
        const rangeFollowups = (followups as any[]).filter((f) => inRange(dayOnly(f.follow_up_date)));
        const followupsDueRange = rangeFollowups.filter(
          (f) => f.status !== "Done" && f.status !== "Cancelled",
        ).length;
        const overdueRange = rangeFollowups.filter(
          (f) => dayOnly(f.follow_up_date) < todayIso && f.status !== "Done" && f.status !== "Cancelled",
        ).length;

        // Leads created in selected range
        const leadsRange = (leads as any[]).filter((l) => inRange(dayOnly(l.created_at)));
        // Active (not dropped/refunded) - all time, used for "Active Pending"
        const activeLeads = (leads as any[]).filter((l) => !l.is_dropped && !l.is_refunded);
        const balanceActiveAllTime = activeLeads.reduce(
          (a, l) => a + Number(l.balance_pending || 0),
          0,
        );

        // --- Snapshot (uses bounds) ---
        const leadsTodayMetric = leadsInRange;
        const spendTodayMetric = spendInRange;
        const tokenTodayMetric = tokenInRange;
        const realizedTodayMetric = realizedInRange;
        const followupsTodayMetric = followupsDueRange;

        // Finance-pending count (active, all-time — labeled)
        const financePendingLeads = (leads as any[]).filter(
          (l) =>
            l.finance_required &&
            l.finance_status &&
            !["Disbursed", "Rejected", "Dropped", "Not Required"].includes(l.finance_status),
        );

        // --- Money view (selected period) ---
        const monthRevenue = realizedInRange;
        const monthRealized = realizedInRange;
        const monthTokens = tokenInRange;
        // Pending revenue from leads created in range (active)
        const monthToBeRealized = leadsRange
          .filter((l) => !l.is_dropped && !l.is_refunded)
          .reduce((a, l) => a + Number(l.balance_pending || 0), 0);
        const monthBalance = monthToBeRealized;
        const monthSpend = spendInRange;

        // --- Pipeline health (selected period; counts based on lead created_at) ---
        const ppTotal = leadsRange.length;
        const ppToken = leadsRange.filter((l) => Number(l.token_amount_collected || 0) > 0).length;
        const ppBalance = leadsRange.filter(
          (l) => Number(l.balance_pending || 0) > 0 && !l.is_dropped,
        ).length;
        const ppFinancePending = leadsRange.filter(
          (l) =>
            l.finance_required &&
            l.finance_status &&
            !["Disbursed", "Rejected", "Dropped", "Not Required"].includes(l.finance_status),
        ).length;
        // Final sales: prefer updated_at (status flip) within range
        const ppFinal = (leads as any[]).filter(
          (l) => l.is_final_sale && inRange(dayOnly(l.updated_at || l.created_at)),
        ).length;
        const ppDropped = (leads as any[]).filter(
          (l) =>
            (l.is_dropped || l.pipeline_stage === "Dropped After Token") &&
            inRange(dayOnly(l.updated_at || l.created_at)),
        ).length;
        const hotPriorities = ["Hot", "Urgent"];
        const ppHotPending = leadsRange.filter(
          (l) =>
            Number(l.balance_pending || 0) > 0 &&
            (hotPriorities.includes(l.follow_up_priority) || hotPriorities.includes(l.lead_temperature)),
        ).length;
        const ppOverdue = overdueRange;

        // Top pending — all-time (labeled)
        const topPending = [...activeLeads]
          .filter((l) => Number(l.balance_pending || 0) > 0)
          .sort((a, b) => Number(b.balance_pending || 0) - Number(a.balance_pending || 0))
          .slice(0, 8);

        // --- Sales team snapshot (selected period) ---
        const leadById = new Map((leads as any[]).map((l) => [l.id, l]));
        const team: Record<string, any> = {};
        const ensureTeam = (ownerId: string) => {
          if (!team[ownerId]) {
            const name = profMap.get(ownerId) || (ownerId === "unassigned" ? "Unassigned" : "—");
            team[ownerId] = {
              name, leadsAssigned: 0, followupsDue: 0, followupsDone: 0,
              tokens: 0, balanceCollected: 0, finalSales: 0, revenue: 0, missed: 0,
            };
          }
          return team[ownerId];
        };
        // Leads assigned in range
        for (const l of leadsRange) {
          const ownerId = l.assigned_sales_executive || "unassigned";
          ensureTeam(ownerId).leadsAssigned += 1;
        }
        // Final sales in range
        for (const l of leads as any[]) {
          if (!l.is_final_sale) continue;
          if (!inRange(dayOnly(l.updated_at || l.created_at))) continue;
          const ownerId = l.assigned_sales_executive || "unassigned";
          ensureTeam(ownerId).finalSales += 1;
        }
        // Payments in range → tokens, revenue, balanceCollected
        for (const p of rangePays) {
          const lead = leadById.get(p.paid_pipeline_lead_id);
          if (!lead) continue;
          const ownerId = lead.assigned_sales_executive || "unassigned";
          const t = ensureTeam(ownerId);
          const amt = Number(p.amount || 0) * (isRefund(p) ? -1 : 1);
          t.revenue += amt;
          if (isTokenPay(p)) t.tokens += amt;
          else t.balanceCollected += amt;
        }
        // Follow-ups in range
        for (const f of rangeFollowups) {
          const lead = leadById.get(f.paid_pipeline_lead_id);
          if (!lead) continue;
          const ownerId = lead.assigned_sales_executive || "unassigned";
          const t = ensureTeam(ownerId);
          if (f.status === "Done") t.followupsDone += 1;
          else t.followupsDue += 1;
          if (dayOnly(f.follow_up_date) < todayIso && f.status !== "Done" && f.status !== "Cancelled")
            t.missed += 1;
        }

        // --- Marketing snapshot (selected period) ---
        const marketing: Record<string, any> = {};
        const ensureMb = (mb: string) => {
          if (!marketing[mb]) {
            marketing[mb] = {
              name: mb, leads: 0, spend: 0, tokenSales: 0, finalSales: 0,
              revenue: 0, balance: 0,
            };
          }
          return marketing[mb];
        };
        for (const l of leadsRange) {
          const mb = l.attributed_media_buyer || "Unattributed";
          const m = ensureMb(mb);
          m.leads += 1;
          if (Number(l.token_amount_collected || 0) > 0) m.tokenSales += 1;
          m.balance += Number(l.balance_pending || 0);
        }
        for (const l of leads as any[]) {
          if (!l.is_final_sale) continue;
          if (!inRange(dayOnly(l.updated_at || l.created_at))) continue;
          const mb = l.attributed_media_buyer || "Unattributed";
          ensureMb(mb).finalSales += 1;
        }
        for (const p of rangePays) {
          const lead = leadById.get(p.paid_pipeline_lead_id);
          if (!lead) continue;
          const mb = lead.attributed_media_buyer || "Unattributed";
          const amt = Number(p.amount || 0) * (isRefund(p) ? -1 : 1);
          ensureMb(mb).revenue += amt;
        }

        // --- Finance/EMI (selected period via updated_at / status dates) ---
        const fStatuses = [
          "Documents Pending", "Application Submitted", "Approved", "Rejected",
          "Disbursed", "Failed - Trying Another Partner",
        ];
        const finance: Record<string, number> = { "Active Finance Pending": financePendingLeads.length };
        for (const s of fStatuses) finance[s] = 0;
        const financeInRange = (financeDetails as any[]).filter((fd) => {
          const d =
            dayOnly(fd.disbursement_date) ||
            dayOnly(fd.approval_date) ||
            dayOnly(fd.application_date) ||
            dayOnly(fd.updated_at) ||
            dayOnly(fd.created_at);
          return inRange(d);
        });
        for (const fd of financeInRange) {
          if (fd.finance_status && finance[fd.finance_status] !== undefined) {
            finance[fd.finance_status] += 1;
          }
        }
        // Finance partners (selected period)
        const financePartners: Record<string, any> = {};
        for (const fd of financeInRange) {
          const p = fd.finance_partner || "Other";
          if (!financePartners[p]) {
            financePartners[p] = {
              name: p, total: 0, docs: 0, approved: 0, rejected: 0,
              disbursed: 0, disbursedRevenue: 0,
            };
          }
          financePartners[p].total += 1;
          if (fd.finance_status === "Documents Pending") financePartners[p].docs += 1;
          if (fd.finance_status === "Approved") financePartners[p].approved += 1;
          if (fd.finance_status === "Rejected") financePartners[p].rejected += 1;
          if (fd.finance_status === "Disbursed") {
            financePartners[p].disbursed += 1;
            financePartners[p].disbursedRevenue += Number(fd.loan_amount || 0);
          }
        }

        // --- Alerts (selected period) ---
        const alerts: DashboardData["alerts"] = [];
        const hotNoFup = leadsRange.filter(
          (l) =>
            (hotPriorities.includes(l.follow_up_priority) || hotPriorities.includes(l.lead_temperature)) &&
            !l.next_follow_up_date,
        ).length;
        if (hotNoFup > 0)
          alerts.push({
            title: "Hot leads without follow-up date",
            count: hotNoFup,
            explain: `Hot/Urgent leads created in ${rangeLabel} have no next follow-up.`,
            actionLabel: "Open Paid Pipeline",
            action: () => nav("/paid-pipeline"),
          });
        const tokenNoFup = leadsRange.filter(
          (l) =>
            Number(l.token_amount_collected || 0) > 0 &&
            Number(l.balance_pending || 0) > 0 &&
            !l.next_follow_up_date &&
            !l.next_balance_follow_up_date,
        ).length;
        if (tokenNoFup > 0)
          alerts.push({
            title: "Token paid but no payment follow-up",
            count: tokenNoFup,
            explain: `Leads in ${rangeLabel} with token collected and balance pending have no follow-up.`,
            actionLabel: "Open Paid Pipeline",
            action: () => nav("/paid-pipeline"),
          });
        const bigBalance = leadsRange.filter(
          (l) => !l.is_dropped && !l.is_refunded && Number(l.balance_pending || 0) >= 50000,
        ).length;
        if (bigBalance > 0)
          alerts.push({
            title: "Balance pending above ₹50,000",
            count: bigBalance,
            explain: `High-value pending balances on leads in ${rangeLabel}.`,
            actionLabel: "Open Paid Pipeline",
            action: () => nav("/paid-pipeline"),
          });
        if (ppOverdue > 0)
          alerts.push({
            title: "Follow-ups overdue",
            count: ppOverdue,
            explain: `Follow-up dates in ${rangeLabel} passed but not marked Done.`,
            actionLabel: "Open Paid Pipeline",
            action: () => nav("/paid-pipeline"),
          });
        if (ppDropped > 0)
          alerts.push({
            title: "Dropped after token",
            count: ppDropped,
            explain: `Leads in ${rangeLabel} that paid token but later dropped.`,
            actionLabel: "Open Paid Pipeline",
            action: () => nav("/paid-pipeline"),
          });

        setData({
          leadsToday: leadsTodayMetric, spendToday: spendTodayMetric,
          tokenToday: tokenTodayMetric, realizedToday: realizedTodayMetric,
          balanceOverall: balanceActiveAllTime,
          followupsToday: followupsTodayMetric,
          financePending: financePendingLeads.length,
          monthRevenue, monthRealized, monthToBeRealized, monthTokens, monthBalance, monthSpend,
          ppTotal, ppToken, ppBalance, ppFinancePending, ppFinal, ppDropped, ppHotPending, ppOverdue,
          topPending, team, marketing, finance, financePartners, alerts,
          hasDailyReports: (dailyReports as any[]).length > 0,
        });
      } catch (e) {
        console.error("Founder dashboard load error", e);
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => { canceled = true; };
  }, [allowed, bounds.start, bounds.end, todayIso, nav, rangeLabel]);

  if (!allowed) {
    return (
      <div className="max-w-[800px]">
        <PageHead title="Founder Dashboard" />
        <div className="rounded-xl border border-line bg-off p-10 text-center">
          <div className="font-serif text-xl mb-2">Access restricted</div>
          <div className="font-sans text-sm text-muted-foreground">
            You do not have access to Founder Dashboard. Please contact an admin.
          </div>
        </div>
      </div>
    );
  }

  const cpl = data && data.leadsToday > 0 ? data.spendToday / data.leadsToday : 0;
  const profit = data ? data.monthRevenue - data.monthSpend : 0;
  const margin = data && data.monthRevenue > 0 ? (profit / data.monthRevenue) * 100 : 0;

  return (
    <div className="max-w-[1280px]">
      <PageHead
        title="Founder Dashboard"
        sub="Your command center for revenue, follow-ups, pipeline health, finance/EMI, team performance, and business alerts."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRangeKey(r.key)}
            className={`px-3 py-1.5 rounded-md border text-xs font-sans transition-colors ${
              rangeKey === r.key
                ? "bg-black text-white border-black"
                : "bg-white text-black border-line hover:border-[#bbb]"
            }`}
          >
            {r.label}
          </button>
        ))}
        {rangeKey === "custom" && (
          <>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1 border border-line rounded-md text-xs"
            />
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1 border border-line rounded-md text-xs"
            />
          </>
        )}
        <div className="ml-auto text-xs text-muted-foreground font-sans">
          {bounds.start} → {bounds.end}
        </div>
      </div>

      {loading || !data ? (
        <div className="text-sm text-muted-foreground">Loading founder dashboard…</div>
      ) : (
        <>
          <Section title={snapshotTitle}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <MetricCard label={`Leads (${rangeLabel})`} value={data.hasDailyReports ? data.leadsToday : NA} sub={data.hasDailyReports ? "Daily Lead Reporting" : "No data available"} />
              <MetricCard label={`Gross Ad Spend (${rangeLabel})`} value={data.hasDailyReports ? inr(data.spendToday) : NA} />
              <MetricCard label={`CPL (${rangeLabel})`} value={data.leadsToday > 0 ? inr(cpl) : NA} sub="Spend / Leads" />
              <MetricCard label={`Token Collected (${rangeLabel})`} value={inr(data.tokenToday)} tone="gold" onClick={() => nav("/paid-pipeline")} />
              <MetricCard label={`Realized Revenue (${rangeLabel})`} value={inr(data.realizedToday)} onClick={() => nav("/paid-pipeline")} />
              <MetricCard label="Total Active Pending Revenue" value={inr(data.balanceOverall)} sub="All-time" onClick={() => nav("/paid-pipeline")} />
              <MetricCard label={`Follow-Ups Due (${rangeLabel})`} value={data.followupsToday} onClick={() => nav("/paid-pipeline")} />
              <MetricCard label="Active Finance Pending" value={data.financePending} sub="All-time" onClick={() => nav("/paid-pipeline")} />
            </div>
          </Section>

          <Section title={moneyTitle}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <MetricCard label={`Revenue (${rangeLabel})`} value={inr(data.monthRevenue)} tone="gold" />
              <MetricCard label={`Realized Revenue (${rangeLabel})`} value={inr(data.monthRealized)} />
              <MetricCard label="Revenue To Be Realized" value={inr(data.monthToBeRealized)} sub={`From leads created in ${rangeLabel}`} onClick={() => nav("/paid-pipeline")} />
              <MetricCard label={`Token Collected (${rangeLabel})`} value={inr(data.monthTokens)} />
              <MetricCard label="Balance Pending" value={inr(data.monthBalance)} sub={`Leads created in ${rangeLabel}`} />
              <MetricCard label={`Gross Ad Spend (${rangeLabel})`} value={data.hasDailyReports ? inr(data.monthSpend) : NA} />
              <MetricCard label="Estimated Profit" value={data.hasDailyReports ? inr(profit) : NA} sub="Revenue − Gross Ad Spend (incl. GST)" onClick={() => nav("/profit-statement")} />
              <MetricCard label="Profit Margin" value={data.hasDailyReports && data.monthRevenue > 0 ? margin.toFixed(1) + "%" : NA} />
            </div>
          </Section>

          <Section title={`Paid Pipeline Health (${rangeLabel})`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <MetricCard label="New Leads" value={data.ppTotal} onClick={() => nav("/paid-pipeline")} />
              <MetricCard label="Token Paid" value={data.ppToken} />
              <MetricCard label="Balance Pending" value={data.ppBalance} />
              <MetricCard label="Finance Pending" value={data.ppFinancePending} />
              <MetricCard label="Final Sales" value={data.ppFinal} tone="gold" />
              <MetricCard label="Dropped After Token" value={data.ppDropped} tone={data.ppDropped > 0 ? "alert" : "default"} />
              <MetricCard label="Hot/Urgent w/ Balance" value={data.ppHotPending} />
              <MetricCard label="Follow-Ups Overdue" value={data.ppOverdue} tone={data.ppOverdue > 0 ? "alert" : "default"} />
            </div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-sans mb-2">Top Pending Balance Leads (All-Time)</div>
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-off">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Paid Batch</th>
                    <th className="px-4 py-2.5 text-right">Balance</th>
                    <th className="px-4 py-2.5">Priority</th>
                    <th className="px-4 py-2.5">Follow-Up</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPending.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground text-xs">No pending balances.</td></tr>
                  ) : data.topPending.map((l: any) => (
                    <tr key={l.id} className="border-t border-line">
                      <td className="px-4 py-2.5">{l.name || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.product_name_snapshot || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.paid_batch_name || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{inr(Number(l.balance_pending || 0))}</td>
                      <td className="px-4 py-2.5 text-xs">{l.follow_up_priority || l.lead_temperature || "—"}</td>
                      <td className="px-4 py-2.5 text-xs">{l.next_follow_up_date || l.next_balance_follow_up_date || "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => nav("/paid-pipeline")} className="text-xs text-gold hover:underline">Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Funnel Health">
            <div className="rounded-xl border border-line bg-off p-6 text-sm text-muted-foreground">
              Funnel metrics (registrations, show-up, watch point, conversion, ROAS) pull from Seminar ROAS &amp; Daily Lead Reporting.
              {" "}<button onClick={() => nav("/reports")} className="text-gold hover:underline">Open Reports &amp; History</button> for detailed funnel analytics.
            </div>
          </Section>

          <Section title={`Sales Team Snapshot (${rangeLabel})`}>
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-off">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">Executive</th>
                    <th className="px-4 py-2.5 text-right">Leads</th>
                    <th className="px-4 py-2.5 text-right">FUp Due</th>
                    <th className="px-4 py-2.5 text-right">FUp Done</th>
                    <th className="px-4 py-2.5 text-right">Tokens</th>
                    <th className="px-4 py-2.5 text-right">Revenue</th>
                    <th className="px-4 py-2.5 text-right">Final Sales</th>
                    <th className="px-4 py-2.5 text-right">Missed</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(data.team).length === 0 ? (
                    <EmptyRow colSpan={8} title="No team data yet." />
                  ) : Object.values(data.team)
                    .sort((a: any, b: any) => b.revenue - a.revenue)
                    .map((t: any, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-4 py-2.5">{t.name}</td>
                        <td className="px-4 py-2.5 text-right">{t.leadsAssigned}</td>
                        <td className="px-4 py-2.5 text-right">{t.followupsDue}</td>
                        <td className="px-4 py-2.5 text-right">{t.followupsDone}</td>
                        <td className="px-4 py-2.5 text-right">{inr(t.tokens)}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{inr(t.revenue)}</td>
                        <td className="px-4 py-2.5 text-right">{t.finalSales}</td>
                        <td className="px-4 py-2.5 text-right">{t.missed > 0 ? <span className="text-[#B91C1C]">{t.missed}</span> : 0}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Marketing Snapshot (${rangeLabel})`}>
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-off">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">Media Buyer</th>
                    <th className="px-4 py-2.5 text-right">Leads</th>
                    <th className="px-4 py-2.5 text-right">Token Sales</th>
                    <th className="px-4 py-2.5 text-right">Final Sales</th>
                    <th className="px-4 py-2.5 text-right">Revenue</th>
                    <th className="px-4 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(data.marketing).length === 0 ? (
                    <EmptyRow colSpan={6} title="No marketing data yet." />
                  ) : Object.values(data.marketing)
                    .sort((a: any, b: any) => b.revenue - a.revenue)
                    .map((m: any, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-4 py-2.5">{m.name}</td>
                        <td className="px-4 py-2.5 text-right">{m.leads}</td>
                        <td className="px-4 py-2.5 text-right">{m.tokenSales}</td>
                        <td className="px-4 py-2.5 text-right">{m.finalSales}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{inr(m.revenue)}</td>
                        <td className="px-4 py-2.5 text-right">{inr(m.balance)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Finance / EMI Health (${rangeLabel})`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {Object.entries(data.finance).map(([k, v]) => (
                <MetricCard key={k} label={k} value={v} sub={k === "Active Finance Pending" ? "All-time" : undefined} />
              ))}
            </div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-sans mb-2">Finance Partner Performance ({rangeLabel})</div>
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-off">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">Partner</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5 text-right">Docs Pending</th>
                    <th className="px-4 py-2.5 text-right">Approved</th>
                    <th className="px-4 py-2.5 text-right">Rejected</th>
                    <th className="px-4 py-2.5 text-right">Disbursed</th>
                    <th className="px-4 py-2.5 text-right">Disbursed Revenue</th>
                    <th className="px-4 py-2.5 text-right">Success %</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(data.financePartners).length === 0 ? (
                    <EmptyRow colSpan={8} title="No finance cases yet." />
                  ) : Object.values(data.financePartners).map((p: any, i) => {
                    const success = p.total > 0 ? ((p.disbursed / p.total) * 100).toFixed(0) + "%" : NA;
                    return (
                      <tr key={i} className="border-t border-line">
                        <td className="px-4 py-2.5">{p.name}</td>
                        <td className="px-4 py-2.5 text-right">{p.total}</td>
                        <td className="px-4 py-2.5 text-right">{p.docs}</td>
                        <td className="px-4 py-2.5 text-right">{p.approved}</td>
                        <td className="px-4 py-2.5 text-right">{p.rejected}</td>
                        <td className="px-4 py-2.5 text-right">{p.disbursed}</td>
                        <td className="px-4 py-2.5 text-right">{inr(p.disbursedRevenue)}</td>
                        <td className="px-4 py-2.5 text-right">{success}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Founder Alerts / Red Flags">
            {data.alerts.length === 0 ? (
              <div className="rounded-xl border border-line bg-off p-6 text-sm text-muted-foreground text-center">
                No major red flags for the selected period.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.alerts.map((a, i) => (
                  <div key={i} className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="font-serif text-base text-[#991B1B]">{a.title}</div>
                      <div className="font-serif text-xl text-[#B91C1C]">{a.count}</div>
                    </div>
                    <div className="font-sans text-xs text-[#7F1D1D] mb-3">{a.explain}</div>
                    {a.action && (
                      <button onClick={a.action} className="text-xs font-medium text-[#B91C1C] hover:underline">
                        {a.actionLabel || "Open"} →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
