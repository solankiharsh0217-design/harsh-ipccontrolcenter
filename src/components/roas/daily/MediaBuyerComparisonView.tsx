import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, Cell,
} from "recharts";
import { inr, fmtNum, downloadFile, copyToClipboard } from "@/lib/dailyReports/helpers";
import { logActivity } from "@/lib/auditLog";
import { getGstAwareAdSpend } from "@/lib/roas/gst";
import { normalizeMediaBuyerListSync, getCanonicalMediaBuyers, getMediaBuyerAliasMap } from "@/lib/mediaBuyers";
import { calculateBuyerMetrics, type ReportLike, type SpendBasis } from "@/lib/dailyReports/buyerMetrics";


type DatePreset = "all" | "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";
type ReportType = "daily" | "attribution" | "combined";

interface Props {
  onBack: () => void;
  initialFrom?: string;
  initialTo?: string;
  initialPreset?: DatePreset;
  initialBuyers?: string[];
}

interface DailyMbRow {
  reportId: string;
  reportName: string;
  reportDate: string;
  buyerNameRaw: string;
  buyerNames: string[]; // split list
  shared: boolean;
  spend: number;
  leads: number;
  cpl: number | null;
  adAccounts: string[];
  templateName: string | null;
}

interface AttrMbRow {
  sessionId: string;
  sessionName: string;
  sessionDate: string;
  buyerNameRaw: string;
  buyerNames: string[];
  shared: boolean;
  spend: number;
  leads: number;
  cpl: number;
  matchedSales: number;
  revenue: number;
  roas: number;
}

const COLORS = ["#0a0a0a", "#C8A84B", "#2563EB", "#16A34A", "#DC2626", "#7C3AED", "#0891B2", "#CA8A04"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function isoD(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function computePreset(p: DatePreset): { from: string; to: string } {
  const t = new Date();
  if (p === "today") { const s = isoD(t); return { from: s, to: s }; }
  if (p === "yesterday") { const y = new Date(t); y.setDate(t.getDate()-1); const s = isoD(y); return { from: s, to: s }; }
  if (p === "last7") { const f = new Date(t); f.setDate(t.getDate()-6); return { from: isoD(f), to: isoD(t) }; }
  if (p === "thisMonth") { const f = new Date(t.getFullYear(), t.getMonth(), 1); return { from: isoD(f), to: isoD(t) }; }
  if (p === "lastMonth") {
    const f = new Date(t.getFullYear(), t.getMonth()-1, 1);
    const x = new Date(t.getFullYear(), t.getMonth(), 0);
    return { from: isoD(f), to: isoD(x) };
  }
  return { from: "", to: "" };
}

function splitBuyerName(raw: string): string[] {
  // Alias-aware split: returns canonical names, deduped.
  return normalizeMediaBuyerListSync(raw);
}
function normKey(s: string) { return s.trim().toLowerCase(); }


export default function MediaBuyerComparisonView({ onBack, initialFrom, initialTo, initialPreset, initialBuyers }: Props) {
  const [loading, setLoading] = useState(true);
  const [dailyRows, setDailyRows] = useState<DailyMbRow[]>([]);
  const [dailyReportsLike, setDailyReportsLike] = useState<ReportLike[]>([]);
  const [includeUnallocated, setIncludeUnallocated] = useState(false);
  const [spendBasis, setSpendBasis] = useState<SpendBasis>("net");
  const basisLabel = spendBasis === "gross" ? "GST-Inclusive" : "Net";
  const [attrRows, setAttrRows] = useState<AttrMbRow[]>([]);

  // Draft filters
  const [datePreset, setDatePreset] = useState<DatePreset>(initialPreset || (initialFrom || initialTo ? "custom" : "all"));
  const [fromDraft, setFromDraft] = useState(initialFrom || "");
  const [toDraft, setToDraft] = useState(initialTo || "");
  const [buyerDraft, setBuyerDraft] = useState<string[]>(initialBuyers || []);
  const [accountDraft, setAccountDraft] = useState("");
  const [templateDraft, setTemplateDraft] = useState("");
  const [reportTypeDraft, setReportTypeDraft] = useState<ReportType>("combined");
  const [searchDraft, setSearchDraft] = useState("");

  // Applied
  const [from, setFrom] = useState(initialFrom || "");
  const [to, setTo] = useState(initialTo || "");
  const [buyers, setBuyers] = useState<string[]>(initialBuyers || []);
  const [account, setAccount] = useState("");
  const [template, setTemplate] = useState("");
  const [reportType, setReportType] = useState<ReportType>("combined");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState(false);

  // Load data
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Warm canonical + alias cache so splitBuyerName normalizes correctly
        await Promise.all([getCanonicalMediaBuyers(), getMediaBuyerAliasMap()]);

        // Daily
        const { data: reports } = await (supabase as any)
          .from("daily_lead_reports")
          .select("id, report_name, report_date, created_at, metric_template_id, is_deleted")
          .eq("is_deleted", false)
          .order("report_date", { ascending: false })
          .limit(1000);
        const reportIds = (reports || []).map((r: any) => r.id);
        let mbs: any[] = [];
        let aas: any[] = [];
        let tpls: any[] = [];
        if (reportIds.length) {
          const [{ data: mb }, { data: tpl }] = await Promise.all([
            (supabase as any).from("daily_lead_report_media_buyers")
              .select("id, report_id, media_buyer_name, total_ad_spend, total_leads, cpl")
              .in("report_id", reportIds),
            (supabase as any).from("daily_metric_templates").select("id, template_name"),
          ]);
          mbs = mb || [];
          tpls = tpl || [];
          const mbIds = mbs.map((m) => m.id);
          if (mbIds.length) {
            const { data: aaData } = await (supabase as any).from("daily_lead_report_ad_accounts")
              .select("report_media_buyer_id, ad_account_name")
              .in("report_media_buyer_id", mbIds);
            aas = aaData || [];
          }
        }
        const tplMap = new Map(tpls.map((t: any) => [t.id, t.template_name]));
        const aaByMb: Record<string, string[]> = {};
        for (const a of aas) (aaByMb[a.report_media_buyer_id] ||= []).push(a.ad_account_name);
        const reportById = new Map((reports || []).map((r: any) => [r.id, r]));

        const dRows: DailyMbRow[] = mbs.map((m) => {
          const r = reportById.get(m.report_id) as any;
          const names = splitBuyerName(m.media_buyer_name || "");
          // Daily reports predate GST capture — estimate gross from default GST rate.
          const gst = getGstAwareAdSpend({ total_ad_spend: m.total_ad_spend });
          const grossSpend = gst.grossAdSpend;
          const leads = Number(m.total_leads) || 0;
          return {
            reportId: m.report_id,
            reportName: r?.report_name || "",
            reportDate: r?.report_date || (r?.created_at?.slice(0,10) ?? ""),
            buyerNameRaw: m.media_buyer_name || "",
            buyerNames: names,
            shared: names.length > 1,
            spend: grossSpend,
            leads,
            cpl: leads ? grossSpend / leads : null,
            adAccounts: aaByMb[m.id] || [],
            templateName: r?.metric_template_id ? (tplMap.get(r.metric_template_id) || null) : null,
          };
        });
        setDailyRows(dRows);

        // Group raw per-buyer rows back into ReportLike per report id, so we can
        // call the shared calculateBuyerMetrics helper (same one Daily History uses).
        const grouped: Record<string, ReportLike> = {};
        for (const r of reports || []) {
          grouped[r.id] = {
            id: r.id,
            date: r.report_date || (r.created_at?.slice(0, 10) ?? ""),
            name: r.report_name || "",
            notes: "",
            template: r.metric_template_id ? (tplMap.get(r.metric_template_id) || null) : null,
            adAccounts: [],
            totalSpend: 0,
            totalLeads: 0,
            mediaBuyers: [],
          };
        }
        for (const m of mbs) {
          const g = grouped[m.report_id];
          if (!g) continue;
          const spend = Number(m.total_ad_spend) || 0;
          const leads = Number(m.total_leads) || 0;
          g.totalSpend += spend;
          g.totalLeads += leads;
          g.mediaBuyers.push({ name: m.media_buyer_name || "", spend, leads });
          for (const acc of aaByMb[m.id] || []) {
            if (acc && !g.adAccounts!.includes(acc)) g.adAccounts!.push(acc);
          }
        }
        setDailyReportsLike(Object.values(grouped));
        const { data: sessions } = await (supabase as any)
          .from("attribution_sessions")
          .select("id, webinar_name, webinar_date, webinar_single_date, created_at, is_deleted")
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(500);
        const sessIds = (sessions || []).map((s: any) => s.id);
        let attrMbs: any[] = [];
        if (sessIds.length) {
          const { data } = await (supabase as any)
            .from("attribution_media_buyers")
            .select("session_id, media_buyer_name, ad_spend, total_leads, cpl, matched_sales, revenue, roas_value, gross_ad_spend, net_ad_spend, gst_amount, ad_spend_tax_mode, gst_rate")
            .in("session_id", sessIds);
          attrMbs = data || [];
        }
        const sessById = new Map((sessions || []).map((s: any) => [s.id, s]));
        const aRows: AttrMbRow[] = attrMbs.map((m) => {
          const s = sessById.get(m.session_id) as any;
          const names = splitBuyerName(m.media_buyer_name || "");
          const gst = getGstAwareAdSpend(m);
          const grossSpend = gst.grossAdSpend;
          const leads = Number(m.total_leads) || 0;
          const rev = Number(m.revenue) || 0;
          return {
            sessionId: m.session_id,
            sessionName: s?.webinar_name || "",
            sessionDate: s?.webinar_single_date || s?.webinar_date || (s?.created_at?.slice(0,10) ?? ""),
            buyerNameRaw: m.media_buyer_name || "",
            buyerNames: names,
            shared: names.length > 1,
            spend: grossSpend,
            leads,
            cpl: leads ? grossSpend / leads : 0,
            matchedSales: Number(m.matched_sales) || 0,
            revenue: rev,
            roas: grossSpend > 0 ? rev / grossSpend : 0,
          };
        });
        setAttrRows(aRows);
      } catch (e: any) {
        toast.error(e?.message || "Could not load comparison data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Buyer/account/template universe
  const allBuyers = useMemo(() => {
    const s = new Map<string, string>(); // norm -> display
    dailyRows.forEach((r) => r.buyerNames.forEach((n) => s.set(normKey(n), n)));
    attrRows.forEach((r) => r.buyerNames.forEach((n) => s.set(normKey(n), n)));
    return Array.from(s.values()).sort();
  }, [dailyRows, attrRows]);
  const allAccounts = useMemo(() => {
    const s = new Set<string>();
    dailyRows.forEach((r) => r.adAccounts.forEach((a) => a && s.add(a)));
    return Array.from(s).sort();
  }, [dailyRows]);
  const allTemplates = useMemo(() => {
    const s = new Set<string>();
    dailyRows.forEach((r) => r.templateName && s.add(r.templateName));
    return Array.from(s).sort();
  }, [dailyRows]);

  // Auto-apply initial filters once
  useEffect(() => {
    if (!loading && !applied) {
      applyFilters();
      setApplied(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const applyFilters = () => {
    let f = fromDraft, t = toDraft;
    if (datePreset !== "custom" && datePreset !== "all") {
      const p = computePreset(datePreset); f = p.from; t = p.to;
      setFromDraft(p.from); setToDraft(p.to);
    } else if (datePreset === "all") {
      f = ""; t = ""; setFromDraft(""); setToDraft("");
    }
    setFrom(f); setTo(t);
    setBuyers(buyerDraft);
    setAccount(accountDraft);
    setTemplate(templateDraft);
    setReportType(reportTypeDraft);
    setSearch(searchDraft);
  };

  const resetFilters = () => {
    setDatePreset("all");
    setFromDraft(""); setToDraft("");
    setBuyerDraft([]); setAccountDraft(""); setTemplateDraft("");
    setReportTypeDraft("combined"); setSearchDraft("");
    setFrom(""); setTo(""); setBuyers([]); setAccount(""); setTemplate("");
    setReportType("combined"); setSearch("");
  };

  const inDate = (d: string) => {
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };
  const matchesSearch = (s: string) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.toLowerCase().includes(q);
  };
  const buyerSet = useMemo(() => new Set(buyers.map(normKey)), [buyers]);
  const buyerActive = (row: { buyerNames: string[] }) =>
    buyerSet.size === 0 || row.buyerNames.some((n) => buyerSet.has(normKey(n)));

  // Filtered rows
  const fDaily = useMemo(() => dailyRows.filter((r) =>
    inDate(r.reportDate)
    && buyerActive(r)
    && (!account || r.adAccounts.some((a) => a === account))
    && (!template || r.templateName === template)
    && matchesSearch(`${r.reportName} ${r.buyerNameRaw} ${r.adAccounts.join(" ")} ${r.templateName || ""}`)
  ), [dailyRows, from, to, buyerSet, account, template, search]);

  const fAttr = useMemo(() => attrRows.filter((r) =>
    inDate(r.sessionDate)
    && buyerActive(r)
    && matchesSearch(`${r.sessionName} ${r.buyerNameRaw}`)
  ), [attrRows, from, to, buyerSet, search]);

  const useDaily = reportType === "daily" || reportType === "combined";
  const useAttr = reportType === "attribution" || reportType === "combined";

  // Per-buyer aggregation. Only show buyers that user selected (if any) — else all buyers found.
  const targetBuyers = useMemo(() => {
    if (buyers.length) return buyers;
    const set = new Map<string, string>();
    if (useDaily) fDaily.forEach((r) => r.buyerNames.forEach((n) => set.set(normKey(n), n)));
    if (useAttr) fAttr.forEach((r) => r.buyerNames.forEach((n) => set.set(normKey(n), n)));
    return Array.from(set.values()).sort();
  }, [buyers, fDaily, fAttr, useDaily, useAttr]);

  interface BuyerAgg {
    name: string;
    spend: number;
    leads: number;
    avgCpl: number | null;
    bestCpl: number | null;
    worstCpl: number | null;
    bestDate: string | null;
    worstDate: string | null;
    reportsCount: number;
    sharedReports: number;
    matchedSales: number;
    revenue: number;
    realizedRoas: number | null;
    daily: { date: string; spend: number; leads: number; cpl: number | null }[];
    quality: number | null;
    dataStatus: string;
  }

  const aggregates: BuyerAgg[] = useMemo(() => {
    return targetBuyers.map((bName) => {
      const bk = normKey(bName);

      // SHARED HELPER: identical math to Daily Reports History.
      // Excludes multi-buyer combined rows by default (no duplication).
      const metrics = useDaily
        ? calculateBuyerMetrics({
            reports: dailyReportsLike,
            buyer: bName,
            from, to,
            account: account || undefined,
            template: template || undefined,
            search: search || undefined,
            includeUnallocatedCombined: includeUnallocated,
            spendBasis,
          })
        : { spend: 0, leads: 0, cpl: null, perDate: [], reportIdsIncluded: [], hadCombinedReports: 0 } as any;

      const spend = metrics.spend;
      const leads = metrics.leads;
      const avgCpl = metrics.cpl;
      const sharedCount = metrics.hadCombinedReports;
      const reportIdsSize = metrics.reportIdsIncluded.length;

      // Best/worst day CPL — derived from per-date breakdown (NOT averaged).
      const cplList = metrics.perDate.filter((d: any) => d.cpl != null).map((d: any) => ({ cpl: d.cpl, date: d.date }));
      const bestCplItem = cplList.length ? cplList.reduce((a: any, b: any) => (a.cpl < b.cpl ? a : b)) : null;
      const worstCplItem = cplList.length ? cplList.reduce((a: any, b: any) => (a.cpl > b.cpl ? a : b)) : null;

      const attrMatches = useAttr ? fAttr.filter((r) => r.buyerNames.some((n) => normKey(n) === bk)) : [];
      let matchedSales = 0, revenue = 0, attrSpend = 0;
      for (const r of attrMatches) {
        matchedSales += r.matchedSales; revenue += r.revenue; attrSpend += r.spend;
      }
      const realizedRoas = attrSpend > 0 ? revenue / attrSpend : null;

      const dailyArr = metrics.perDate.map((d: any) => ({ date: d.date, spend: d.spend, leads: d.leads, cpl: d.cpl }));

      // Quality (0–100). Simple heuristic.
      let qParts: number[] = [];
      if (avgCpl != null && avgCpl > 0) qParts.push(Math.max(0, 100 - Math.min(100, (avgCpl / 1000) * 100)));
      if (leads > 0) qParts.push(Math.min(100, leads / 10));
      if (realizedRoas != null) qParts.push(Math.min(100, realizedRoas * 20));
      const quality = qParts.length >= 2 ? Math.round(qParts.reduce((a, b) => a + b, 0) / qParts.length) : null;

      const hasDaily = reportIdsSize > 0;
      const dataStatus =
        attrMatches.length === 0 && hasDaily ? "Revenue Data Missing" :
        attrMatches.length > 0 && hasDaily ? "Complete" :
        attrMatches.length > 0 ? "Attribution Only" :
        hasDaily ? (sharedCount > 0 ? "Shared Report Data" : "Daily Only") :
        "No Data";

      return {
        name: bName,
        spend, leads, avgCpl,
        bestCpl: bestCplItem?.cpl ?? null,
        worstCpl: worstCplItem?.cpl ?? null,
        bestDate: bestCplItem?.date ?? null,
        worstDate: worstCplItem?.date ?? null,
        reportsCount: reportIdsSize,
        sharedReports: sharedCount,
        matchedSales, revenue, realizedRoas,
        daily: dailyArr,
        quality,
        dataStatus,
      };
    }).filter((a) => a.spend > 0 || a.leads > 0 || a.matchedSales > 0 || a.revenue > 0);
  }, [targetBuyers, dailyReportsLike, fAttr, useDaily, useAttr, from, to, account, template, search, includeUnallocated, spendBasis]);

  // Summary
  const summary = useMemo(() => {
    const totalSpend = aggregates.reduce((a, b) => a + b.spend, 0);
    const totalLeads = aggregates.reduce((a, b) => a + b.leads, 0);
    const overallCpl = totalLeads ? totalSpend / totalLeads : null;
    const withCpl = aggregates.filter((a) => a.avgCpl != null);
    const bestCpl = withCpl.length ? withCpl.reduce((a, b) => ((a.avgCpl as number) < (b.avgCpl as number) ? a : b)) : null;
    const mostLeads = aggregates.length ? aggregates.reduce((a, b) => (a.leads > b.leads ? a : b)) : null;
    const withSales = aggregates.filter((a) => a.matchedSales > 0);
    const bestConv = withSales.length ? withSales.reduce((a, b) => (a.matchedSales > b.matchedSales ? a : b)) : null;
    const withRev = aggregates.filter((a) => a.revenue > 0);
    const bestRev = withRev.length ? withRev.reduce((a, b) => (a.revenue > b.revenue ? a : b)) : null;
    return { totalSpend, totalLeads, overallCpl, bestCpl, mostLeads, bestConv, bestRev };
  }, [aggregates]);

  // Daily trend chart data — merge by date across buyers
  const trendData = useMemo(() => {
    const dates = new Set<string>();
    aggregates.forEach((a) => a.daily.forEach((d) => dates.add(d.date)));
    return Array.from(dates).sort().map((date) => {
      const row: any = { date };
      aggregates.forEach((a) => {
        const d = a.daily.find((x) => x.date === date);
        row[`spend_${a.name}`] = d?.spend ?? 0;
        row[`leads_${a.name}`] = d?.leads ?? 0;
      });
      return row;
    });
  }, [aggregates]);

  const hasRevenue = aggregates.some((a) => a.revenue > 0 || a.matchedSales > 0);

  // Insights
  const insights = useMemo(() => {
    const out: string[] = [];
    if (summary.mostLeads && aggregates.length > 1)
      out.push(`${summary.mostLeads.name} generated the highest lead volume (${fmtNum(summary.mostLeads.leads)} leads).`);
    if (summary.bestCpl && aggregates.length > 1)
      out.push(`${summary.bestCpl.name} had the lowest average CPL (${inr(summary.bestCpl.avgCpl!)}).`);
    if (summary.bestConv) out.push(`${summary.bestConv.name} had the most attributed sales (${summary.bestConv.matchedSales}).`);
    if (summary.bestRev) out.push(`${summary.bestRev.name} produced the most revenue (${inr(summary.bestRev.revenue)}).`);
    const sharedAny = aggregates.some((a) => a.sharedReports > 0);
    if (sharedAny) out.push("Some reports contain multiple media buyers in one row, so exact per-buyer split is not available — those are counted as shared.");
    if (!hasRevenue) out.push("Revenue attribution is not available for these filters. CPL/spend/leads comparison is still valid.");
    return out;
  }, [summary, aggregates, hasRevenue]);

  // Daily breakdown rows (flat list across matched dailies)
  const dailyBreakdown = useMemo(() => {
    if (!useDaily) return [];
    const want = new Set(targetBuyers.map(normKey));
    return fDaily
      .filter((r) => want.size === 0 || r.buyerNames.some((n) => want.has(normKey(n))))
      .sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1));
  }, [fDaily, targetBuyers, useDaily]);

  // Exports
  const exportComparisonCSV = () => {
    const headers = ["Media Buyer","Reports","Shared","Spend","Leads","Avg CPL","Best CPL","Worst CPL","Best Date","Worst Date","Attributed Sales","Revenue","Realized ROAS","Quality","Data Status"];
    const lines = [headers.join(",")];
    for (const a of aggregates) {
      lines.push([
        `"${a.name}"`, a.reportsCount, a.sharedReports,
        a.spend.toFixed(2), a.leads,
        a.avgCpl?.toFixed(2) ?? "",
        a.bestCpl?.toFixed(2) ?? "",
        a.worstCpl?.toFixed(2) ?? "",
        a.bestDate ?? "", a.worstDate ?? "",
        a.matchedSales, a.revenue.toFixed(2),
        a.realizedRoas?.toFixed(2) ?? "",
        a.quality ?? "",
        `"${a.dataStatus}"`,
      ].join(","));
    }
    downloadFile(`media-buyer-comparison-${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"), "text/csv");
    logActivity({ module_key: "reports_history", action_type: "media_buyer_comparison_exported", summary: "Exported Media Buyer Comparison CSV.", metadata: { from, to, buyers, count: aggregates.length } });
  };

  const exportDailyCSV = () => {
    const headers = ["Date","Report Name","Media Buyer","Ad Accounts","Template","Spend","Leads","CPL","Shared"];
    const lines = [headers.join(",")];
    for (const r of dailyBreakdown) {
      lines.push([
        r.reportDate, `"${r.reportName}"`, `"${r.buyerNameRaw}"`,
        `"${r.adAccounts.join("; ")}"`, `"${r.templateName || ""}"`,
        r.spend.toFixed(2), r.leads,
        r.cpl?.toFixed(2) ?? "", r.shared ? "yes" : "no",
      ].join(","));
    }
    downloadFile(`media-buyer-daily-breakdown-${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"), "text/csv");
    logActivity({ module_key: "reports_history", action_type: "media_buyer_comparison_exported", summary: "Exported Media Buyer Daily Breakdown CSV." });
  };

  const copyFounderSummary = async () => {
    const lines: string[] = [];
    lines.push("Media Buyer Comparison Summary");
    lines.push(`Date Range: ${from || "All"} → ${to || "All"}`);
    lines.push(`Media Buyers Compared: ${aggregates.map((a) => a.name).join(", ") || "—"}`);
    lines.push(`Total Spend: ${inr(summary.totalSpend)}`);
    lines.push(`Total Leads: ${fmtNum(summary.totalLeads)}`);
    lines.push(`Overall CPL: ${summary.overallCpl != null ? inr(summary.overallCpl) : "N/A"}`);
    lines.push(`Best CPL: ${summary.bestCpl ? `${summary.bestCpl.name} (${inr(summary.bestCpl.avgCpl!)})` : "N/A"}`);
    lines.push(`Highest Leads: ${summary.mostLeads ? `${summary.mostLeads.name} (${fmtNum(summary.mostLeads.leads)})` : "N/A"}`);
    lines.push(`Best Attributed Sales: ${summary.bestConv ? `${summary.bestConv.name} (${summary.bestConv.matchedSales})` : "N/A"}`);
    lines.push(`Best Revenue: ${summary.bestRev ? `${summary.bestRev.name} (${inr(summary.bestRev.revenue)})` : "N/A"}`);
    if (insights.length) { lines.push(""); lines.push("Insights:"); insights.forEach((i) => lines.push(`• ${i}`)); }
    const ok = await copyToClipboard(lines.join("\n"));
    if (ok) toast.success("Founder summary copied."); else toast.error("Could not copy.");
    logActivity({ module_key: "reports_history", action_type: "media_buyer_comparison_summary_copied", summary: "Copied Founder Summary." });
  };

  const copyTeamSummary = async () => {
    const lines: string[] = ["Media Buyer Performance Review"];
    aggregates.forEach((a, i) => {
      lines.push("");
      lines.push(`Media Buyer ${i+1}: ${a.name}`);
      lines.push(`Spend: ${inr(a.spend)}`);
      lines.push(`Leads: ${fmtNum(a.leads)}`);
      lines.push(`CPL: ${a.avgCpl != null ? inr(a.avgCpl) : "N/A"}`);
      lines.push(`Attributed Sales: ${a.matchedSales || "N/A"}`);
      lines.push(`Revenue: ${a.revenue ? inr(a.revenue) : "N/A"}`);
      lines.push(`Status: ${a.dataStatus}`);
    });
    const ok = await copyToClipboard(lines.join("\n"));
    if (ok) toast.success("Team summary copied."); else toast.error("Could not copy.");
    logActivity({ module_key: "reports_history", action_type: "media_buyer_comparison_summary_copied", summary: "Copied Team Summary." });
  };

  const toggleBuyer = (b: string) => {
    setBuyerDraft((curr) => curr.some((x) => normKey(x) === normKey(b))
      ? curr.filter((x) => normKey(x) !== normKey(b))
      : [...curr, b]);
  };

  const chartData = aggregates.map((a) => ({
    name: a.name, spend: a.spend, leads: a.leads, cpl: a.avgCpl ?? 0,
    revenue: a.revenue, sales: a.matchedSales,
  }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <div>
          <div className="step-title">Media Buyer Comparison</div>
          <div className="step-sub">Compare media buyers side-by-side across spend, leads, CPL, conversions, revenue quality, and report performance.</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4, maxWidth: 720 }}>
            This comparison uses existing Daily Lead Reports, Attribution Reports, and Paid Pipeline attribution data. No new sheet import is required. Reports containing multiple combined media buyers without a per-buyer breakdown are marked as shared/combined data.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn btn-g btn-sm" onClick={onBack}>← Back to Daily History</button>
          <button className="btn btn-g btn-sm" onClick={exportComparisonCSV}>Export Comparison CSV</button>
          <button className="btn btn-g btn-sm" onClick={exportDailyCSV}>Export Daily CSV</button>
          <button className="btn btn-g btn-sm" onClick={copyFounderSummary}>Copy Founder Summary</button>
          <button className="btn btn-g btn-sm" onClick={copyTeamSummary}>Copy Team Summary</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 14, padding: 12, background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          <div>
            <label className="fl-sm">Date Range</label>
            <select className="fi-sm" value={datePreset} onChange={(e) => {
              const v = e.target.value as DatePreset;
              setDatePreset(v);
              if (v === "all") { setFromDraft(""); setToDraft(""); }
              else if (v !== "custom") { const p = computePreset(v); setFromDraft(p.from); setToDraft(p.to); }
            }}>
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
            <input type="date" className="fi-sm" value={fromDraft} onChange={(e) => { setFromDraft(e.target.value); setDatePreset("custom"); }} />
          </div>
          <div>
            <label className="fl-sm">To Date</label>
            <input type="date" className="fi-sm" value={toDraft} onChange={(e) => { setToDraft(e.target.value); setDatePreset("custom"); }} />
          </div>
          <div>
            <label className="fl-sm">Ad Account</label>
            <select className="fi-sm" value={accountDraft} onChange={(e) => setAccountDraft(e.target.value)}>
              <option value="">All</option>
              {allAccounts.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="fl-sm">Template</label>
            <select className="fi-sm" value={templateDraft} onChange={(e) => setTemplateDraft(e.target.value)}>
              <option value="">All</option>
              {allTemplates.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="fl-sm">Report Type</label>
            <select className="fi-sm" value={reportTypeDraft} onChange={(e) => setReportTypeDraft(e.target.value as ReportType)}>
              <option value="combined">Combined View</option>
              <option value="daily">Daily Lead Reports</option>
              <option value="attribution">Attribution Reports</option>
            </select>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="fl-sm">Search</label>
            <input className="fi-sm" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
              placeholder="Media buyer, report, account…" />
          </div>
        </div>

        {/* Media buyer multi-select */}
        <div style={{ marginTop: 10 }}>
          <label className="fl-sm">Media Buyers ({buyerDraft.length} selected)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {allBuyers.length === 0 && <span style={{ fontSize: 11, color: "#888" }}>No media buyers found in saved reports.</span>}
            {allBuyers.map((b) => {
              const on = buyerDraft.some((x) => normKey(x) === normKey(b));
              return (
                <button key={b} type="button" onClick={() => toggleBuyer(b)}
                  className={"pill" + (on ? " on" : "")}
                  style={{ height: 28, padding: "0 12px", fontSize: 11.5 }}>
                  {b}
                </button>
              );
            })}
            {buyerDraft.length > 0 && (
              <button type="button" className="btn btn-g btn-sm" onClick={() => setBuyerDraft([])}>Clear</button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-k btn-sm" onClick={applyFilters}>Apply Comparison</button>
          <button className="btn btn-g btn-sm" onClick={resetFilters}>Reset Filters</button>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#555", cursor: "pointer" }}>
            <input type="checkbox" checked={includeUnallocated} onChange={(e) => setIncludeUnallocated(e.target.checked)} />
            Include unallocated combined reports
          </label>
        </div>
      </div>

      {/* Buyer-level audit: report IDs included per buyer (matches Daily History). */}
      {!loading && aggregates.length > 0 && (
        <details style={{ marginBottom: 12, fontSize: 11, color: "#555" }}>
          <summary style={{ cursor: "pointer", color: "#888" }}>
            🔍 Calculation Debug — included report IDs per buyer
          </summary>
          <pre style={{ marginTop: 8, padding: 10, background: "#fff", border: "1px solid #E8E5DE", borderRadius: 8, fontSize: 11, color: "#333", overflow: "auto", maxHeight: 260 }}>
{JSON.stringify({ spendBasis, basisLabel, buyers: aggregates.map((a) => {
  const m = calculateBuyerMetrics({
    reports: dailyReportsLike, buyer: a.name,
    from, to, account: account || undefined, template: template || undefined,
    search: search || undefined, includeUnallocatedCombined: includeUnallocated,
    spendBasis,
  });
  return {
    buyer: a.name,
    spendBasis: m.spendBasis,
    displayedSpend: a.spend, leads: a.leads, cpl: a.avgCpl,
    netSpend: m.netSpend, grossSpend: m.grossSpend, gstAmount: m.gstAmount,
    cplNet: m.cplNet, cplGross: m.cplGross,
    formula: m.formula, reportIdsIncluded: m.reportIdsIncluded,
    reportsExcluded: m.reportsExcluded, includeUnallocatedCombined: includeUnallocated,
  };
}) }, null, 2)}
          </pre>
        </details>
      )}

      {loading ? (
        <div style={{ color: "#888" }}>Loading…</div>
      ) : aggregates.length === 0 ? (
        <div style={{ background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 10, padding: 24, textAlign: "center" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18 }}>No media buyer comparison data found.</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Try changing the date range, media buyers, ad account, campaign, or report type.</div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 6 }}>
            <button className="btn btn-g btn-sm" onClick={resetFilters}>Reset Filters</button>
            <button className="btn btn-k btn-sm" onClick={onBack}>Open Daily Reports History</button>
          </div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
            <SumCard label="Buyers Compared" value={String(aggregates.length)} />
            <SumCard label={`Total Spend (${basisLabel})`} value={inr(summary.totalSpend)} />
            <SumCard label="Total Leads" value={fmtNum(summary.totalLeads)} />
            <SumCard label={`Overall CPL (${basisLabel})`} value={summary.overallCpl != null ? inr(summary.overallCpl) : "—"} gold />
            <SumCard label={`Best CPL (${basisLabel})`} value={summary.bestCpl ? `${summary.bestCpl.name} · ${inr(summary.bestCpl.avgCpl!)}` : "N/A"} />
            <SumCard label="Highest Leads" value={summary.mostLeads ? `${summary.mostLeads.name} · ${fmtNum(summary.mostLeads.leads)}` : "N/A"} />
            <SumCard label="Best Attributed Sales" value={summary.bestConv ? `${summary.bestConv.name} · ${summary.bestConv.matchedSales}` : "N/A"} />
            <SumCard label="Best Revenue" value={summary.bestRev ? `${summary.bestRev.name} · ${inr(summary.bestRev.revenue)}` : "N/A"} />
          </div>

          {buyers.length === 1 && (
            <div style={{ marginBottom: 12, padding: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, fontSize: 12, color: "#92400E" }}>
              Select at least 2 media buyers to compare. Individual performance for {buyers[0]} shown below.
            </div>
          )}

          {/* Split view */}
          {aggregates.length <= 4 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: aggregates.length >= 2 ? `repeat(${aggregates.length}, minmax(0, 1fr))` : "1fr",
              gap: 12, marginBottom: 18,
            }} className="mbc-split">
              {aggregates.map((a, idx) => (
                <BuyerCard key={a.name} agg={a} winners={{
                  bestCpl: summary.bestCpl?.name === a.name,
                  mostLeads: summary.mostLeads?.name === a.name,
                  bestConv: summary.bestConv?.name === a.name,
                  bestRev: summary.bestRev?.name === a.name,
                }} color={COLORS[idx % COLORS.length]} />
              ))}
            </div>
          )}

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 18 }}>
            <ChartCard title="Spend Comparison">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip formatter={(v: any) => inr(Number(v))} />
                  <Bar dataKey="spend" radius={[4,4,0,0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Leads Comparison">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Bar dataKey="leads" radius={[4,4,0,0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="CPL Comparison">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip formatter={(v: any) => inr(Number(v))} />
                  <Bar dataKey="cpl" radius={[4,4,0,0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            {trendData.length > 1 && (
              <ChartCard title="Daily Spend Trend">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip formatter={(v: any) => inr(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {aggregates.map((a, i) => (
                      <Line key={a.name} type="monotone" dataKey={`spend_${a.name}`} name={a.name}
                        stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            {hasRevenue && (
              <ChartCard title="Revenue & Attributed Sales">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <RTooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="revenue" fill="#C8A84B" name="Revenue" radius={[4,4,0,0]} />
                    <Bar yAxisId="right" dataKey="sales" fill="#0a0a0a" name="Sales" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* Comparison table */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, marginBottom: 8 }}>Comparison Table</div>
            <div style={{ overflowX: "auto" }}>
              <table className="attr-table" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>Media Buyer</th><th>Reports</th><th>Spend</th><th>Leads</th>
                    <th>Avg CPL</th><th>Best CPL</th><th>Worst CPL</th>
                    <th>Attributed Sales</th><th>Revenue</th><th>Realized ROAS</th>
                    <th>Quality</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregates.map((a) => (
                    <tr key={a.name}>
                      <td><span className="mb-name-cell">{a.name}</span>{a.sharedReports > 0 && <div className="mb-sub2">Includes {a.sharedReports} shared</div>}</td>
                      <td>{a.reportsCount}</td>
                      <td>{inr(a.spend)}</td>
                      <td>{fmtNum(a.leads)}</td>
                      <td>{a.avgCpl != null ? inr(a.avgCpl) : "—"}</td>
                      <td>{a.bestCpl != null ? inr(a.bestCpl) : "—"}</td>
                      <td>{a.worstCpl != null ? inr(a.worstCpl) : "—"}</td>
                      <td>{a.matchedSales || "—"}</td>
                      <td>{a.revenue ? inr(a.revenue) : "—"}</td>
                      <td>{a.realizedRoas != null ? a.realizedRoas.toFixed(2) + "×" : "—"}</td>
                      <td>{a.quality != null ? a.quality : "—"}</td>
                      <td><span style={{ fontSize: 10.5, color: "#666" }}>{a.dataStatus}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily breakdown */}
          {useDaily && dailyBreakdown.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, marginBottom: 8 }}>Daily Breakdown</div>
              <div style={{ overflowX: "auto" }}>
                <table className="attr-table" style={{ minWidth: 880 }}>
                  <thead>
                    <tr>
                      <th>Date</th><th>Report</th><th>Media Buyer</th><th>Ad Accounts</th>
                      <th>Template</th><th>Spend</th><th>Leads</th><th>CPL</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyBreakdown.slice(0, 200).map((r, i) => (
                      <tr key={`${r.reportId}-${i}`}>
                        <td>{r.reportDate}</td>
                        <td>{r.reportName}</td>
                        <td>{r.buyerNameRaw}</td>
                        <td style={{ fontSize: 11, color: "#666" }}>{r.adAccounts.join(", ") || "—"}</td>
                        <td style={{ fontSize: 11, color: "#666" }}>{r.templateName || "—"}</td>
                        <td>{inr(r.spend)}</td>
                        <td>{fmtNum(r.leads)}</td>
                        <td>{r.cpl != null ? inr(r.cpl) : "—"}</td>
                        <td><span style={{ fontSize: 10.5, color: r.shared ? "#92400E" : "#666" }}>{r.shared ? "Shared" : "Complete"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dailyBreakdown.length > 200 && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>Showing first 200 of {dailyBreakdown.length} rows. Export CSV for full data.</div>
                )}
              </div>
            </div>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <div style={{ padding: 14, background: "#FBF6E9", border: "1px solid #E8D49A", borderRadius: 10, marginBottom: 16 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, marginBottom: 6 }}>Comparison Insights</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#3F3F46", lineHeight: 1.7 }}>
                {insights.map((i, idx) => <li key={idx}>{i}</li>)}
              </ul>
            </div>
          )}
        </>
      )}

      <style>{`
        @media (max-width: 720px) {
          .mbc-split { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function SumCard({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className={"sum-card " + (gold ? "gold" : "plain")}>
      <div className="sum-lbl">{label}</div>
      <div className="sum-val" style={{ fontSize: 18 }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, background: "#fff", padding: 14 }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function BuyerCard({ agg, winners, color }: {
  agg: any;
  winners: { bestCpl: boolean; mostLeads: boolean; bestConv: boolean; bestRev: boolean };
  color: string;
}) {
  const Stat = ({ l, v }: { l: string; v: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed #E8E5DE" }}>
      <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: ".08em" }}>{l}</span>
      <span style={{ fontSize: 12.5, fontWeight: 500 }}>{v}</span>
    </div>
  );
  return (
    <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, background: "#fff", padding: 16, borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 500 }}>{agg.name}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {winners.bestCpl && <Badge>Best CPL</Badge>}
          {winners.mostLeads && <Badge>Most Leads</Badge>}
          {winners.bestConv && <Badge>Best Conv</Badge>}
          {winners.bestRev && <Badge>Best Revenue</Badge>}
        </div>
      </div>
      <Stat l="Spend" v={inr(agg.spend)} />
      <Stat l="Leads" v={fmtNum(agg.leads)} />
      <Stat l="Avg CPL" v={agg.avgCpl != null ? inr(agg.avgCpl) : "—"} />
      <Stat l="Reports" v={String(agg.reportsCount)} />
      <Stat l="Best Date" v={agg.bestDate || "—"} />
      <Stat l="Worst Date" v={agg.worstDate || "—"} />
      <Stat l="Attributed Sales" v={agg.matchedSales || "—"} />
      <Stat l="Revenue" v={agg.revenue ? inr(agg.revenue) : "—"} />
      <Stat l="Realized ROAS" v={agg.realizedRoas != null ? agg.realizedRoas.toFixed(2) + "×" : "—"} />
      <Stat l="Quality" v={agg.quality != null ? `${agg.quality} / 100` : "Insufficient data"} />
      <div style={{ marginTop: 8, fontSize: 10.5, color: "#888" }}>{agg.dataStatus}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, padding: "2px 8px", borderRadius: 10,
      background: "#FBF6E9", border: "1px solid #E8D49A", color: "#854D0E",
      textTransform: "uppercase", letterSpacing: ".08em",
    }}>{children}</span>
  );
}
