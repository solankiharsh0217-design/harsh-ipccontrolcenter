import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type AttrRow = {
  name: string;
  spend: number;
  leads: number;
  matched: number;
  revenue: number;
};
export type SaleDetail = {
  name: string;
  email: string;
  phone: string;
  attributedTo: string | null;
  matchMethod: "email" | "phone" | "name" | "unmatched";
  revenue: number;
  webinarDate: string;
};
export type AttributionMeta = {
  createdOn?: string;
  calculationMethod?: string;
  webinarPeriod?: string;
  webinarFormat?: string;
  webinarOperator?: string;
  sessionSlot?: string;
  webinarPlatform?: string;
  zoomAccount?: string;
  adSpendSource?: string;
  calculationId?: string;
  inputSnapshotHash?: string;
  outputHash?: string;
  engineVersion?: string;
};
export type AttributionPayload = {
  webinarName: string;
  webinarDate: string;
  webinarType: string;
  totals: { spend: number; revenue: number; sales: number; leads: number };
  rows: AttrRow[];
  salesDetail: SaleDetail[];
  meta?: AttributionMeta;
};

export const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN");
export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const roasColor = (n: number) => (n >= 10 ? "#16A34A" : n >= 5 ? "#CA8A04" : "#DC2626");

export function downloadCSV(p: AttributionPayload) {
  const overall = p.totals.spend > 0 ? (p.totals.revenue / p.totals.spend).toFixed(2) : "0";
  const m = p.meta || {};
  const sec0 = [
    "SECTION 0 — REPORT METADATA",
    "Field,Value",
    ...[
      ["Created On", m.createdOn || ""],
      ["Calculation Method", m.calculationMethod || ""],
      ["Webinar Date / Period", m.webinarPeriod || p.webinarDate],
      ["Webinar Format", m.webinarFormat || ""],
      ["Webinar Operator", m.webinarOperator || ""],
      ["Session Slot", m.sessionSlot || ""],
      ["Platform", m.webinarPlatform || ""],
      ["Zoom Account", m.zoomAccount || ""],
      ["Ad Spend Source", m.adSpendSource || ""],
      ["Calculation ID", m.calculationId || ""],
      ["Engine Version", m.engineVersion || ""],
      ["Input Hash", m.inputSnapshotHash || ""],
      ["Output Hash", m.outputHash || ""],
    ].filter(([, v]) => v).map(([k, v]) => [q(k), q(String(v))].join(",")),
    "",
  ];
  const sec1 = [
    "SECTION 1 — SUMMARY",
    "Webinar Name,Date,Type,Total Leads,Total Sales,Total Ad Spend,Total Revenue,Overall ROAS,Generated",
    [
      q(p.webinarName), p.webinarDate, p.webinarType, p.totals.leads, p.totals.sales,
      p.totals.spend, p.totals.revenue, overall + "x",
      new Date().toISOString(),
    ].join(","),
  ];
  const sec2 = [
    "",
    "SECTION 2 — PER MEDIA BUYER BREAKDOWN",
    "Media Buyer,Total Leads,Sales Attributed,Revenue,Ad Spend,CPL,Conversion Rate,ROAS",
    ...p.rows.map((r) => {
      const cpl = r.leads ? Math.round(r.spend / r.leads) : 0;
      const cvr = r.leads ? ((r.matched / r.leads) * 100).toFixed(1) : "0";
      const roas = r.spend ? (r.revenue / r.spend).toFixed(2) : "0";
      return [q(r.name), r.leads, r.matched, r.revenue, r.spend, cpl, cvr + "%", roas + "x"].join(",");
    }),
  ];
  const matched = p.salesDetail.filter((s) => s.matchMethod !== "unmatched");
  const unm = p.salesDetail.filter((s) => s.matchMethod === "unmatched");
  const sec3 = [
    "",
    "SECTION 3 — FULL SALES ATTRIBUTION DETAIL",
    "Buyer Name,Email,Phone,Attributed To,Match Method,Revenue,Webinar,Date",
    ...matched.map((s) =>
      [q(s.name), q(s.email), q(s.phone), q(s.attributedTo || ""), s.matchMethod, s.revenue, q(p.webinarName), s.webinarDate].join(","),
    ),
  ];
  const sec4 = [
    "",
    "SECTION 4 — UNMATCHED SALES",
    "Buyer Name,Email,Phone,Reason",
    ...unm.map((s) => [q(s.name), q(s.email), q(s.phone), "No match found in any lead sheet"].join(",")),
  ];
  const csv = [...sec1, ...sec2, ...sec3, ...sec4].join("\n");
  triggerDownload(csv, `IPC_Attribution_${slug(p.webinarName)}_${p.webinarDate}.csv`, "text/csv");
}

function q(s: any) {
  const v = String(s ?? "");
  return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
}
function slug(s: string) {
  return (s || "webinar").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
}
function triggerDownload(content: string, name: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function downloadPDF(p: AttributionPayload) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const GOLD: [number, number, number] = [200, 168, 75];
  const BLACK: [number, number, number] = [10, 10, 10];
  const MUTED: [number, number, number] = [136, 136, 136];

  // Page 1 — Cover
  doc.setFillColor(...BLACK);
  doc.circle(W / 2, 130, 28, "F");
  doc.setTextColor(...GOLD);
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.text("IPC", W / 2, 135, { align: "center" });

  doc.setTextColor(...BLACK);
  doc.setFont("times", "normal");
  doc.setFontSize(34);
  doc.text("Attribution Report", W / 2, 220, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.text(p.webinarName || "—", W / 2, 260, { align: "center" });
  doc.setTextColor(...MUTED);
  doc.setFontSize(11);
  doc.text(`${fmtDate(p.webinarDate)} · ${p.webinarType.replace("-", " ")}`, W / 2, 280, { align: "center" });
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, W / 2, 298, { align: "center" });

  doc.setFontSize(9);
  doc.text("India Photographers Club · Control Center", W / 2, H - 40, { align: "center" });

  // Page 2 — Summary
  doc.addPage();
  header(doc, p, GOLD, MUTED);
  doc.setTextColor(...BLACK);
  doc.setFont("times", "normal"); doc.setFontSize(22);
  doc.text("Executive Summary", 40, 90);

  const overall = p.totals.spend > 0 ? (p.totals.revenue / p.totals.spend).toFixed(2) + "×" : "—";
  const stats = [
    ["Overall ROAS", overall],
    ["Total Leads", p.totals.leads.toLocaleString("en-IN")],
    ["Total Sales", String(p.totals.sales)],
    ["Total Ad Spend", inr(p.totals.spend)],
  ];
  stats.forEach((s, i) => {
    const x = 40 + (i % 2) * 260;
    const y = 120 + Math.floor(i / 2) * 90;
    doc.setDrawColor(232, 229, 222);
    doc.roundedRect(x, y, 240, 70, 8, 8);
    doc.setTextColor(...MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(s[0].toUpperCase(), x + 16, y + 22);
    doc.setTextColor(...BLACK); doc.setFont("times", "normal"); doc.setFontSize(24);
    doc.text(s[1], x + 16, y + 55);
  });

  const unmatched = p.salesDetail.filter((s) => s.matchMethod === "unmatched");
  if (unmatched.length) {
    doc.setTextColor(202, 138, 4); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`⚠ ${unmatched.length} sales could not be attributed to any media buyer.`, 40, 320);
  }

  // Page 3 — Per buyer breakdown
  doc.addPage();
  header(doc, p, GOLD, MUTED);
  doc.setTextColor(...BLACK); doc.setFont("times", "normal"); doc.setFontSize(22);
  doc.text("Per Media Buyer Breakdown", 40, 90);

  autoTable(doc, {
    startY: 110,
    head: [["Media Buyer", "Leads", "Sales", "Revenue", "Ad Spend", "CPL", "CVR", "ROAS"]],
    body: p.rows.map((r) => {
      const roasN = r.spend ? r.revenue / r.spend : 0;
      return [
        r.name,
        r.leads,
        r.matched,
        inr(r.revenue),
        inr(r.spend),
        r.leads ? "₹" + Math.round(r.spend / r.leads).toLocaleString("en-IN") : "—",
        r.leads ? ((r.matched / r.leads) * 100).toFixed(1) + "%" : "—",
        r.spend ? roasN.toFixed(2) + "×" : "—",
      ];
    }),
    headStyles: { fillColor: [247, 246, 243], textColor: BLACK, fontSize: 9 },
    bodyStyles: { fontSize: 10, textColor: BLACK },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        const r = p.rows[data.row.index];
        const roasN = r.spend ? r.revenue / r.spend : 0;
        const c = roasColor(roasN);
        const rgb = hexToRgb(c);
        if (rgb) data.cell.styles.textColor = rgb;
      }
    },
  });
  doc.setTextColor(...MUTED); doc.setFontSize(9);
  doc.text("Matching method: Email → Phone → Name (fuzzy).", 40, (doc as any).lastAutoTable.finalY + 20);

  // Page 4 — Sales detail
  doc.addPage();
  header(doc, p, GOLD, MUTED);
  doc.setTextColor(...BLACK); doc.setFont("times", "normal"); doc.setFontSize(22);
  doc.text("Full Sales Attribution", 40, 90);

  autoTable(doc, {
    startY: 110,
    head: [["Buyer", "Email", "Phone", "Attributed To", "Method", "Revenue"]],
    body: p.salesDetail.map((s) => [
      s.name || "—",
      s.email || "—",
      s.phone || "—",
      s.attributedTo || "Unmatched",
      s.matchMethod,
      s.matchMethod === "unmatched" ? "—" : inr(s.revenue),
    ]),
    headStyles: { fillColor: [247, 246, 243], textColor: BLACK, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: BLACK },
  });

  doc.save(`IPC_Attribution_${slug(p.webinarName)}_${p.webinarDate}.pdf`);
}

function header(doc: jsPDF, p: AttributionPayload, gold: [number, number, number], muted: [number, number, number]) {
  doc.setTextColor(...gold); doc.setFont("times", "bold"); doc.setFontSize(11);
  doc.text("IPC", 40, 40);
  doc.setTextColor(...muted); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`${p.webinarName} · ${fmtDate(p.webinarDate)}`, 40, 56);
  doc.setDrawColor(232, 229, 222);
  doc.line(40, 65, doc.internal.pageSize.getWidth() - 40, 65);
}

function hexToRgb(h: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(h);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
