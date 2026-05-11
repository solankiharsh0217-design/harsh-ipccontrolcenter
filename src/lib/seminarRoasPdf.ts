import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const inr = (n: any) => "INR " + Number(n || 0).toLocaleString("en-IN");
const slug = (s: string) => (s || "report").replace(/\W+/g, "-").replace(/^-+|-+$/g, "");

export type SeminarPdfInput = {
  webinarName: string;
  webinarMode?: string | null;
  totalDays: number;
  watchPct: number;
  salesDay: number;
  revenueBasisLabel?: string;
  conversionBasisLabel?: string;
  totals: {
    totalRev: number;
    adInc: number;
    adCost?: number;
    netGst?: number;
    profit: number;
    totalUnits: number;
    convRate: number | null;
    cpa: number | null;
    cpl: number | null;
    roas: number | null;
  };
  days?: Array<{
    day: number;
    date?: string;
    startTime?: string;
    endTime?: string;
    duration?: number | null;
    watchPointTime?: string;
    registrations?: number;
    showUp?: number;
    watchOrOffer?: number;
    isSalesDay?: boolean;
  }>;
  products?: Array<{
    type: string;
    units: number;
    price: number;
    token?: number | null;
    revenue: number;
  }>;
  createdAt?: string;
};

export function downloadSeminarRoasPdf(p: SeminarPdfInput) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const BLACK: [number, number, number] = [10, 10, 10];
  const GOLD: [number, number, number] = [200, 168, 75];
  const MUTED: [number, number, number] = [120, 120, 120];

  // Cover
  doc.setFillColor(...BLACK);
  doc.circle(W / 2, 110, 24, "F");
  doc.setTextColor(...GOLD);
  doc.setFont("times", "bold"); doc.setFontSize(12);
  doc.text("IPC", W / 2, 114, { align: "center" });

  doc.setTextColor(...BLACK);
  doc.setFont("times", "normal"); doc.setFontSize(28);
  doc.text("Seminar ROAS Report", W / 2, 180, { align: "center" });

  doc.setFont("helvetica", "normal"); doc.setFontSize(13);
  doc.text(p.webinarName || "—", W / 2, 210, { align: "center" });

  doc.setTextColor(...MUTED); doc.setFontSize(10);
  const sub = [
    p.webinarMode || "",
    `${p.totalDays} day${p.totalDays > 1 ? "s" : ""}`,
    `Watch Point ${p.watchPct}%`,
    `Sales Day ${p.salesDay}`,
  ].filter(Boolean).join("  ·  ");
  doc.text(sub, W / 2, 230, { align: "center" });
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, W / 2, 248, { align: "center" });

  // Headline metrics
  const stats: [string, string][] = [
    ["ROAS", p.totals.roas == null ? "—" : p.totals.roas.toFixed(2) + "x"],
    ["Profit After GST", inr(p.totals.profit)],
    ["Total Conversions", String(p.totals.totalUnits)],
    ["Conversion Rate", p.totals.convRate == null ? "—" : Number(p.totals.convRate).toFixed(2) + "%"],
    ["Total Revenue Inc. GST", inr(p.totals.totalRev)],
    ["Ad Spend Inc. GST", inr(p.totals.adInc)],
    ["CPA", p.totals.cpa == null ? "—" : inr(p.totals.cpa)],
    ["CPL", p.totals.cpl == null ? "—" : inr(p.totals.cpl)],
  ];
  const cardW = (W - 80 - 20) / 2;
  stats.forEach((s, i) => {
    const x = 40 + (i % 2) * (cardW + 20);
    const y = 290 + Math.floor(i / 2) * 60;
    doc.setDrawColor(232, 229, 222);
    doc.roundedRect(x, y, cardW, 50, 6, 6);
    doc.setTextColor(...MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(s[0].toUpperCase(), x + 12, y + 18);
    doc.setTextColor(...BLACK); doc.setFont("times", "normal"); doc.setFontSize(18);
    doc.text(s[1], x + 12, y + 40);
  });

  // Meta block
  const metaRows: [string, string][] = [
    ["Webinar Mode", p.webinarMode || "—"],
    ["Revenue Basis", p.revenueBasisLabel || "—"],
    ["Conversion Basis", p.conversionBasisLabel || "—"],
    ["Total Days", String(p.totalDays)],
    ["Sales / Offer Day", `Day ${p.salesDay}`],
    ["Watch Point %", `${p.watchPct}%`],
  ];
  autoTable(doc, {
    startY: 540,
    head: [["Setup", ""]],
    body: metaRows,
    headStyles: { fillColor: [247, 246, 243], textColor: BLACK, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: BLACK },
    columnStyles: { 0: { cellWidth: 160, textColor: MUTED }, 1: { cellWidth: "auto" } },
    margin: { left: 40, right: 40 },
  });

  // Day-wise
  if (p.days && p.days.length) {
    doc.addPage();
    doc.setTextColor(...BLACK); doc.setFont("times", "normal"); doc.setFontSize(20);
    doc.text("Day-wise Attendance", 40, 60);

    autoTable(doc, {
      startY: 80,
      head: [["Day", "Date", "Start", "End", "Dur", "Watch Pt", "Regs", "Show-Up", "Watch/Offer", "Sales Day"]],
      body: p.days.map((d) => [
        String(d.day),
        d.date || "—",
        d.startTime || "—",
        d.endTime || "—",
        d.duration == null ? "—" : `${d.duration}m`,
        d.watchPointTime || "—",
        String(d.registrations ?? 0),
        String(d.showUp ?? 0),
        String(d.watchOrOffer ?? 0),
        d.isSalesDay ? "Yes" : "No",
      ]),
      headStyles: { fillColor: [247, 246, 243], textColor: BLACK, fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: BLACK },
      margin: { left: 40, right: 40 },
    });
  }

  // Products
  if (p.products && p.products.length) {
    const lastY = (doc as any).lastAutoTable?.finalY || 80;
    if (lastY > 600) doc.addPage();
    const startY = lastY > 600 ? 60 : lastY + 30;
    doc.setTextColor(...BLACK); doc.setFont("times", "normal"); doc.setFontSize(20);
    doc.text("Products / Payment Rows", 40, startY);

    autoTable(doc, {
      startY: startY + 14,
      head: [["Payment Type", "Units", "Deal Price Inc. GST", "Token / Down", "Row Revenue"]],
      body: p.products.map((r) => [
        r.type || "—",
        String(r.units),
        inr(r.price),
        r.token == null || r.token === 0 ? "—" : inr(r.token),
        inr(r.revenue),
      ]),
      headStyles: { fillColor: [247, 246, 243], textColor: BLACK, fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: BLACK },
      margin: { left: 40, right: 40 },
    });
  }

  doc.save(`seminar-roas-${slug(p.webinarName)}.pdf`);
}
