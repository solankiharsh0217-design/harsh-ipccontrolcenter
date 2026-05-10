import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";

/* ============================================================
   Seminar ROAS Calculator (5-step wizard)
   ============================================================ */

const inr = (n: number | null | undefined) =>
  n == null || !isFinite(Number(n)) ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const num = (n: number | null | undefined) =>
  n == null || !isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-IN");
const pctFmt = (n: number | null | undefined) =>
  n == null || !isFinite(Number(n)) ? "—" : Number(n).toFixed(2) + "%";

// ---------- time helpers ----------
function parseTime(t: string): number | null {
  if (!t) return null;
  const s = t.trim().toUpperCase().replace(/\s+/g, " ");
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
function formatTime(mins: number | null): string {
  if (mins == null || !isFinite(mins)) return "—";
  let m = ((mins % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60);
  const mi = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2, "0")} ${ap}`;
}
function durationMin(start: string, end: string): number | null {
  const a = parseTime(start), b = parseTime(end);
  if (a == null || b == null) return null;
  return b >= a ? b - a : 1440 - a + b;
}

function Info({ title, body }: { title: string; body: string }) {
  return (
    <span className="srInfo" tabIndex={0} aria-label={title}>
      i
      <span className="srInfoPop">
        <strong>{title}</strong>
        <span>{body}</span>
      </span>
    </span>
  );
}

const STYLES = `
.srWiz{font-family:'Jost',sans-serif;color:var(--kk)}
.srStepper{display:flex;gap:8px;margin-bottom:22px;flex-wrap:wrap}
.srStepDot{display:flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid var(--bd);border-radius:999px;background:var(--ww);font-size:12px;color:var(--mt);cursor:pointer}
.srStepDot.on{background:var(--gp);border-color:var(--gold);color:var(--kk);font-weight:500}
.srStepDot.done{color:var(--kk)}
.srStepDot .n{width:20px;height:20px;border-radius:50%;background:var(--off);font-family:'Cormorant Garamond',serif;display:inline-flex;align-items:center;justify-content:center;font-size:11px}
.srStepDot.on .n{background:var(--gold);color:var(--kk)}
.srSection{border:1px solid var(--bd);border-radius:12px;padding:22px 24px;margin-bottom:14px;background:var(--ww)}
.srGrid{display:grid;gap:14px}
.srGrid.c2{grid-template-columns:1fr 1fr}
.srGrid.c3{grid-template-columns:1fr 1fr 1fr}
.srGrid.c4{grid-template-columns:repeat(4,1fr)}
@media (max-width:780px){.srGrid.c2,.srGrid.c3,.srGrid.c4{grid-template-columns:1fr}}
.srLbl{display:flex;align-items:center;gap:6px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--kk);margin-bottom:7px;font-weight:500}
.srInput{width:100%;height:40px;border:1px solid var(--bd);border-radius:8px;padding:0 12px;font-family:'Jost',sans-serif;font-size:13px;background:var(--ww);outline:none}
.srInput:focus{border-color:var(--gold)}
.srSelect{width:100%;height:40px;border:1px solid var(--bd);border-radius:8px;padding:0 12px;font-family:'Jost',sans-serif;font-size:13px;background:var(--ww)}
.srPills{display:flex;gap:8px;flex-wrap:wrap}
.srPill{height:34px;padding:0 16px;border-radius:20px;border:1px solid var(--bd);background:var(--ww);font-size:12px;color:var(--mt);cursor:pointer;font-family:'Jost',sans-serif}
.srPill.on{background:var(--kk);color:var(--ww);border-color:var(--kk)}
.srHelper{font-size:11px;color:var(--mt);margin-top:6px;line-height:1.5}
.srInfo{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:var(--off);border:1px solid var(--bd);color:var(--mt);font-size:9px;font-style:italic;font-family:Georgia,serif;cursor:help;position:relative}
.srInfo:hover .srInfoPop,.srInfo:focus .srInfoPop{opacity:1;visibility:visible;transform:translateY(0)}
.srInfoPop{position:absolute;left:50%;top:calc(100% + 8px);transform:translateY(-4px);min-width:240px;max-width:300px;background:#0a0a0a;color:#fff;font-style:normal;font-family:'Jost',sans-serif;padding:10px 12px;border-radius:8px;font-size:11.5px;line-height:1.5;z-index:50;opacity:0;visibility:hidden;transition:all .15s;pointer-events:none;text-align:left;white-space:normal;font-weight:400;letter-spacing:0;text-transform:none;box-shadow:0 6px 18px rgba(0,0,0,.2);margin-left:-120px}
.srInfoPop strong{display:block;color:var(--gold);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px;font-weight:500}
.srDayCard{border:1px solid var(--bd);border-radius:10px;padding:16px 18px;background:var(--off);margin-bottom:10px}
.srDayCard.sales{background:var(--gp);border-color:var(--gm)}
.srDayHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px}
.srDayTitle{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:500}
.srBadge{font-size:10px;padding:3px 10px;border-radius:10px;background:var(--gold);color:#0a0a0a;text-transform:uppercase;letter-spacing:.06em;font-family:'Jost',sans-serif;font-weight:500}
.srMetric{font-size:11.5px;color:var(--mt);margin-top:10px;display:flex;flex-wrap:wrap;gap:14px}
.srMetric strong{color:var(--kk);font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:500}
.srBtnRow{display:flex;gap:10px;justify-content:space-between;margin-top:18px}
.srBtn{height:38px;padding:0 18px;border-radius:8px;font-family:'Jost',sans-serif;font-size:12.5px;font-weight:500;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:6px}
.srBtn-k{background:var(--kk);color:var(--ww)}
.srBtn-g{background:var(--ww);color:var(--kk);border:1px solid var(--bd)}
.srBtn-d{background:var(--ww);color:var(--rd);border:1px solid var(--rb)}
.srBtn:disabled{opacity:.4;cursor:not-allowed}
.srSumGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
@media (max-width:780px){.srSumGrid{grid-template-columns:1fr 1fr}}
.srSumCard{border-radius:10px;padding:16px 18px;border:1px solid var(--bd);background:var(--off)}
.srSumCard.gold{background:var(--gp);border-color:var(--gm)}
.srSumCard.grn{background:var(--gnp);border-color:var(--gnb)}
.srSumLbl{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--mt);margin-bottom:6px}
.srSumVal{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:500;line-height:1.1}
.srSumCard.gold .srSumVal{color:var(--gold)}
.srSumCard.grn .srSumVal{color:var(--gn)}
.srSumNote{font-size:10.5px;color:var(--mt);margin-top:4px}
.srTbl{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
.srTbl th,.srTbl td{padding:10px 12px;border-bottom:1px solid var(--bd);text-align:left}
.srTbl th{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--mt);background:var(--off)}
.srProdGrid{display:grid;grid-template-columns:minmax(0,2.2fr) 90px minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1.2fr) 36px;gap:10px;align-items:center}
@media (max-width:900px){.srProdGrid{grid-template-columns:1fr 1fr;gap:10px}}
.srProdHead{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--mt);padding:0 4px 6px;align-items:end}
.srProdRow{margin-bottom:10px}
.srRm{height:40px;width:36px;border:1px solid var(--bd);background:var(--ww);border-radius:8px;color:var(--mt);cursor:pointer}
.srRm:hover{background:var(--rp);color:var(--rd);border-color:var(--rb)}
.srAddBtn{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border:1.5px dashed var(--bd);border-radius:10px;cursor:pointer;color:var(--mt);font-size:12.5px;background:transparent;width:100%;font-family:'Jost',sans-serif}
.srAddBtn:hover{border-color:var(--gold);color:var(--kk);background:var(--gp)}
.srHint{background:var(--gp);border:1px solid var(--gm);border-radius:9px;padding:10px 14px;font-size:12px;color:#7A5E10;margin-bottom:14px}
.srErr{font-size:11px;color:var(--rd);margin-top:4px}
.srRO{background:var(--off);display:flex;align-items:center}
`;

const WATCH_PRESETS = [50, 60, 70, 75, 80];
const DAY_PRESETS = [1, 2, 3];
const MODE_OPTS = ["Live", "Automated", "Replay", "Hybrid", "Custom"];
const DEFAULT_PAYMENT_TYPES = [
  "Full Payment Sale", "Part Payment Sale", "Token Payment", "Down Payment",
  "Diamond Sale", "₹15,000 Product", "₹10,000 Product",
];
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 15) out.push(formatTime(m));
  return out;
})();

type ConvBasis = "offer_show_up" | "show_up" | "registrations";
const CONV_BASIS_LABEL: Record<ConvBasis, string> = {
  offer_show_up: "Offer Show-Up",
  show_up: "Show-Up",
  registrations: "Registrations",
};

type DayRow = {
  date: string;
  startTime: string;
  endTime: string;
  registrations: string;
  showUp: string;
  watchOrOffer: string;
};
type ProductRow = {
  type: string;
  units: string;
  price: string;
  token: string;
};

const emptyDay = (s = "", e = ""): DayRow => ({ date: "", startTime: s, endTime: e, registrations: "", showUp: "", watchOrOffer: "" });
const emptyProd = (): ProductRow => ({ type: "", units: "", price: "", token: "" });

const DRAFT_KEY = "seminar_roas_draft_v2";

type Props = { onBack?: () => void; loadReportId?: string | null; };

export default function SeminarRoasCalculator({ onBack, loadReportId }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1
  const [webinarName, setWebinarName] = useState("");
  const [webinarMode, setWebinarMode] = useState("Live");
  const [totalDays, setTotalDays] = useState<number>(2);
  const [watchPct, setWatchPct] = useState<number>(70);
  const [salesDay, setSalesDay] = useState<number>(0);
  const [salesDayError, setSalesDayError] = useState(false);
  const [defaultStart, setDefaultStart] = useState("10:30 AM");
  const [defaultEnd, setDefaultEnd] = useState("3:30 PM");
  const [timingNote, setTimingNote] = useState("");
  const [convBasis, setConvBasis] = useState<ConvBasis>("offer_show_up");

  // Step 2
  const [days, setDays] = useState<DayRow[]>([emptyDay("10:30 AM", "3:30 PM"), emptyDay("10:30 AM", "3:30 PM")]);

  // Step 3
  const [adCostExGst, setAdCostExGst] = useState("");

  // Step 4
  const [revenueBasis, setRevenueBasis] = useState<"full_deal_value" | "token_collected_amount">("full_deal_value");
  const [products, setProducts] = useState<ProductRow[]>([emptyProd()]);

  const [editingId, setEditingId] = useState<string | null>(loadReportId || null);
  const [saving, setSaving] = useState(false);
  const [draftBanner, setDraftBanner] = useState(false);
  const draftLoadedRef = useRef(false);
  const setSalesDayManual = useCallback((d: number) => { setSalesDayError(false); setSalesDay(d); }, []);

  // ----- derived: keep days array sized to totalDays. Do NOT auto-pick salesDay. -----
  useEffect(() => {
    setDays((prev) => {
      const next = prev.slice(0, totalDays);
      while (next.length < totalDays) next.push(emptyDay());
      return next;
    });
    if (salesDay > totalDays) setSalesDay(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalDays]);


  // Draft load
  useEffect(() => {
    if (loadReportId) {
      void loadReport(loadReportId);
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.webinarName) setDraftBanner(true);
      }
    } catch {}
    draftLoadedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      setWebinarName(d.webinarName || "");
      setWebinarMode(d.webinarMode || "Live");
      setTotalDays(d.totalDays || 2);
      setWatchPct(d.watchPct ?? 70);
      setSalesDay(d.salesDay || 0);
      setDefaultStart(d.defaultStart || "10:30 AM");
      setDefaultEnd(d.defaultEnd || "3:30 PM");
      setTimingNote(d.timingNote || "");
      setConvBasis(d.convBasis || "offer_show_up");
      setDays(d.days || [emptyDay("10:30 AM", "3:30 PM"), emptyDay("10:30 AM", "3:30 PM")]);
      setAdCostExGst(d.adCostExGst || "");
      setRevenueBasis(d.revenueBasis === "token_collected_amount" ? "token_collected_amount" : "full_deal_value");
      setProducts(d.products?.length ? d.products : [emptyProd()]);
      setStep(d.step || 1);
      setDraftBanner(false);
      toast.success("Previous draft restored");
    } catch {
      setDraftBanner(false);
    }
  };

  const startFresh = () => {
    if (!confirm("Discard the saved draft and start fresh?")) return;
    localStorage.removeItem(DRAFT_KEY);
    setDraftBanner(false);
  };

  // Autosave
  useEffect(() => {
    if (!draftLoadedRef.current || draftBanner || editingId) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          step, webinarName, webinarMode, totalDays, watchPct, salesDay,
          defaultStart, defaultEnd, timingNote, convBasis, days, adCostExGst, revenueBasis, products,
        }));
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [step, webinarName, webinarMode, totalDays, watchPct, salesDay,
      defaultStart, defaultEnd, timingNote, convBasis, days, adCostExGst, revenueBasis, products, draftBanner, editingId]);

  // Per-day computed timing
  const dayTimings = useMemo(() => {
    return days.map((d) => {
      const dur = durationMin(d.startTime, d.endTime);
      const startMin = parseTime(d.startTime);
      const wpMin = (dur != null) ? Math.round(dur * (watchPct / 100)) : null;
      const wpTime = (wpMin != null && startMin != null) ? formatTime(startMin + wpMin) : "—";
      return { dur, wpMin, wpTime };
    });
  }, [days, watchPct]);

  // Calculations
  const calc = useMemo(() => {
    const hasSalesDay = salesDay >= 1 && salesDay <= totalDays;
    const sIdx = hasSalesDay ? salesDay - 1 : -1;
    const sDay = sIdx >= 0 ? days[sIdx] : undefined;

    const regs = Number(sDay?.registrations || 0);
    const showUp = Number(sDay?.showUp || 0);
    const offerShowUp = Number(sDay?.watchOrOffer || 0);

    const totalRegsAll = days.reduce((a, d) => a + Number(d.registrations || 0), 0);

    const adCost = Number(adCostExGst || 0);
    const adGst = adCost * 0.18;
    const adInc = adCost * 1.18;

    const totalUnits = products.reduce((a, p) => a + Number(p.units || 0), 0);
    const totalRev = products.reduce((a, p) => {
      const units = Number(p.units || 0);
      const price = Number(p.price || 0);
      const tok = p.token === "" ? null : Number(p.token);
      const rev = (revenueBasis === "token_collected_amount" && tok != null && tok > 0)
        ? units * tok
        : units * price;
      return a + rev;
    }, 0);

    const outputGst = totalRev * 18 / 118;
    const inputGstCredit = adGst;
    const netGstRaw = outputGst - inputGstCredit;
    const netGst = Math.max(0, netGstRaw);
    const excessCredit = netGstRaw < 0 ? Math.abs(netGstRaw) : 0;

    const profit = totalRev - netGst - adInc;
    const cpl = totalRegsAll > 0 ? adCost / totalRegsAll : (regs > 0 ? adCost / regs : null);
    const costShowUp = showUp > 0 ? adCost / showUp : null;
    const costOfferSU = offerShowUp > 0 ? adCost / offerShowUp : null;
    const cpa = totalUnits > 0 ? adCost / totalUnits : null;
    const roas = adInc > 0 ? totalRev / adInc : null;

    let convDenom: number = 0;
    if (convBasis === "registrations") convDenom = regs;
    else if (convBasis === "show_up") convDenom = showUp;
    else convDenom = offerShowUp;
    const convRate = convDenom > 0 && totalUnits > 0 ? (totalUnits / convDenom) * 100 : null;

    return {
      regs, showUp, offerShowUp, totalRegsAll,
      adCost, adGst, adInc,
      totalUnits, totalRev,
      outputGst, inputGstCredit, netGst, excessCredit, profit,
      cpl, costShowUp, costOfferSU, cpa, roas, convRate,
    };
  }, [days, salesDay, totalDays, adCostExGst, products, revenueBasis, convBasis]);

  const dayMetrics = (i: number) => {
    const d = days[i];
    if (!d) return { sur: null as number | null, dr: null as number | null };
    const reg = Number(d.registrations || 0);
    const su = Number(d.showUp || 0);
    const wp = Number(d.watchOrOffer || 0);
    const sur = reg > 0 ? (su / reg) * 100 : null;
    const dr = su > 0 ? ((su - wp) / su) * 100 : null;
    return { sur, dr };
  };

  const updateDay = (i: number, patch: Partial<DayRow>) =>
    setDays((p) => p.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  const addDay = () => { if (totalDays < 60) setTotalDays(totalDays + 1); };
  const removeDay = () => { if (totalDays > 1) setTotalDays(totalDays - 1); };

  const addProd = () => setProducts((p) => [...p, emptyProd()]);
  const removeProd = (i: number) => setProducts((p) => p.length > 1 ? p.filter((_, idx) => idx !== i) : p);
  const updateProd = (i: number, patch: Partial<ProductRow>) =>
    setProducts((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const canCalc =
    webinarName.trim().length > 0 &&
    totalDays >= 1 && totalDays <= 60 &&
    watchPct >= 1 && watchPct <= 100 &&
    salesDay >= 1 && salesDay <= totalDays &&
    Number(adCostExGst) >= 0 &&
    products.some((p) => p.type.trim() && Number(p.units) > 0);

  const buildWhatsApp = () => {
    const lines: string[] = [];
    lines.push("Seminar ROAS Summary");
    lines.push(`Webinar: ${webinarName}`);
    if (webinarMode) lines.push(`Mode: ${webinarMode}`);
    lines.push(`Days: ${totalDays}`);
    lines.push(`Watch Point: ${watchPct}%`);
    lines.push(`Sales Day: Day ${salesDay}`);
    lines.push(`Revenue Basis: ${revenueBasis === "token_collected_amount" ? "Token / Collected Amount" : "Full Deal Value"}`);
    lines.push(`Conversion Basis: ${CONV_BASIS_LABEL[convBasis]}`);
    lines.push(`Revenue Inc. GST: ${inr(calc.totalRev)}`);
    lines.push(`Ad Spend Inc. GST: ${inr(calc.adInc)}`);
    lines.push(`Net GST Payable to Govt: ${inr(calc.netGst)}`);
    lines.push(`Profit After GST: ${inr(calc.profit)}`);
    lines.push(`Total Conversions: ${calc.totalUnits}`);
    lines.push(`Conversion Rate: ${pctFmt(calc.convRate)}`);
    lines.push(`CPA: ${inr(calc.cpa)}`);
    lines.push(`CPL: ${inr(calc.cpl)}`);
    lines.push(`ROAS: ${calc.roas == null ? "—" : calc.roas.toFixed(2) + "×"}`);
    return lines.join("\n");
  };

  const copyWhatsApp = async () => {
    try { await navigator.clipboard.writeText(buildWhatsApp()); toast.success("WhatsApp summary copied"); }
    catch { toast.error("Could not copy"); }
  };

  const buildCsvRows = (): (string | number)[][] => {
    const head: (string | number)[][] = [
      ["Webinar Name", webinarName],
      ["Webinar Mode", webinarMode],
      ["Total Webinar Days", totalDays],
      ["Watch Point %", watchPct],
      ["Sales Day", `Day ${salesDay}`],
      ["Revenue Basis", revenueBasis === "token_collected_amount" ? "Token / Collected Amount" : "Full Deal Value"],
      ["Conversion Rate Basis", CONV_BASIS_LABEL[convBasis]],
      ["Conversion Rate", calc.convRate == null ? "" : Number(calc.convRate).toFixed(2) + "%"],
      ["Registrations (sales day)", calc.regs],
      ["Show-Up (sales day)", calc.showUp],
      ["Offer / Watch Present", calc.offerShowUp],
      ["Total Revenue Inc. GST", calc.totalRev],
      ["Ad Cost Excl. GST", calc.adCost],
      ["Ad Spend Inc. GST", calc.adInc],
      ["Net GST Payable to Govt", calc.netGst],
      ["Total Conversions", calc.totalUnits],
      ["CPA", calc.cpa ?? ""],
      ["CPL", calc.cpl ?? ""],
      ["ROAS", calc.roas == null ? "" : Number(calc.roas).toFixed(4)],
      ["Profit After GST", calc.profit],
      [],
      ["Day-wise Attendance"],
      ["Day", "Date", "Start Time", "End Time", "Duration (min)", "Watch Point Time", "Registrations", "Show-Up", "Watch/Offer Present", "Show-Up Rate", "Drop Rate", "Is Sales Day"],
      ...days.map((d, i) => {
        const t = dayTimings[i];
        const m = dayMetrics(i);
        return [
          i + 1, d.date || "", d.startTime || "", d.endTime || "",
          t?.dur ?? "", t?.wpTime ?? "",
          d.registrations || 0, d.showUp || 0, d.watchOrOffer || 0,
          m.sur == null ? "" : m.sur.toFixed(2) + "%",
          m.dr == null ? "" : m.dr.toFixed(2) + "%",
          (i + 1 === salesDay) ? "Yes" : "No",
        ];
      }),
      [],
      ["Products / Payment Rows"],
      ["Payment Type", "Units", "Deal Price Inc. GST", "Token / Down Payment", "Row Revenue"],
      ...products.map((p) => {
        const u = Number(p.units || 0);
        const pr = Number(p.price || 0);
        const tk = p.token === "" ? null : Number(p.token);
        const rev = (revenueBasis === "token_collected_amount" && tk != null && tk > 0) ? u * tk : u * pr;
        return [p.type, u, pr, tk ?? "", rev];
      }),
    ];
    return head;
  };

  const downloadCsv = (filename: string) => {
    const rows = buildCsvRows();
    const csv = rows.map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  };
  const exportCsv = () => { downloadCsv(`seminar-roas-${(webinarName || "report").replace(/\W+/g, "-")}.csv`); toast.success("CSV downloaded"); };
  const exportSheetsCsv = () => { downloadCsv(`seminar-roas-${(webinarName || "report").replace(/\W+/g, "-")}-sheets.csv`); toast.success("Google Sheets CSV downloaded"); };
  const exportPdf = () => { toast.message("PDF export coming soon", { description: "Use CSV export or print this page (Ctrl+P)." }); };

  const saveReport = async () => {
    if (!user) { toast.error("Not signed in"); return; }
    if (!canCalc) { toast.error("Fill required fields before saving"); return; }
    setSaving(true);
    try {
      const wa = buildWhatsApp();
      const inputSnap = {
        webinarName, webinarMode, totalDays, watchPct, salesDay,
        defaultStart, defaultEnd, timingNote, convBasis,
        days, adCostExGst, revenueBasis, products,
      };
      const outputSnap = { ...calc, dayTimings, revenueBasis, convBasis };

      const reportPayload: any = {
        report_name: webinarName,
        webinar_name: webinarName,
        webinar_mode: webinarMode || null,
        total_webinar_days: totalDays,
        watch_point_percent: watchPct,
        webinar_start_time: defaultStart || null,
        webinar_end_time: defaultEnd || null,
        sales_day: salesDay,
        timing_note: timingNote || null,
        revenue_basis: revenueBasis,
        conversion_rate_basis: convBasis,
        conversion_rate: calc.convRate,
        ad_cost_excluding_gst: calc.adCost,
        ad_gst: calc.adGst,
        total_ad_spend_including_gst: calc.adInc,
        total_revenue_including_gst: calc.totalRev,
        net_gst_payable_to_govt: calc.netGst,
        profit_after_gst: calc.profit,
        cpl: calc.cpl,
        cpa: calc.cpa,
        roas: calc.roas,
        total_conversions: calc.totalUnits,
        input_snapshot_json: inputSnap,
        output_snapshot_json: outputSnap,
        whatsapp_summary_text: wa,
      };

      let reportId = editingId;
      if (editingId) {
        const { error } = await (supabase as any).from("seminar_roas_reports").update(reportPayload).eq("id", editingId);
        if (error) throw error;
        await (supabase as any).from("seminar_roas_report_days").delete().eq("report_id", editingId);
        await (supabase as any).from("seminar_roas_report_products").delete().eq("report_id", editingId);
      } else {
        const { data, error } = await (supabase as any).from("seminar_roas_reports").insert({ ...reportPayload, created_by: user.id }).select("id").single();
        if (error) throw error;
        reportId = data.id;
        setEditingId(reportId);
      }

      const dayRows = days.map((d, i) => {
        const dn = i + 1;
        const reg = Number(d.registrations || 0);
        const su = Number(d.showUp || 0);
        const wp = Number(d.watchOrOffer || 0);
        const t = dayTimings[i];
        return {
          report_id: reportId,
          day_number: dn,
          date: d.date || null,
          start_time: d.startTime || null,
          end_time: d.endTime || null,
          duration_minutes: t?.dur ?? null,
          watch_point_time: t?.wpTime && t.wpTime !== "—" ? t.wpTime : null,
          registrations: reg,
          show_up: su,
          watch_or_offer_present: wp,
          show_up_rate: reg > 0 ? (su / reg) * 100 : null,
          drop_rate: su > 0 ? ((su - wp) / su) * 100 : null,
          is_sales_day: dn === salesDay,
        };
      });
      if (dayRows.length) {
        const { error: dErr } = await (supabase as any).from("seminar_roas_report_days").insert(dayRows);
        if (dErr) throw dErr;
      }

      const prodRows = products.filter((p) => p.type.trim()).map((p, idx) => {
        const units = Number(p.units || 0);
        const price = Number(p.price || 0);
        const tok = p.token === "" ? null : Number(p.token);
        const rev = (revenueBasis === "token_collected_amount" && tok != null && tok > 0) ? units * tok : units * price;
        return {
          report_id: reportId,
          payment_type: p.type,
          units_sold: units,
          deal_price_including_gst: price,
          token_down_payment: tok,
          revenue_counted: rev,
          sort_order: idx,
        };
      });
      if (prodRows.length) {
        const { error: pErr } = await (supabase as any).from("seminar_roas_report_products").insert(prodRows);
        if (pErr) throw pErr;
      }

      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast.success("Seminar ROAS report saved.");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save report");
    } finally {
      setSaving(false);
    }
  };

  const loadReport = async (id: string) => {
    const { data, error } = await (supabase as any)
      .from("seminar_roas_reports")
      .select("*, days:seminar_roas_report_days(*), products:seminar_roas_report_products(*)")
      .eq("id", id).single();
    if (error || !data) { toast.error("Could not load report"); return; }
    const r: any = data;
    const snap = r.input_snapshot_json || {};
    setEditingId(id);
    setWebinarName(r.webinar_name || "");
    setWebinarMode(r.webinar_mode || "Live");
    setTotalDays(r.total_webinar_days || 1);
    setWatchPct(Number(r.watch_point_percent ?? 70));
    setSalesDay(r.sales_day || 0);
    setDefaultStart(snap.defaultStart || r.webinar_start_time || "10:30 AM");
    setDefaultEnd(snap.defaultEnd || r.webinar_end_time || "3:30 PM");
    setTimingNote(r.timing_note || "");
    setConvBasis((snap.convBasis || r.conversion_rate_basis || "offer_show_up") as ConvBasis);
    setRevenueBasis((r.revenue_basis === "token_collected_amount") ? "token_collected_amount" : "full_deal_value");
    if (snap.days) setDays(snap.days);
    else setDays((r.days || []).sort((a: any, b: any) => a.day_number - b.day_number).map((d: any) => ({
      date: d.date || "",
      startTime: d.start_time || r.webinar_start_time || "",
      endTime: d.end_time || r.webinar_end_time || "",
      registrations: String(d.registrations || ""),
      showUp: String(d.show_up || ""),
      watchOrOffer: String(d.watch_or_offer_present || ""),
    })));
    setAdCostExGst(String(r.ad_cost_excluding_gst || ""));
    if (snap.revenueBasis) setRevenueBasis(snap.revenueBasis === "token_collected_amount" ? "token_collected_amount" : "full_deal_value");
    if (snap.products) setProducts(snap.products);
    else setProducts((r.products || []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((p: any) => ({
      type: p.payment_type || "",
      units: String(p.units_sold || ""),
      price: String(p.deal_price_including_gst || ""),
      token: p.token_down_payment == null ? "" : String(p.token_down_payment),
    })) || [emptyProd()]);
    draftLoadedRef.current = true;
    setStep(5);
  };

  const stepTitles: Record<number, string> = {
    1: "Webinar Setup", 2: "Attendance Details", 3: "Ad Cost & Spend",
    4: "Sales & Payment Types", 5: "ROAS, GST & Profit Summary",
  };

  return (
    <div className="srWiz">
      <style>{STYLES}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="page-title">Seminar ROAS Calculator</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            Calculate registrations, show-up, watch drop, ad spend, GST, profit and ROAS for any seminar, webinar or multi-day challenge.
          </div>
        </div>
        {onBack && <button className="srBtn srBtn-g" onClick={onBack}>← Back</button>}
      </div>

      {draftBanner && (
        <div className="srHint" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>Your previous Seminar ROAS draft has been restored.</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="srBtn srBtn-k" style={{ height: 30 }} onClick={restoreDraft}>Continue Draft</button>
            <button className="srBtn srBtn-g" style={{ height: 30 }} onClick={startFresh}>Start Fresh</button>
          </span>
        </div>
      )}

      <div className="srStepper">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={"srStepDot" + (step === n ? " on" : (step > n ? " done" : ""))}
            onClick={() => setStep(n as any)} type="button">
            <span className="n">{n}</span>{stepTitles[n]}
          </button>
        ))}
      </div>

      {step === 1 && (
        <Step1 {...{ webinarName, setWebinarName, webinarMode, setWebinarMode, totalDays, setTotalDays,
          watchPct, setWatchPct, salesDay, setSalesDay: setSalesDayManual, salesDayError,
          defaultStart, setDefaultStart, defaultEnd, setDefaultEnd, timingNote, setTimingNote,
          convBasis, setConvBasis, applyDefaultsToAll }} />
      )}
      {step === 2 && (
        <Step2 days={days} totalDays={totalDays} salesDay={salesDay} watchPct={watchPct}
          dayTimings={dayTimings} updateDay={updateDay} addDay={addDay} removeDay={removeDay} dayMetrics={dayMetrics} />
      )}
      {step === 3 && (
        <Step3 adCostExGst={adCostExGst} setAdCostExGst={setAdCostExGst} calc={calc} />
      )}
      {step === 4 && (
        <Step4 revenueBasis={revenueBasis} setRevenueBasis={setRevenueBasis}
          products={products} updateProd={updateProd} addProd={addProd} removeProd={removeProd} calc={calc} />
      )}
      {step === 5 && (
        <Step5 calc={calc} totalDays={totalDays} watchPct={watchPct} salesDay={salesDay}
          revenueBasis={revenueBasis} convBasis={convBasis}
          regs={calc.regs} showUp={calc.showUp} offer={calc.offerShowUp} />
      )}

      <div className="srBtnRow">
        <div>
          {step > 1 && <button className="srBtn srBtn-g" onClick={() => setStep((s) => (s - 1) as any)}>← Previous</button>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {step < 5 && <button className="srBtn srBtn-k" onClick={() => {
            if (step === 1) {
              if (!webinarName.trim()) { toast.error("Please enter a webinar name."); return; }
              if (!(salesDay >= 1 && salesDay <= totalDays)) {
                setSalesDayError(true);
                toast.error("Please select the day when sales/offer happened.");
                return;
              }
            }
            setStep((s) => (s + 1) as any);
          }}>Next →</button>}
          {step === 5 && (
            <>
              <ExportMenu onCsv={exportCsv} onSheets={exportSheetsCsv} onPdf={exportPdf} onWa={copyWhatsApp} />
              <button className="srBtn srBtn-k" onClick={saveReport} disabled={!canCalc || saving}>
                {saving ? "Saving..." : (editingId ? "Update Report" : "Save Report")}
              </button>
            </>
          )}
        </div>
      </div>

      <datalist id="srTimes">
        {TIME_OPTIONS.map((t) => <option key={t} value={t} />)}
      </datalist>
    </div>
  );
}

/* ---------------- Step 1 ---------------- */
function Step1(props: any) {
  const { webinarName, setWebinarName, webinarMode, setWebinarMode, totalDays, setTotalDays,
    watchPct, setWatchPct, salesDay, setSalesDay, salesDayError,
    defaultStart, setDefaultStart, defaultEnd, setDefaultEnd, timingNote, setTimingNote,
    convBasis, setConvBasis, applyDefaultsToAll } = props;

  const [customDays, setCustomDays] = useState(!DAY_PRESETS.includes(totalDays));
  const [customWatch, setCustomWatch] = useState(!WATCH_PRESETS.includes(watchPct));

  return (
    <div className="srSection">
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, marginBottom: 14 }}>Webinar Setup</div>

      <div className="srGrid c2" style={{ marginBottom: 14 }}>
        <div>
          <div className="srLbl">Webinar / Campaign Name <Info title="Webinar Name" body="Type a new name or click to choose a previously saved one." /></div>
          <QuickSaveInput fieldKey="seminar_webinar_name" value={webinarName} onChange={setWebinarName} placeholder="Click to choose saved webinar or type new" />
        </div>
        <div>
          <div className="srLbl">Webinar Mode <Info title="Webinar Mode" body="Live, Automated, Replay, Hybrid or Custom." /></div>
          <QuickSaveInput fieldKey="webinar_mode" value={webinarMode} onChange={setWebinarMode} placeholder="Live / Automated / Replay / ..." />
          <div className="srHelper">Suggestions: {MODE_OPTS.join(" · ")}</div>
        </div>
      </div>

      <div className="srGrid c2" style={{ marginBottom: 14 }}>
        <div>
          <div className="srLbl">Total Webinar Days <Info title="Total Webinar Days" body="How many days the webinar/seminar/challenge ran. Up to 60 days." /></div>
          <div className="srPills">
            {DAY_PRESETS.map((d) => (
              <button key={d} className={"srPill" + (!customDays && totalDays === d ? " on" : "")}
                onClick={() => { setCustomDays(false); setTotalDays(d); }}>{d} {d === 1 ? "Day" : "Days"}</button>
            ))}
            <button className={"srPill" + (customDays ? " on" : "")} onClick={() => setCustomDays(true)}>Custom</button>
          </div>
          {customDays && (
            <input type="number" min={1} max={60} className="srInput" style={{ marginTop: 8 }}
              value={totalDays} onChange={(e) => setTotalDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
          )}
        </div>
        <div>
          <div className="srLbl">Watch Point % <Info title="Watch Point %" body="Percentage of webinar duration where you check how many people are still watching. Applied to each day's own timing." /></div>
          <div className="srPills">
            {WATCH_PRESETS.map((w) => (
              <button key={w} className={"srPill" + (!customWatch && watchPct === w ? " on" : "")}
                onClick={() => { setCustomWatch(false); setWatchPct(w); }}>{w}%</button>
            ))}
            <button className={"srPill" + (customWatch ? " on" : "")} onClick={() => setCustomWatch(true)}>Custom</button>
          </div>
          {customWatch && (
            <input type="number" min={1} max={100} className="srInput" style={{ marginTop: 8 }}
              value={watchPct} onChange={(e) => setWatchPct(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
          )}
        </div>
      </div>

      <div className="srGrid c3" style={{ marginBottom: 14 }}>
        <div>
          <div className="srLbl">Sales / Offer Day <span style={{ color: "var(--rd)" }}>*</span>
            <Info title="Sales / Offer Day" body="The day the offer is pitched. On this day you'll fill Offer Show-Up; other days use People Present at Watch Point." /></div>
          <select className="srSelect" style={salesDayError ? { borderColor: "var(--rd)" } : undefined}
            value={salesDay || ""} onChange={(e) => setSalesDay(Number(e.target.value))}>
            <option value="">Select sales/offer day</option>
            {Array.from({ length: totalDays }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>Day {n}</option>
            ))}
          </select>
          {salesDayError && <div className="srErr">Please select the day when sales/offer happened.</div>}
        </div>
        <div>
          <div className="srLbl">Conversion Rate Basis
            <Info title="Conversion Rate Basis" body="Conversion Rate = Total Conversions ÷ this denominator × 100. Choose Offer Show-Up, Show-Up or Registrations." /></div>
          <select className="srSelect" value={convBasis} onChange={(e) => setConvBasis(e.target.value)}>
            <option value="offer_show_up">Offer Show-Up (recommended)</option>
            <option value="show_up">Show-Up</option>
            <option value="registrations">Registrations</option>
          </select>
        </div>
        <div>
          <div className="srLbl">Timing Note (optional)</div>
          <input className="srInput" value={timingNote} onChange={(e) => setTimingNote(e.target.value)} placeholder="e.g. Same timing every day" />
        </div>
      </div>

      <div className="srHint">
        Default Timing for All Days — used as the starting point. You can override start/end time on each day card in Step 2.
      </div>

      <div className="srGrid c3" style={{ marginBottom: 6 }}>
        <div>
          <div className="srLbl">Default Start Time <Info title="Default Start" body="Pick from 15-min suggestions or type any time (e.g. 10:30 AM, 18:00)." /></div>
          <input className="srInput" list="srTimes" value={defaultStart} onChange={(e) => setDefaultStart(e.target.value)} placeholder="10:30 AM" />
        </div>
        <div>
          <div className="srLbl">Default End Time <Info title="Default End" body="Pick from 15-min suggestions or type any time (e.g. 3:30 PM, 21:00)." /></div>
          <input className="srInput" list="srTimes" value={defaultEnd} onChange={(e) => setDefaultEnd(e.target.value)} placeholder="3:30 PM" />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="srBtn srBtn-g" type="button" onClick={applyDefaultsToAll} style={{ width: "100%" }}>Apply to All Days</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 2 ---------------- */
function Step2({ days, totalDays, salesDay, watchPct, dayTimings, updateDay, addDay, removeDay, dayMetrics }: any) {
  return (
    <div className="srSection">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18 }}>Attendance Details</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="srBtn srBtn-g" onClick={removeDay} disabled={totalDays <= 1}>− Remove Last Day</button>
          <button className="srBtn srBtn-g" onClick={addDay} disabled={totalDays >= 60}>+ Add One More Day</button>
        </div>
      </div>

      {Array.from({ length: totalDays }, (_, i) => {
        const isSales = i + 1 === salesDay;
        const m = dayMetrics(i);
        const t = dayTimings[i] || { dur: null, wpTime: "—", wpMin: null };
        const presenceLabel = isSales
          ? "Offer Show-Up"
          : `People Present at ${watchPct}% Timing (${t.wpTime}${t.wpMin != null ? ` · after ${t.wpMin} min` : ""})`;
        const dropLabel = isSales ? "Offer Drop Rate" : `${watchPct}% Drop Rate`;
        const d = days[i] || {};

        return (
          <div key={i} className={"srDayCard" + (isSales ? " sales" : "")}>
            <div className="srDayHead">
              <div className="srDayTitle">Day {i + 1}</div>
              {isSales && <span className="srBadge">Sales / Offer Day</span>}
            </div>

            <div className="srGrid c3" style={{ marginBottom: 10 }}>
              <div>
                <div className="srLbl">Date</div>
                <input type="date" className="srInput" value={d.date || ""} onChange={(e) => updateDay(i, { date: e.target.value })} />
              </div>
              <div>
                <div className="srLbl">Webinar Start Time
                  <Info title="Start Time" body="Pick from 15-min suggestions or type any time." /></div>
                <input className="srInput" list="srTimes" value={d.startTime || ""} onChange={(e) => updateDay(i, { startTime: e.target.value })} placeholder="10:30 AM" />
              </div>
              <div>
                <div className="srLbl">Webinar End Time
                  <Info title="End Time" body="Pick from 15-min suggestions or type any time." /></div>
                <input className="srInput" list="srTimes" value={d.endTime || ""} onChange={(e) => updateDay(i, { endTime: e.target.value })} placeholder="3:30 PM" />
              </div>
            </div>

            <div className="srGrid c2" style={{ marginBottom: 10 }}>
              <div>
                <div className="srLbl">Total Duration</div>
                <div className="srInput srRO">{t.dur != null ? `${Math.floor(t.dur / 60)}h ${t.dur % 60}m (${t.dur} min)` : "—"}</div>
              </div>
              <div>
                <div className="srLbl">Watch Point Time ({watchPct}%)</div>
                <div className="srInput srRO">{t.wpTime}{t.wpMin != null ? `  ·  after ${t.wpMin} min` : ""}</div>
              </div>
            </div>

            <div className="srGrid c3">
              <div>
                <div className="srLbl">Registrations / Leads
                  <Info title="Registrations" body="Total people who registered for this day. Used for CPL." /></div>
                <input type="number" className="srInput" value={d.registrations || ""} onChange={(e) => updateDay(i, { registrations: e.target.value })} />
              </div>
              <div>
                <div className="srLbl">Show-Up <Info title="Show-Up" body="People who actually attended on this day." /></div>
                <input type="number" className="srInput" value={d.showUp || ""} onChange={(e) => updateDay(i, { showUp: e.target.value })} />
              </div>
              <div>
                <div className="srLbl" title={presenceLabel}>{presenceLabel}
                  <Info title={isSales ? "Offer Show-Up" : "People Present at Watch Point"}
                    body={isSales ? "People still present when the offer was being pitched." : "People still present at this day's watch-point time."} /></div>
                <input type="number" className="srInput" value={d.watchOrOffer || ""} onChange={(e) => updateDay(i, { watchOrOffer: e.target.value })} />
              </div>
            </div>

            <div className="srMetric">
              <span>Show-Up Rate: <strong>{m.sur == null ? "—" : m.sur.toFixed(2) + "%"}</strong></span>
              <span>{dropLabel}: <strong>{m.dr == null ? "—" : m.dr.toFixed(2) + "%"}</strong></span>
              {!isSales && <span>People Present at {watchPct}%: <strong>{d.watchOrOffer || "—"}</strong></span>}
              {isSales && <span>Offer Show-Up: <strong>{d.watchOrOffer || "—"}</strong></span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Step 3 ---------------- */
function Step3({ adCostExGst, setAdCostExGst, calc }: any) {
  return (
    <div className="srSection">
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, marginBottom: 14 }}>Ad Cost & Spend</div>

      <div className="srGrid c3" style={{ marginBottom: 18 }}>
        <div>
          <div className="srLbl">Ad Cost Excluding GST <Info title="Ad Cost Excl. GST" body="Actual ad spend before GST. Used for CPL and CPA." /></div>
          <input type="number" className="srInput" value={adCostExGst} onChange={(e) => setAdCostExGst(e.target.value)} placeholder="0" />
        </div>
        <div>
          <div className="srLbl">GST @ 18%</div>
          <div className="srInput srRO">{inr(calc.adGst)}</div>
        </div>
        <div>
          <div className="srLbl">Total Ad Spend Including GST <Info title="Ad Spend Inc. GST" body="Ad Cost × 1.18. Used for ROAS and Profit." /></div>
          <div className="srInput srRO">{inr(calc.adInc)}</div>
        </div>
      </div>

      <div className="srSumGrid">
        <div className="srSumCard">
          <div className="srSumLbl">CPL <Info title="CPL" body="Cost per Lead = Ad Cost Excl. GST ÷ Registrations." /></div>
          <div className="srSumVal">{inr(calc.cpl)}</div>
        </div>
        <div className="srSumCard">
          <div className="srSumLbl">Cost / Show-Up</div>
          <div className="srSumVal">{inr(calc.costShowUp)}</div>
        </div>
        <div className="srSumCard">
          <div className="srSumLbl">Cost / Offer Show-Up</div>
          <div className="srSumVal">{inr(calc.costOfferSU)}</div>
        </div>
        <div className="srSumCard">
          <div className="srSumLbl">Input GST Credit</div>
          <div className="srSumVal">{inr(calc.inputGstCredit)}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 4 ---------------- */
function Step4({ revenueBasis, setRevenueBasis, products, updateProd, addProd, removeProd, calc }: any) {
  const isToken = revenueBasis === "token_collected_amount";
  return (
    <div className="srSection">
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, marginBottom: 14 }}>Sales & Payment Types</div>

      <div style={{ marginBottom: 16 }}>
        <div className="srLbl">Revenue Basis for ROAS <span style={{ color: "var(--rd)" }}>*</span>
          <Info title="Revenue Basis for ROAS" body="Full Deal Value uses the complete program price; Token / Collected Amount uses only the token amount when entered." /></div>
        <div className="srPills">
          <button className={"srPill" + (!isToken ? " on" : "")} onClick={() => setRevenueBasis("full_deal_value")}>Full Deal Value</button>
          <button className={"srPill" + (isToken ? " on" : "")} onClick={() => setRevenueBasis("token_collected_amount")}>Token / Collected Amount</button>
        </div>
        <div className="srHelper">
          Choose whether ROAS should be calculated on the full product/deal value or only the token/amount collected during the webinar.
        </div>
      </div>

      <div className="srHint">
        Revenue basis: <strong>{isToken ? "Token / Collected Amount" : "Full Deal Value"}</strong>{isToken
          ? " — token amount (when entered) is used as row revenue. Token does not modify the deal price."
          : " — full deal price is always used. Token / Down Payment is stored only as informational data and does not change ROAS."}
      </div>

      <div className="srProdGrid srProdHead">
        <div>Payment / Product Type</div>
        <div>Units</div>
        <div>Deal Price (Inc. GST)</div>
        <div>Token / Down Pmt</div>
        <div>Row Revenue</div>
        <div></div>
      </div>

      {products.map((p: ProductRow, i: number) => {
        const units = Number(p.units || 0);
        const price = Number(p.price || 0);
        const tok = p.token === "" ? null : Number(p.token);
        const rev = (isToken && tok != null && tok > 0) ? units * tok : units * price;
        return (
          <div key={i} className="srProdGrid srProdRow">
            <div>
              <QuickSaveInput fieldKey="seminar_payment_type" value={p.type}
                onChange={(v) => updateProd(i, { type: v })} placeholder="e.g. Full Payment Sale" />
            </div>
            <input type="number" className="srInput" value={p.units} onChange={(e) => updateProd(i, { units: e.target.value })} placeholder="0" />
            <input type="number" className="srInput" value={p.price} onChange={(e) => updateProd(i, { price: e.target.value })} placeholder="0" />
            <input type="number" className="srInput" value={p.token} onChange={(e) => updateProd(i, { token: e.target.value })} placeholder="optional" />
            <div className="srInput srRO">{inr(rev)}</div>
            <button className="srRm" onClick={() => removeProd(i)} title="Remove row">✕</button>
          </div>
        );
      })}

      <button className="srAddBtn" onClick={addProd} style={{ marginTop: 6 }}>+ Add Product</button>

      <div className="srSumGrid" style={{ marginTop: 18 }}>
        <div className="srSumCard">
          <div className="srSumLbl">Total Conversions</div>
          <div className="srSumVal">{calc.totalUnits}</div>
        </div>
        <div className="srSumCard grn">
          <div className="srSumLbl">Total Revenue Inc. GST</div>
          <div className="srSumVal">{inr(calc.totalRev)}</div>
        </div>
      </div>

      <div className="srHelper">Suggested types: {DEFAULT_PAYMENT_TYPES.join(" · ")}</div>
    </div>
  );
}

/* ---------------- Step 5 ---------------- */
function Step5({ calc, totalDays, watchPct, salesDay, revenueBasis, convBasis, regs, showUp, offer }: any) {
  const rows: [string, string][] = [
    ["Webinar Days", String(totalDays)],
    ["Watch Point", `${watchPct}%`],
    ["Sales / Offer Day", salesDay >= 1 ? `Day ${salesDay}` : "—"],
    ["Revenue Basis", revenueBasis === "token_collected_amount" ? "Token / Collected Amount" : "Full Deal Value"],
    ["Conversion Rate Basis", CONV_BASIS_LABEL[convBasis as ConvBasis]],
    ["Registrations (sales day)", num(regs)],
    ["Show-Up (sales day)", num(showUp)],
    ["Offer Show-Up / Watch Present", num(offer)],
    ["Total Revenue Inc. GST", inr(calc.totalRev)],
    ["Ad Cost Excl. GST", inr(calc.adCost)],
    ["Ad Spend Inc. GST", inr(calc.adInc)],
    ["Net GST Payable to Govt", inr(calc.netGst)],
    ["Total Conversions", num(calc.totalUnits)],
    ["Conversion Rate", pctFmt(calc.convRate)],
    ["Profit After GST", inr(calc.profit)],
    ["CPA", inr(calc.cpa)],
    ["ROAS", calc.roas == null ? "—" : calc.roas.toFixed(2) + "×"],
  ];
  return (
    <div className="srSection">
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, marginBottom: 14 }}>ROAS, GST & Profit Summary</div>

      <div className="srSumGrid">
        <div className="srSumCard gold">
          <div className="srSumLbl">ROAS</div>
          <div className="srSumVal">{calc.roas == null ? "—" : calc.roas.toFixed(2) + "×"}</div>
          <div className="srSumNote">Revenue Inc. GST ÷ Ad Spend Inc. GST</div>
        </div>
        <div className="srSumCard grn">
          <div className="srSumLbl">Profit After GST</div>
          <div className="srSumVal">{inr(calc.profit)}</div>
          <div className="srSumNote">Revenue − Net GST − Ad Spend Inc. GST</div>
        </div>
        <div className="srSumCard">
          <div className="srSumLbl">CPA</div>
          <div className="srSumVal">{inr(calc.cpa)}</div>
          <div className="srSumNote">Ad Cost Excl. GST ÷ Conversions</div>
        </div>
        <div className="srSumCard">
          <div className="srSumLbl">Conversion Rate</div>
          <div className="srSumVal">{pctFmt(calc.convRate)}</div>
          <div className="srSumNote">Conversions ÷ {CONV_BASIS_LABEL[convBasis as ConvBasis]} × 100</div>
        </div>
      </div>

      <div className="srSumGrid">
        <div className="srSumCard">
          <div className="srSumLbl">Total Revenue Inc. GST</div>
          <div className="srSumVal" style={{ fontSize: 22 }}>{inr(calc.totalRev)}</div>
        </div>
        <div className="srSumCard">
          <div className="srSumLbl">Ad Spend Inc. GST</div>
          <div className="srSumVal" style={{ fontSize: 22 }}>{inr(calc.adInc)}</div>
        </div>
        <div className="srSumCard">
          <div className="srSumLbl">Net GST Payable to Govt</div>
          <div className="srSumVal" style={{ fontSize: 22 }}>{inr(calc.netGst)}</div>
          {calc.excessCredit > 0 && <div className="srSumNote">Excess input GST credit: {inr(calc.excessCredit)}</div>}
        </div>
        <div className="srSumCard">
          <div className="srSumLbl">Total Conversions</div>
          <div className="srSumVal" style={{ fontSize: 22 }}>{calc.totalUnits}</div>
        </div>
      </div>

      <table className="srTbl">
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>
          {rows.map(([k, v]) => (<tr key={k}><td>{k}</td><td>{v}</td></tr>))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Export Menu ---------------- */
function ExportMenu({ onCsv, onSheets, onPdf, onWa }: { onCsv: () => void; onSheets: () => void; onPdf: () => void; onWa: () => void; }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const item: React.CSSProperties = { padding: "10px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: "'Jost',sans-serif", whiteSpace: "nowrap", color: "var(--kk)", background: "transparent", border: "none", textAlign: "left", width: "100%", display: "block" };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="srBtn srBtn-g" onClick={() => setOpen((o) => !o)}>Export ▾</button>
      {open && (
        <div style={{ position: "absolute", right: 0, bottom: "calc(100% + 6px)", background: "var(--ww)", border: "1px solid var(--bd)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.08)", zIndex: 60, minWidth: 220, overflow: "hidden" }}>
          <button style={item} onClick={() => { setOpen(false); onCsv(); }}>Export CSV</button>
          <button style={item} onClick={() => { setOpen(false); onSheets(); }}>Google Sheets Ready CSV</button>
          <button style={item} onClick={() => { setOpen(false); onPdf(); }}>Export PDF</button>
          <button style={item} onClick={() => { setOpen(false); onWa(); }}>Copy WhatsApp Summary</button>
        </div>
      )}
    </div>
  );
}
