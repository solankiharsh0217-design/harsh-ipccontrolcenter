import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { downloadCSV, downloadPDF, type AttributionPayload, type SaleDetail } from "@/lib/roasExport";
import AttributionResultsView from "@/components/roas/AttributionResultsView";
import AttributionAuditPanel from "@/components/roas/AttributionAuditPanel";
import type { AttributionResult } from "@/lib/roas/attributionEngine";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Cell,
  Tooltip as RTooltip, Legend,
} from "recharts";
import DailyHistoryView from "@/components/roas/daily/DailyHistoryView";
import MediaBuyerComparisonView from "@/components/roas/daily/MediaBuyerComparisonView";
import type { DailyReport } from "@/lib/dailyReports/helpers";
import { logActivity } from "@/lib/auditLog";

const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN");
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (d: string | Date) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const roasClass = (n: number) => (n >= 10 ? "roas-good" : n >= 5 ? "roas-avg" : "roas-bad");
const roasHex = (n: number) => (n >= 10 ? "#16A34A" : n >= 5 ? "#CA8A04" : "#DC2626");
function initials(name: string) {
  const w = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  if (w.length === 1) return w[0][0].toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
}
function daysRemaining(deletedAt?: string | null): number {
  if (!deletedAt) return 14;
  const ms = new Date(deletedAt).getTime() + 14 * 24 * 60 * 60 * 1000 - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

const styles = `
.rcv2 *,.rcv2 *::before,.rcv2 *::after{box-sizing:border-box}
.rcv2{--gold:#C8A84B;--gp:#FBF6E9;--gm:#E8D49A;--kk:#0a0a0a;--ww:#fff;--off:#F7F6F3;--bd:#E8E5DE;--mt:#888;--ml:#bbb;--rd:#DC2626;--rp:#FEF2F2;--rb:#FECACA;--gn:#16A34A;--gnp:#F0FDF4;--gnb:#BBF7D0;--bl:#2563EB;--amb:#CA8A04;--ap:#FFFBEB;--ab:#FDE68A;font-family:'Jost',sans-serif;color:var(--kk)}
.rcv2 .fi,.rcv2 .fsel{height:38px;border:1px solid var(--bd);border-radius:8px;padding:0 12px;font-family:'Jost',sans-serif;font-size:13px;background:var(--ww);outline:none;transition:border-color .12s;width:100%}
.rcv2 .fi-sm,.rcv2 .fsel-sm{height:32px;font-size:12px}
.rcv2 .fi:focus,.rcv2 .fsel:focus,.rcv2 .fi-sm:focus{border-color:var(--gold)}
.rcv2 .fl-sm{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--mt);margin-bottom:4px;display:block}
.rcv2 .btn{height:34px;padding:0 14px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12px;font-weight:500;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:6px}
.rcv2 .btn-k{background:var(--kk);color:var(--ww)}
.rcv2 .btn-g{background:var(--ww);color:var(--kk);border:1px solid var(--bd)}
.rcv2 .btn-g:hover{background:var(--off)}
.rcv2 .btn-sm{height:28px;padding:0 10px;font-size:11.5px}
.rcv2 .step-title{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:500}
.rcv2 .step-sub{font-size:12px;color:var(--mt);margin-top:2px}
.rcv2 .attr-table{width:100%;border-collapse:collapse;font-size:12.5px}
.rcv2 .attr-table th{text-align:left;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);padding:10px 14px;border-bottom:1px solid var(--bd);background:var(--off)}
.rcv2 .attr-table td{padding:14px;border-bottom:1px solid var(--bd);vertical-align:middle}
.rcv2 .attr-table tbody tr:hover td{background:var(--off);cursor:pointer}
.rcv2 .roas-val{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:500}
.rcv2 .roas-good{color:var(--gn)} .rcv2 .roas-avg{color:var(--amb)} .rcv2 .roas-bad{color:var(--rd)}
.rcv2 .spend-av{width:24px;height:24px;border-radius:50%;background:var(--kk);color:var(--gold);font-family:'Cormorant Garamond',serif;font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2px solid var(--ww);margin-left:-8px}
.rcv2 .spend-av:first-child{margin-left:0}
.rcv2 .pill{height:32px;padding:0 16px;border-radius:18px;border:1px solid var(--bd);background:var(--ww);font-size:12px;color:var(--mt);cursor:pointer;font-family:'Jost',sans-serif;transition:all .12s}
.rcv2 .pill:hover{color:var(--kk)}
.rcv2 .pill.on{background:var(--kk);color:var(--ww);border-color:var(--kk)}
.rcv2 .stat-card{border:1px solid var(--bd);border-radius:12px;padding:16px 18px;background:var(--ww)}
.rcv2 .stat-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);margin-bottom:6px}
.rcv2 .stat-val{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:500}
.rcv2 .sum-card{border-radius:10px;padding:16px 18px}
.rcv2 .sum-card.plain{background:var(--off);border:1px solid var(--bd)}
.rcv2 .sum-card.gold{background:var(--gp);border:1px solid var(--gm)}
.rcv2 .sum-card.grn{background:var(--gnp);border:1px solid var(--gnb)}
.rcv2 .sum-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);margin-bottom:7px}
.rcv2 .sum-val{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:500;line-height:1;margin-bottom:2px}
.rcv2 .sum-card.gold .sum-val{color:var(--gold)} .rcv2 .sum-card.grn .sum-val{color:var(--gn)}
.rcv2 .sum-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.rcv2 .mb-name-cell{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:500}
.rcv2 .mb-sub2{font-size:10.5px;color:var(--mt);margin-top:2px}
.rcv2 .filter-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--mt);margin-bottom:4px;display:block}
.rcv2 .cat-card{flex:1;min-width:240px;border:1px solid var(--bd);border-radius:14px;padding:20px 22px;background:var(--ww);cursor:pointer;transition:all .15s;text-align:left}
.rcv2 .cat-card:hover{background:var(--off)}
.rcv2 .cat-card.on{background:var(--gp);border-color:var(--gold)}
.rcv2 .cat-title{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:10px}
.rcv2 .cat-badge{display:inline-block;background:var(--ww);border:1px solid var(--bd);color:var(--kk);font-size:10.5px;padding:2px 10px;border-radius:12px;font-family:'Jost',sans-serif}
.rcv2 .cat-card.on .cat-badge{border-color:var(--gold);background:var(--ww)}
.rcv2 .cat-desc{font-size:12.5px;color:var(--mt);line-height:1.5;margin-bottom:14px}
.rcv2 .cat-stats{display:flex;gap:16px;flex-wrap:wrap;border-top:1px solid var(--bd);padding-top:12px}
.rcv2 .cat-card.on .cat-stats{border-top-color:var(--gm)}
.rcv2 .cat-stat-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--mt)}
.rcv2 .cat-stat-val{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:500;margin-top:2px}
.rcv2 .menu-pop{position:absolute;top:calc(100% + 4px);right:0;background:#fff;border:1px solid var(--bd);border-radius:10px;min-width:200px;z-index:60;padding:4px;box-shadow:0 4px 12px rgba(0,0,0,.04)}
.rcv2 .menu-item{display:block;width:100%;text-align:left;padding:8px 12px;background:transparent;border:none;font-family:'Jost',sans-serif;font-size:12px;color:var(--kk);cursor:pointer;border-radius:6px}
.rcv2 .menu-item:hover{background:var(--gp)}
.rcv2 .menu-item.danger{color:var(--rd)}
.rcv2 .menu-item.danger:hover{background:var(--rp)}
`;

type SessionRow = {
  id: string;
  webinar_name: string;
  webinar_date: string | null;
  webinar_type: string | null;
  total_leads: number;
  total_sales: number;
  total_ad_spend: number;
  total_revenue: number;
  overall_roas: number;
  unmatched_count: number;
  created_at: string;
  updated_at?: string | null;
  is_deleted?: boolean | null;
  calculation_method?: string | null;
  calculation_display_method?: string | null;
  webinar_date_mode?: string | null;
  webinar_single_date?: string | null;
  webinar_start_date?: string | null;
  webinar_end_date?: string | null;
  webinar_dates?: string[] | null;
  session_slot?: string | null;
  webinar_format?: string | null;
  webinar_operator?: string | null;
  webinar_platform?: string | null;
  webinar_notes?: string | null;
  zoom_account_used?: string | null;
  buyers?: { name: string }[];
};

function methodLabel(s: SessionRow): string {
  if (s.calculation_display_method) return s.calculation_display_method;
  const m = (s.calculation_method || "").toLowerCase();
  if (m.includes("auto")) return "Automatic Attribution";
  if (m === "manual") return "Manual Upload";
  return "—";
}
function webinarPeriod(s: SessionRow): string {
  const fmt = (d: string | null | undefined) => d ? fmtDate(d) : "";
  const mode = s.webinar_date_mode;
  if (mode === "range" && s.webinar_start_date && s.webinar_end_date) {
    return `${fmt(s.webinar_start_date)} - ${fmt(s.webinar_end_date)}`;
  }
  if (mode === "multiple" && Array.isArray(s.webinar_dates) && s.webinar_dates.length) {
    return s.webinar_dates.filter(Boolean).map(fmt).join(", ");
  }
  if (s.webinar_single_date) return fmt(s.webinar_single_date);
  if (s.webinar_date) return fmt(s.webinar_date);
  return "—";
}
function periodMonth(s: SessionRow): string {
  const d = (s.webinar_date_mode === "range" && s.webinar_start_date)
    || (s.webinar_date_mode === "multiple" && s.webinar_dates?.[0])
    || s.webinar_single_date || s.webinar_date;
  return d ? String(d).slice(0, 7) : "";
}

type SectionKey = "attribution" | "daily" | "seminar" | "profit" | "overview";

type ProfitStatementRow = {
  id: string;
  business_unit: string;
  statement_month: string;
  status: string;
  total_revenue: number;
  total_cogs: number;
  gross_profit: number;
  total_payroll: number;
  total_operating_expense: number;
  total_fixed_expense: number;
  total_variable_expense: number;
  total_one_time_expense: number;
  total_incentives: number;
  net_profit: number;
  net_margin: number;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
};

type SeminarRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  webinar_name: string;
  webinar_mode: string | null;
  total_webinar_days: number;
  watch_point_percent: number;
  total_revenue_including_gst: number;
  total_ad_spend_including_gst: number;
  total_conversions: number;
  profit_after_gst: number;
  cpa: number | null;
  roas: number | null;
  whatsapp_summary_text: string | null;
  input_snapshot_json: any;
  output_snapshot_json: any;
};

export default function Reports() {
  const navigate = useNavigate();
  const [section, setSection] = useState<SectionKey>("attribution");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareCtx, setCompareCtx] = useState<{ from: string; to: string; preset: any } | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dailyStats, setDailyStats] = useState({ count: 0, spend: 0, leadsTotal: 0, avgCpl: null as number | null });
  const [seminarRows, setSeminarRows] = useState<SeminarRow[]>([]);
  const [profitRows, setProfitRows] = useState<ProfitStatementRow[]>([]);

  const reloadProfit = async () => {
    const { data } = await (supabase as any)
      .from("profit_statements")
      .select("*")
      .order("statement_month", { ascending: false })
      .limit(500);
    setProfitRows((data || []) as ProfitStatementRow[]);
  };


  const reloadSeminar = async () => {
    const { data } = await (supabase as any)
      .from("seminar_roas_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setSeminarRows((data || []) as SeminarRow[]);
  };

  const reloadSessions = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("attribution_sessions")
      .select("*, buyers:attribution_media_buyers(media_buyer_name)")
      .order("created_at", { ascending: false })
      .limit(500);
    const rows: SessionRow[] = (data || []).map((d: any) => ({
      ...d,
      buyers: (d.buyers || []).map((b: any) => ({ name: b.media_buyer_name })),
    }));
    setSessions(rows);
    setLoading(false);
  };

  const loadDailyStats = async () => {
    const { data } = await (supabase as any)
      .from("daily_lead_reports")
      .select("total_ad_spend,total_leads,overall_cpl")
      .eq("is_deleted", false);
    const arr = data || [];
    const spend = arr.reduce((a: number, r: any) => a + Number(r.total_ad_spend || 0), 0);
    const leadsTotal = arr.reduce((a: number, r: any) => a + Number(r.total_leads || 0), 0);
    const cpls = arr.map((r: any) => r.overall_cpl).filter((x: any) => x != null).map(Number);
    const avgCpl = cpls.length ? cpls.reduce((a: number, b: number) => a + b, 0) / cpls.length : null;
    setDailyStats({ count: arr.length, spend, leadsTotal, avgCpl });
  };

  useEffect(() => {
    // Best-effort: purge reports that have been in trash > 14 days, then load.
    (async () => {
      try { await (supabase as any).rpc("purge_old_deleted_reports"); } catch {}
      reloadSessions();
      loadDailyStats();
      reloadSeminar();
      reloadProfit();
    })();
    // Auto-open comparison view via route
    if (typeof window !== "undefined" && window.location.pathname.includes("media-buyer-comparison")) {
      setSection("daily");
      setCompareOpen(true);
    }
  }, []);

  const visibleSessions = useMemo(() =>
    sessions.filter((s) => showDeleted ? true : !s.is_deleted),
  [sessions, showDeleted]);

  const visibleSeminar = useMemo(() =>
    seminarRows.filter((s) => showDeleted ? true : !s.is_deleted),
  [seminarRows, showDeleted]);

  const seminarStats = useMemo(() => {
    const live = visibleSeminar;
    const totalRev = live.reduce((a, s) => a + Number(s.total_revenue_including_gst || 0), 0);
    const avgRoas = live.length ? live.reduce((a, s) => a + Number(s.roas || 0), 0) / live.length : 0;
    return { count: live.length, totalRev, avgRoas };
  }, [visibleSeminar]);

  const attrStats = useMemo(() => {
    const live = visibleSessions;
    const totalRev = live.reduce((a, s) => a + Number(s.total_revenue || 0), 0);
    const avg = live.length ? live.reduce((a, s) => a + Number(s.overall_roas || 0), 0) / live.length : 0;
    return { count: live.length, totalRev, avgRoas: avg };
  }, [visibleSessions]);

  const visibleProfit = useMemo(() =>
    profitRows.filter((s) => showDeleted ? true : !s.is_deleted),
  [profitRows, showDeleted]);

  const profitStats = useMemo(() => {
    const live = visibleProfit;
    const totalRev = live.reduce((a, s) => a + Number(s.total_revenue || 0), 0);
    const totalNet = live.reduce((a, s) => a + Number(s.net_profit || 0), 0);
    return { count: live.length, totalRev, totalNet };
  }, [visibleProfit]);

  const latestReportDate = useMemo(() => {
    const dates: string[] = [];
    visibleSessions.forEach((s) => s.created_at && dates.push(s.created_at));
    return dates.sort().reverse()[0] || null;
  }, [visibleSessions]);

  return (
    <div className="rcv2">
      <style>{styles}</style>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 400 }}>Reports & History</div>
      <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
        View, manage, analyze, and export reports from all IPC Control Center tools.
      </div>

      {/* Section cards */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        <CategoryCard
          on={section === "attribution"}
          title="Attribution Reports"
          badge={`${attrStats.count} reports`}
          desc="Media buyer attribution and ROAS reports from the ROAS Calculator."
          stats={[
            { lbl: "Reports", val: String(attrStats.count) },
            { lbl: "Avg ROAS", val: attrStats.avgRoas.toFixed(2) + "×" },
            { lbl: "Total Revenue", val: inr(attrStats.totalRev) },
          ]}
          onClick={() => setSection("attribution")}
        />
        <CategoryCard
          on={section === "daily"}
          title="Daily Lead Reports"
          badge={`${dailyStats.count} reports`}
          desc="Daily media buyer spend, leads, CPL and Meta metric reports."
          stats={[
            { lbl: "Reports", val: String(dailyStats.count) },
            { lbl: "Total Spend", val: inr(dailyStats.spend) },
            { lbl: "Avg CPL", val: dailyStats.avgCpl == null ? "—" : inr(dailyStats.avgCpl) },
          ]}
          onClick={() => setSection("daily")}
        />
        <CategoryCard
          on={section === "seminar"}
          title="Seminar ROAS Reports"
          badge={`${seminarStats.count} reports`}
          desc="Saved Seminar ROAS calculations from the Seminar ROAS Calculator."
          stats={[
            { lbl: "Reports", val: String(seminarStats.count) },
            { lbl: "Avg ROAS", val: seminarStats.avgRoas.toFixed(2) + "×" },
            { lbl: "Total Revenue", val: inr(seminarStats.totalRev) },
          ]}
          onClick={() => setSection("seminar")}
        />
        <CategoryCard
          on={section === "profit"}
          title="Profit Statements"
          badge={`${profitStats.count} statements`}
          desc="Monthly P&L statements with payroll, expenses, revenue and net profit."
          stats={[
            { lbl: "Statements", val: String(profitStats.count) },
            { lbl: "Total Revenue", val: inr(profitStats.totalRev) },
            { lbl: "Net Profit", val: inr(profitStats.totalNet) },
          ]}
          onClick={() => setSection("profit")}
        />
        <CategoryCard
          on={section === "overview"}
          title="Reports Overview"
          badge="Analytics"
          desc="High-level analytics across attribution and daily lead reports."
          stats={[
            { lbl: "Reports Saved", val: String(attrStats.count + dailyStats.count + seminarStats.count + profitStats.count) },
            { lbl: "Latest Report", val: latestReportDate ? fmtDate(latestReportDate) : "—" },
            { lbl: "Active Types", val: String((attrStats.count > 0 ? 1 : 0) + (dailyStats.count > 0 ? 1 : 0) + (seminarStats.count > 0 ? 1 : 0) + (profitStats.count > 0 ? 1 : 0)) },
          ]}
          onClick={() => setSection("overview")}
        />
      </div>

      {section === "attribution" && (
        <AttributionSection
          sessions={visibleSessions}
          loading={loading}
          showDeleted={showDeleted}
          setShowDeleted={setShowDeleted}
          reload={reloadSessions}
        />
      )}

      {section === "daily" && !compareOpen && (
        <DailyHistoryView
          onNew={() => navigate("/daily-lead-reporting")}
          onEditReport={(report: DailyReport) => {
            if (report?.id) navigate(`/daily-lead-reporting?editReportId=${report.id}`);
          }}
          onShowAnalytics={() => setSection("overview")}
          onCompareMediaBuyers={(ctx) => { setCompareCtx(ctx); setCompareOpen(true); }}
        />
      )}

      {section === "daily" && compareOpen && (
        <MediaBuyerComparisonView
          onBack={() => setCompareOpen(false)}
          initialFrom={compareCtx?.from}
          initialTo={compareCtx?.to}
          initialPreset={compareCtx?.preset}
        />
      )}

      {section === "seminar" && (
        <SeminarSection rows={visibleSeminar} showDeleted={showDeleted} setShowDeleted={setShowDeleted} reload={reloadSeminar} navigate={navigate} />
      )}

      {section === "profit" && (
        <ProfitStatementsSection rows={visibleProfit} showDeleted={showDeleted} setShowDeleted={setShowDeleted} reload={reloadProfit} navigate={navigate} />
      )}

      {section === "overview" && (
        <OverviewSection sessions={visibleSessions} dailyStats={dailyStats} />
      )}
    </div>
  );
}

function SeminarSection({ rows, showDeleted, setShowDeleted, reload, navigate }: { rows: SeminarRow[]; showDeleted: boolean; setShowDeleted: (b: boolean) => void; reload: () => void; navigate: (p: string) => void; }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const { user } = useAuth();

  const softDelete = async (id: string) => {
    if (!confirm("Move this report to trash? It will auto-delete after 14 days.")) return;
    const target = rows.find(r => r.id === id);
    setBusyId(id);
    const { error } = await (supabase as any)
      .from("seminar_roas_reports")
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id })
      .eq("id", id);
    setBusyId(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Report moved to trash");
      logActivity({ module_key: "reports_history", action_type: "report_soft_deleted", entity_type: "seminar_roas_report", entity_id: id, entity_label: target?.webinar_name, metadata: { report_type: "Seminar ROAS" }, summary: `Seminar ROAS Report '${target?.webinar_name ?? id}' moved to trash.`, severity: "warning" });
      reload();
    }
  };
  const restore = async (id: string) => {
    const target = rows.find(r => r.id === id);
    setBusyId(id);
    const { error } = await (supabase as any)
      .from("seminar_roas_reports")
      .update({ is_deleted: false, deleted_at: null, deleted_by: null })
      .eq("id", id);
    setBusyId(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Report restored");
      logActivity({ module_key: "reports_history", action_type: "report_restored", entity_type: "seminar_roas_report", entity_id: id, entity_label: target?.webinar_name, summary: `Seminar ROAS Report '${target?.webinar_name ?? id}' restored.` });
      reload();
    }
  };
  const copyWa = async (r: SeminarRow) => {
    if (!r.whatsapp_summary_text) { toast.error("No WhatsApp summary saved"); return; }
    try {
      await navigator.clipboard.writeText(r.whatsapp_summary_text);
      toast.success("WhatsApp summary copied");
      logActivity({ module_key: "reports_history", action_type: "whatsapp_summary_copied", entity_type: "seminar_roas_report", entity_id: r.id, entity_label: r.webinar_name, summary: `WhatsApp summary copied for '${r.webinar_name}'.` });
    } catch { toast.error("Copy failed"); }
  };
  const exportCsv = (r: SeminarRow) => {
    const rowsCsv = [
      ["Webinar", r.webinar_name],
      ["Mode", r.webinar_mode || ""],
      ["Days", String(r.total_webinar_days)],
      ["Watch Point %", String(r.watch_point_percent)],
      ["Revenue Inc. GST", String(r.total_revenue_including_gst)],
      ["Ad Spend Inc. GST", String(r.total_ad_spend_including_gst)],
      ["Total Conversions", String(r.total_conversions)],
      ["Profit After GST", String(r.profit_after_gst)],
      ["CPA", r.cpa == null ? "" : String(r.cpa)],
      ["ROAS", r.roas == null ? "" : String(r.roas)],
    ];
    const csv = rowsCsv.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seminar-roas-${r.webinar_name.replace(/\W+/g, "-")}.csv`;
    a.click();
    logActivity({ module_key: "reports_history", action_type: "report_exported", entity_type: "seminar_roas_report", entity_id: r.id, entity_label: r.webinar_name, metadata: { format: "csv", report_type: "Seminar ROAS" }, summary: `Seminar ROAS Report '${r.webinar_name}' exported as CSV.` });
  };

  const exportPdfRow = async (r: SeminarRow) => {
    try {
      const { downloadSeminarRoasPdf } = await import("@/lib/seminarRoasPdf");
      const inSnap = (r.input_snapshot_json || {}) as any;
      const outSnap = (r.output_snapshot_json || {}) as any;
      const revBasis = inSnap.revenueBasis || (r as any).revenue_basis;
      const convBasis = inSnap.convBasis || (r as any).conversion_rate_basis;
      const convBasisLabels: Record<string, string> = {
        offer_show_up: "Offer / Watch Present",
        show_up: "Show-Up",
        registrations: "Registrations",
      };
      const dayTimings = (outSnap.dayTimings || []) as Array<{ dur: number | null; wpTime: string }>;
      const days = (inSnap.days || []) as Array<any>;
      const products = (inSnap.products || []) as Array<any>;
      downloadSeminarRoasPdf({
        webinarName: r.webinar_name,
        webinarMode: r.webinar_mode,
        totalDays: r.total_webinar_days,
        watchPct: r.watch_point_percent,
        salesDay: (r as any).sales_day || inSnap.salesDay || 1,
        revenueBasisLabel: revBasis === "token_collected_amount" ? "Token / Collected Amount" : "Full Deal Value",
        conversionBasisLabel: convBasisLabels[convBasis] || "—",
        totals: {
          totalRev: Number(r.total_revenue_including_gst),
          adInc: Number(r.total_ad_spend_including_gst),
          profit: Number(r.profit_after_gst),
          totalUnits: Number(r.total_conversions),
          convRate: (r as any).conversion_rate ?? outSnap.convRate ?? null,
          cpa: r.cpa == null ? null : Number(r.cpa),
          cpl: outSnap.cpl ?? null,
          roas: r.roas == null ? null : Number(r.roas),
        },
        days: days.map((d: any, i: number) => {
          const t = dayTimings[i];
          return {
            day: i + 1,
            date: d.date,
            startTime: d.startTime,
            endTime: d.endTime,
            duration: t?.dur ?? null,
            watchPointTime: t?.wpTime,
            registrations: Number(d.registrations || 0),
            showUp: Number(d.showUp || 0),
            watchOrOffer: Number(d.watchOrOffer || 0),
            isSalesDay: i + 1 === ((r as any).sales_day || inSnap.salesDay),
          };
        }),
        products: products.map((p: any) => {
          const u = Number(p.units || 0);
          const pr = Number(p.price || 0);
          const tk = p.token === "" || p.token == null ? null : Number(p.token);
          const rev = (revBasis === "token_collected_amount" && tk != null && tk > 0) ? u * tk : u * pr;
          return { type: p.type, units: u, price: pr, token: tk, revenue: rev };
        }),
      });
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error("PDF export failed", { description: e?.message });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="step-title">Seminar ROAS Reports</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className={"pill" + (showDeleted ? " on" : "")} onClick={() => setShowDeleted(!showDeleted)}>
            {showDeleted ? "Showing trash" : "Show trash"}
          </button>
          <button className="btn btn-k" onClick={() => navigate("/roas-calculator")}>+ New Seminar Report</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#888", border: "1px solid var(--bd)", borderRadius: 12, background: "var(--ww)" }}>
          No seminar ROAS reports yet. Create one from the ROAS Calculator → Seminar ROAS Calculator.
        </div>
      ) : (
        <div style={{ border: "1px solid var(--bd)", borderRadius: 12, background: "var(--ww)", overflow: "hidden" }}>
          <table className="attr-table">
            <thead>
              <tr>
                <th>Created</th><th>Webinar</th><th>Days</th><th>WP%</th>
                <th>Revenue Inc. GST</th><th>Ad Spend Inc. GST</th><th>Conv.</th>
                <th>Profit</th><th>CPA</th><th>ROAS</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 11, color: "#888" }}>{fmtDateTime(r.created_at)}</td>
                  <td className="mb-name-cell">{r.webinar_name}{r.is_deleted && <span style={{ marginLeft: 8, fontSize: 10, color: "var(--rd)", fontFamily: "'Jost',sans-serif", fontWeight: 400 }}>· trash ({daysRemaining(r.deleted_at)}d left)</span>}</td>
                  <td>{r.total_webinar_days}</td>
                  <td>{r.watch_point_percent}%</td>
                  <td>{inr(Number(r.total_revenue_including_gst))}</td>
                  <td>{inr(Number(r.total_ad_spend_including_gst))}</td>
                  <td>{r.total_conversions}</td>
                  <td>{inr(Number(r.profit_after_gst))}</td>
                  <td>{r.cpa == null ? "—" : inr(Number(r.cpa))}</td>
                  <td><span className={"roas-val " + roasClass(Number(r.roas || 0))}>{r.roas == null ? "—" : Number(r.roas).toFixed(2) + "×"}</span></td>
                  <td>
                    <SeminarRowActions
                      busy={busyId === r.id}
                      isDeleted={!!r.is_deleted}
                      onView={() => navigate(`/roas-calculator?seminarId=${r.id}`)}
                      onEdit={() => navigate(`/roas-calculator?seminarId=${r.id}`)}
                      onCopyWa={() => copyWa(r)}
                      onExportCsv={() => exportCsv(r)}
                      onExportPdf={() => exportPdfRow(r)}
                      onDelete={() => softDelete(r.id)}
                      onRestore={() => restore(r.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SeminarRowActions({
  busy, isDeleted,
  onView, onEdit, onCopyWa, onExportCsv, onExportPdf, onDelete, onRestore,
}: {
  busy: boolean; isDeleted: boolean;
  onView: () => void; onEdit: () => void; onCopyWa: () => void;
  onExportCsv: () => void; onExportPdf: () => void;
  onDelete: () => void; onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setExportOpen(false); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "flex", gap: 4 }}>
      <button className="btn btn-g btn-sm" title="View" onClick={onView}>👁 View</button>
      <button className="btn btn-g btn-sm" onClick={() => setOpen((o) => !o)} disabled={busy}>⋯</button>
      {open && (
        <div className="menu-pop">
          {!isDeleted && (
            <button className="menu-item" onClick={() => { setOpen(false); onEdit(); }}>✏️ Edit Report</button>
          )}
          <button className="menu-item" onClick={() => setExportOpen((o) => !o)}>📤 Export ▸</button>
          {exportOpen && (
            <div style={{ paddingLeft: 8, borderLeft: "2px solid #E8E5DE", margin: "0 8px" }}>
              <button className="menu-item" onClick={() => { setOpen(false); onExportPdf(); }}>📄 Export PDF</button>
              <button className="menu-item" onClick={() => { setOpen(false); onExportCsv(); }}>📁 Export CSV</button>
              <button className="menu-item" onClick={() => { setOpen(false); onCopyWa(); }}>📋 Copy WhatsApp Summary</button>
            </div>
          )}
          {isDeleted ? (
            <button className="menu-item" onClick={() => { setOpen(false); onRestore(); }}>♻️ Restore</button>
          ) : (
            <button className="menu-item danger" onClick={() => { setOpen(false); onDelete(); }}>🗑 Delete Report</button>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryCard({
  on, title, badge, desc, stats, onClick,
}: { on: boolean; title: string; badge: string; desc: string; stats: { lbl: string; val: string }[]; onClick: () => void; }) {
  return (
    <button className={"cat-card" + (on ? " on" : "")} onClick={onClick}>
      <div className="cat-title">
        {title}
        <span className="cat-badge">{badge}</span>
      </div>
      <div className="cat-desc">{desc}</div>
      <div className="cat-stats">
        {stats.map((s) => (
          <div key={s.lbl}>
            <div className="cat-stat-lbl">{s.lbl}</div>
            <div className="cat-stat-val">{s.val}</div>
          </div>
        ))}
      </div>
    </button>
  );
}

/* ============================================================
   ATTRIBUTION SECTION
   ============================================================ */
type DatePreset = "all" | "today" | "yesterday" | "last_7_days" | "last_30_days" | "this_month" | "last_month" | "custom";

function getDateRangeFromPreset(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const t = iso(today);
  if (preset === "today") return { from: t, to: t };
  if (preset === "yesterday") { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
  if (preset === "last_7_days") { const f = new Date(today); f.setDate(f.getDate() - 6); return { from: iso(f), to: t }; }
  if (preset === "last_30_days") { const f = new Date(today); f.setDate(f.getDate() - 29); return { from: iso(f), to: t }; }
  if (preset === "this_month") { const f = new Date(today.getFullYear(), today.getMonth(), 1); return { from: iso(f), to: t }; }
  if (preset === "last_month") {
    const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const l = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: iso(f), to: iso(l) };
  }
  return { from: "", to: "" };
}

function DateRangeControl({
  label, preset, setPreset, from, to, setFrom, setTo, allLabel = "All Dates",
}: {
  label: string; preset: DatePreset; setPreset: (p: DatePreset) => void;
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; allLabel?: string;
}) {
  const onPresetChange = (p: DatePreset) => {
    setPreset(p);
    if (p === "custom") return;
    const r = getDateRangeFromPreset(p);
    setFrom(r.from); setTo(r.to);
  };
  return (
    <div>
      <label className="filter-lbl">{label}</label>
      <select className="fsel" value={preset} onChange={(e) => onPresetChange(e.target.value as DatePreset)}>
        <option value="all">{allLabel}</option>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="last_7_days">Last 7 Days</option>
        <option value="last_30_days">Last 30 Days</option>
        <option value="this_month">This Month</option>
        <option value="last_month">Last Month</option>
        <option value="custom">Custom Range</option>
      </select>
      {preset === "custom" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
          <input className="fi" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="fi" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}
      {preset !== "all" && preset !== "custom" && (from || to) && (
        <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
          {from ? fmtDate(from) : "…"} – {to ? fmtDate(to) : "…"}
        </div>
      )}
    </div>
  );
}

function AttributionSection({
  sessions, loading, showDeleted, setShowDeleted, reload,
}: { sessions: SessionRow[]; loading: boolean; showDeleted: boolean; setShowDeleted: (b: boolean) => void; reload: () => void; }) {
  const { user } = useAuth();
  const [createdPreset, setCreatedPreset] = useState<DatePreset>("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [webPreset, setWebPreset] = useState<DatePreset>("all");
  const [webFrom, setWebFrom] = useState("");
  const [webTo, setWebTo] = useState("");
  const [month, setMonth] = useState("all");
  const [monthBasis, setMonthBasis] = useState<"webinar" | "created">("webinar");
  const [methodF, setMethodF] = useState("all");
  const [buyer, setBuyer] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openSession, setOpenSession] = useState<SessionRow | null>(null);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const PAGE = 15;

  const months = useMemo(() => {
    const m = new Set<string>();
    sessions.forEach((s) => {
      const k = monthBasis === "webinar" ? periodMonth(s) : (s.created_at || "").slice(0, 7);
      if (k) m.add(k);
    });
    return Array.from(m).sort().reverse();
  }, [sessions, monthBasis]);

  const buyers = useMemo(() => {
    const b = new Set<string>();
    sessions.forEach((s) => s.buyers?.forEach((x) => b.add(x.name)));
    return Array.from(b).sort();
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sessions.filter((s) => {
      if (q) {
        const hay = [s.webinar_name, s.webinar_operator, s.session_slot, s.webinar_platform, s.zoom_account_used, methodLabel(s), ...(s.buyers?.map((x) => x.name) || [])]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (createdFrom && (s.created_at || "") < createdFrom) return false;
      if (createdTo && (s.created_at || "") > createdTo + "T23:59:59") return false;
      const wd = (s.webinar_date_mode === "range" ? s.webinar_start_date : s.webinar_single_date) || s.webinar_date;
      if (webFrom && (!wd || wd < webFrom)) return false;
      if (webTo && (!wd || wd > webTo)) return false;
      if (month !== "all") {
        const k = monthBasis === "webinar" ? periodMonth(s) : (s.created_at || "").slice(0, 7);
        if (k !== month) return false;
      }
      if (methodF !== "all") {
        const lbl = methodLabel(s);
        if (methodF === "manual" && lbl !== "Manual Upload") return false;
        if (methodF === "auto" && lbl !== "Automatic Attribution") return false;
      }
      if (buyer !== "all" && !s.buyers?.some((b) => b.name === buyer)) return false;
      return true;
    });
  }, [sessions, search, createdFrom, createdTo, webFrom, webTo, month, monthBasis, methodF, buyer]);

  const totals = useMemo(() => {
    let leads = 0, sales = 0, spend = 0, rev = 0;
    filtered.forEach((s) => {
      leads += Number(s.total_leads) || 0;
      sales += Number(s.total_sales) || 0;
      spend += Number(s.total_ad_spend) || 0;
      rev += Number(s.total_revenue) || 0;
    });
    return { leads, sales, spend, rev, roas: spend > 0 ? rev / spend : null, count: filtered.length };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const display = filtered.slice((page - 1) * PAGE, page * PAGE);

  const reset = () => {
    setCreatedPreset("all"); setCreatedFrom(""); setCreatedTo("");
    setWebPreset("all"); setWebFrom(""); setWebTo("");
    setMonth("all"); setMethodF("all"); setBuyer("all"); setSearch(""); setPage(1);
  };

  const confirmDelete = async (id: string) => {
    if (!confirm("Move this attribution report to Trash? It will be hidden from history and permanently deleted after 14 days unless restored.")) return;
    const target = sessions.find((s: any) => s.id === id);
    setDeletingId(id);
    try {
      const { error } = await (supabase as any)
        .from("attribution_sessions")
        .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id || null })
        .eq("id", id);
      if (error) throw error;
      toast.success("Moved to Trash. Will auto-delete in 14 days.");
      logActivity({ module_key: "reports_history", action_type: "report_soft_deleted", entity_type: "attribution_session", entity_id: id, entity_label: target?.webinar_name, metadata: { report_type: "Attribution", webinar_date: target?.webinar_date }, summary: `Attribution Report '${target?.webinar_name ?? id}' moved to trash.`, severity: "warning" });
      setOpenSession(null);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Could not delete report.");
    } finally { setDeletingId(null); }
  };

  const restoreSession = async (id: string) => {
    const target = sessions.find((s: any) => s.id === id);
    try {
      const { error } = await (supabase as any)
        .from("attribution_sessions")
        .update({ is_deleted: false, deleted_at: null, deleted_by: null })
        .eq("id", id);
      if (error) throw error;
      toast.success("Report restored.");
      logActivity({ module_key: "reports_history", action_type: "report_restored", entity_type: "attribution_session", entity_id: id, entity_label: target?.webinar_name, summary: `Attribution Report '${target?.webinar_name ?? id}' restored.` });
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Could not restore report.");
    }
  };

  const purgeOne = async (id: string) => {
    if (!confirm("Permanently delete this report now? This cannot be undone.")) return;
    try {
      await (supabase as any).from("attribution_media_buyers").delete().eq("session_id", id);
      await (supabase as any).from("attribution_sales_detail").delete().eq("session_id", id);
      await (supabase as any).from("media_buyer_attribution").delete().eq("session_id", id);
      await (supabase as any).from("roas_attribution_audit_logs").delete().eq("attribution_session_id", id);
      const { error } = await (supabase as any).from("attribution_sessions").delete().eq("id", id);
      if (error) throw error;
      toast.success("Report permanently deleted.");
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Could not permanently delete.");
    }
  };

  const exportFiltered = async (kind: "csv" | "pdf" | "sheets") => {
    if (!filtered.length) { toast.error("No reports to export."); return; }
    if (kind === "csv" || kind === "sheets") {
      const header = ["Created On", "Webinar", "Webinar Period", "Type", "Method", "Media Buyers", "Leads", "Sales", "Ad Spend", "Revenue", "ROAS"];
      const rows = filtered.map((s) => [
        s.created_at ? fmtDateTime(s.created_at) : "",
        s.webinar_name,
        webinarPeriod(s),
        s.webinar_type || "",
        methodLabel(s),
        (s.buyers || []).map((b) => b.name).join(" | "),
        s.total_leads, s.total_sales,
        Number(s.total_ad_spend), Number(s.total_revenue),
        Number(s.overall_roas).toFixed(2) + "×",
      ]);
      rows.push([
        "FILTERED TOTAL", `${filtered.length} reports`, "", "", "", "",
        totals.leads, totals.sales, totals.spend, totals.rev,
        totals.roas !== null ? totals.roas.toFixed(2) + "×" : "—",
      ]);
      const csv = [header, ...rows].map((r) => r.map((c) => {
        const v = String(c ?? "");
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `attribution-reports-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const { default: jsPDF } = await import("jspdf");
      const autoTableMod = await import("jspdf-autotable");
      const autoTable = (autoTableMod as any).default || (autoTableMod as any);
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      doc.setFontSize(16); doc.text("Attribution Reports", 40, 40);
      doc.setFontSize(9); doc.setTextColor(120);
      doc.text(`${filtered.length} reports · ${new Date().toLocaleString("en-IN")}`, 40, 58);
      doc.setTextColor(0);
      autoTable(doc, {
        startY: 75,
        head: [["Created", "Webinar", "Period", "Method", "Leads", "Sales", "Spend", "Revenue", "ROAS"]],
        body: filtered.map((s) => [
          s.created_at ? fmtDate(s.created_at) : "",
          s.webinar_name,
          webinarPeriod(s),
          methodLabel(s),
          s.total_leads, s.total_sales,
          inr(Number(s.total_ad_spend)), inr(Number(s.total_revenue)),
          Number(s.overall_roas).toFixed(2) + "×",
        ]),
        foot: [[
          "FILTERED TOTAL", `${filtered.length} reports`, "", "",
          totals.leads, totals.sales,
          inr(totals.spend), inr(totals.rev),
          totals.roas !== null ? totals.roas.toFixed(2) + "×" : "—",
        ]],
        theme: "grid", styles: { fontSize: 8 },
        headStyles: { fillColor: [247, 246, 243], textColor: 0 },
        footStyles: { fillColor: [247, 246, 243], textColor: 0, fontStyle: "bold" },
      });
      doc.save(`attribution-reports-${new Date().toISOString().slice(0,10)}.pdf`);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <div>
          <div className="step-title">Attribution Reports</div>
          <div className="step-sub">Saved media buyer attribution reports from the ROAS Calculator.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#555" }}>
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
            Show deleted
          </label>
          <SmallExportMenu onSelect={exportFiltered} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10, padding: 14, background: "#FAFAF8", border: "1px solid #E8E5DE", borderRadius: 12 }}>
        <DateRangeControl label="Created Date Range" preset={createdPreset} setPreset={(p) => { setCreatedPreset(p); setPage(1); }} from={createdFrom} to={createdTo} setFrom={(v) => { setCreatedFrom(v); setPage(1); }} setTo={(v) => { setCreatedTo(v); setPage(1); }} allLabel="All Dates" />
        <DateRangeControl label="Webinar Date Range" preset={webPreset} setPreset={(p) => { setWebPreset(p); setPage(1); }} from={webFrom} to={webTo} setFrom={(v) => { setWebFrom(v); setPage(1); }} setTo={(v) => { setWebTo(v); setPage(1); }} allLabel="All Webinar Dates" />
        <div>
          <label className="filter-lbl">Month ({monthBasis === "webinar" ? "Webinar" : "Created"})</label>
          <div style={{ display: "flex", gap: 6 }}>
            <select className="fsel" style={{ flex: 1 }} value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }}>
              <option value="all">All</option>
              {months.map((m) => <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</option>)}
            </select>
            <select className="fsel" value={monthBasis} onChange={(e) => setMonthBasis(e.target.value as any)} title="Month basis">
              <option value="webinar">Webinar</option>
              <option value="created">Created</option>
            </select>
          </div>
        </div>
        <div>
          <label className="filter-lbl">Method</label>
          <select className="fsel" value={methodF} onChange={(e) => { setMethodF(e.target.value); setPage(1); }}>
            <option value="all">All Methods</option>
            <option value="auto">Automatic Attribution</option>
            <option value="manual">Manual Upload</option>
          </select>
        </div>
        <div>
          <label className="filter-lbl">Media Buyer</label>
          <select className="fsel" value={buyer} onChange={(e) => { setBuyer(e.target.value); setPage(1); }}>
            <option value="all">All media buyers</option>
            {buyers.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="filter-lbl">Search</label>
          <input className="fi" placeholder="Webinar, buyer, operator…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
          <button className="btn btn-g btn-sm" onClick={reset}>Reset Filters</button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, fontSize: 11.5, color: "#666" }}>
        <div>Showing <strong style={{ color: "#0a0a0a" }}>{filtered.length}</strong> of <strong style={{ color: "#0a0a0a" }}>{sessions.length}</strong> attribution reports</div>
      </div>

      {loading ? (
        <div style={{ color: "#888", fontSize: 13, padding: 40, textAlign: "center" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#888", border: "1px solid #E8E5DE", borderRadius: 12, background: "#FAFAF8" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: "#0a0a0a", marginBottom: 8 }}>No attribution reports found for selected filters</div>
          <div style={{ fontSize: 13, marginBottom: 14 }}>Try changing the created date range, webinar date range, media buyer, method, or search keyword.</div>
          <button className="btn btn-g btn-sm" onClick={reset}>Reset Filters</button>
        </div>
      ) : (
        <table className="attr-table">
          <thead>
            <tr>
              <th>Created On</th><th>Webinar</th><th>Webinar Date / Period</th><th>Type</th><th>Method</th>
              <th>Media Buyers</th><th>Leads</th><th>Sales</th><th>Ad Spend</th><th>Revenue</th><th>ROAS</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {display.map((s) => {
              const roasN = Number(s.overall_roas);
              return (
                <tr key={s.id} onClick={() => setOpenSession(s)} style={s.is_deleted ? { opacity: 0.55 } : undefined}>
                  <td style={{ fontSize: 11.5, color: "#555" }}>{s.created_at ? fmtDateTime(s.created_at) : "—"}</td>
                  <td>
                    <div className="mb-name-cell">
                      {s.webinar_name}
                      {s.is_deleted && (() => {
                        const days = daysRemaining((s as any).deleted_at);
                        return <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", textTransform: "uppercase", letterSpacing: ".08em" }} title={`Auto-deletes in ${days} day(s)`}>deleted · {days}d left</span>;
                      })()}
                    </div>
                    {(s.session_slot || s.webinar_format) && <div className="mb-sub2">{[s.session_slot, s.webinar_format].filter(Boolean).join(" · ")}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>{webinarPeriod(s)}</td>
                  <td style={{ fontSize: 11, color: "#555" }}>{s.webinar_type ? s.webinar_type.replace("-", " ") : "—"}</td>
                  <td style={{ fontSize: 11 }}>
                    {(() => {
                      const lbl = methodLabel(s);
                      if (lbl === "—") return <span style={{ color: "#888" }}>—</span>;
                      const isAuto = lbl === "Automatic Attribution";
                      return <span style={{ background: isAuto ? "#FBF6E9" : "#F7F6F3", color: isAuto ? "#7A5E10" : "#555", padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 500 }}>{lbl}</span>;
                    })()}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ display: "flex" }}>
                        {(s.buyers || []).slice(0, 4).map((b, i) => (
                          <div key={i} className="spend-av" title={b.name}>{initials(b.name)}</div>
                        ))}
                      </div>
                      <span style={{ fontSize: 11, color: "#888" }}>{s.buyers?.length || 0}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16 }}>{s.total_leads}</td>
                  <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: "#16A34A" }}>{s.total_sales}</td>
                  <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>{inr(Number(s.total_ad_spend))}</td>
                  <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: "#16A34A" }}>{inr(Number(s.total_revenue))}</td>
                  <td><span className={"roas-val " + roasClass(roasN)}>{roasN.toFixed(2)}×</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {s.is_deleted ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-g btn-sm" onClick={() => restoreSession(s.id)}>↺ Restore</button>
                        <button className="btn btn-g btn-sm" style={{ color: "#DC2626" }} onClick={() => purgeOne(s.id)}>🗑 Forever</button>
                      </div>
                    ) : (
                      <AttrRowActions
                        onView={() => setOpenSession(s)}
                        onEdit={() => setEditing(s)}
                        onExport={async (kind) => {
                          const p = await loadPayload(s);
                          if (!p) return;
                          if (kind === "pdf") downloadPDF(p);
                          else downloadCSV(p);
                          logActivity({ module_key: "reports_history", action_type: "report_exported", entity_type: "attribution_session", entity_id: s.id, entity_label: s.webinar_name, metadata: { format: kind, report_type: "Attribution" }, summary: `Attribution Report '${s.webinar_name}' exported as ${kind.toUpperCase()}.` });
                        }}
                        onDelete={() => confirmDelete(s.id)}
                        disabled={!!s.is_deleted}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 14 }}>
          <button className="btn btn-g btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</button>
          <span style={{ fontSize: 12, color: "#888", alignSelf: "center" }}>Page {page} of {totalPages}</span>
          <button className="btn btn-g btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      <ReportDrawer
        session={openSession}
        onClose={() => setOpenSession(null)}
        onEdit={() => { if (openSession) { setEditing(openSession); setOpenSession(null); } }}
        onDelete={() => { if (openSession) confirmDelete(openSession.id); }}
      />

      {editing && (
        <EditAttributionDrawer
          session={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </>
  );
}

function AttrRowActions({
  onView, onEdit, onExport, onDelete, disabled,
}: { onView: () => void; onEdit: () => void; onExport: (k: "csv" | "pdf") => void; onDelete: () => void; disabled: boolean; }) {
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setExportOpen(false); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "flex", gap: 4 }}>
      <button className="btn btn-g btn-sm" title="View" onClick={onView}>👁 View</button>
      <button className="btn btn-g btn-sm" onClick={() => setOpen((o) => !o)} disabled={disabled}>⋯</button>
      {open && (
        <div className="menu-pop">
          <button className="menu-item" onClick={() => { setOpen(false); onEdit(); }}>✏️ Edit Report</button>
          <button className="menu-item" onClick={() => setExportOpen((o) => !o)}>📤 Export ▸</button>
          {exportOpen && (
            <div style={{ paddingLeft: 8, borderLeft: "2px solid #E8E5DE", margin: "0 8px" }}>
              <button className="menu-item" onClick={() => { setOpen(false); onExport("pdf"); }}>📄 Export PDF</button>
              <button className="menu-item" onClick={() => { setOpen(false); onExport("csv"); }}>📁 Export CSV</button>
              <button className="menu-item" onClick={() => { setOpen(false); onExport("csv"); }}>📗 Sheets-Ready CSV</button>
            </div>
          )}
          <button className="menu-item danger" onClick={() => { setOpen(false); onDelete(); }}>🗑 Delete Report</button>
        </div>
      )}
    </div>
  );
}

function SmallExportMenu({ onSelect }: { onSelect: (k: "csv" | "pdf" | "sheets") => void }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn btn-g btn-sm" onClick={() => setOpen((o) => !o)}>📤 Export Reports ▾</button>
      {open && (
        <div className="menu-pop">
          <button className="menu-item" onClick={() => { setOpen(false); onSelect("csv"); }}>📁 Filtered CSV</button>
          <button className="menu-item" onClick={() => { setOpen(false); onSelect("pdf"); }}>📄 Filtered PDF Summary</button>
          <button className="menu-item" onClick={() => { setOpen(false); onSelect("sheets"); }}>📗 Google Sheets Ready CSV</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   EDIT ATTRIBUTION (METADATA)
   ============================================================ */
function EditAttributionDrawer({ session, onClose, onSaved }: { session: SessionRow; onClose: () => void; onSaved: () => void; }) {
  const [name, setName] = useState(session.webinar_name || "");
  const [type, setType] = useState(session.webinar_type || "");
  const [date, setDate] = useState(session.webinar_date || "");
  const [format, setFormat] = useState(session.webinar_format || "");
  const [operator, setOperator] = useState(session.webinar_operator || "");
  const [slot, setSlot] = useState(session.session_slot || "");
  const [notes, setNotes] = useState(session.webinar_notes || "");
  const [saving, setSaving] = useState(false);

  const sx = session as any;
  const hasSnapshot = !!(sx.calculation_id || sx.input_snapshot_hash);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("attribution_sessions")
        .update({
          webinar_name: name, webinar_type: type || null, webinar_date: date || null,
          webinar_format: format || null, webinar_operator: operator || null,
          session_slot: slot || null, webinar_notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
      if (error) throw error;
      toast.success("Report updated.");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Could not save.");
    } finally { setSaving(false); }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="!max-w-[560px] sm:!max-w-[560px] w-full overflow-y-auto p-0">
        <div className="rcv2" style={{ padding: 28 }}>
          <style>{styles}</style>
          <div className="step-title">Edit Attribution Report</div>
          <div className="step-sub" style={{ marginBottom: 18 }}>Update report metadata. Calculation values are not editable here.</div>

          <div style={{ display: "grid", gap: 12 }}>
            <Field lbl="Webinar Name"><input className="fi" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field lbl="Webinar Type"><input className="fi" value={type} onChange={(e) => setType(e.target.value)} placeholder="paid / free / mixed" /></Field>
            <Field lbl="Webinar Date"><input className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field lbl="Webinar Format"><input className="fi" value={format} onChange={(e) => setFormat(e.target.value)} /></Field>
            <Field lbl="Webinar Operator"><input className="fi" value={operator} onChange={(e) => setOperator(e.target.value)} /></Field>
            <Field lbl="Session Slot"><input className="fi" value={slot} onChange={(e) => setSlot(e.target.value)} /></Field>
            <Field lbl="Notes">
              <textarea className="fi" style={{ height: 90, padding: 10, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          {!hasSnapshot && (
            <div style={{ marginTop: 14, padding: 12, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, fontSize: 11.5, color: "#7A5E10" }}>
              This report can only be edited for metadata because original calculation inputs are not available.
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
            <button className="btn btn-g" onClick={onClose}>Cancel</button>
            <button className="btn btn-k" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ lbl, children }: { lbl: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="filter-lbl">{lbl}</label>
      {children}
    </div>
  );
}

/* ============================================================
   OVERVIEW SECTION
   ============================================================ */
function OverviewSection({ sessions, dailyStats }: { sessions: SessionRow[]; dailyStats: { count: number; spend: number; leadsTotal: number; avgCpl: number | null } }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<"all" | "attribution" | "daily">("all");
  const [dailyRows, setDailyRows] = useState<{ report_date: string; total_ad_spend: number; total_leads: number; overall_cpl: number | null }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("daily_lead_reports")
        .select("report_date,total_ad_spend,total_leads,overall_cpl")
        .eq("is_deleted", false)
        .order("report_date", { ascending: true });
      setDailyRows(data || []);
    })();
  }, []);

  const inRange = (d?: string | null) => {
    if (!d) return true;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const filteredAttr = sessions.filter((s) => inRange((s.created_at || "").slice(0, 10)));
  const filteredDaily = dailyRows.filter((r) => inRange(r.report_date));

  const totalRev = filteredAttr.reduce((a, s) => a + Number(s.total_revenue || 0), 0);
  const totalSpendDaily = filteredDaily.reduce((a, r) => a + Number(r.total_ad_spend || 0), 0);
  const avgRoas = filteredAttr.length ? filteredAttr.reduce((a, s) => a + Number(s.overall_roas || 0), 0) / filteredAttr.length : 0;
  const cpls = filteredDaily.map((r) => r.overall_cpl).filter((x) => x != null).map(Number);
  const avgCpl = cpls.length ? cpls.reduce((a, b) => a + b, 0) / cpls.length : null;

  const roasTrend = filteredAttr
    .slice()
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
    .map((s) => ({
      date: s.created_at ? fmtDate(s.created_at) : "",
      roas: Number(s.overall_roas || 0),
    }));

  const cplTrend = filteredDaily.map((r) => ({
    date: fmtDate(r.report_date),
    cpl: r.overall_cpl == null ? 0 : Number(r.overall_cpl),
  }));

  const spendLeads = filteredDaily.map((r) => ({
    date: fmtDate(r.report_date),
    spend: Number(r.total_ad_spend || 0),
    leads: Number(r.total_leads || 0),
  }));

  const volume = [
    { name: "Attribution", count: filteredAttr.length },
    { name: "Daily Lead", count: filteredDaily.length },
  ];

  const showAttr = type !== "daily";
  const showDaily = type !== "attribution";

  const exportSummary = (kind: "csv" | "pdf") => {
    const summary = [
      ["Metric", "Value"],
      ["Attribution Reports", filteredAttr.length],
      ["Daily Lead Reports", filteredDaily.length],
      ["Total Attribution Revenue", totalRev],
      ["Total Daily Ad Spend", totalSpendDaily],
      ["Average ROAS", avgRoas.toFixed(2)],
      ["Average CPL", avgCpl == null ? "—" : avgCpl.toFixed(2)],
    ];
    if (kind === "csv") {
      const csv = summary.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `reports-overview-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } else {
      import("jspdf").then(async ({ default: jsPDF }) => {
        const autoTableMod = await import("jspdf-autotable");
        const autoTable = (autoTableMod as any).default || (autoTableMod as any);
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        doc.setFontSize(18); doc.text("Reports Overview", 40, 50);
        doc.setFontSize(10); doc.setTextColor(120);
        doc.text(`Generated ${new Date().toLocaleString("en-IN")}`, 40, 70);
        doc.setTextColor(0);
        autoTable(doc, {
          startY: 90,
          head: [summary[0]],
          body: summary.slice(1),
          theme: "grid", styles: { fontSize: 10 },
          headStyles: { fillColor: [247, 246, 243], textColor: 0 },
        });
        doc.save(`reports-overview-${new Date().toISOString().slice(0,10)}.pdf`);
      });
    }
  };

  const empty = filteredAttr.length === 0 && filteredDaily.length === 0;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <div>
          <div className="step-title">Reports Overview</div>
          <div className="step-sub">High-level summary of attribution and daily lead reports.</div>
        </div>
        <SmallExportMenu onSelect={(k) => exportSummary(k === "pdf" ? "pdf" : "csv")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 18, padding: 14, background: "#FAFAF8", border: "1px solid #E8E5DE", borderRadius: 12 }}>
        <div><label className="filter-lbl">From</label><input className="fi" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="filter-lbl">To</label><input className="fi" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <label className="filter-lbl">Report Type</label>
          <select className="fsel" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="all">All</option>
            <option value="attribution">Attribution</option>
            <option value="daily">Daily Lead</option>
          </select>
        </div>
      </div>

      <div className="sum-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <div className="sum-card plain"><div className="sum-lbl">Attribution Reports</div><div className="sum-val">{filteredAttr.length}</div></div>
        <div className="sum-card plain"><div className="sum-lbl">Daily Lead Reports</div><div className="sum-val">{filteredDaily.length}</div></div>
        <div className="sum-card grn"><div className="sum-lbl">Attribution Revenue</div><div className="sum-val">{inr(totalRev)}</div></div>
        <div className="sum-card plain"><div className="sum-lbl">Daily Ad Spend</div><div className="sum-val">{inr(totalSpendDaily)}</div></div>
        <div className="sum-card gold"><div className="sum-lbl">Avg ROAS</div><div className="sum-val">{avgRoas.toFixed(2)}×</div></div>
        <div className="sum-card gold"><div className="sum-lbl">Avg CPL</div><div className="sum-val">{avgCpl == null ? "—" : inr(avgCpl)}</div></div>
      </div>

      {empty ? (
        <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: "#0a0a0a", marginBottom: 8 }}>Not enough report data yet</div>
          <div style={{ fontSize: 13 }}>Charts will appear once attribution or daily lead reports are saved.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {showAttr && roasTrend.length > 0 && (
            <ChartCard title="Attribution ROAS Trend">
              <LineChart data={roasTrend}>
                <CartesianGrid stroke="#F0EDE8" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RTooltip />
                <Line type="monotone" dataKey="roas" stroke="#C8A84B" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartCard>
          )}
          {showDaily && cplTrend.length > 0 && (
            <ChartCard title="Daily CPL Trend">
              <LineChart data={cplTrend}>
                <CartesianGrid stroke="#F0EDE8" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RTooltip />
                <Line type="monotone" dataKey="cpl" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartCard>
          )}
          {showDaily && spendLeads.length > 0 && (
            <ChartCard title="Daily Spend vs Leads">
              <BarChart data={spendLeads}>
                <CartesianGrid stroke="#F0EDE8" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} />
                <RTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="spend" fill="#C8A84B" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="r" dataKey="leads" fill="#16A34A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          )}
          <ChartCard title="Report Volume by Type">
            <BarChart data={volume}>
              <CartesianGrid stroke="#F0EDE8" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {volume.map((d, i) => <Cell key={i} fill={i === 0 ? "#0a0a0a" : "#C8A84B"} />)}
              </Bar>
            </BarChart>
          </ChartCard>
        </div>
      )}
    </>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 18, background: "#fff" }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "#888", marginBottom: 12 }}>{title}</div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================================================
   ATTRIBUTION REPORT DRAWER
   ============================================================ */
async function loadPayload(s: SessionRow): Promise<AttributionPayload | null> {
  const [{ data: bs }, { data: sd }] = await Promise.all([
    supabase.from("attribution_media_buyers").select("*").eq("session_id", s.id),
    supabase.from("attribution_sales_detail").select("*").eq("session_id", s.id),
  ]);
  const sx = s as any;
  return {
    webinarName: s.webinar_name,
    webinarDate: s.webinar_date || "",
    webinarType: s.webinar_type || "",
    totals: {
      spend: Number(s.total_ad_spend), revenue: Number(s.total_revenue),
      sales: s.total_sales, leads: s.total_leads,
    },
    rows: (bs || []).map((b: any) => ({
      name: b.media_buyer_name, spend: Number(b.ad_spend),
      leads: b.total_leads, matched: b.matched_sales, revenue: Number(b.revenue),
    })),
    salesDetail: (sd || []).map((x: any) => ({
      name: x.buyer_name || "", email: x.email || "", phone: x.phone || "",
      attributedTo: x.attributed_to, matchMethod: (x.match_method as SaleDetail["matchMethod"]) || "unmatched",
      revenue: Number(x.revenue), webinarDate: x.webinar_date || s.webinar_date || "",
    })),
    meta: {
      createdOn: s.created_at ? fmtDateTime(s.created_at) : "",
      calculationMethod: methodLabel(s),
      webinarPeriod: webinarPeriod(s),
      webinarFormat: s.webinar_format || "",
      webinarOperator: s.webinar_operator || "",
      sessionSlot: s.session_slot || "",
      webinarPlatform: s.webinar_platform || "",
      zoomAccount: s.zoom_account_used || "",
      adSpendSource: (s.calculation_method || "").toLowerCase().includes("auto") ? "Master Sheet" : "Manual Entry",
      calculationId: sx.calculation_id || "",
      inputSnapshotHash: sx.input_snapshot_hash || "",
      outputHash: sx.output_hash || "",
      engineVersion: sx.attribution_engine_version || "",
    },
  };
}

function ReportDrawer({ session, onClose, onEdit, onDelete }: { session: SessionRow | null; onClose: () => void; onEdit: () => void; onDelete: () => void; }) {
  const [payload, setPayload] = useState<AttributionPayload | null>(null);
  const [auditData, setAuditData] = useState<{
    result: AttributionResult;
    mediaBuyerOrder: Array<{ id: string; displayName: string; leads: number; source: string }>;
    columnMappingsUsed: Array<{ source: string; tabName: string; mapping: any }>;
  } | null>(null);

  useEffect(() => {
    if (!session) { setPayload(null); setAuditData(null); return; }
    (async () => {
      const p = await loadPayload(session);
      setPayload(p);
      const sx = session as any;
      const calcId = sx.calculation_id;
      if (!calcId) { setAuditData(null); return; }
      const [{ data: log }, { data: sd }, { data: bs }] = await Promise.all([
        supabase.from("roas_attribution_audit_logs").select("*").eq("calculation_id", calcId).maybeSingle(),
        supabase.from("attribution_sales_detail").select("*").eq("session_id", session.id),
        supabase.from("attribution_media_buyers").select("*").eq("session_id", session.id),
      ]);
      if (!log) { setAuditData(null); return; }
      const auditRows: any[] = Array.isArray((log as any).audit_rows) ? (log as any).audit_rows : [];
      const audits = auditRows.length ? auditRows : (sd || []).map((x: any, i: number) => ({
        saleId: x.sale_id || `sale-${i}`,
        buyerName: x.buyer_name || "",
        buyerEmail: x.email || "",
        buyerPhone: x.phone || "",
        attributedTo: x.attributed_to || null,
        attributedToMediaBuyerId: null,
        matchMethod: x.match_method || "unmatched",
        matchedLeadId: x.matched_lead_id || null,
        matchedLeadName: x.matched_lead_name || null,
        matchedLeadEmail: x.matched_lead_email || null,
        matchedLeadPhone: x.matched_lead_phone || null,
        sourceMediaBuyer: x.source_media_buyer || null,
        sourceRowIndex: x.source_row_index ?? null,
        competingMatches: Array.isArray(x.competing_matches) ? x.competing_matches : [],
        confidenceScore: Number(x.confidence_score || 0),
        matchReason: x.match_reason || "",
        needsReview: !!x.needs_review,
        revenue: Number(x.revenue || 0),
        webinarDate: x.webinar_date || "",
      }));
      const mediaBuyerBreakdown = (bs || []).map((b: any) => ({
        mediaBuyerId: b.id,
        mediaBuyerName: b.media_buyer_name,
        leads: b.total_leads,
        salesAttributed: b.matched_sales,
        revenue: Number(b.revenue),
        adSpend: Number(b.ad_spend),
        cpl: Number(b.cpl),
        conversionRate: Number(b.conversion_rate),
        roas: Number(b.roas_value),
      }));
      const result: AttributionResult = {
        calculationId: calcId,
        inputSnapshotHash: sx.input_snapshot_hash || "",
        outputHash: sx.output_hash || "",
        engineVersion: sx.attribution_engine_version || "deterministic_v1",
        calculatedAt: session.created_at,
        hashes: { leadRowsHash: "", salesRowsHash: "", mediaBuyerOrderHash: "", columnMappingHash: "" },
        summary: {
          totalLeads: session.total_leads,
          totalSales: session.total_sales,
          totalMatchedSales: audits.filter((a) => a.matchMethod !== "unmatched").length,
          totalUnmatchedSales: audits.filter((a) => a.matchMethod === "unmatched").length,
          totalRevenue: Number(session.total_revenue),
          totalAdSpend: Number(session.total_ad_spend),
          overallRoas: Number(session.overall_roas),
        },
        mediaBuyerBreakdown,
        salesAttribution: audits,
        unmatchedSales: audits.filter((a) => a.matchMethod === "unmatched"),
        duplicateLeadConflicts: Array.isArray((log as any).duplicate_conflicts) ? (log as any).duplicate_conflicts : [],
        auditLog: audits,
      };
      const orderArr: any[] = Array.isArray((log as any).media_buyer_order) ? (log as any).media_buyer_order : [];
      const mediaBuyerOrder = orderArr.length
        ? orderArr.map((o: any, i: number) => ({
            id: o.id || o.mediaBuyerId || String(i),
            displayName: o.displayName || o.name || o.mediaBuyerName || "—",
            leads: Number(o.leads || 0),
            source: o.source || "",
          }))
        : mediaBuyerBreakdown.map((m) => ({ id: m.mediaBuyerId, displayName: m.mediaBuyerName, leads: m.leads, source: "saved" }));
      const cmuArr: any[] = Array.isArray((log as any).column_mappings_used) ? (log as any).column_mappings_used : [];
      setAuditData({ result, mediaBuyerOrder, columnMappingsUsed: cmuArr });
    })();
  }, [session]);

  const opt = (label: string, val?: string | null) => val ? (
    <div><div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div><div style={{ fontSize: 12.5 }}>{val}</div></div>
  ) : null;

  return (
    <Sheet open={!!session} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="!max-w-[760px] sm:!max-w-[760px] w-full overflow-y-auto p-0">
        <div className="rcv2" style={{ padding: 28 }}>
          <style>{styles}</style>
          {!payload || !session ? (
            <div style={{ color: "#888", fontSize: 13, padding: 40, textAlign: "center" }}>Loading…</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 12 }}>
                <button className="btn btn-g btn-sm" onClick={onEdit}>✏️ Edit</button>
                <button className="btn btn-g btn-sm" onClick={async () => { downloadPDF(payload); }}>📄 PDF</button>
                <button className="btn btn-g btn-sm" onClick={() => downloadCSV(payload)}>📁 CSV</button>
                <button className="btn btn-g btn-sm" style={{ color: "#DC2626" }} onClick={onDelete}>🗑 Delete</button>
              </div>
              <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 14, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                {opt("Created On", session.created_at ? fmtDateTime(session.created_at) : null)}
                {opt("Calculation Method", methodLabel(session))}
                {opt("Webinar Name", session.webinar_name)}
                {opt("Webinar Type", session.webinar_type ? session.webinar_type.replace("-", " ") : null)}
                {opt("Webinar Date / Period", webinarPeriod(session))}
                {opt("Webinar Format", session.webinar_format)}
                {opt("Webinar Operator", session.webinar_operator)}
                {opt("Session Slot", session.session_slot)}
                {opt("Platform", session.webinar_platform)}
                {opt("Zoom Account", session.zoom_account_used)}
                {opt("Notes", session.webinar_notes)}
                {opt("Ad Spend Source", (session.calculation_method || "").toLowerCase().includes("auto") ? "Master Sheet" : "Manual Entry")}
              </div>
              <AttributionResultsView
                payload={payload}
                allowSave={false}
                sessionId={session.id}
                sessionMeta={{
                  webinar_name: session.webinar_name,
                  webinar_date: session.webinar_date,
                  webinar_type: session.webinar_type,
                  webinar_operator: session.webinar_operator,
                }}
              />
              {auditData && (
                <AttributionAuditPanel
                  result={auditData.result}
                  mediaBuyerOrder={auditData.mediaBuyerOrder}
                  columnMappingsUsed={auditData.columnMappingsUsed}
                />
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ============================================================
   PROFIT STATEMENTS SECTION
   ============================================================ */
function ProfitStatementsSection({
  rows, showDeleted, setShowDeleted, reload, navigate,
}: { rows: ProfitStatementRow[]; showDeleted: boolean; setShowDeleted: (b: boolean) => void; reload: () => void; navigate: (p: string) => void; }) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<"all" | "draft" | "posted">("all");
  const [unit, setUnit] = useState("all");

  const units = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.business_unit && s.add(r.business_unit));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (statusF !== "all" && r.status !== statusF) return false;
      if (unit !== "all" && r.business_unit !== unit) return false;
      if (q) {
        const hay = [r.business_unit, r.statement_month, r.status].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusF, unit]);

  const trash = async (id: string) => {
    if (!confirm("Move this Profit Statement to Trash? It will auto-delete in 14 days.")) return;
    setBusyId(id);
    try {
      const { error } = await (supabase as any)
        .from("profit_statements")
        .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id || null })
        .eq("id", id);
      if (error) throw error;
      toast.success("Moved to Trash.");
      const target = rows.find(r => r.id === id);
      logActivity({ module_key: "reports_history", action_type: "report_soft_deleted", entity_type: "profit_statement", entity_id: id, entity_label: `${target?.business_unit ?? ""} ${target?.statement_month?.slice(0,7) ?? ""}`.trim(), metadata: { report_type: "Profit Statement" }, summary: `Profit Statement '${target?.business_unit ?? ""} ${target?.statement_month?.slice(0,7) ?? id}' moved to trash.`, severity: "warning" });
      reload();
    } catch (e: any) { toast.error(e?.message || "Could not delete."); }
    finally { setBusyId(null); }
  };

  const restore = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await (supabase as any)
        .from("profit_statements")
        .update({ is_deleted: false, deleted_at: null, deleted_by: null })
        .eq("id", id);
      if (error) throw error;
      toast.success("Restored.");
      const target = rows.find(r => r.id === id);
      logActivity({ module_key: "reports_history", action_type: "report_restored", entity_type: "profit_statement", entity_id: id, entity_label: `${target?.business_unit ?? ""} ${target?.statement_month?.slice(0,7) ?? ""}`.trim(), summary: `Profit Statement restored.` });
      reload();
    } catch (e: any) { toast.error(e?.message || "Could not restore."); }
    finally { setBusyId(null); }
  };

  const exportCsv = async (s: ProfitStatementRow) => {
    const { data: lines } = await (supabase as any)
      .from("profit_statement_lines")
      .select("bucket, category, label, amount, source_type, notes")
      .eq("profit_statement_id", s.id);
    const header = ["Bucket", "Category", "Label", "Amount (INR)", "Source", "Notes"];
    const rs = (lines ?? []).map((l: any) => [l.bucket, l.category ?? "", l.label ?? "", Number(l.amount ?? 0), l.source_type ?? "", (l.notes ?? "").replace(/\n/g, " ")]);
    const summary = [
      ["", "", "", "", "", ""],
      ["Summary", "", "", "", "", ""],
      ["Revenue", "", "", Number(s.total_revenue ?? 0), "", ""],
      ["COGS", "", "", Number(s.total_cogs ?? 0), "", ""],
      ["Gross Profit", "", "", Number(s.gross_profit ?? 0), "", ""],
      ["Operating Expense", "", "", Number(s.total_operating_expense ?? 0), "", ""],
      ["Fixed Expense", "", "", Number(s.total_fixed_expense ?? 0), "", ""],
      ["Variable Expense", "", "", Number(s.total_variable_expense ?? 0), "", ""],
      ["One-Time Expense", "", "", Number(s.total_one_time_expense ?? 0), "", ""],
      ["Payroll", "", "", Number(s.total_payroll ?? 0), "", ""],
      ["Incentives", "", "", Number(s.total_incentives ?? 0), "", ""],
      ["Net Profit", "", "", Number(s.net_profit ?? 0), "", ""],
      ["Net Margin %", "", "", Number(s.net_margin ?? 0), "", ""],
    ];
    const csv = [header, ...rs, ...summary].map((r) => r.map((c) => {
      const v = String(c ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `profit-statement-${s.business_unit}-${s.statement_month?.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logActivity({ module_key: "reports_history", action_type: "report_exported", entity_type: "profit_statement", entity_id: s.id, entity_label: `${s.business_unit} ${s.statement_month?.slice(0,7)}`, metadata: { format: "csv", report_type: "Profit Statement" }, summary: `Profit Statement '${s.business_unit} ${s.statement_month?.slice(0,7)}' exported as CSV.` });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label className="filter-lbl">Search</label>
          <input className="fi fi-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Month, business unit, status…" />
        </div>
        <div>
          <label className="filter-lbl">Business Unit</label>
          <select className="fsel fsel-sm" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="all">All</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="filter-lbl">Status</label>
          <select className="fsel fsel-sm" value={statusF} onChange={(e) => setStatusF(e.target.value as any)}>
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
          </select>
        </div>
        <button className="btn btn-g btn-sm" onClick={() => setShowDeleted(!showDeleted)}>
          {showDeleted ? "Hide deleted" : "Show deleted"}
        </button>
        <button className="btn btn-k btn-sm" onClick={() => navigate("/profit-statement")}>+ New Statement</button>
      </div>

      <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <table className="attr-table">
          <thead>
            <tr>
              <th>Month</th><th>Business Unit</th><th>Revenue</th><th>Gross Profit</th><th>Payroll</th><th>Net Profit</th><th>Margin</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 24, color: "#888" }}>No profit statements yet.</td></tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id}>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>{s.statement_month?.slice(0, 7)}</td>
                <td>{s.business_unit}</td>
                <td>{inr(Number(s.total_revenue))}</td>
                <td>{inr(Number(s.gross_profit))}</td>
                <td>{inr(Number(s.total_payroll))}</td>
                <td style={{ fontWeight: 500 }}>{inr(Number(s.net_profit))}</td>
                <td>{Number(s.net_margin).toFixed(1)}%</td>
                <td>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 11,
                    background: s.status === "posted" ? "#F0FDF4" : "#F7F6F3",
                    color: s.status === "posted" ? "#16A34A" : "#888",
                    border: s.status === "posted" ? "1px solid #BBF7D0" : "1px solid #E8E5DE",
                  }}>{s.status}</span>
                  {s.is_deleted && <span style={{ marginLeft: 6, fontSize: 10, color: "#DC2626" }}>· Trash {daysRemaining(s.deleted_at)}d</span>}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-g btn-sm" onClick={() => exportCsv(s)} style={{ marginRight: 6 }}>Export CSV</button>
                  <button className="btn btn-g btn-sm" onClick={() => navigate(`/profit-statement`)} style={{ marginRight: 6 }}>Open</button>
                  {s.is_deleted
                    ? <button className="btn btn-g btn-sm" disabled={busyId === s.id} onClick={() => restore(s.id)}>Restore</button>
                    : <button className="btn btn-g btn-sm" disabled={busyId === s.id} onClick={() => trash(s.id)} style={{ color: "#DC2626" }}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
