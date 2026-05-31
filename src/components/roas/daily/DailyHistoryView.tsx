import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  buildHistoryCsv, buildHistoryTSV, copyToClipboard, downloadFile,
  fmtDateLong, fmtNum, inr, type DailyReport,
} from "@/lib/dailyReports/helpers";
import DailyReportDrawer from "./DailyReportDrawer";
import { loadFullReport, runExportAction, softDeleteReport, restoreReport, permanentlyDeleteReport, daysRemaining } from "./sharedActions";
import ExportMenu from "./ExportMenu";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import { normalizeMediaBuyerNameSync, getCanonicalMediaBuyers, getMediaBuyerAliasMap, subscribeMediaBuyers } from "@/lib/mediaBuyers";
import { calculateBuyerMetrics, resolveReportForBuyer, type ReportLike } from "@/lib/dailyReports/buyerMetrics";


type DatePreset = "all" | "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";

function computePreset(preset: DatePreset): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();
  if (preset === "today") { const s = iso(today); return { from: s, to: s }; }
  if (preset === "yesterday") {
    const y = new Date(today); y.setDate(today.getDate() - 1);
    const s = iso(y); return { from: s, to: s };
  }
  if (preset === "last7") {
    const f = new Date(today); f.setDate(today.getDate() - 6);
    return { from: iso(f), to: iso(today) };
  }
  if (preset === "thisMonth") {
    const f = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(f), to: iso(today) };
  }
  if (preset === "lastMonth") {
    const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const t = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: iso(f), to: iso(t) };
  }
  return { from: "", to: "" };
}

type RowExt = {
  id: string; created_at: string; report_date: string; report_name: string;
  total_ad_spend: number; total_leads: number; overall_cpl: number | null;
  metric_template_id: string | null; report_status: string | null;
  notes?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  _media_buyers?: { name: string; spend: number; leads: number }[];
  _ad_accounts?: string[];
  _template_name?: string | null;
};

interface Props {
  onNew: () => void;
  onEditReport: (report: DailyReport) => void;
  onShowAnalytics: () => void;
  onCompareMediaBuyers?: (ctx: { from: string; to: string; preset: DatePreset }) => void;
}

type FilterState = {
  search: string;
  datePreset: DatePreset;
  from: string;
  to: string;
  buyerFilter: string;
  accountFilter: string;
  templateFilter: string;
};

const EMPTY_FILTERS: FilterState = {
  search: "", datePreset: "all", from: "", to: "",
  buyerFilter: "", accountFilter: "", templateFilter: "",
};

export default function DailyHistoryView({ onNew, onEditReport, onShowAnalytics, onCompareMediaBuyers }: Props) {
  const [rows, setRows] = useState<RowExt[]>([]);
  const [loading, setLoading] = useState(true);

  // Draft = what user is editing. Applied = what drives table/cards/charts/export.
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);
  const setDraftPart = (p: Partial<FilterState>) => setDraft((d) => ({ ...d, ...p }));
  const appliedPreset = applied.datePreset;

  const [viewing, setViewing] = useState<DailyReport | null>(null);
  const [viewingStatus, setViewingStatus] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showCharts, setShowCharts] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [includeUnallocated, setIncludeUnallocated] = useState(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(applied), [draft, applied]);

  const reload = async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("daily_lead_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(500);
    q = showDeleted ? q.eq("is_deleted", true) : q.eq("is_deleted", false);
    const { data: reports } = await q;
    const reportIds = (reports || []).map((r: any) => r.id);
    let mbsByReport: Record<string, any[]> = {};
    if (reportIds.length) {
      const { data: mbs } = await (supabase as any)
        .from("daily_lead_report_media_buyers")
        .select("id, report_id, media_buyer_name, total_ad_spend, total_leads")
        .in("report_id", reportIds);
      for (const m of (mbs || [])) {
        (mbsByReport[m.report_id] ||= []).push(m);
      }
      const mbIds = (mbs || []).map((m: any) => m.id);
      let aaByMb: Record<string, string[]> = {};
      if (mbIds.length) {
        const { data: aas } = await (supabase as any)
          .from("daily_lead_report_ad_accounts")
          .select("report_media_buyer_id, ad_account_name")
          .in("report_media_buyer_id", mbIds);
        for (const a of (aas || [])) {
          (aaByMb[a.report_media_buyer_id] ||= []).push(a.ad_account_name);
        }
      }
      for (const r of reports || []) {
        const mbs = mbsByReport[r.id] || [];
        (r as any)._media_buyers = mbs.map((m) => ({
          name: m.media_buyer_name, spend: Number(m.total_ad_spend), leads: Number(m.total_leads),
        }));
        (r as any)._ad_accounts = mbs.flatMap((m) => aaByMb[m.id] || []);
      }
    }
    const tplIds = Array.from(new Set((reports || []).map((r: any) => r.metric_template_id).filter(Boolean)));
    if (tplIds.length) {
      const { data: tpls } = await (supabase as any)
        .from("daily_metric_templates").select("id, template_name").in("id", tplIds);
      const tplMap = new Map((tpls || []).map((t: any) => [t.id, t.template_name]));
      for (const r of reports || []) (r as any)._template_name = tplMap.get(r.metric_template_id) || null;
    }
    setRows(reports || []);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      try { await (supabase as any).rpc("purge_old_deleted_reports"); } catch {}
      await Promise.all([getCanonicalMediaBuyers(), getMediaBuyerAliasMap()]).catch(() => {});
      reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeleted]);

  const [, setMbTick] = useState(0);
  useEffect(() => {
    const off = subscribeMediaBuyers(() => setMbTick((t) => t + 1));
    return () => { off; };
  }, []);

  const allBuyers = useMemo(() => {
    const s = new Map<string, string>();
    rows.forEach((r) => (r._media_buyers || []).forEach((m) => {
      const canonical = normalizeMediaBuyerNameSync(m.name) || m.name;
      s.set(canonical.toLowerCase(), canonical);
    }));
    return Array.from(s.values()).sort();
  }, [rows]);

  const allAccounts = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => (r._ad_accounts || []).forEach((a) => a && s.add(a)));
    return Array.from(s).sort();
  }, [rows]);

  const allTemplates = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r._template_name && s.add(r._template_name));
    return Array.from(s).sort();
  }, [rows]);

  // Staged filter passes (table + debug panel).
  const debugStages = useMemo(() => {
    const { from, to, buyerFilter, accountFilter, templateFilter, search } = applied;
    const afterDate = rows.filter((r) => {
      const dateKey = (r.report_date || (r.created_at ? r.created_at.slice(0, 10) : "")) as string;
      if (from && dateKey < from) return false;
      if (to && dateKey > to) return false;
      return true;
    });
    const buyerQ = buyerFilter.trim().toLowerCase();
    const afterBuyer = afterDate.filter((r) =>
      !buyerQ || (r._media_buyers || []).some((m) => (normalizeMediaBuyerNameSync(m.name) || m.name).toLowerCase() === buyerQ),
    );
    const accQ = accountFilter.trim().toLowerCase();
    const afterAcc = afterBuyer.filter((r) =>
      !accQ || (r._ad_accounts || []).some((a) => (a || "").trim().toLowerCase() === accQ),
    );
    const afterTpl = afterAcc.filter((r) => !templateFilter || r._template_name === templateFilter);
    const q = search.trim().toLowerCase();
    const afterSearch = afterTpl.filter((r) => {
      if (!q) return true;
      const inName = (r.report_name || "").toLowerCase().includes(q);
      const inNotes = (r.notes || "").toLowerCase().includes(q);
      const inBuyer = (r._media_buyers || []).some((m) => m.name.toLowerCase().includes(q));
      const inAcc = (r._ad_accounts || []).some((a) => (a || "").toLowerCase().includes(q));
      const inTpl = (r._template_name || "").toLowerCase().includes(q);
      const inDate = (r.report_date || "").toLowerCase().includes(q);
      return inName || inNotes || inBuyer || inAcc || inTpl || inDate;
    });
    return { afterDate, afterBuyer, afterAcc, afterTpl, afterSearch };
  }, [rows, applied]);

  const filtered = debugStages.afterSearch;

  // Map filtered RowExt -> ReportLike (shared shape used by buyerMetrics helper).
  const toReportLike = (r: RowExt): ReportLike => ({
    id: r.id,
    date: r.report_date || (r.created_at ? r.created_at.slice(0, 10) : ""),
    name: r.report_name,
    notes: r.notes || "",
    template: r._template_name || null,
    adAccounts: r._ad_accounts || [],
    totalSpend: Number(r.total_ad_spend) || 0,
    totalLeads: Number(r.total_leads) || 0,
    mediaBuyers: (r._media_buyers || []).map((m) => ({ name: m.name, spend: m.spend, leads: m.leads })),
  });

  // When a buyer filter is applied, resolve each row using the shared helper so
  // values agree with Media Buyer Comparison. Combined multi-buyer rows without a
  // per-buyer split are excluded unless "Include unallocated combined reports" is on.
  const filteredWithBuyerScope = useMemo(() => {
    const buyer = applied.buyerFilter.trim() || null;
    return filtered.map((r) => {
      const rl = toReportLike(r);
      const res = resolveReportForBuyer(rl, buyer, includeUnallocated);
      const mixed = (r._media_buyers || []).length > 1;
      return {
        row: r,
        spend: res.spend,
        leads: res.leads,
        mixed,
        hasBreakdown: res.matched && !res.isCombined,
        isCombined: res.isCombined,
        excluded: !res.matched,
        reason: res.reason,
      };
    });
  }, [filtered, applied.buyerFilter, includeUnallocated]);

  // Rows that contribute to totals (exclude unmatched combined rows by default).
  const scopeRowsForTotals = useMemo(
    () => filteredWithBuyerScope.filter((x) => !x.excluded),
    [filteredWithBuyerScope],
  );

  // Shared aggregation — the single source of truth for summary/trend/exports.
  const buyerMetrics = useMemo(() => {
    const reports = filtered.map(toReportLike);
    return calculateBuyerMetrics({
      reports,
      buyer: applied.buyerFilter.trim() || null,
      includeUnallocatedCombined: includeUnallocated,
    });
  }, [filtered, applied.buyerFilter, includeUnallocated]);

  const summary = useMemo(() => ({
    spend: buyerMetrics.spend,
    leads: buyerMetrics.leads,
    cpl: buyerMetrics.cpl,
    count: buyerMetrics.reportIdsIncluded.length,
  }), [buyerMetrics]);

  const trendData = useMemo(
    () => buyerMetrics.perDate.map((d) => ({ date: d.date, spend: d.spend, leads: d.leads, cpl: d.cpl ?? 0 })),
    [buyerMetrics],
  );

  // Per-buyer comparison chart — call helper per buyer for identical math.
  const buyerComparison = useMemo(() => {
    const buyerQ = applied.buyerFilter.trim().toLowerCase();
    const buyers = new Map<string, string>();
    for (const r of filtered) {
      for (const m of r._media_buyers || []) {
        for (const n of (m.name ? m.name.split(/[,/&]+/) : [])) {
          const canonical = normalizeMediaBuyerNameSync(n.trim()) || n.trim();
          if (!canonical) continue;
          if (buyerQ && canonical.toLowerCase() !== buyerQ) continue;
          buyers.set(canonical.toLowerCase(), canonical);
        }
      }
    }
    const reports = filtered.map(toReportLike);
    return Array.from(buyers.values()).map((name) => {
      const m = calculateBuyerMetrics({ reports, buyer: name, includeUnallocatedCombined: includeUnallocated });
      return { name, spend: m.spend, leads: m.leads, cpl: m.cpl ?? 0 };
    });
  }, [filtered, applied.buyerFilter, includeUnallocated]);

  const apply = () => setApplied(draft);
  const reset = () => { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); };
  // Chip "x" removes one applied filter immediately and syncs back into draft.
  const clearApplied = (p: Partial<FilterState>) => {
    const next = { ...applied, ...p };
    setApplied(next); setDraft(next);
  };

  const onRowExport = async (id: string, action: any) => {
    const full = await loadFullReport(id);
    if (!full) { toast.error("Could not load report."); return; }
    if (action === "view") { setViewing(full); setViewingStatus(rows.find((r) => r.id === id)?.report_status || null); return; }
    if (action === "edit") { onEditReport(full); return; }
    await runExportAction(action, full);
  };

  const buildExportFilename = (ext: string) => {
    const parts = ["Daily-Reports-History"];
    if (applied.from || applied.to || applied.buyerFilter || applied.accountFilter || applied.templateFilter || applied.search) {
      parts.push("Filtered");
    }
    if (applied.from || applied.to) parts.push(`${applied.from || "start"}-to-${applied.to || "end"}`);
    if (applied.buyerFilter) parts.push(applied.buyerFilter.replace(/[^A-Za-z0-9_-]+/g, "_"));
    if (applied.accountFilter) parts.push(applied.accountFilter.replace(/[^A-Za-z0-9_-]+/g, "_"));
    if (applied.templateFilter) parts.push(applied.templateFilter.replace(/[^A-Za-z0-9_-]+/g, "_"));
    if (!applied.from && !applied.to) parts.push(new Date().toISOString().slice(0, 10));
    return parts.join("-") + "." + ext;
  };

  const exportHistory = (action: string) => {
    const histRows = scopeRowsForTotals.map(({ row: r, spend, leads }) => ({
      created_at: r.created_at, report_date: r.report_date, report_name: r.report_name,
      media_buyer_count: (r._media_buyers || []).length,
      total_ad_spend: spend,
      total_leads: leads,
      overall_cpl: leads ? spend / leads : null,
      metric_template_name: r._template_name || null,
    }));
    if (action === "csv" || action === "xlsx" || action === "sheets-download") {
      downloadFile(buildExportFilename("csv"), buildHistoryCsv(histRows), "text/csv");
    } else if (action === "sheets-copy") {
      copyToClipboard(buildHistoryTSV(histRows)).then((ok) => {
        if (ok) toast.success("History copied for Google Sheets.");
        else toast.error("Could not copy.");
      });
    } else if (action === "pdf") {
      import("jspdf").then(async ({ default: jsPDF }) => {
        const autoTableMod = await import("jspdf-autotable");
        const autoTable = (autoTableMod as any).default || (autoTableMod as any);
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        doc.setFontSize(18);
        doc.text("Daily Reports History", 40, 50);
        doc.setFontSize(10); doc.setTextColor(120);
        doc.text(`Filtered rows: ${histRows.length} · Generated ${new Date().toISOString()}`, 40, 70);
        doc.setTextColor(0);
        autoTable(doc, {
          startY: 90,
          head: [["Created", "Report Date", "Name", "Buyers", "Spend", "Leads", "CPL", "Template"]],
          body: histRows.map((r) => [
            new Date(r.created_at).toISOString().slice(0, 10),
            r.report_date, r.report_name, r.media_buyer_count,
            inr(r.total_ad_spend), fmtNum(r.total_leads), r.overall_cpl == null ? "—" : inr(r.overall_cpl), r.metric_template_name || "",
          ]),
          theme: "grid", styles: { fontSize: 8 },
          headStyles: { fillColor: [247, 246, 243], textColor: 0 },
        });
        doc.save(buildExportFilename("pdf"));
      });
    } else if (action === "whatsapp") {
      toast.message("WhatsApp copy is available for individual reports only.");
    }
  };


  const confirmDelete = async (id: string) => {
    if (!confirm("Move this daily report to Trash? It will be hidden from history and permanently deleted after 14 days unless restored.")) return;
    setDeletingId(id);
    try {
      await softDeleteReport(id);
      toast.success("Moved to Trash. Will auto-delete in 14 days.");
      setViewing(null);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Could not delete report.");
    } finally { setDeletingId(null); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div>
          <div className="step-title">Daily Reports History</div>
          <div className="step-sub">Review saved daily lead reports, compare media buyers, export reports, or copy WhatsApp summaries.</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#555" }}>
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
            Show deleted (Trash)
          </label>
          <button className="btn btn-k btn-sm" onClick={onNew}>+ New Daily Report</button>
          <button className="btn btn-g btn-sm" onClick={() => setShowCharts((v) => !v)}>
            {showCharts ? "Hide Charts" : "📊 Show Charts"}
          </button>
          {onCompareMediaBuyers && (
            <button className="btn btn-g btn-sm" onClick={() => onCompareMediaBuyers({ from: applied.from, to: applied.to, preset: appliedPreset })}>⚖️ Compare Media Buyers</button>
          )}
          <ExportMenu label="Export History" onSelect={(a) => exportHistory(a)} includeWhatsapp={false} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="sum-row" style={{ marginBottom: 14 }}>
        <div className="sum-card plain"><div className="sum-lbl">Total Spend</div><div className="sum-val">{inr(summary.spend)}</div></div>
        <div className="sum-card plain"><div className="sum-lbl">Total Leads</div><div className="sum-val">{fmtNum(summary.leads)}</div></div>
        <div className="sum-card gold"><div className="sum-lbl">Overall CPL</div><div className="sum-val">{summary.cpl == null ? "—" : inr(summary.cpl)}</div></div>
        <div className="sum-card plain"><div className="sum-lbl">Reports</div><div className="sum-val">{summary.count}</div></div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 14, padding: 12, background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <div>
            <label className="fl-sm">Date Range</label>
            <select
              className="fi-sm"
              value={draft.datePreset}
              onChange={(e) => {
                const v = e.target.value as DatePreset;
                if (v === "all") setDraftPart({ datePreset: v, from: "", to: "" });
                else if (v !== "custom") {
                  const p = computePreset(v);
                  setDraftPart({ datePreset: v, from: p.from, to: p.to });
                } else setDraftPart({ datePreset: v });
              }}
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 Days</option>
              <option value="thisMonth">This Month</option>
              <option value="lastMonth">Last Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          <div>
            <label className="fl-sm">From Date</label>
            <input
              type="date"
              className="fi-sm"
              value={draft.from}
              onChange={(e) => setDraftPart({ from: e.target.value, datePreset: "custom" })}
            />
          </div>
          <div>
            <label className="fl-sm">To Date</label>
            <input
              type="date"
              className="fi-sm"
              value={draft.to}
              onChange={(e) => setDraftPart({ to: e.target.value, datePreset: "custom" })}
            />
          </div>
          <div>
            <label className="fl-sm">Media Buyer</label>
            <select className="fi-sm" value={draft.buyerFilter} onChange={(e) => setDraftPart({ buyerFilter: e.target.value })}>
              <option value="">All</option>
              {allBuyers.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="fl-sm">Ad Account</label>
            <select className="fi-sm" value={draft.accountFilter} onChange={(e) => setDraftPart({ accountFilter: e.target.value })}>
              <option value="">All</option>
              {allAccounts.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="fl-sm">Template</label>
            <select className="fi-sm" value={draft.templateFilter} onChange={(e) => setDraftPart({ templateFilter: e.target.value })}>
              <option value="">All</option>
              {allTemplates.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="fl-sm">Search</label>
            <input
              className="fi-sm"
              value={draft.search}
              onChange={(e) => setDraftPart({ search: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
              placeholder="Report, buyer, account, template, notes…"
            />
          </div>
          <div style={{ display: "flex", alignItems: "end", gap: 6 }}>
            <button className="btn btn-k btn-sm" onClick={apply} disabled={!dirty}>
              {dirty ? "Apply Filters" : "Applied"}
            </button>
            <button className="btn btn-g btn-sm" onClick={reset}>Reset Filters</button>
          </div>
        </div>

        {(applied.from || applied.to || applied.buyerFilter || applied.accountFilter || applied.templateFilter || applied.search) && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, color: "#555", alignItems: "center" }}>
            <span style={{ color: "#888" }}>Applied:</span>
            {(applied.from || applied.to) && (
              <Chip onRemove={() => clearApplied({ from: "", to: "", datePreset: "all" })}>
                Date: {applied.from || "…"} → {applied.to || "…"}
              </Chip>
            )}
            {applied.buyerFilter && <Chip onRemove={() => clearApplied({ buyerFilter: "" })}>Buyer: {applied.buyerFilter}</Chip>}
            {applied.accountFilter && <Chip onRemove={() => clearApplied({ accountFilter: "" })}>Account: {applied.accountFilter}</Chip>}
            {applied.templateFilter && <Chip onRemove={() => clearApplied({ templateFilter: "" })}>Template: {applied.templateFilter}</Chip>}
            {applied.search && <Chip onRemove={() => clearApplied({ search: "" })}>Search: "{applied.search}"</Chip>}
          </div>
        )}

        {dirty && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#B45309" }}>
            You have unapplied filter changes. Click <strong>Apply Filters</strong> to refresh results.
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 11, color: "#888", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>Showing {filtered.length} of {rows.length} reports</span>
          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
          >
            {showDebug ? "Hide Filter Debug" : "Filter Debug"}
          </button>
        </div>

        {applied.buyerFilter && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={includeUnallocated} onChange={(e) => setIncludeUnallocated(e.target.checked)} />
              Include unallocated combined reports
            </label>
            <span style={{ color: "#888" }}>
              ({filteredWithBuyerScope.filter((x) => x.isCombined && x.excluded).length} excluded by default)
            </span>
          </div>
        )}

        {showDebug && (
          <pre style={{ marginTop: 8, padding: 10, background: "#fff", border: "1px solid #E8E5DE", borderRadius: 8, fontSize: 11, color: "#333", overflow: "auto", maxHeight: 320 }}>
{JSON.stringify({
  draftFilters: draft,
  appliedFilters: applied,
  totalReportsLoaded: rows.length,
  afterDateFilter: debugStages.afterDate.length,
  afterBuyerFilter: debugStages.afterBuyer.length,
  afterAccountFilter: debugStages.afterAcc.length,
  afterTemplateFilter: debugStages.afterTpl.length,
  afterSearch: debugStages.afterSearch.length,
  buyerMetrics: {
    buyer: buyerMetrics.buyer,
    spend: buyerMetrics.spend,
    leads: buyerMetrics.leads,
    cpl: buyerMetrics.cpl,
    formula: buyerMetrics.formula,
    reportIdsIncluded: buyerMetrics.reportIdsIncluded,
    reportsExcluded: buyerMetrics.reportsExcluded,
    hadCombinedReports: buyerMetrics.hadCombinedReports,
    includeUnallocatedCombined: includeUnallocated,
  },
}, null, 2)}
          </pre>
        )}
      </div>


      {loading ? (
        <div style={{ color: "#888" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 10, padding: 24, textAlign: "center" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18 }}>No daily reports match these filters</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Adjust filters or create a new daily report.</div>
          <button className="btn btn-k btn-sm" style={{ marginTop: 12 }} onClick={onNew}>+ New Daily Report</button>
        </div>
      ) : (
        <table className="attr-table">
          <thead>
            <tr>
              <th>Created On</th><th>Report Date</th><th>Report Name</th>
              <th>Media Buyers</th><th>Total Spend</th><th>Total Leads</th><th>Overall CPL</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filteredWithBuyerScope.map(({ row: r, spend, leads, mixed, hasBreakdown, isCombined, excluded }) => {
              const cpl = leads ? spend / leads : null;
              const showCombinedWarn = !!applied.buyerFilter && isCombined;
              const buyerOnlyBadge = !!applied.buyerFilter && hasBreakdown;
              return (
                <tr key={r.id} style={r.is_deleted || excluded ? { opacity: 0.55 } : undefined}>
                  <td style={{ fontSize: 11, color: "#888" }}>{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                  <td>{fmtDateLong(r.report_date)}</td>
                  <td>
                    {r.report_name}
                    {r.report_status === "edited" && !r.is_deleted && (
                      <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", textTransform: "uppercase", letterSpacing: ".08em" }}>edited</span>
                    )}
                    {buyerOnlyBadge && (
                      <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857", textTransform: "uppercase", letterSpacing: ".08em" }}>
                        buyer-level
                      </span>
                    )}
                    {showCombinedWarn && (
                      <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", textTransform: "uppercase", letterSpacing: ".08em" }}>
                        combined / split unavailable
                      </span>
                    )}
                    {r.is_deleted && (
                      <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", textTransform: "uppercase", letterSpacing: ".08em" }}>
                        deleted · {daysRemaining(r.deleted_at)}d left
                      </span>
                    )}
                    {showCombinedWarn && excluded && (
                      <div style={{ marginTop: 4, fontSize: 10, color: "#B45309" }}>
                        ⚠ Excluded from buyer totals (toggle "Include unallocated combined reports" to count).
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: "#888" }}>
                    {mixed ? (r._media_buyers || []).map((m) => m.name).join(", ") : (r._media_buyers || []).map((m) => m.name).join(", ")}
                  </td>
                  <td>{excluded ? "—" : inr(spend)}</td>
                  <td>{excluded ? "—" : fmtNum(leads)}</td>
                  <td>{excluded || cpl == null ? "—" : inr(cpl)}</td>
                  <td>
                    {r.is_deleted ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-g btn-sm" onClick={async () => {
                          try { await restoreReport(r.id); toast.success("Report restored."); reload(); }
                          catch (e: any) { toast.error(e?.message || "Restore failed."); }
                        }}>↺ Restore</button>
                        <button className="btn btn-g btn-sm" style={{ color: "#DC2626" }} onClick={async () => {
                          if (!confirm("Permanently delete this report now? This cannot be undone.")) return;
                          try { await permanentlyDeleteReport(r.id); toast.success("Report permanently deleted."); reload(); }
                          catch (e: any) { toast.error(e?.message || "Delete failed."); }
                        }}>🗑 Forever</button>
                      </div>
                    ) : (
                      <RowActions
                        onView={() => onRowExport(r.id, "view")}
                        onEdit={() => onRowExport(r.id, "edit")}
                        onWhatsapp={() => onRowExport(r.id, "whatsapp")}
                        onExport={(a) => onRowExport(r.id, a)}
                        onDelete={() => confirmDelete(r.id)}
                        deleting={deletingId === r.id}
                      />
                    )}
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>
      )}

      {showCharts && filtered.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Analytics</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
            Charts reflect the {filtered.length} report(s) matching your current filters.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14 }}>
            <ChartCard title="Daily Spend Trend">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                  <RTooltip /><Line type="monotone" dataKey="spend" stroke="#0a0a0a" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Daily Leads Trend">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                  <RTooltip /><Line type="monotone" dataKey="leads" stroke="#C8A84B" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Daily CPL Trend">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                  <RTooltip /><Line type="monotone" dataKey="cpl" stroke="#16A34A" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Media Buyer CPL">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={buyerComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                  <RTooltip /><Bar dataKey="cpl" fill="#C8A84B" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Media Buyer Spend">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={buyerComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                  <RTooltip /><Bar dataKey="spend" fill="#0a0a0a" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Media Buyer Leads">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={buyerComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                  <RTooltip /><Bar dataKey="leads" fill="#C8A84B" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}


      {viewing && (
        <DailyReportDrawer
          report={viewing}
          status={viewingStatus}
          onClose={() => setViewing(null)}
          onEdit={() => { const r = viewing; setViewing(null); onEditReport(r); }}
          onDelete={() => viewing.id && confirmDelete(viewing.id)}
        />
      )}
    </div>
  );
}

function RowActions({
  onView, onEdit, onWhatsapp, onExport, onDelete, deleting,
}: any) {
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setExportOpen(false); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const item = (label: string, onClick: () => void, danger = false) => (
    <button
      onClick={() => { setOpen(false); setExportOpen(false); onClick(); }}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "8px 12px", background: "transparent", border: "none",
        fontFamily: "'Jost',sans-serif", fontSize: 12,
        color: danger ? "#DC2626" : "#0a0a0a", cursor: "pointer", borderRadius: 6,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "#FEF2F2" : "#FBF6E9")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >{label}</button>
  );

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", gap: 4 }}>
      <button className="btn btn-g btn-sm" onClick={onView}>View</button>
      <button className="btn btn-g btn-sm" onClick={() => setOpen((o) => !o)} disabled={deleting}>⋯</button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0,
          background: "#fff", border: "1px solid #E8E5DE", borderRadius: 10,
          minWidth: 200, zIndex: 50, padding: 4, boxShadow: "0 4px 12px rgba(0,0,0,.04)",
        }}>
          {item("✏️ Edit", onEdit)}
          {item("📋 Copy WhatsApp", onWhatsapp)}
          <button
            onClick={() => setExportOpen((o) => !o)}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "8px 12px", background: "transparent", border: "none",
              fontFamily: "'Jost',sans-serif", fontSize: 12, color: "#0a0a0a",
              cursor: "pointer", borderRadius: 6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#FBF6E9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >📤 Export ▸</button>
          {exportOpen && (
            <div style={{ paddingLeft: 8, borderLeft: "2px solid #E8E5DE", margin: "0 8px" }}>
              {item("📁 CSV", () => onExport("csv"))}
              {item("📊 Excel (CSV)", () => onExport("xlsx"))}
              {item("📄 PDF", () => onExport("pdf"))}
              {item("📗 Sheets CSV", () => onExport("sheets-download"))}
              {item("📗 Copy for Sheets", () => onExport("sheets-copy"))}
            </div>
          )}
          {item("🗑 Delete", onDelete, true)}
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E8E5DE", borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".12em", color: "#888", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 4px 2px 8px", background: "#fff", border: "1px solid #E8E5DE", borderRadius: 999 }}>
      <span>{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        style={{ width: 16, height: 16, borderRadius: 999, border: "none", background: "#F1EFEA", color: "#555", fontSize: 11, lineHeight: "16px", cursor: "pointer", padding: 0 }}
      >×</button>
    </span>
  );
}
