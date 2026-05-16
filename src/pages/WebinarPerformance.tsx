import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { inr, pct, num } from "@/lib/roas/format";
import { toast } from "sonner";

// ---------- helpers ----------
type Range = { start: string; end: string; label: string };
const todayStr = () => new Date().toISOString().slice(0, 10);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function presetRange(key: string): Range {
  const now = new Date();
  const start = new Date(now);
  if (key === "this_month") {
    start.setDate(1);
    return { start: ymd(start), end: ymd(now), label: "This Month" };
  }
  if (key === "last_month") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: ymd(s), end: ymd(e), label: "Last Month" };
  }
  if (key === "last_7") {
    start.setDate(now.getDate() - 6);
    return { start: ymd(start), end: ymd(now), label: "Last 7 Days" };
  }
  start.setDate(1);
  return { start: ymd(start), end: ymd(now), label: "This Month" };
}

const div = (a: number, b: number) => (b > 0 ? a / b : 0);
const pctV = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

interface WebinarRow {
  key: string;
  session_id: string | null;
  webinar_name: string;
  webinar_date: string | null;
  webinar_type: string | null;
  product: string | null;
  registrations: number;
  show_ups: number;
  watch_point: number;
  offer_show_up: number;
  ad_spend: number;
  token_buyers: number;
  final_sales: number;
  revenue_realized: number;
  revenue_to_realize: number;
  drop_after_token: number;
  media_buyers: Record<string, { leads: number; spend: number; tokens: number; finals: number; revenue: number; balance: number }>;
  linked: boolean;
}

export default function WebinarPerformance() {
  const nav = useNavigate();
  const [chip, setChip] = useState("this_month");
  const [range, setRange] = useState<Range>(presetRange("this_month"));
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [search, setSearch] = useState("");
  const [fWebinar, setFWebinar] = useState("");
  const [fType, setFType] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fMediaBuyer, setFMediaBuyer] = useState("");
  const [extraChip, setExtraChip] = useState("");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WebinarRow[]>([]);
  const [detail, setDetail] = useState<WebinarRow | null>(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range.start, range.end]);

  async function load() {
    setLoading(true);
    try {
      // 1) Webinars from attribution_sessions
      const { data: sessions } = await supabase
        .from("attribution_sessions")
        .select("id, webinar_name, webinar_date, webinar_type, total_leads, total_sales, total_ad_spend, total_revenue, overall_roas, is_deleted")
        .eq("is_deleted", false)
        .gte("webinar_date", range.start)
        .lte("webinar_date", range.end);

      // 2) Daily lead reports (for ad spend / lead counts aggregated by webinar name if any)
      const { data: dailyReports } = await supabase
        .from("daily_lead_reports")
        .select("id, report_date, total_ad_spend, total_leads, is_deleted")
        .eq("is_deleted", false)
        .gte("report_date", range.start)
        .lte("report_date", range.end);

      // 3) Paid pipeline leads in window (created or final-paid in range)
      const { data: leads } = await supabase
        .from("paid_pipeline_leads")
        .select("id, attribution_session_id, source_webinar, source_report_date, attributed_media_buyer, token_amount_collected, total_collected, balance_pending, deal_value_including_gst, final_revenue_realized, is_final_sale, is_dropped, is_refunded, is_deleted, created_at, product_name_snapshot")
        .eq("is_deleted", false);

      // 4) Media buyer attribution
      const sessionIds = (sessions ?? []).map((s: any) => s.id);
      let mbRows: any[] = [];
      if (sessionIds.length) {
        const { data: mb } = await supabase
          .from("attribution_media_buyers")
          .select("session_id, media_buyer_name, total_leads, matched_sales, ad_spend, revenue, roas_value, cpl")
          .in("session_id", sessionIds);
        mbRows = mb ?? [];
      }

      const totalDailySpend = (dailyReports ?? []).reduce((a, b: any) => a + Number(b.total_ad_spend || 0), 0);
      const totalDailyLeads = (dailyReports ?? []).reduce((a, b: any) => a + Number(b.total_leads || 0), 0);

      // Build webinar rows from sessions
      const byKey = new Map<string, WebinarRow>();
      for (const s of sessions ?? []) {
        const key = String(s.id);
        byKey.set(key, {
          key,
          session_id: s.id,
          webinar_name: s.webinar_name || "Untitled",
          webinar_date: s.webinar_date,
          webinar_type: s.webinar_type || null,
          product: null,
          registrations: Number(s.total_leads || 0),
          show_ups: 0,
          watch_point: 0,
          offer_show_up: 0,
          ad_spend: Number(s.total_ad_spend || 0),
          token_buyers: 0,
          final_sales: Number(s.total_sales || 0),
          revenue_realized: 0,
          revenue_to_realize: 0,
          drop_after_token: 0,
          media_buyers: {},
          linked: false,
        });
      }

      // Apply media buyer breakdown into rows
      for (const m of mbRows) {
        const row = byKey.get(String(m.session_id));
        if (!row) continue;
        const name = m.media_buyer_name || "Unknown";
        if (!row.media_buyers[name]) row.media_buyers[name] = { leads: 0, spend: 0, tokens: 0, finals: 0, revenue: 0, balance: 0 };
        row.media_buyers[name].leads += Number(m.total_leads || 0);
        row.media_buyers[name].spend += Number(m.ad_spend || 0);
        row.media_buyers[name].finals += Number(m.matched_sales || 0);
        row.media_buyers[name].revenue += Number(m.revenue || 0);
      }

      // Apply paid pipeline leads → token/final/revenue/balance
      const unlinkedBucket = new Map<string, WebinarRow>();
      const inRange = (d: string | null) => !d || (d >= range.start && d <= range.end);
      for (const l of leads ?? []) {
        // Filter by overlap with window — include if attribution session is in window, OR lead source_report_date in window
        const inWindow = (l.attribution_session_id && byKey.has(String(l.attribution_session_id))) || inRange(l.source_report_date) || inRange(String(l.created_at).slice(0, 10));
        if (!inWindow) continue;

        let target: WebinarRow | undefined;
        if (l.attribution_session_id && byKey.has(String(l.attribution_session_id))) {
          target = byKey.get(String(l.attribution_session_id));
          if (target) target.linked = true;
        } else {
          const name = l.source_webinar || "Unlinked (no webinar)";
          const k = `unlinked::${name}`;
          if (!unlinkedBucket.has(k)) {
            unlinkedBucket.set(k, {
              key: k,
              session_id: null,
              webinar_name: name,
              webinar_date: l.source_report_date || null,
              webinar_type: null,
              product: l.product_name_snapshot || null,
              registrations: 0, show_ups: 0, watch_point: 0, offer_show_up: 0,
              ad_spend: 0, token_buyers: 0, final_sales: 0,
              revenue_realized: 0, revenue_to_realize: 0, drop_after_token: 0,
              media_buyers: {}, linked: false,
            });
          }
          target = unlinkedBucket.get(k);
        }
        if (!target) continue;

        if (!target.product && l.product_name_snapshot) target.product = l.product_name_snapshot;
        if (Number(l.token_amount_collected || 0) > 0) target.token_buyers += 1;
        if (l.is_final_sale) target.final_sales = Math.max(target.final_sales, target.final_sales); // keep session value if present; else count below
        target.revenue_realized += Number(l.final_revenue_realized || l.total_collected || 0);
        if (!l.is_dropped && !l.is_refunded) target.revenue_to_realize += Number(l.balance_pending || 0);
        if (l.is_dropped && Number(l.token_amount_collected || 0) > 0) target.drop_after_token += 1;

        const mb = l.attributed_media_buyer;
        if (mb) {
          if (!target.media_buyers[mb]) target.media_buyers[mb] = { leads: 0, spend: 0, tokens: 0, finals: 0, revenue: 0, balance: 0 };
          if (Number(l.token_amount_collected || 0) > 0) target.media_buyers[mb].tokens += 1;
          if (l.is_final_sale) target.media_buyers[mb].finals += 1;
          target.media_buyers[mb].revenue += Number(l.final_revenue_realized || l.total_collected || 0);
          target.media_buyers[mb].balance += Number(l.balance_pending || 0);
        }
      }

      // If session.total_sales was 0 but we have paid-pipeline finals, prefer counted finals
      // (avoid double counting if session already had a sales count)
      const out = [...byKey.values(), ...unlinkedBucket.values()];
      setRows(out);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to load webinar data");
    } finally {
      setLoading(false);
    }
  }

  // Filters
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search && !r.webinar_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (fWebinar && r.webinar_name !== fWebinar) return false;
      if (fType && r.webinar_type !== fType) return false;
      if (fProduct && r.product !== fProduct) return false;
      if (fMediaBuyer && !r.media_buyers[fMediaBuyer]) return false;
      const showUp = pctV(r.show_ups, r.registrations);
      const tokenConv = pctV(r.token_buyers, r.registrations);
      const finalConv = pctV(r.final_sales, r.registrations);
      const cpl = div(r.ad_spend, r.registrations);
      const roas = div(r.revenue_realized, r.ad_spend);
      if (extraChip === "high_roas" && roas < 3) return false;
      if (extraChip === "low_roas" && (roas >= 1 || r.ad_spend === 0)) return false;
      if (extraChip === "high_cpl" && cpl < 500) return false;
      if (extraChip === "high_show_up" && showUp < 60) return false;
      if (extraChip === "low_show_up" && (showUp >= 30 || r.registrations === 0)) return false;
      if (extraChip === "high_token_conv" && tokenConv < 10) return false;
      if (extraChip === "high_final_conv" && finalConv < 5) return false;
      if (extraChip === "high_pending" && r.revenue_to_realize < 100000) return false;
      return true;
    });
  }, [rows, search, fWebinar, fType, fProduct, fMediaBuyer, extraChip]);

  // Top-level aggregates
  const totals = useMemo(() => {
    const t = {
      registrations: 0, show_ups: 0, watch_point: 0, offer_show_up: 0,
      token_buyers: 0, final_sales: 0, revenue_realized: 0, revenue_to_realize: 0, ad_spend: 0,
    };
    for (const r of filtered) {
      t.registrations += r.registrations;
      t.show_ups += r.show_ups;
      t.watch_point += r.watch_point;
      t.offer_show_up += r.offer_show_up;
      t.token_buyers += r.token_buyers;
      t.final_sales += r.final_sales;
      t.revenue_realized += r.revenue_realized;
      t.revenue_to_realize += r.revenue_to_realize;
      t.ad_spend += r.ad_spend;
    }
    return t;
  }, [filtered]);

  const cpl = div(totals.ad_spend, totals.registrations);
  const roas = div(totals.revenue_realized, totals.ad_spend);
  const showUpRate = pctV(totals.show_ups, totals.registrations);

  // Aggregate media buyer table
  const mediaBuyerAgg = useMemo(() => {
    const m: Record<string, { leads: number; spend: number; tokens: number; finals: number; revenue: number; balance: number }> = {};
    for (const r of filtered) {
      for (const [name, v] of Object.entries(r.media_buyers)) {
        if (!m[name]) m[name] = { leads: 0, spend: 0, tokens: 0, finals: 0, revenue: 0, balance: 0 };
        m[name].leads += v.leads;
        m[name].spend += v.spend;
        m[name].tokens += v.tokens;
        m[name].finals += v.finals;
        m[name].revenue += v.revenue;
        m[name].balance += v.balance;
      }
    }
    return Object.entries(m).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filtered]);

  // Dropdown options
  const webinarOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.webinar_name))).sort(), [rows]);
  const typeOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.webinar_type).filter(Boolean))).sort() as string[], [rows]);
  const productOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.product).filter(Boolean))).sort() as string[], [rows]);
  const mediaBuyerOptions = useMemo(() => Array.from(new Set(rows.flatMap((r) => Object.keys(r.media_buyers)))).sort(), [rows]);

  // Red flags
  const redFlags = useMemo(() => {
    const flags: { title: string; count: number; explain: string; chip?: string }[] = [];
    const highCpl = filtered.filter((r) => div(r.ad_spend, r.registrations) > 500 && pctV(r.token_buyers, r.registrations) < 5).length;
    if (highCpl) flags.push({ title: "High CPL, low token conversion", count: highCpl, explain: "Expensive leads that aren't converting to tokens.", chip: "high_cpl" });
    const lowShow = filtered.filter((r) => r.registrations >= 20 && pctV(r.show_ups, r.registrations) < 30).length;
    if (lowShow) flags.push({ title: "Low show-up rate", count: lowShow, explain: "Registrations are coming but attendance is weak.", chip: "low_show_up" });
    const dropTok = filtered.filter((r) => r.token_buyers > 0 && r.drop_after_token / Math.max(r.token_buyers, 1) > 0.3).length;
    if (dropTok) flags.push({ title: "High drop after token", count: dropTok, explain: "Token buyers dropping before final payment." });
    const highPending = filtered.filter((r) => r.revenue_to_realize > 100000).length;
    if (highPending) flags.push({ title: "High pending revenue", count: highPending, explain: "Significant amount yet to be collected.", chip: "high_pending" });
    const unlinked = filtered.filter((r) => !r.linked && r.session_id === null).length;
    if (unlinked) flags.push({ title: "Unlinked webinar data", count: unlinked, explain: "Paid pipeline leads without a linked webinar report." });
    return flags;
  }, [filtered]);

  // Best / worst summaries
  const bestByRoas = [...filtered].filter((r) => r.ad_spend > 0).sort((a, b) => div(b.revenue_realized, b.ad_spend) - div(a.revenue_realized, a.ad_spend))[0];
  const bestByRevenue = [...filtered].sort((a, b) => b.revenue_realized - a.revenue_realized)[0];
  const highestPending = [...filtered].sort((a, b) => b.revenue_to_realize - a.revenue_to_realize)[0];

  const exportCsv = (data: any[], filename: string) => {
    if (!data.length) { toast.error("Nothing to export"); return; }
    const keys = Object.keys(data[0]);
    const csv = [keys.join(","), ...data.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = filename;
    a.click();
  };

  const exportTable = () => exportCsv(filtered.map((r) => ({
    webinar: r.webinar_name, date: r.webinar_date, type: r.webinar_type, product: r.product,
    registrations: r.registrations, show_ups: r.show_ups,
    ad_spend: r.ad_spend, cpl: Math.round(div(r.ad_spend, r.registrations)),
    token_buyers: r.token_buyers, final_sales: r.final_sales,
    revenue_realized: Math.round(r.revenue_realized), revenue_to_realize: Math.round(r.revenue_to_realize),
    roas: Number(div(r.revenue_realized, r.ad_spend).toFixed(2)),
  })), `webinar-performance-${range.start}_${range.end}.csv`);

  const exportMb = () => exportCsv(mediaBuyerAgg.map(([name, v]) => ({
    media_buyer: name, leads: v.leads, ad_spend: v.spend,
    cpl: Math.round(div(v.spend, v.leads)),
    token_buyers: v.tokens, final_sales: v.finals,
    revenue_realized: Math.round(v.revenue), balance_pending: Math.round(v.balance),
    roas: Number(div(v.revenue, v.spend).toFixed(2)),
  })), `media-buyer-quality-${range.start}_${range.end}.csv`);

  const copyFounder = async () => {
    const lines = [
      `Webinar Performance Summary (${range.label}):`,
      `Total Registrations: ${num(totals.registrations)}`,
      `Show-Up Rate: ${pct(showUpRate)}`,
      `Token Buyers: ${num(totals.token_buyers)}`,
      `Final Sales: ${num(totals.final_sales)}`,
      `Revenue Realized: ${inr(totals.revenue_realized)}`,
      `Revenue To Be Realized: ${inr(totals.revenue_to_realize)}`,
      `Realized ROAS: ${roas.toFixed(2)}x`,
      `Top Webinar: ${bestByRevenue?.webinar_name || "—"}`,
      `Biggest Red Flag: ${redFlags[0]?.title || "None"}`,
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied founder summary");
  };

  const setChipRange = (k: string) => {
    setChip(k);
    if (["this_month", "last_month", "last_7"].includes(k)) setRange(presetRange(k));
  };

  return (
    <div className="max-w-[1380px]">
      <PageHead title="Webinar Performance" sub="Compare webinar performance across registrations, attendance, offer show-up, ROAS, sales, payment recovery, and final revenue." />

      {/* Filters */}
      <div className="bg-off rounded-xl p-4 mb-5">
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            ["this_month", "This Month"], ["last_month", "Last Month"], ["last_7", "Last 7 Days"],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setChipRange(k)} className={`text-[11px] font-sans px-3 py-1 rounded-full border ${chip === k ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground hover:text-black"}`}>{l}</button>
          ))}
          {[
            ["high_roas", "High ROAS"], ["low_roas", "Low ROAS"], ["high_cpl", "High CPL"],
            ["high_show_up", "High Show-Up"], ["low_show_up", "Low Show-Up"],
            ["high_token_conv", "High Token Conv"], ["high_final_conv", "High Final Conv"],
            ["high_pending", "High Pending Revenue"],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setExtraChip(extraChip === k ? "" : k)} className={`text-[11px] font-sans px-3 py-1 rounded-full border ${extraChip === k ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground hover:text-black"}`}>{l}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <input type="date" value={range.start} onChange={(e) => { setRange({ ...range, start: e.target.value, label: "Custom" }); setChip(""); }} className="ipc-input" />
          <input type="date" value={range.end} onChange={(e) => { setRange({ ...range, end: e.target.value, label: "Custom" }); setChip(""); }} className="ipc-input" />
          <select value={fWebinar} onChange={(e) => setFWebinar(e.target.value)} className="ipc-input">
            <option value="">All webinars</option>
            {webinarOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={fType} onChange={(e) => setFType(e.target.value)} className="ipc-input">
            <option value="">All types</option>
            {typeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={fProduct} onChange={(e) => setFProduct(e.target.value)} className="ipc-input">
            <option value="">All products</option>
            {productOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={fMediaBuyer} onChange={(e) => setFMediaBuyer(e.target.value)} className="ipc-input">
            <option value="">All media buyers</option>
            {mediaBuyerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search webinar…" className="ipc-input md:col-span-2" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card label="Registrations" value={num(totals.registrations)} />
        <Card label="Show-Ups" value={num(totals.show_ups)} sub={`${pct(showUpRate)} rate`} />
        <Card label="Token Buyers" value={num(totals.token_buyers)} sub={`${pct(pctV(totals.token_buyers, totals.registrations))} conv`} />
        <Card label="Final Sales" value={num(totals.final_sales)} sub={`${pct(pctV(totals.final_sales, totals.registrations))} conv`} />
        <Card label="Revenue Realized" value={inr(totals.revenue_realized, { compact: true })} />
        <Card label="Revenue To Be Realized" value={inr(totals.revenue_to_realize, { compact: true })} />
        <Card label="Ad Spend" value={inr(totals.ad_spend, { compact: true })} sub={`CPL ${inr(cpl)}`} />
        <Card label="Realized ROAS" value={`${roas.toFixed(2)}x`} />
      </div>

      {/* Funnel */}
      <SectionLabel>Funnel Conversion</SectionLabel>
      <div className="bg-off rounded-xl p-5 mb-6 grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Registrations", totals.registrations, totals.registrations],
          ["Show-Ups", totals.show_ups, totals.registrations],
          ["Token Buyers", totals.token_buyers, totals.registrations],
          ["Final Sales", totals.final_sales, totals.registrations],
          ["Revenue Realized", totals.revenue_realized, 0],
        ].map(([label, v, base], i) => (
          <div key={i} className="bg-white border border-line rounded-lg p-4">
            <div className="font-sans text-[9px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">{label as string}</div>
            <div className="font-serif text-[22px] font-medium text-black">{label === "Revenue Realized" ? inr(v as number, { compact: true }) : num(v as number)}</div>
            {(base as number) > 0 && label !== "Registrations" && (
              <div className="font-sans text-[10px] text-muted-foreground mt-1">{pct(pctV(v as number, base as number))} of registrations</div>
            )}
          </div>
        ))}
      </div>

      {/* Main table */}
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>Webinar Performance Table</SectionLabel>
        <div className="flex gap-2">
          <button onClick={exportTable} className="ipc-btn ipc-btn-ghost text-[11px]">Export CSV</button>
          <button onClick={copyFounder} className="ipc-btn ipc-btn-ghost text-[11px]">Copy Founder Summary</button>
        </div>
      </div>
      <div className="border border-line rounded-xl bg-white overflow-x-auto mb-6">
        <table className="w-full border-collapse font-sans text-[12px]">
          <thead>
            <tr>
              {["Webinar", "Date", "Type", "Product", "Regs", "Show-Ups", "Show %", "Ad Spend", "CPL", "Token", "Tok %", "Finals", "Fin %", "Revenue", "Pending", "ROAS", "Status", "Actions"].map((h) => (
                <th key={h} className="text-left text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground py-2.5 px-3 border-b border-line whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={18} className="py-6 px-3 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={18} className="py-6 px-3 text-center text-muted-foreground">No webinar data in this range.</td></tr>}
            {filtered.map((r) => {
              const cpl = div(r.ad_spend, r.registrations);
              const roas = div(r.revenue_realized, r.ad_spend);
              return (
                <tr key={r.key} className="hover:bg-off transition-colors border-b border-line">
                  <td className="py-2.5 px-3 font-serif text-[13px] font-medium text-black">{r.webinar_name}</td>
                  <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{r.webinar_date || "—"}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{r.webinar_type || "—"}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{r.product || "—"}</td>
                  <td className="py-2.5 px-3">{num(r.registrations)}</td>
                  <td className="py-2.5 px-3">{num(r.show_ups)}</td>
                  <td className="py-2.5 px-3">{pct(pctV(r.show_ups, r.registrations))}</td>
                  <td className="py-2.5 px-3">{inr(r.ad_spend, { compact: true })}</td>
                  <td className="py-2.5 px-3">{inr(cpl)}</td>
                  <td className="py-2.5 px-3">{num(r.token_buyers)}</td>
                  <td className="py-2.5 px-3">{pct(pctV(r.token_buyers, r.registrations))}</td>
                  <td className="py-2.5 px-3">{num(r.final_sales)}</td>
                  <td className="py-2.5 px-3">{pct(pctV(r.final_sales, r.registrations))}</td>
                  <td className="py-2.5 px-3">{inr(r.revenue_realized, { compact: true })}</td>
                  <td className="py-2.5 px-3">{inr(r.revenue_to_realize, { compact: true })}</td>
                  <td className="py-2.5 px-3 font-medium">{roas.toFixed(2)}x</td>
                  <td className="py-2.5 px-3">
                    {r.session_id == null ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Needs Mapping</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Linked</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <button onClick={() => setDetail(r)} className="text-[11px] underline text-black hover:opacity-70">View</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Media Buyer Quality */}
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>Media Buyer Quality</SectionLabel>
        <button onClick={exportMb} className="ipc-btn ipc-btn-ghost text-[11px]">Export CSV</button>
      </div>
      <div className="border border-line rounded-xl bg-white overflow-x-auto mb-6">
        <table className="w-full border-collapse font-sans text-[12px]">
          <thead>
            <tr>
              {["Media Buyer", "Leads", "Spend", "CPL", "Tokens", "Tok %", "Finals", "Fin %", "Revenue", "Pending", "ROAS"].map((h) => (
                <th key={h} className="text-left text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground py-2.5 px-3 border-b border-line">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mediaBuyerAgg.length === 0 && <tr><td colSpan={11} className="py-6 px-3 text-center text-muted-foreground">No media buyer data.</td></tr>}
            {mediaBuyerAgg.map(([name, v]) => (
              <tr key={name} className="border-b border-line hover:bg-off cursor-pointer" onClick={() => setFMediaBuyer(name)}>
                <td className="py-2.5 px-3 font-serif text-[13px] font-medium">{name}</td>
                <td className="py-2.5 px-3">{num(v.leads)}</td>
                <td className="py-2.5 px-3">{inr(v.spend, { compact: true })}</td>
                <td className="py-2.5 px-3">{inr(div(v.spend, v.leads))}</td>
                <td className="py-2.5 px-3">{num(v.tokens)}</td>
                <td className="py-2.5 px-3">{pct(pctV(v.tokens, v.leads))}</td>
                <td className="py-2.5 px-3">{num(v.finals)}</td>
                <td className="py-2.5 px-3">{pct(pctV(v.finals, v.leads))}</td>
                <td className="py-2.5 px-3">{inr(v.revenue, { compact: true })}</td>
                <td className="py-2.5 px-3">{inr(v.balance, { compact: true })}</td>
                <td className="py-2.5 px-3 font-medium">{div(v.revenue, v.spend).toFixed(2)}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comparison */}
      <SectionLabel>Webinar Comparison</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <MiniCard title="Best by ROAS" value={bestByRoas ? `${bestByRoas.webinar_name} — ${div(bestByRoas.revenue_realized, bestByRoas.ad_spend).toFixed(2)}x` : "No data available"} />
        <MiniCard title="Best by Final Revenue" value={bestByRevenue ? `${bestByRevenue.webinar_name} — ${inr(bestByRevenue.revenue_realized, { compact: true })}` : "No data available"} />
        <MiniCard title="Highest Pending Revenue" value={highestPending && highestPending.revenue_to_realize > 0 ? `${highestPending.webinar_name} — ${inr(highestPending.revenue_to_realize, { compact: true })}` : "No data available"} />
      </div>

      {/* Payment Realization */}
      <SectionLabel>Payment Realization</SectionLabel>
      <div className="border border-line rounded-xl bg-white overflow-x-auto mb-6">
        <table className="w-full border-collapse font-sans text-[12px]">
          <thead>
            <tr>
              {["Webinar", "Token Buyers", "Final Sales", "Revenue Realized", "Pending", "Realization Rate"].map((h) => (
                <th key={h} className="text-left text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground py-2.5 px-3 border-b border-line">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="py-6 px-3 text-center text-muted-foreground">No data.</td></tr>}
            {filtered.map((r) => {
              const dealValue = r.revenue_realized + r.revenue_to_realize;
              const realization = pctV(r.revenue_realized, dealValue);
              return (
                <tr key={r.key} className="border-b border-line">
                  <td className="py-2.5 px-3 font-serif text-[13px] font-medium">{r.webinar_name}</td>
                  <td className="py-2.5 px-3">{num(r.token_buyers)}</td>
                  <td className="py-2.5 px-3">{num(r.final_sales)}</td>
                  <td className="py-2.5 px-3">{inr(r.revenue_realized, { compact: true })}</td>
                  <td className="py-2.5 px-3">{inr(r.revenue_to_realize, { compact: true })}</td>
                  <td className="py-2.5 px-3">{pct(realization)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Red Flags */}
      <SectionLabel>Red Flags</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
        {redFlags.length === 0 && <div className="text-muted-foreground font-sans text-sm">No red flags detected.</div>}
        {redFlags.map((f, i) => (
          <div key={i} className="border border-line rounded-lg bg-white p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="font-serif text-[15px] font-medium text-black">{f.title}</div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">{f.count} webinar{f.count > 1 ? "s" : ""}</span>
            </div>
            <div className="font-sans text-[12px] text-muted-foreground mb-2">{f.explain}</div>
            {f.chip && <button onClick={() => setExtraChip(f.chip!)} className="text-[11px] underline text-black">View Webinars</button>}
          </div>
        ))}
      </div>

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setDetail(null)}>
          <div className="w-full max-w-[640px] bg-white h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-serif text-2xl font-medium text-black">{detail.webinar_name}</div>
                <div className="font-sans text-[12px] text-muted-foreground">{detail.webinar_date} · {detail.webinar_type || "—"} · {detail.product || "—"}</div>
              </div>
              <button onClick={() => setDetail(null)} className="text-muted-foreground">✕</button>
            </div>

            {!detail.linked && detail.session_id == null && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-[12px] text-amber-800 mb-4">
                This webinar has paid pipeline data but no linked attribution report. Link the batch from Paid Pipeline to enable full mapping.
              </div>
            )}

            <SectionLabel>Funnel</SectionLabel>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <Stat label="Registrations" value={num(detail.registrations)} />
              <Stat label="Show-Ups" value={`${num(detail.show_ups)} (${pct(pctV(detail.show_ups, detail.registrations))})`} />
              <Stat label="Token Buyers" value={`${num(detail.token_buyers)} (${pct(pctV(detail.token_buyers, detail.registrations))})`} />
              <Stat label="Final Sales" value={`${num(detail.final_sales)} (${pct(pctV(detail.final_sales, detail.registrations))})`} />
              <Stat label="Drop After Token" value={num(detail.drop_after_token)} />
            </div>

            <SectionLabel>Money</SectionLabel>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <Stat label="Ad Spend" value={inr(detail.ad_spend, { compact: true })} />
              <Stat label="CPL" value={inr(div(detail.ad_spend, detail.registrations))} />
              <Stat label="Revenue Realized" value={inr(detail.revenue_realized, { compact: true })} />
              <Stat label="Revenue To Be Realized" value={inr(detail.revenue_to_realize, { compact: true })} />
              <Stat label="Realized ROAS" value={`${div(detail.revenue_realized, detail.ad_spend).toFixed(2)}x`} />
              <Stat label="CPA" value={inr(div(detail.ad_spend, detail.final_sales))} />
            </div>

            <SectionLabel>Media Buyers</SectionLabel>
            <div className="border border-line rounded mb-5 overflow-hidden">
              <table className="w-full text-[12px]">
                <thead><tr className="bg-off"><th className="p-2 text-left">Buyer</th><th className="p-2 text-left">Leads</th><th className="p-2 text-left">Tokens</th><th className="p-2 text-left">Finals</th><th className="p-2 text-left">Revenue</th><th className="p-2 text-left">Pending</th></tr></thead>
                <tbody>
                  {Object.entries(detail.media_buyers).length === 0 && <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No buyer breakdown</td></tr>}
                  {Object.entries(detail.media_buyers).map(([name, v]) => (
                    <tr key={name} className="border-t border-line"><td className="p-2">{name}</td><td className="p-2">{num(v.leads)}</td><td className="p-2">{num(v.tokens)}</td><td className="p-2">{num(v.finals)}</td><td className="p-2">{inr(v.revenue, { compact: true })}</td><td className="p-2">{inr(v.balance, { compact: true })}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="ipc-btn ipc-btn-ghost text-[11px]" onClick={() => nav(`/paid-pipeline?webinar=${encodeURIComponent(detail.webinar_name)}`)}>Open Paid Pipeline</button>
              <button className="ipc-btn ipc-btn-ghost text-[11px]" onClick={() => nav(`/payment-recovery?webinar=${encodeURIComponent(detail.webinar_name)}`)}>Open Payment Recovery</button>
              <button className="ipc-btn ipc-btn-ghost text-[11px]" onClick={() => nav(`/follow-up-command-center?webinar=${encodeURIComponent(detail.webinar_name)}`)}>Open Follow-Ups</button>
              <button className="ipc-btn ipc-btn-ghost text-[11px]" onClick={() => exportCsv([detail], `webinar-${detail.webinar_name}.csv`)}>Export CSV</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Card = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="bg-off rounded-[10px] p-4">
    <div className="font-sans text-[9px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">{label}</div>
    <div className="font-serif text-[22px] font-medium text-black leading-tight">{value}</div>
    {sub && <div className="font-sans text-[10px] text-muted-foreground mt-1">{sub}</div>}
  </div>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-off rounded p-3">
    <div className="font-sans text-[9px] uppercase tracking-[0.12em] text-muted-foreground mb-1">{label}</div>
    <div className="font-serif text-[16px] font-medium text-black">{value}</div>
  </div>
);

const MiniCard = ({ title, value }: { title: string; value: string }) => (
  <div className="border border-line rounded-lg bg-white p-4">
    <div className="font-sans text-[9px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">{title}</div>
    <div className="font-serif text-[15px] font-medium text-black">{value}</div>
  </div>
);
