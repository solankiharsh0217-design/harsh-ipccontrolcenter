import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { downloadCSV, downloadPDF, type AttributionPayload, type SaleDetail } from "@/lib/roasExport";
import AttributionResultsView from "@/components/roas/AttributionResultsView";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Tooltip as RTooltip,
} from "recharts";

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

const styles = `
.rcv2 *,.rcv2 *::before,.rcv2 *::after{box-sizing:border-box}
.rcv2{--gold:#C8A84B;--gp:#FBF6E9;--gm:#E8D49A;--kk:#0a0a0a;--ww:#fff;--off:#F7F6F3;--bd:#E8E5DE;--mt:#888;--ml:#bbb;--rd:#DC2626;--rp:#FEF2F2;--rb:#FECACA;--gn:#16A34A;--gnp:#F0FDF4;--gnb:#BBF7D0;--bl:#2563EB;--amb:#CA8A04;--ap:#FFFBEB;--ab:#FDE68A;font-family:'Jost',sans-serif;color:var(--kk)}
.rcv2 .fi,.rcv2 .fsel{height:38px;border:1px solid var(--bd);border-radius:8px;padding:0 12px;font-family:'Jost',sans-serif;font-size:13px;background:var(--ww);outline:none;transition:border-color .12s}
.rcv2 .fi:focus,.rcv2 .fsel:focus{border-color:var(--gold)}
.rcv2 .btn{height:34px;padding:0 14px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12px;font-weight:500;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:6px}
.rcv2 .btn-k{background:var(--kk);color:var(--ww)}
.rcv2 .btn-g{background:var(--ww);color:var(--kk);border:1px solid var(--bd)}
.rcv2 .btn-g:hover{background:var(--off)}
.rcv2 .btn-sm{height:28px;padding:0 10px;font-size:11.5px}
.rcv2 .sl{font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:var(--mt);margin-bottom:12px;padding-bottom:9px;border-bottom:1px solid var(--bd)}
.rcv2 .attr-table{width:100%;border-collapse:collapse;font-size:12.5px}
.rcv2 .attr-table th{text-align:left;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);padding:10px 14px;border-bottom:1px solid var(--bd);background:var(--off);cursor:pointer}
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
.rcv2 .ptab{padding:12px 18px;background:transparent;border:none;border-bottom:2px solid transparent;font-family:'Jost',sans-serif;font-size:13px;color:var(--mt);cursor:pointer;margin-bottom:-1px}
.rcv2 .ptab.on{color:var(--kk);border-bottom-color:var(--gold);font-weight:500}
.rcv2 .sum-card{border-radius:10px;padding:16px 18px}
.rcv2 .sum-card.plain{background:var(--off);border:1px solid var(--bd)}
.rcv2 .sum-card.gold{background:var(--gp);border:1px solid var(--gm)}
.rcv2 .sum-card.grn{background:var(--gnp);border:1px solid var(--gnb)}
.rcv2 .sum-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);margin-bottom:7px}
.rcv2 .sum-val{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:500;line-height:1;margin-bottom:2px}
.rcv2 .sum-card.gold .sum-val{color:var(--gold)} .rcv2 .sum-card.grn .sum-val{color:var(--gn)}
.rcv2 .sum-note{font-size:10.5px;color:var(--mt)}
.rcv2 .sum-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.rcv2 .mb-name-cell{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:500}
.rcv2 .mb-sub2{font-size:10.5px;color:var(--mt);margin-top:2px}
.rcv2 .mini-bar-wrap{display:flex;align-items:center;gap:7px}
.rcv2 .mini-bar{height:5px;width:60px;border-radius:3px;background:var(--gnp);border:1px solid var(--gnb);overflow:hidden}
.rcv2 .mini-bar-fill{height:100%;background:var(--gn)}
.rcv2 .unmatched-box{background:var(--ap);border:1px solid var(--ab);border-radius:10px;padding:16px 18px;margin-bottom:16px}
.rcv2 .unmatched-title{font-size:12px;font-weight:500;color:var(--amb);margin-bottom:8px}
.rcv2 .unmatched-list{font-size:12px;color:var(--amb);line-height:1.8}
.rcv2 .filter-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--mt);margin-bottom:4px;display:block}
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

export default function Reports() {
  const [tab, setTab] = useState<"history" | "monthly">("history");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
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
    })();
  }, []);

  return (
    <div className="rcv2">
      <style>{styles}</style>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 400 }}>Reports & History</div>
      <div style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>All past attribution calculations, stored date-wise.</div>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E8E5DE", marginBottom: 24 }}>
        <button className={"ptab" + (tab === "history" ? " on" : "")} onClick={() => setTab("history")}>Attribution History</button>
        <button className={"ptab" + (tab === "monthly" ? " on" : "")} onClick={() => setTab("monthly")}>Monthly Overview</button>
      </div>

      {loading ? (
        <div style={{ color: "#888", fontSize: 13, padding: 40, textAlign: "center" }}>Loading…</div>
      ) : tab === "history" ? (
        <HistoryTab sessions={sessions} />
      ) : (
        <MonthlyTab sessions={sessions} />
      )}
    </div>
  );
}

function HistoryTab({ sessions }: { sessions: SessionRow[] }) {
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [webFrom, setWebFrom] = useState("");
  const [webTo, setWebTo] = useState("");
  const [month, setMonth] = useState("all");
  const [monthBasis, setMonthBasis] = useState<"webinar" | "created">("webinar");
  const [methodF, setMethodF] = useState("all");
  const [buyer, setBuyer] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openSession, setOpenSession] = useState<SessionRow | null>(null);
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
        const hay = [s.webinar_name, s.webinar_operator, s.session_slot, s.webinar_platform, s.zoom_account_used, ...(s.buyers?.map((x) => x.name) || [])]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (createdFrom && s.created_at < createdFrom) return false;
      if (createdTo && s.created_at > createdTo + "T23:59:59") return false;
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

  const avgRoas = filtered.length ? filtered.reduce((a, s) => a + Number(s.overall_roas), 0) / filtered.length : 0;
  const totalRev = filtered.reduce((a, s) => a + Number(s.total_revenue), 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const display = filtered.slice((page - 1) * PAGE, page * PAGE);

  const reset = () => {
    setCreatedFrom(""); setCreatedTo(""); setWebFrom(""); setWebTo("");
    setMonth("all"); setMethodF("all"); setBuyer("all"); setSearch(""); setPage(1);
  };

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14, padding: 14, background: "#FAFAF8", border: "1px solid #E8E5DE", borderRadius: 12 }}>
        <div>
          <label className="filter-lbl">Created Date — From</label>
          <input className="fi" type="date" value={createdFrom} onChange={(e) => { setCreatedFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="filter-lbl">Created Date — To</label>
          <input className="fi" type="date" value={createdTo} onChange={(e) => { setCreatedTo(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="filter-lbl">Webinar Date — From</label>
          <input className="fi" type="date" value={webFrom} onChange={(e) => { setWebFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="filter-lbl">Webinar Date — To</label>
          <input className="fi" type="date" value={webTo} onChange={(e) => { setWebTo(e.target.value); setPage(1); }} />
        </div>
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
          <input className="fi" placeholder="Search by webinar name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="btn btn-g btn-sm" onClick={reset}>Reset</button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#888", marginBottom: 14 }}>
        {filtered.length} sessions found · Avg ROAS: {avgRoas.toFixed(2)}× · Total revenue: {inr(totalRev)}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: "#0a0a0a", marginBottom: 8 }}>No attribution reports yet</div>
          <div style={{ fontSize: 13 }}>Saved ROAS reports will appear here after you calculate and save them from the ROAS Calculator.</div>
        </div>
      ) : (
        <table className="attr-table">
          <thead>
            <tr>
              <th>Created On</th>
              <th>Webinar</th>
              <th>Webinar Date / Period</th>
              <th>Type</th>
              <th>Method</th>
              <th>Media Buyers</th>
              <th>Leads</th>
              <th>Sales</th>
              <th>Ad Spend</th>
              <th>Revenue</th>
              <th>ROAS</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {display.map((s) => {
              const roasN = Number(s.overall_roas);
              return (
                <tr key={s.id} onClick={() => setOpenSession(s)}>
                  <td style={{ fontSize: 11.5, color: "#555" }}>{s.created_at ? fmtDateTime(s.created_at) : "—"}</td>
                  <td>
                    <div className="mb-name-cell">{s.webinar_name}</div>
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
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-g btn-sm" title="View" onClick={() => setOpenSession(s)}>👁</button>
                      <button className="btn btn-g btn-sm" title="Export PDF" onClick={async () => {
                        const p = await loadPayload(s); if (p) downloadPDF(p);
                      }}>⬇</button>
                    </div>
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

      <ReportDrawer session={openSession} onClose={() => setOpenSession(null)} />
    </>
  );
}

function MonthlyTab({ sessions }: { sessions: SessionRow[] }) {
  const [basis, setBasis] = useState<"webinar" | "created">("webinar");
  const months = useMemo(() => {
    const m = new Set<string>();
    sessions.forEach((s) => {
      const k = basis === "webinar" ? periodMonth(s) : (s.created_at || "").slice(0, 7);
      if (k) m.add(k);
    });
    return Array.from(m).sort().reverse();
  }, [sessions, basis]);
  const [sel, setSel] = useState<string>("");
  useEffect(() => { if (!sel && months.length) setSel(months[0]); else if (sel && !months.includes(sel)) setSel(months[0] || ""); }, [months, sel]);

  const monthSessions = sessions.filter((s) => {
    const k = basis === "webinar" ? periodMonth(s) : (s.created_at || "").slice(0, 7);
    return k === sel;
  });
  const totalLeads = monthSessions.reduce((a, s) => a + s.total_leads, 0);
  const totalSales = monthSessions.reduce((a, s) => a + s.total_sales, 0);
  const totalRev = monthSessions.reduce((a, s) => a + Number(s.total_revenue), 0);

  const chartData = monthSessions.map((s) => ({
    name: s.webinar_name.length > 18 ? s.webinar_name.slice(0, 18) + "…" : s.webinar_name,
    roas: Number(s.overall_roas),
  }));

  const [openSession, setOpenSession] = useState<SessionRow | null>(null);

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <label className="filter-lbl">Show overview by</label>
          <select className="fsel" value={basis} onChange={(e) => setBasis(e.target.value as any)}>
            <option value="webinar">Webinar Month</option>
            <option value="created">Created Month</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {months.map((m) => (
          <button key={m} className={"pill" + (m === sel ? " on" : "")} onClick={() => setSel(m)}>
            {new Date(m + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
          </button>
        ))}
      </div>

      {!sel ? <div style={{ color: "#888", fontSize: 13 }}>No data yet.</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
            <div className="stat-card"><div className="stat-lbl">Sessions</div><div className="stat-val">{monthSessions.length}</div></div>
            <div className="stat-card"><div className="stat-lbl">Total leads</div><div className="stat-val">{totalLeads}</div></div>
            <div className="stat-card"><div className="stat-lbl">Total sales</div><div className="stat-val" style={{ color: "#16A34A" }}>{totalSales}</div></div>
            <div className="stat-card"><div className="stat-lbl">Total revenue</div><div className="stat-val" style={{ color: "#16A34A" }}>{inr(totalRev)}</div></div>
          </div>

          <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 18, marginBottom: 20 }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "#888", marginBottom: 12 }}>ROAS by webinar this month</div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#F0EDE8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Jost" }} />
                  <YAxis tick={{ fontSize: 11, fontFamily: "Jost", fill: "#888" }} />
                  <RTooltip />
                  <Bar dataKey="roas" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={roasHex(d.roas)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <table className="attr-table">
            <thead>
              <tr><th>Webinar</th><th>Webinar Date / Period</th><th>Leads</th><th>Sales</th><th>Revenue</th><th>ROAS</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {monthSessions.map((s) => (
                <tr key={s.id} onClick={() => setOpenSession(s)}>
                  <td><div className="mb-name-cell">{s.webinar_name}</div></td>
                  <td style={{ fontSize: 12 }}>{webinarPeriod(s)}</td>
                  <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16 }}>{s.total_leads}</td>
                  <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: "#16A34A" }}>{s.total_sales}</td>
                  <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: "#16A34A" }}>{inr(Number(s.total_revenue))}</td>
                  <td><span className={"roas-val " + roasClass(Number(s.overall_roas))}>{Number(s.overall_roas).toFixed(2)}×</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-g btn-sm" onClick={async () => { const p = await loadPayload(s); if (p) downloadPDF(p); }}>⬇ PDF</button>
                  </td>
                </tr>
              ))}
              {monthSessions.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#888", padding: 24 }}>No sessions this month.</td></tr>
              )}
            </tbody>
          </table>

          <ReportDrawer session={openSession} onClose={() => setOpenSession(null)} />
        </>
      )}
    </>
  );
}

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

function ReportDrawer({ session, onClose }: { session: SessionRow | null; onClose: () => void }) {
  const [payload, setPayload] = useState<AttributionPayload | null>(null);
  useEffect(() => {
    if (!session) { setPayload(null); return; }
    loadPayload(session).then(setPayload);
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
                {opt("Ad Spend Source", "Manual Entry")}
              </div>
              <AttributionResultsView payload={payload} allowSave={false} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
