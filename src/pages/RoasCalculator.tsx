import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/* ====================================================================
   ROAS Calculator v2 — single-page module with three tabs:
   1) Media Buyer Attribution
   2) Total ROAS
   3) Data Sources
   Visual + interaction spec ported directly from ROAS_Calculator_v2.html
   ==================================================================== */

const styles = `
.rcv2 *,.rcv2 *::before,.rcv2 *::after{box-sizing:border-box}
.rcv2{
  --gold:#C8A84B;--gp:#FBF6E9;--gm:#E8D49A;
  --kk:#0a0a0a;--ww:#fff;--off:#F7F6F3;
  --bd:#E8E5DE;--mt:#888;--ml:#bbb;
  --rd:#DC2626;--rp:#FEF2F2;--rb:#FECACA;
  --gn:#16A34A;--gnp:#F0FDF4;--gnb:#BBF7D0;
  --bl:#2563EB;
  --amb:#CA8A04;--ap:#FFFBEB;--ab:#FDE68A;
  font-family:'Jost',sans-serif;color:var(--kk);
}
.rcv2 .page-tabs{display:flex;gap:0;border-bottom:1px solid var(--bd);background:var(--ww);margin:-40px -40px 0;padding:0 28px}
.rcv2 .ptab{padding:12px 18px;background:transparent;border:none;border-bottom:2px solid transparent;font-family:'Jost',sans-serif;font-size:13px;font-weight:400;color:var(--mt);cursor:pointer;transition:all .12s;margin-bottom:-1px;display:flex;align-items:center;gap:7px}
.rcv2 .ptab:hover{color:var(--kk)}
.rcv2 .ptab.on{color:var(--kk);border-bottom-color:var(--gold);font-weight:500}
.rcv2 .content{padding:32px 4px;max-width:900px}
.rcv2 .page-title{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:400;margin-bottom:5px}
.rcv2 .page-sub{font-size:13px;font-weight:300;color:var(--mt);margin-bottom:28px;line-height:1.6}
.rcv2 .btn{height:36px;padding:0 18px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:500;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:6px;transition:opacity .12s}
.rcv2 .btn-k{background:var(--kk);color:var(--ww)}
.rcv2 .btn-k:hover{opacity:.82}
.rcv2 .btn-g{background:var(--ww);color:var(--kk);border:1px solid var(--bd)}
.rcv2 .btn-g:hover{background:var(--off)}
.rcv2 .btn-sm{height:30px;padding:0 13px;font-size:11.5px}
.rcv2 .fl{display:block;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.08em;color:var(--kk);margin-bottom:7px}
.rcv2 .fi,.rcv2 .fsel{width:100%;height:40px;border:1px solid var(--bd);border-radius:8px;padding:0 12px;font-family:'Jost',sans-serif;font-size:13px;color:var(--kk);background:var(--ww);outline:none;transition:border-color .12s}
.rcv2 .fi:focus,.rcv2 .fsel:focus{border-color:var(--gold)}
.rcv2 .fi::placeholder{color:#ccc}
.rcv2 .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rcv2 .three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.rcv2 .sl{font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:var(--mt);margin-bottom:12px;padding-bottom:9px;border-bottom:1px solid var(--bd)}
.rcv2 .step-card{border:1px solid var(--bd);border-radius:12px;padding:22px 24px;margin-bottom:16px;background:var(--ww)}
.rcv2 .step-card.active{border-color:var(--gold);background:var(--gp)}
.rcv2 .step-header{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.rcv2 .step-num{width:28px;height:28px;border-radius:50%;background:var(--kk);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:13px;color:var(--gold);font-weight:500;flex-shrink:0}
.rcv2 .step-card.active .step-num{background:var(--gold);color:var(--kk)}
.rcv2 .step-title{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:500}
.rcv2 .step-sub{font-size:11.5px;color:var(--mt);margin-top:2px}
.rcv2 .mb-list{display:flex;flex-direction:column;gap:12px;margin-bottom:14px}
.rcv2 .mb-row{background:var(--off);border:1px solid var(--bd);border-radius:10px;padding:16px 18px}
.rcv2 .mb-row-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.rcv2 .mb-row-title{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:500}
.rcv2 .mb-remove{width:26px;height:26px;border:1px solid var(--bd);border-radius:6px;background:var(--ww);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mt);font-size:12px;transition:all .12s}
.rcv2 .mb-remove:hover{background:var(--rp);color:var(--rd);border-color:var(--rb)}
.rcv2 .add-mb-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;border:1.5px dashed var(--bd);border-radius:10px;cursor:pointer;color:var(--mt);font-size:12.5px;background:transparent;width:100%;transition:all .12s;font-family:'Jost',sans-serif}
.rcv2 .add-mb-btn:hover{border-color:var(--gold);color:var(--kk);background:var(--gp)}
.rcv2 .sheet-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rcv2 .sheet-opts.three{grid-template-columns:1fr 1fr 1fr}
.rcv2 .sheet-opt{border:1px solid var(--bd);border-radius:9px;padding:13px 15px;cursor:pointer;transition:all .13s;background:var(--ww)}
.rcv2 .sheet-opt:hover{border-color:var(--ml);background:var(--off)}
.rcv2 .sheet-opt.sel{border-color:var(--gold);background:var(--gp)}
.rcv2 .so-icon{font-size:16px;margin-bottom:6px}
.rcv2 .so-title{font-size:12.5px;font-weight:500;margin-bottom:3px}
.rcv2 .so-desc{font-size:11px;color:var(--mt);line-height:1.5}
.rcv2 .uz-compact{border:1.5px dashed var(--bd);border-radius:9px;padding:18px 16px;text-align:center;cursor:pointer;transition:all .15s;background:var(--ww);position:relative;margin-top:10px}
.rcv2 .uz-compact:hover,.rcv2 .uz-compact.drag{border-color:var(--gold);background:var(--gp)}
.rcv2 .uz-compact.done{border-style:solid;border-color:var(--gold);background:var(--gp)}
.rcv2 .uz-compact input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.rcv2 .uz-icon{font-size:20px;margin-bottom:6px}
.rcv2 .uz-title{font-size:13px;font-weight:500;margin-bottom:3px}
.rcv2 .uz-sub{font-size:11px;color:var(--mt)}
.rcv2 .uz-done-name{font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:500;margin-bottom:2px}
.rcv2 .uz-done-meta{font-size:10.5px;color:var(--mt)}
.rcv2 .sum-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.rcv2 .sum-card{border-radius:10px;padding:16px 18px}
.rcv2 .sum-card.plain{background:var(--off);border:1px solid var(--bd)}
.rcv2 .sum-card.gold{background:var(--gp);border:1px solid var(--gm)}
.rcv2 .sum-card.grn{background:var(--gnp);border:1px solid var(--gnb)}
.rcv2 .sum-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);margin-bottom:7px}
.rcv2 .sum-val{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:500;line-height:1;margin-bottom:2px}
.rcv2 .sum-card.gold .sum-val{color:var(--gold)}
.rcv2 .sum-card.grn .sum-val{color:var(--gn)}
.rcv2 .sum-note{font-size:10.5px;color:var(--mt)}
.rcv2 .attr-table{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:20px}
.rcv2 .attr-table th{text-align:left;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);padding:10px 16px;border-bottom:1px solid var(--bd);background:var(--off)}
.rcv2 .attr-table td{padding:14px 16px;border-bottom:1px solid var(--bd);vertical-align:middle}
.rcv2 .attr-table tr:last-child td{border-bottom:none}
.rcv2 .attr-table tbody tr:hover td{background:var(--off)}
.rcv2 .mb-name-cell{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:500}
.rcv2 .mb-sub2{font-size:10.5px;color:var(--mt);margin-top:2px}
.rcv2 .roas-val{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:500}
.rcv2 .roas-good{color:var(--gn)}
.rcv2 .roas-avg{color:var(--amb)}
.rcv2 .roas-bad{color:var(--rd)}
.rcv2 .mini-bar-wrap{display:flex;align-items:center;gap:7px}
.rcv2 .mini-bar{height:5px;width:60px;border-radius:3px;background:var(--gnp);border:1px solid var(--gnb);overflow:hidden}
.rcv2 .mini-bar-fill{height:100%;background:var(--gn);transition:width .4s ease}
.rcv2 .unmatched-box{background:var(--ap);border:1px solid var(--ab);border-radius:10px;padding:16px 18px;margin-bottom:16px}
.rcv2 .unmatched-title{font-size:12px;font-weight:500;color:var(--amb);margin-bottom:8px}
.rcv2 .unmatched-list{font-size:12px;color:var(--amb);line-height:1.8}
.rcv2 .info-box{background:var(--gp);border:1px solid var(--gm);border-radius:9px;padding:12px 14px;margin-bottom:18px;font-size:12px;color:#7A5E10;line-height:1.6}
.rcv2 .wpills{display:flex;gap:8px}
.rcv2 .wpill{height:34px;padding:0 16px;border-radius:20px;border:1px solid var(--bd);background:var(--ww);font-family:'Jost',sans-serif;font-size:12px;color:var(--mt);cursor:pointer;transition:all .12s}
.rcv2 .wpill:hover{border-color:var(--ml);color:var(--kk)}
.rcv2 .wpill.sel{background:var(--kk);color:var(--ww);border-color:var(--kk)}
.rcv2 .prog-wrap{margin:20px 0}
.rcv2 .prog-lbl{font-size:11px;color:var(--mt);margin-bottom:6px}
.rcv2 .prog-bg{height:3px;background:var(--bd);border-radius:2px;overflow:hidden}
.rcv2 .prog-fill{height:100%;background:var(--gold);border-radius:2px;transition:width .25s}
.rcv2 .ds-card{border:1px solid var(--bd);border-radius:11px;padding:18px 20px;display:flex;align-items:flex-start;gap:14px;transition:background .12s;margin-bottom:12px}
.rcv2 .ds-card:hover{background:var(--off)}
.rcv2 .ds-icon{width:38px;height:38px;border-radius:9px;background:var(--off);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.rcv2 .ds-name{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:500;margin-bottom:3px}
.rcv2 .ds-desc{font-size:12px;color:var(--mt);margin-bottom:6px;line-height:1.5}
.rcv2 .ds-url{font-size:11px;color:var(--bl);text-decoration:none;word-break:break-all}
.rcv2 .ds-actions{display:flex;gap:6px;margin-left:auto;flex-shrink:0}
.rcv2 .ds-btn{width:28px;height:28px;border:1px solid var(--bd);border-radius:6px;background:var(--ww);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mt);font-size:12px;transition:all .12s}
.rcv2 .ds-btn:hover{background:var(--off);color:var(--kk)}
.rcv2 .ds-btn.del:hover{background:var(--rp);color:var(--rd);border-color:var(--rb)}
.rcv2 .ds-status{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:500;padding:2px 8px;border-radius:20px}
.rcv2 .ds-status.live{background:var(--gnp);color:var(--gn);border:1px solid var(--gnb)}
.rcv2 .ds-status.manual{background:var(--off);color:var(--mt);border:1px solid var(--bd)}
.rcv2 .add-ds-form{border:1.5px dashed var(--bd);border-radius:11px;padding:20px 22px}
.rcv2 .add-ds-title{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.1em;color:var(--mt);margin-bottom:14px}
`;

// ───────────── helpers ─────────────
function parseCSV(text: string): string[][] {
  return text.split("\n").map((line) => {
    const cols: string[] = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQ = !inQ;
      else if (c === "," && !inQ) { cols.push(cur.trim().replace(/^"|"$/g, "")); cur = ""; }
      else cur += c;
    }
    cols.push(cur.trim().replace(/^"|"$/g, ""));
    return cols;
  }).filter((r) => r.some((c) => c.trim()));
}
function findCol(headers: string[], kws: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || "").toLowerCase().trim();
    if (kws.some((k) => h.includes(k))) return i;
  }
  return -1;
}
function getHeader(rows: string[][]) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i].join(" ").toLowerCase();
    if (r.includes("email") || r.includes("name") || r.includes("phone")) return { idx: i, headers: rows[i] };
  }
  return { idx: 0, headers: rows[0] || [] };
}
function cleanPhone(p: string) { return (p || "").replace(/['"+ \-()]/g, "").replace(/^91/, "").replace(/^0/, "").trim(); }
function normName(n: string) { return (n || "").toLowerCase().trim().replace(/\s+/g, " "); }
type Person = { name: string; email: string; phone: string };
function extractPeople(rows: string[][]): Person[] {
  const { idx, headers } = getHeader(rows);
  const eC = findCol(headers, ["email", "mail"]);
  const pC = findCol(headers, ["phone", "mobile", "contact", "number", "whatsapp", "mob"]);
  const nC = findCol(headers, ["name", "attendee", "participant", "buyer", "customer", "student"]);
  return rows.slice(idx + 1).map((r) => ({
    name: nC >= 0 ? r[nC] || "" : "",
    email: eC >= 0 ? (r[eC] || "").toLowerCase().trim() : "",
    phone: pC >= 0 ? cleanPhone(r[pC] || "") : "",
  })).filter((p) => p.email || p.phone || p.name);
}
function matchSale(sale: Person, list: Person[]) {
  if (sale.email) { const m = list.find((p) => p.email && p.email === sale.email); if (m) return m; }
  if (sale.phone && sale.phone.length >= 8) { const m = list.find((p) => p.phone && p.phone === sale.phone); if (m) return m; }
  if (sale.name && sale.name.length > 2) {
    const sn = normName(sale.name);
    return list.find((p) => {
      const pn = normName(p.name); if (!pn) return false;
      if (pn === sn) return true;
      const sp = sn.split(" "), pp = pn.split(" ");
      return sp.some((s) => s.length > 3 && pp.some((q) => q === s));
    }) || null;
  }
  return null;
}
const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN");
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const roasClass = (n: number) => (n >= 10 ? "roas-good" : n >= 5 ? "roas-avg" : "roas-bad");

// ───────────── types ─────────────
type SheetMode = "url" | "csv";
type MB = { id: number; name: string; spend: string; leads: string; mode: SheetMode; url: string; fileName?: string; fileMeta?: string; data: string[][] };
type AttrRow = { name: string; spend: number; leads: number; matched: number; revenue: number };
type HistoryRow = { id?: string; campaign: string; date: string; spend: number; revenue: number; sales: number; roas: number };
type DataSource = { id?: string; name: string; type: string; url: string; description: string; status: "live" | "manual"; meta?: string };

const DEAL_VALUE = 118000;

// ───────────── component ─────────────
export default function RoasCalculator() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"attr" | "total" | "sources">("attr");

  return (
    <div className="rcv2">
      <style>{styles}</style>
      <div className="page-tabs">
        <button className={"ptab" + (tab === "attr" ? " on" : "")} onClick={() => setTab("attr")}>Media Buyer Attribution</button>
        <button className={"ptab" + (tab === "total" ? " on" : "")} onClick={() => setTab("total")}>Total ROAS</button>
        <button className={"ptab" + (tab === "sources" ? " on" : "")} onClick={() => setTab("sources")}>Data Sources</button>
      </div>
      <div className="content">
        {tab === "attr" && <AttrTab userId={user?.id} />}
        {tab === "total" && <TotalTab userId={user?.id} />}
        {tab === "sources" && <SourcesTab userId={user?.id} />}
      </div>
    </div>
  );
}

// ===================================================================
// TAB 1: MEDIA BUYER ATTRIBUTION
// ===================================================================
function AttrTab({ userId }: { userId?: string }) {
  const [wbName, setWbName] = useState("");
  const [wbDate, setWbDate] = useState(new Date().toISOString().slice(0, 10));
  const [wbType, setWbType] = useState("1-day");
  const [mbs, setMbs] = useState<MB[]>([{ id: 1, name: "", spend: "", leads: "", mode: "url", url: "", data: [] }]);
  const [salesMode, setSalesMode] = useState<SheetMode>("url");
  const [salesUrl, setSalesUrl] = useState("");
  const [salesData, setSalesData] = useState<string[][]>([]);
  const [salesFile, setSalesFile] = useState<{ name: string; meta: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [progPct, setProgPct] = useState(0);
  const [progLbl, setProgLbl] = useState("");
  const [results, setResults] = useState<{ rows: AttrRow[]; unmatched: Person[]; totals: { spend: number; revenue: number; sales: number; leads: number } } | null>(null);
  const idRef = useRef(2);

  const addMB = () => setMbs((p) => [...p, { id: idRef.current++, name: "", spend: "", leads: "", mode: "url", url: "", data: [] }]);
  const removeMB = (id: number) => setMbs((p) => p.filter((m) => m.id !== id));
  const updateMB = (id: number, patch: Partial<MB>) => setMbs((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const handleMBFile = (id: number, f: File) => {
    const r = new FileReader();
    r.onload = (e) => {
      const rows = parseCSV(String(e.target?.result || ""));
      updateMB(id, {
        data: rows, fileName: f.name,
        fileMeta: (f.size / 1024).toFixed(1) + " KB · " + rows.length + " rows",
        leads: String(Math.max(0, rows.length - 1)),
      });
    };
    r.readAsText(f);
  };
  const handleSalesFile = (f: File) => {
    const r = new FileReader();
    r.onload = (e) => {
      const rows = parseCSV(String(e.target?.result || ""));
      setSalesData(rows);
      setSalesFile({ name: f.name, meta: (f.size / 1024).toFixed(1) + " KB · " + rows.length + " rows" });
    };
    r.readAsText(f);
  };

  const fetchURL = async (url: string): Promise<string[][]> => {
    if (!url.trim()) return [];
    try {
      const res = await fetch(url);
      const text = await res.text();
      return parseCSV(text);
    } catch {
      toast.error("Could not fetch sheet directly. Please export as CSV and upload instead.");
      return [];
    }
  };

  const run = async () => {
    setRunning(true);
    const labels = ["Fetching lead sheets…", "Reading sales data…", "Matching sales to leads…", "Calculating ROAS…", "Preparing results…"];
    let pct = 0, li = 0;
    const iv = setInterval(() => {
      pct += Math.random() * 22 + 6;
      if (pct > 100) pct = 100;
      setProgPct(pct);
      setProgLbl(labels[Math.min(li++, labels.length - 1)]);
    }, 200);

    // collect MB people
    const mbResolved = await Promise.all(mbs.map(async (m) => {
      let rows = m.data;
      if (m.mode === "url" && m.url && rows.length === 0) rows = await fetchURL(m.url);
      const people = rows.length ? extractPeople(rows) : [];
      return { mb: m, people, leads: people.length || (parseInt(m.leads) || 0) };
    }));
    let sales = salesData;
    if (salesMode === "url" && salesUrl && sales.length === 0) sales = await fetchURL(salesUrl);
    const salesPeople = extractPeople(sales);

    const tally: AttrRow[] = mbResolved.map((x) => ({ name: x.mb.name || `Media Buyer ${x.mb.id}`, spend: parseFloat(x.mb.spend) || 0, leads: x.leads, matched: 0, revenue: 0 }));
    const unmatched: Person[] = [];
    salesPeople.forEach((sale) => {
      let attr = false;
      for (let i = 0; i < mbResolved.length; i++) {
        if (matchSale(sale, mbResolved[i].people)) {
          tally[i].matched++; tally[i].revenue += DEAL_VALUE; attr = true; break;
        }
      }
      if (!attr) unmatched.push(sale);
    });

    setTimeout(() => {
      clearInterval(iv); setProgPct(100);
      const totals = {
        spend: tally.reduce((a, b) => a + b.spend, 0),
        revenue: tally.reduce((a, b) => a + b.revenue, 0),
        sales: tally.reduce((a, b) => a + b.matched, 0),
        leads: tally.reduce((a, b) => a + b.leads, 0),
      };
      setResults({ rows: tally, unmatched, totals });
      setRunning(false);
    }, 600);
  };

  const reset = () => {
    setMbs([{ id: 1, name: "", spend: "", leads: "", mode: "url", url: "", data: [] }]);
    setSalesData([]); setSalesFile(null); setSalesUrl("");
    setResults(null); setProgPct(0);
  };

  const exportReport = () => {
    if (!results) return;
    const lines = [
      ["Media Buyer", "Leads", "Matched Sales", "Revenue", "Ad Spend", "CPL", "Conversion Rate", "ROAS"].join(","),
      ...results.rows.map((r) => {
        const cpl = r.leads > 0 ? Math.round(r.spend / r.leads) : 0;
        const cvr = r.leads > 0 ? ((r.matched / r.leads) * 100).toFixed(1) : "0";
        const roas = r.spend > 0 ? (r.revenue / r.spend).toFixed(2) : "0";
        return [r.name, r.leads, r.matched, r.revenue, r.spend, cpl, cvr + "%", roas + "x"].join(",");
      }),
    ].join("\n");
    const blob = new Blob([lines], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `IPC_Attribution_${(wbName || "webinar").replace(/\s+/g, "_")}_${wbDate}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const saveHistory = async () => {
    if (!results || !userId) return;
    const sessionId = crypto.randomUUID();
    const records = results.rows.map((r) => ({
      session_id: sessionId,
      webinar_name: wbName || null,
      webinar_date: wbDate || null,
      webinar_type: wbType,
      media_buyer_name: r.name,
      ad_spend: r.spend,
      total_leads: r.leads,
      matched_sales: r.matched,
      revenue: r.revenue,
      roas_value: r.spend > 0 ? r.revenue / r.spend : 0,
      cpl: r.leads > 0 ? r.spend / r.leads : 0,
      conversion_rate: r.leads > 0 ? (r.matched / r.leads) * 100 : 0,
      created_by: userId,
    }));
    const { error } = await supabase.from("media_buyer_attribution").insert(records);
    if (error) toast.error("Save failed: " + error.message);
    else toast.success("Saved to history ✓");
  };

  return (
    <>
      <div className="page-title">Media Buyer Attribution</div>
      <p className="page-sub">Add your media buyers, link their lead sheets, upload the sales sheet, and enter ad spends. The system matches sales to leads and calculates ROAS for each media buyer.</p>

      {/* STEP 1 */}
      <div className="step-card active">
        <div className="step-header">
          <div className="step-num">1</div>
          <div><div className="step-title">Webinar details</div><div className="step-sub">Tell us which webinar this attribution is for</div></div>
        </div>
        <div className="two-col" style={{ marginBottom: 14 }}>
          <div><label className="fl">Webinar name</label><input className="fi" value={wbName} onChange={(e) => setWbName(e.target.value)} placeholder="e.g. Learn 6 Secrets to ₹1 Crore Turnover" /></div>
          <div><label className="fl">Webinar date</label><input className="fi" type="date" value={wbDate} onChange={(e) => setWbDate(e.target.value)} /></div>
        </div>
        <div>
          <label className="fl">Webinar type</label>
          <div className="wpills">
            {[["1-day", "1 Day"], ["2-day", "2 Days"], ["3-day", "3 Days"], ["series", "Series"]].map(([v, l]) => (
              <button key={v} className={"wpill" + (wbType === v ? " sel" : "")} onClick={() => setWbType(v)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* STEP 2 */}
      <div className="step-card">
        <div className="step-header">
          <div className="step-num">2</div>
          <div><div className="step-title">Media buyers & lead sheets</div><div className="step-sub">Add each media buyer and connect their lead source</div></div>
        </div>
        <div className="mb-list">
          {mbs.map((m, idx) => (
            <div className="mb-row" key={m.id}>
              <div className="mb-row-head">
                <div className="mb-row-title">Media Buyer {idx + 1}</div>
                <button className="mb-remove" onClick={() => removeMB(m.id)} title="Remove">✕</button>
              </div>
              <div className="three-col" style={{ marginBottom: 14 }}>
                <div><label className="fl">Media buyer name</label><input className="fi" value={m.name} onChange={(e) => updateMB(m.id, { name: e.target.value })} placeholder="e.g. Priya Kapoor" /></div>
                <div><label className="fl">Ad spend (₹)</label><input className="fi" type="number" value={m.spend} onChange={(e) => updateMB(m.id, { spend: e.target.value })} placeholder="e.g. 25000" /></div>
                <div><label className="fl">Total leads generated</label><input className="fi" type="number" value={m.leads} onChange={(e) => updateMB(m.id, { leads: e.target.value })} placeholder="Auto-filled from sheet" style={{ background: "#F7F6F3" }} /></div>
              </div>
              <label className="fl">Lead sheet source</label>
              <div className="sheet-opts">
                <div className={"sheet-opt" + (m.mode === "url" ? " sel" : "")} onClick={() => updateMB(m.id, { mode: "url" })}>
                  <div className="so-icon">🔗</div><div className="so-title">Google Sheet URL</div><div className="so-desc">Paste published sheet link for live fetch</div>
                </div>
                <div className={"sheet-opt" + (m.mode === "csv" ? " sel" : "")} onClick={() => updateMB(m.id, { mode: "csv" })}>
                  <div className="so-icon">📄</div><div className="so-title">Upload CSV</div><div className="so-desc">Export and upload the lead sheet as CSV</div>
                </div>
              </div>
              {m.mode === "url" ? (
                <div style={{ marginTop: 10 }}>
                  <input className="fi" value={m.url} onChange={(e) => updateMB(m.id, { url: e.target.value })} placeholder="Paste Google Sheet published CSV URL…" />
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>Sheet → File → Share → Publish to web → CSV</div>
                </div>
              ) : (
                <UploadZone done={!!m.fileName} fileName={m.fileName} fileMeta={m.fileMeta}
                  onFile={(f) => handleMBFile(m.id, f)} idleIcon="📄" idleTitle="Drop lead sheet CSV here" idleSub="Any format — auto-detected" />
              )}
            </div>
          ))}
        </div>
        <button className="add-mb-btn" onClick={addMB}>+ Add another media buyer</button>
      </div>

      {/* STEP 3 */}
      <div className="step-card">
        <div className="step-header">
          <div className="step-num">3</div>
          <div><div className="step-title">Sales sheet</div><div className="step-sub">The final list of people who purchased — manually entered by your team</div></div>
        </div>
        <div className="info-box">📋 <strong>How matching works:</strong> The system matches sales to leads using email first, phone number second, and name third. Even if names are spelled differently, phone matching will catch them. Unmatched sales will be shown separately so you can review them manually.</div>
        <div className="sheet-opts">
          <div className={"sheet-opt" + (salesMode === "url" ? " sel" : "")} onClick={() => setSalesMode("url")}>
            <div className="so-icon">🔗</div><div className="so-title">Google Sheet URL</div><div className="so-desc">Fetch sales data live — works with manual rows and gaps</div>
          </div>
          <div className={"sheet-opt" + (salesMode === "csv" ? " sel" : "")} onClick={() => setSalesMode("csv")}>
            <div className="so-icon">📄</div><div className="so-title">Upload CSV</div><div className="so-desc">Export your sales sheet and upload manually</div>
          </div>
        </div>
        {salesMode === "url" ? (
          <div style={{ marginTop: 10 }}>
            <input className="fi" value={salesUrl} onChange={(e) => setSalesUrl(e.target.value)} placeholder="Paste Google Sheet published CSV URL…" />
            <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>Works with manually entered data and gaps between rows</div>
          </div>
        ) : (
          <UploadZone done={!!salesFile} fileName={salesFile?.name} fileMeta={salesFile?.meta}
            onFile={handleSalesFile} idleIcon="📊" idleTitle="Drop sales sheet CSV here" idleSub="Any format — system auto-detects name, email, phone columns" />
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <button className="btn btn-k" onClick={run} disabled={running}>★ Calculate attribution</button>
        <button className="btn btn-g" onClick={reset}>Clear all</button>
      </div>

      {running && (
        <div className="prog-wrap">
          <div className="prog-lbl">{progLbl}</div>
          <div className="prog-bg"><div className="prog-fill" style={{ width: progPct + "%" }} /></div>
        </div>
      )}

      {results && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 400 }}>Attribution Results</div>
            <div style={{ display: "flex", gap: 7 }}>
              <button className="btn btn-g btn-sm" onClick={exportReport}>Export report</button>
              <button className="btn btn-k btn-sm" onClick={saveHistory}>Save to history</button>
            </div>
          </div>
          <div className="sum-row">
            <SumCard kind="gold" label="Overall ROAS" value={results.totals.spend > 0 ? (results.totals.revenue / results.totals.spend).toFixed(2) + "×" : "—"} note="Total revenue / total spend" />
            <SumCard kind="plain" label="Total leads" value={results.totals.leads.toLocaleString("en-IN")} note="Across all media buyers" />
            <SumCard kind="grn" label="Total sales" value={String(results.totals.sales)} note={inr(results.totals.revenue)} />
            <SumCard kind="plain" label="Total ad spend" value={inr(results.totals.spend)} note="All media buyers combined" />
          </div>
          {results.unmatched.length > 0 && (
            <div className="unmatched-box">
              <div className="unmatched-title">⚠ {results.unmatched.length} sales could not be matched to any media buyer</div>
              <div className="unmatched-list">
                {results.unmatched.slice(0, 5).map((p, i) => (<div key={i}>• {p.name || "Unknown"} ({p.email || p.phone || "no contact info"})</div>))}
                {results.unmatched.length > 5 && <div>…and {results.unmatched.length - 5} more</div>}
              </div>
              <div style={{ fontSize: 11, color: "#CA8A04", marginTop: 8 }}>These may be direct sales or leads from an unlisted source. Review manually.</div>
            </div>
          )}
          <div className="sl">Per media buyer breakdown</div>
          <table className="attr-table">
            <thead><tr><th>Media Buyer</th><th>Leads</th><th>Matched Sales</th><th>Revenue</th><th>Ad Spend</th><th>CPL</th><th>Conv. Rate</th><th>ROAS</th></tr></thead>
            <tbody>
              {results.rows.map((r, i) => {
                const roasN = r.spend > 0 ? r.revenue / r.spend : 0;
                const cpl = r.leads > 0 ? "₹" + Math.round(r.spend / r.leads).toLocaleString("en-IN") : "—";
                const cvr = r.leads > 0 ? ((r.matched / r.leads) * 100).toFixed(1) + "%" : "—";
                const barPct = results.totals.sales > 0 ? (r.matched / results.totals.sales) * 100 : 0;
                return (
                  <tr key={i}>
                    <td><div className="mb-name-cell">{r.name}</div><div className="mb-sub2">{r.leads} leads · ₹{r.spend.toLocaleString("en-IN")} spent</div></td>
                    <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500 }}>{r.leads}</td>
                    <td><div className="mini-bar-wrap"><div className="mini-bar"><div className="mini-bar-fill" style={{ width: barPct + "%" }} /></div><span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500 }}>{r.matched}</span></div></td>
                    <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500, color: "#16A34A" }}>{inr(r.revenue)}</td>
                    <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500 }}>{inr(r.spend)}</td>
                    <td style={{ fontSize: 13, color: "#888" }}>{cpl}</td>
                    <td style={{ fontSize: 13, color: "#888" }}>{cvr}</td>
                    <td><span className={"roas-val " + roasClass(roasN)}>{r.spend > 0 ? (r.revenue / r.spend).toFixed(2) + "×" : "—"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: "#888", lineHeight: 1.6, padding: "12px 16px", background: "#F7F6F3", borderRadius: 8 }}>
            <strong style={{ color: "#0a0a0a" }}>Matching method used:</strong> Email → Phone → Name (fuzzy). Each sale is attributed to the first media buyer whose lead sheet contains a matching record.
          </div>
        </div>
      )}
    </>
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

function UploadZone({ done, fileName, fileMeta, onFile, idleIcon, idleTitle, idleSub }: {
  done: boolean; fileName?: string; fileMeta?: string; onFile: (f: File) => void; idleIcon: string; idleTitle: string; idleSub: string;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className={"uz-compact" + (drag ? " drag" : "") + (done ? " done" : "")}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
      <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {done ? (
        <div><div className="uz-icon">✅</div><div className="uz-done-name">{fileName}</div><div className="uz-done-meta">{fileMeta}</div></div>
      ) : (
        <div><div className="uz-icon">{idleIcon}</div><div className="uz-title">{idleTitle}</div><div className="uz-sub">{idleSub}</div></div>
      )}
    </div>
  );
}

// ===================================================================
// TAB 2: TOTAL ROAS
// ===================================================================
function TotalTab({ userId }: { userId?: string }) {
  const [spend, setSpend] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"url" | "csv" | "manual">("url");
  const [url, setUrl] = useState("");
  const [salesCount, setSalesCount] = useState("");
  const [revenue, setRevenue] = useState("");
  const [csvFile, setCsvFile] = useState<{ name: string; meta: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("roas_history").select("*").order("created_at", { ascending: false }).limit(50);
      setHistory((data || []).map((r: any) => ({
        id: r.id, campaign: r.campaign_name, date: r.created_at,
        spend: Number(r.total_ad_spend), revenue: Number(r.total_revenue || 0),
        sales: Number(r.total_sales || 0), roas: Number(r.roas_value || 0),
      })));
    })();
  }, []);

  const s = parseFloat(spend) || 0;
  const r = parseFloat(revenue) || 0;
  const c = parseFloat(salesCount) || 0;
  const roasN = s > 0 ? r / s : 0;

  const handleCsv = (f: File) => {
    const rd = new FileReader();
    rd.onload = (e) => {
      const rows = parseCSV(String(e.target?.result || ""));
      const valid = rows.slice(1);
      const cnt = valid.length;
      setCsvFile({ name: f.name, meta: (f.size / 1024).toFixed(1) + " KB · " + rows.length + " rows" });
      setSalesCount(String(cnt));
      setRevenue(String(cnt * DEAL_VALUE));
    };
    rd.readAsText(f);
  };
  const fetchSheet = async () => {
    if (!url.trim()) return;
    try {
      const res = await fetch(url); const text = await res.text();
      const rows = parseCSV(text);
      const cnt = Math.max(0, rows.length - 1);
      setSalesCount(String(cnt));
      setRevenue(String(cnt * DEAL_VALUE));
      toast.success("Fetched " + cnt + " sales");
    } catch { toast.error("Could not fetch sheet. Use Upload CSV instead."); }
  };

  const save = async () => {
    if (!s) { toast.error("Please enter ad spend first"); return; }
    if (!userId) return;
    const row = {
      campaign_name: name || "Unnamed campaign",
      webinar_date: new Date().toISOString().slice(0, 10),
      total_ad_spend: s, total_revenue: r, total_sales: c, roas_value: roasN, created_by: userId,
    };
    const { data, error } = await supabase.from("roas_history").insert(row).select().single();
    if (error) { toast.error(error.message); return; }
    setHistory((p) => [{ id: data.id, campaign: row.campaign_name, date: data.created_at, spend: s, revenue: r, sales: c, roas: roasN }, ...p]);
    toast.success("Saved to history ✓");
  };

  return (
    <>
      <div className="page-title">Total ROAS</div>
      <p className="page-sub">Calculate the overall return on ad spend for the entire webinar — all media buyers combined, all revenue against all spend.</p>

      <div className="step-card active">
        <div className="step-header"><div className="step-num">1</div><div><div className="step-title">Ad spend</div><div className="step-sub">Enter the total combined ad spend across all media buyers</div></div></div>
        <div className="two-col">
          <div><label className="fl">Total ad spend (₹)</label><input className="fi" type="number" value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="e.g. 75000" /></div>
          <div><label className="fl">Webinar / campaign name</label><input className="fi" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Day 1 — 5 May 2026" /></div>
        </div>
      </div>

      <div className="step-card">
        <div className="step-header"><div className="step-num">2</div><div><div className="step-title">Sales data</div><div className="step-sub">Connect your sales sheet or enter revenue manually</div></div></div>
        <div className="sheet-opts three" style={{ marginBottom: 14 }}>
          <div className={"sheet-opt" + (mode === "url" ? " sel" : "")} onClick={() => setMode("url")}><div className="so-icon">🔗</div><div className="so-title">Google Sheet URL</div><div className="so-desc">Fetch sales data live from your Google Sheet</div></div>
          <div className={"sheet-opt" + (mode === "csv" ? " sel" : "")} onClick={() => setMode("csv")}><div className="so-icon">📄</div><div className="so-title">Upload CSV</div><div className="so-desc">Upload exported sales sheet CSV</div></div>
          <div className={"sheet-opt" + (mode === "manual" ? " sel" : "")} onClick={() => setMode("manual")}><div className="so-icon">✏️</div><div className="so-title">Enter manually</div><div className="so-desc">Type in total sales count and revenue directly</div></div>
        </div>
        {mode === "url" && (
          <>
            <input className="fi" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste published Google Sheet CSV URL…" />
            <div style={{ fontSize: 11, color: "#888", marginTop: 6, marginBottom: 8 }}>System will count rows and sum revenue column automatically</div>
            <button className="btn btn-g btn-sm" onClick={fetchSheet}>Fetch sheet</button>
          </>
        )}
        {mode === "csv" && (
          <UploadZone done={!!csvFile} fileName={csvFile?.name} fileMeta={csvFile?.meta} onFile={handleCsv}
            idleIcon="📊" idleTitle="Drop sales CSV here" idleSub="Any format" />
        )}
        {mode === "manual" && (
          <div className="two-col" style={{ marginTop: 10 }}>
            <div><label className="fl">Number of sales</label><input className="fi" type="number" value={salesCount} onChange={(e) => setSalesCount(e.target.value)} placeholder="e.g. 22" /></div>
            <div><label className="fl">Total revenue (₹)</label><input className="fi" type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="e.g. 2596000" /></div>
          </div>
        )}
      </div>

      <div className="sum-row" style={{ marginTop: 4 }}>
        <div className="sum-card gold">
          <div className="sum-lbl">ROAS</div>
          <div className={"sum-val " + (s > 0 && r > 0 ? roasClass(roasN) : "")} style={{ color: s > 0 && r > 0 ? undefined : "#C8A84B" }}>{s > 0 && r > 0 ? roasN.toFixed(2) + "×" : "—"}</div>
          <div className="sum-note">{roasN >= 10 ? "Excellent return" : roasN >= 5 ? "Healthy return" : roasN > 0 ? "Below target" : "Updates live as you type"}</div>
        </div>
        <SumCard kind="plain" label="Total revenue" value={r > 0 ? inr(r) : "—"} note="From sales sheet" />
        <SumCard kind="plain" label="Total sales" value={c > 0 ? String(c) : "—"} note="Confirmed conversions" />
        <SumCard kind="plain" label="Cost per acquisition" value={c > 0 && s > 0 ? "₹" + Math.round(s / c).toLocaleString("en-IN") : "—"} note="Ad spend / sales count" />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button className="btn btn-k" onClick={() => { /* live, just refresh */ }}>Calculate</button>
        <button className="btn btn-g" onClick={save}>Save to history</button>
      </div>

      <div style={{ marginTop: 28 }}>
        <div className="sl">Calculation history</div>
        <table className="attr-table">
          <thead><tr><th>Campaign</th><th>Date</th><th>Ad Spend</th><th>Revenue</th><th>Sales</th><th>ROAS</th></tr></thead>
          <tbody>
            {history.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "#888", padding: 24 }}>No calculations yet. Save your first one above.</td></tr>
            )}
            {history.map((h) => (
              <tr key={h.id}>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, fontWeight: 500 }}>{h.campaign}</td>
                <td style={{ fontSize: 12, color: "#888" }}>{fmtDate(h.date)}</td>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>{inr(h.spend)}</td>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: "#16A34A" }}>{inr(h.revenue)}</td>
                <td style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15 }}>{h.sales}</td>
                <td><span className={"roas-val " + roasClass(h.roas)}>{h.roas.toFixed(1)}×</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===================================================================
// TAB 3: DATA SOURCES
// ===================================================================
function SourcesTab({ userId }: { userId?: string }) {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("lead_sheet");
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");

  const load = async () => {
    const { data } = await supabase.from("data_sources").select("*").order("created_at", { ascending: false });
    setSources((data || []).map((d: any) => ({
      id: d.id, name: d.source_name, type: d.source_type, url: d.sheet_url, description: d.description,
      status: d.status, meta: d.last_fetched ? `Last used: ${fmtDate(d.last_fetched)} · ${d.row_count || 0} rows` : "Never used",
    })));
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim() || !url.trim() || !userId) { toast.error("Name and URL are required"); return; }
    const { error } = await supabase.from("data_sources").insert({
      source_name: name, source_type: type, sheet_url: url, description: desc, status: "manual", created_by: userId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Data source added ✓");
    setName(""); setUrl(""); setDesc(""); setType("lead_sheet");
    load();
  };
  const remove = async (id?: string) => {
    if (!id) return;
    const { error } = await supabase.from("data_sources").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setSources((p) => p.filter((s) => s.id !== id));
  };

  return (
    <>
      <div className="page-title">Data Sources</div>
      <p className="page-sub">Manage all connected Google Sheets and data sources used across the ROAS Calculator. Link a sheet once here and reuse it every time you run attribution.</p>

      <div className="sl">Connected sources</div>
      <div style={{ marginBottom: 20 }}>
        {sources.length === 0 && <div style={{ color: "#888", fontSize: 13, padding: "16px 0" }}>No data sources yet. Add your first one below.</div>}
        {sources.map((s) => (
          <div className="ds-card" key={s.id}>
            <div className="ds-icon">{s.type === "sales_sheet" ? "📋" : "📊"}</div>
            <div style={{ flex: 1 }}>
              <div className="ds-name">{s.name}</div>
              <div className="ds-desc">{s.description || "—"}</div>
              <a className="ds-url" href={s.url} target="_blank" rel="noreferrer">🔗 {s.url.length > 60 ? s.url.slice(0, 60) + "…" : s.url}</a>
              <div style={{ marginTop: 7, display: "flex", gap: 7, alignItems: "center" }}>
                <span className={"ds-status " + s.status}>{s.status === "live" ? "● Live sync" : "Manual entry"}</span>
                <span style={{ fontSize: 11, color: "#888" }}>{s.meta}</span>
              </div>
            </div>
            <div className="ds-actions">
              <button className="ds-btn del" onClick={() => remove(s.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="add-ds-form">
        <div className="add-ds-title">Add new data source</div>
        <div className="two-col" style={{ marginBottom: 12 }}>
          <div><label className="fl">Source name</label><input className="fi" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul Singh — Lead Sheet" /></div>
          <div><label className="fl">Source type</label>
            <select className="fsel" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="lead_sheet">Lead Sheet (media buyer)</option>
              <option value="sales_sheet">Sales Sheet (manual)</option>
              <option value="registration">Registration Sheet</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="fl">Google Sheet URL (published as CSV)</label>
          <input className="fi" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste published CSV URL here…" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="fl">Description</label>
          <input className="fi" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Briefly describe what this sheet contains and which media buyer or team it belongs to…" />
        </div>
        <button className="btn btn-k" onClick={add}>Add data source</button>
      </div>
    </>
  );
}
