import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";
import { downloadCSV, downloadPDF, type AttributionPayload, type SaleDetail } from "@/lib/roasExport";

const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN");
const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const roasClass = (n: number) => (n >= 10 ? "roas-good" : n >= 5 ? "roas-avg" : "roas-bad");
const roasHex = (n: number) => (n >= 10 ? "#16A34A" : n >= 5 ? "#CA8A04" : "#DC2626");
function initials(name: string) {
  const w = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  if (w.length === 1) return w[0][0].toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
}

const PALETTE = ["#0a0a0a", "#C8A84B", "#E8D49A", "#333333", "#888888", "#7A5E10", "#D4B876", "#555"];

export default function AttributionResultsView({
  payload, onSave, savedHist, allowSave = true,
}: {
  payload: AttributionPayload;
  onSave?: () => void;
  savedHist?: boolean;
  allowSave?: boolean;
}) {
  const { rows, salesDetail, totals, webinarName, webinarDate, webinarType } = payload;
  const unmatched = salesDetail.filter((s) => s.matchMethod === "unmatched");
  const overall = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  const pieData = rows
    .filter((r) => r.matched > 0)
    .map((r) => ({ name: r.name, value: r.matched }));
  const barData = rows.map((r) => ({ name: r.name, leads: r.leads, sales: r.matched }));
  const roasData = rows.map((r) => ({
    name: r.name,
    roas: r.spend > 0 ? +(r.revenue / r.spend).toFixed(2) : 0,
  }));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 12 }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 400 }}>Attribution Results</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-g btn-sm" onClick={() => downloadCSV(payload)}>Export CSV</button>
          <button className="btn btn-g btn-sm" onClick={() => downloadPDF(payload)}>📄 Export PDF</button>
          {allowSave && onSave && (
            <button className="btn btn-k btn-sm" onClick={onSave}>{savedHist ? "Saved ✓" : "Save to history"}</button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 24 }}>
        {webinarName} · {fmtDate(webinarDate)} · {(webinarType || "").replace("-", " ")}
      </div>

      <div className="sum-row">
        <SumCard kind="gold" label="Overall ROAS" value={totals.spend > 0 ? overall.toFixed(2) + "×" : "—"} note="Total revenue ÷ total ad spend" />
        <SumCard kind="plain" label="Total leads" value={totals.leads.toLocaleString("en-IN")} note="Across all media buyers" />
        <SumCard kind="grn" label="Total sales" value={String(totals.sales)} note={inr(totals.revenue)} />
        <SumCard kind="plain" label="Total ad spend" value={inr(totals.spend)} note="All media buyers combined" />
      </div>

      {unmatched.length > 0 && (
        <div className="unmatched-box">
          <div className="unmatched-title">⚠ {unmatched.length} sales could not be matched to any media buyer</div>
          <div className="unmatched-list">
            {unmatched.slice(0, 5).map((p, i) => (<div key={i}>• {p.name || "Unknown"} ({p.email || p.phone || "no contact info"})</div>))}
            {unmatched.length > 5 && <div>…and {unmatched.length - 5} more</div>}
          </div>
        </div>
      )}

      <div className="sl">Per media buyer breakdown</div>
      <table className="attr-table">
        <thead><tr><th>Media Buyer</th><th>Leads</th><th>Sales Attributed</th><th>Revenue</th><th>Ad Spend</th><th>CPL</th><th>Conv. Rate</th><th>ROAS</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const roasN = r.spend > 0 ? r.revenue / r.spend : 0;
            const cpl = r.leads > 0 ? "₹" + Math.round(r.spend / r.leads).toLocaleString("en-IN") : "—";
            const cvr = r.leads > 0 ? ((r.matched / r.leads) * 100).toFixed(1) + "%" : "—";
            const barPct = totals.sales > 0 ? (r.matched / totals.sales) * 100 : 0;
            const lbl = roasN >= 10 ? "Excellent" : roasN >= 5 ? "Good" : "Below target";
            return (
              <tr key={i}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="spend-av">{initials(r.name)}</div>
                    <div>
                      <div className="mb-name-cell">{r.name}</div>
                      <div className="mb-sub2">{r.leads} leads · {inr(r.spend)} spent</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500 }}>{r.leads}</td>
                <td><div className="mini-bar-wrap"><div className="mini-bar"><div className="mini-bar-fill" style={{ width: barPct + "%" }} /></div><span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500 }}>{r.matched}</span></div></td>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500, color: "#16A34A" }}>{inr(r.revenue)}</td>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500 }}>{inr(r.spend)}</td>
                <td style={{ fontSize: 13, color: "#888" }}>{cpl}</td>
                <td style={{ fontSize: 13, color: "#888" }}>{cvr}</td>
                <td>
                  <span className={"roas-val " + roasClass(roasN)}>{r.spend > 0 ? roasN.toFixed(2) + "×" : "—"}</span>
                  {r.spend > 0 && <div style={{ fontSize: 10, marginTop: 2 }} className={roasClass(roasN)}>{lbl}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ fontSize: 11.5, color: "#888", lineHeight: 1.6, padding: "12px 16px", background: "#F7F6F3", borderRadius: 8, marginTop: 12 }}>
        <strong style={{ color: "#0a0a0a" }}>Matching method:</strong> Email → Phone → Name (fuzzy).
      </div>

      {/* Full sales attribution */}
      <FullSalesTable salesDetail={salesDetail} buyers={rows.map((r) => r.name)} />

      {/* Charts */}
      <div className="sl" style={{ marginTop: 28 }}>Performance charts</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)", gap: 18 }}>
        <ChartCard title="Sales attribution by media buyer">
          <div style={{ position: "relative", height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <RTooltip />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "Jost" }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", marginTop: -28 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28 }}>{totals.sales}</div>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "#888" }}>Total sales</div>
            </div>
          </div>
        </ChartCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ChartCard title="Leads vs sales by media buyer">
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={barData}>
                  <CartesianGrid stroke="#F0EDE8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Jost" }} />
                  <YAxis tick={{ fontSize: 11, fontFamily: "Jost", fill: "#888" }} />
                  <RTooltip />
                  <Bar dataKey="leads" fill="#F7F6F3" stroke="#E8E5DE" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sales" fill="#C8A84B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard title="ROAS comparison">
            <div style={{ height: Math.max(160, roasData.length * 48) }}>
              <ResponsiveContainer>
                <BarChart data={roasData} layout="vertical">
                  <CartesianGrid stroke="#F0EDE8" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fontFamily: "Jost", fill: "#888" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontFamily: "Jost" }} width={110} />
                  <RTooltip />
                  <ReferenceLine x={10} stroke="#888" strokeDasharray="4 4" />
                  <Bar dataKey="roas" radius={[0, 4, 4, 0]}>
                    {roasData.map((d, i) => <Cell key={i} fill={roasHex(d.roas)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>
    </>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 18, background: "#fff" }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "#888", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function SumCard({ kind, label, value, note }: { kind: "gold" | "plain" | "grn"; label: string; value: string; note: string }) {
  return (
    <div className={"sum-card " + kind}>
      <div className="sum-lbl">{label}</div>
      <div className="sum-val">{value}</div>
      <div className="sum-note">{note}</div>
    </div>
  );
}

function FullSalesTable({ salesDetail, buyers }: { salesDetail: SaleDetail[]; buyers: string[] }) {
  const [search, setSearch] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const PAGE = 20;

  const filtered = useMemo(() => {
    return salesDetail.filter((s) => {
      const q = search.toLowerCase();
      if (q && !(s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.phone?.includes(q))) return false;
      if (buyerFilter === "unmatched" && s.matchMethod !== "unmatched") return false;
      if (buyerFilter !== "all" && buyerFilter !== "unmatched" && s.attributedTo !== buyerFilter) return false;
      if (methodFilter !== "all" && s.matchMethod !== methodFilter) return false;
      return true;
    });
  }, [salesDetail, search, buyerFilter, methodFilter]);

  const display = expanded ? filtered.slice((page - 1) * PAGE, page * PAGE) : filtered.slice(0, 5);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const methodPill = (m: string) => {
    const map: Record<string, [string, string, string]> = {
      email: ["Email", "#EFF6FF", "#2563EB"],
      phone: ["Phone", "#FBF6E9", "#7A5E10"],
      name: ["Name", "#F5F0FF", "#7C3AED"],
      unmatched: ["Unmatched", "#FFFBEB", "#CA8A04"],
    };
    const [lbl, bg, fg] = map[m] || ["—", "#F7F6F3", "#888"];
    return <span style={{ background: bg, color: fg, fontSize: 9, padding: "2px 8px", borderRadius: 12, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 500 }}>{lbl}</span>;
  };

  return (
    <div style={{ marginTop: 28 }}>
      <div className="sl">Full sales attribution</div>
      {expanded && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <input className="fi" style={{ flex: "1 1 200px", maxWidth: 280 }} placeholder="Search by name, email, or phone…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="fsel" style={{ width: 180 }} value={buyerFilter} onChange={(e) => { setBuyerFilter(e.target.value); setPage(1); }}>
            <option value="all">All buyers</option>
            {buyers.map((b) => <option key={b} value={b}>{b}</option>)}
            <option value="unmatched">Unmatched only</option>
          </select>
          <select className="fsel" style={{ width: 160 }} value={methodFilter} onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}>
            <option value="all">All matches</option>
            <option value="email">Email match</option>
            <option value="phone">Phone match</option>
            <option value="name">Name match</option>
            <option value="unmatched">Unmatched</option>
          </select>
        </div>
      )}
      {expanded && (
        <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
          Showing {display.length} of {filtered.length} sales
        </div>
      )}
      <table className="attr-table">
        <thead>
          <tr><th>Buyer</th><th>Email</th><th>Phone</th><th>Attributed To</th><th>Method</th><th>Revenue</th><th>Date</th></tr>
        </thead>
        <tbody>
          {display.map((s, i) => (
            <tr key={i}>
              <td><div className="mb-name-cell" style={{ fontSize: 15 }}>{s.name || "—"}</div></td>
              <td style={{ fontSize: 11, color: "#888" }}>{s.email || "—"}</td>
              <td style={{ fontSize: 12 }}>{s.phone || "—"}</td>
              <td>
                {s.attributedTo ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="spend-av">{initials(s.attributedTo)}</div>
                    <span style={{ fontSize: 12 }}>{s.attributedTo}</span>
                  </div>
                ) : <span style={{ color: "#CA8A04", fontSize: 12 }}>⚠ Unmatched</span>}
              </td>
              <td>{methodPill(s.matchMethod)}</td>
              <td style={{ color: s.matchMethod === "unmatched" ? "#888" : "#16A34A", fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>
                {s.matchMethod === "unmatched" ? "—" : inr(s.revenue)}
              </td>
              <td style={{ fontSize: 11, color: "#888" }}>{s.webinarDate ? fmtDate(s.webinarDate) : "—"}</td>
            </tr>
          ))}
          {display.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: "center", color: "#888", padding: 20 }}>No sales match these filters.</td></tr>
          )}
        </tbody>
      </table>
      {!expanded && filtered.length > 5 && (
        <button onClick={() => setExpanded(true)} style={{ background: "transparent", border: "none", color: "#C8A84B", fontSize: 12, cursor: "pointer", marginTop: 10, fontFamily: "'Jost',sans-serif" }}>
          Show all {filtered.length} sales →
        </button>
      )}
      {expanded && totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 14 }}>
          <button className="btn btn-g btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</button>
          <span style={{ fontSize: 12, color: "#888", alignSelf: "center" }}>Page {page} of {totalPages}</span>
          <button className="btn btn-g btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
