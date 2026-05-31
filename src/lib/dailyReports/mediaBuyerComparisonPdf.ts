// Insightful Media Buyer Comparison PDF report.
// USES: jsPDF + jspdf-autotable (already in project).
// IMPORTANT: This file does NOT recalculate metrics. It receives aggregates
// already produced by calculateBuyerMetrics() so the PDF matches the screen.

import { inr, fmtNum } from "./helpers";
import type { SpendBasis } from "./buyerMetrics";

export interface PdfBuyerAgg {
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

export interface PdfDailyRow {
  reportDate: string;
  reportName: string;
  buyerNameRaw: string;
  adAccounts: string[];
  templateName: string | null;
  spend: number;
  leads: number;
  cpl: number | null;
  shared: boolean;
  revenue?: number;
  matchedSales?: number;
  notes?: string;
}

export interface PdfFilters {
  from: string;
  to: string;
  buyers: string[];
  account: string;
  template: string;
  reportType: string;
  search: string;
  includeUnallocated: boolean;
  spendBasis: SpendBasis;
}

export interface PdfMeta {
  generatedAt: Date;
  generatedBy: string;
  basisLabel: string;
}

export interface ComparisonPdfInput {
  aggregates: PdfBuyerAgg[];
  summary: {
    totalSpend: number;
    totalLeads: number;
    overallCpl: number | null;
    bestCpl: PdfBuyerAgg | null;
    mostLeads: PdfBuyerAgg | null;
    bestConv: PdfBuyerAgg | null;
    bestRev: PdfBuyerAgg | null;
  };
  insights: string[];
  dailyBreakdown: PdfDailyRow[];
  filters: PdfFilters;
  meta: PdfMeta;
}

const GOLD: [number, number, number] = [200, 168, 75];
const INK: [number, number, number] = [10, 10, 10];
const MUTED: [number, number, number] = [120, 120, 120];
const BG: [number, number, number] = [247, 246, 243];

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}
function fmtDateTime(d: Date) {
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ensureSpace(doc: any, needed: number, pageH: number, margin: number, footer: () => void) {
  const y = (doc as any).lastAutoTable?.finalY ?? margin;
  if (y + needed > pageH - margin - 24) {
    footer();
    doc.addPage();
    return margin;
  }
  return y;
}

function addPageChrome(doc: any, title: string, subtitle: string, pageW: number, margin: number) {
  // Top gold bar
  doc.setFillColor(...GOLD); doc.rect(0, 0, pageW, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(title, margin, 18);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, pageW - margin, 18, { align: "right" });
}

function addFooter(doc: any, pageW: number, pageH: number, margin: number) {
  const pageNum = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text("Generated from IPC Control Center", margin, pageH - 16);
  doc.text(`Page ${pageNum}`, pageW - margin, pageH - 16, { align: "right" });
}

function drawBarChart(doc: any, opts: {
  x: number; y: number; width: number; rowHeight: number;
  title: string;
  items: { label: string; value: number; display: string }[];
  color: [number, number, number];
}) {
  const { x, y, width, rowHeight, title, items, color } = opts;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(title, x, y);
  const max = Math.max(1, ...items.map((i) => i.value));
  const labelW = 90;
  const valueW = 90;
  const barAreaX = x + labelW;
  const barAreaW = width - labelW - valueW;
  let cursorY = y + 12;
  for (const it of items) {
    const w = max > 0 ? (it.value / max) * barAreaW : 0;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
    doc.text(it.label.length > 16 ? it.label.slice(0, 14) + "…" : it.label, x, cursorY + rowHeight * 0.7);
    // Track bar (light)
    doc.setFillColor(232, 229, 222); doc.rect(barAreaX, cursorY, barAreaW, rowHeight, "F");
    // Value bar
    doc.setFillColor(...color); doc.rect(barAreaX, cursorY, w, rowHeight, "F");
    doc.setTextColor(...INK); doc.setFontSize(9);
    doc.text(it.display, x + width, cursorY + rowHeight * 0.7, { align: "right" });
    cursorY += rowHeight + 4;
  }
  return cursorY + 6;
}

function buildExecutiveText(input: ComparisonPdfInput): string[] {
  const { summary, aggregates } = input;
  if (aggregates.length === 0) return ["No matching reports found for the selected filters."];
  const out: string[] = [];
  if (summary.mostLeads && summary.bestCpl) {
    if (summary.mostLeads.name === summary.bestCpl.name) {
      out.push(`${summary.mostLeads.name} led on both lead volume (${fmtNum(summary.mostLeads.leads)} leads) and CPL efficiency (${inr(summary.bestCpl.avgCpl!)}).`);
    } else {
      out.push(`During this period, ${summary.mostLeads.name} generated the highest lead volume with ${fmtNum(summary.mostLeads.leads)} leads, while ${summary.bestCpl.name} achieved the best CPL at ${inr(summary.bestCpl.avgCpl!)}.`);
    }
  } else if (summary.mostLeads) {
    out.push(`${summary.mostLeads.name} generated the highest lead volume with ${fmtNum(summary.mostLeads.leads)} leads.`);
  } else if (summary.bestCpl) {
    out.push(`${summary.bestCpl.name} achieved the best CPL at ${inr(summary.bestCpl.avgCpl!)}.`);
  }
  if (summary.bestRev && summary.bestConv) {
    if (summary.bestRev.name === summary.bestConv.name) {
      out.push(`${summary.bestRev.name} delivered the strongest revenue attribution with ${inr(summary.bestRev.revenue)} across ${summary.bestRev.matchedSales} attributed sales.`);
    } else {
      out.push(`${summary.bestRev.name} delivered the strongest revenue (${inr(summary.bestRev.revenue)}), while ${summary.bestConv.name} drove the most attributed sales (${summary.bestConv.matchedSales}).`);
    }
  }
  if (aggregates.some((a) => a.sharedReports > 0) && !input.filters.includeUnallocated) {
    const skipped = aggregates.reduce((n, a) => n + a.sharedReports, 0);
    out.push(`${skipped} combined report row${skipped === 1 ? "" : "s"} were excluded because a buyer-level split is unavailable.`);
  }
  return out;
}

function buildRecommendations(input: ComparisonPdfInput): string[] {
  const { aggregates, summary } = input;
  const out: string[] = [];
  if (aggregates.length < 2) {
    if (aggregates.length === 1) {
      const a = aggregates[0];
      if (a.worstCpl != null && a.bestCpl != null && a.worstCpl > a.bestCpl * 1.5) {
        out.push(`Review ${a.name}'s high-CPL dates (worst ${inr(a.worstCpl)} on ${fmtDate(a.worstDate)}) versus their best date (${inr(a.bestCpl)} on ${fmtDate(a.bestDate)}) for creative or audience differences.`);
      }
      return out.length ? out : ["Insufficient data to generate cross-buyer recommendations."];
    }
    return ["Insufficient data to generate recommendations."];
  }
  if (summary.bestCpl && summary.mostLeads && summary.bestCpl.name !== summary.mostLeads.name) {
    const gap = (summary.mostLeads.avgCpl ?? 0) - (summary.bestCpl.avgCpl ?? 0);
    if (gap > 0) {
      out.push(`${summary.bestCpl.name} has CPL ${inr(gap)} lower than ${summary.mostLeads.name}. Consider scaling ${summary.bestCpl.name}'s campaigns if lead quality remains stable.`);
    }
  }
  for (const a of aggregates) {
    if (a.worstCpl != null && a.bestCpl != null && a.worstCpl > a.bestCpl * 2) {
      out.push(`Review ${a.name}'s high-CPL dates — worst day reached ${inr(a.worstCpl)} on ${fmtDate(a.worstDate)} vs best ${inr(a.bestCpl)} on ${fmtDate(a.bestDate)}.`);
    }
  }
  if (summary.bestRev && summary.bestCpl && summary.bestRev.name !== summary.bestCpl.name) {
    out.push(`Compare lead quality between ${summary.bestCpl.name} (best CPL) and ${summary.bestRev.name} (best revenue) before shifting budget — efficient CPL is not always the most profitable.`);
  }
  if (!aggregates.some((a) => a.revenue > 0)) {
    out.push("Revenue attribution missing for this period — link attribution sessions to make ROAS-based recommendations possible.");
  }
  return out.length ? out : ["No critical actions detected. Continue current allocation and monitor weekly."];
}

async function newDoc() {
  const { default: jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = (autoTableMod as any).default || (autoTableMod as any);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  return { doc, autoTable };
}

function filtersChips(f: PdfFilters): string {
  const parts: string[] = [];
  parts.push(`Date: ${f.from ? fmtDate(f.from) : "All"} – ${f.to ? fmtDate(f.to) : "All"}`);
  parts.push(`Buyers: ${f.buyers.length ? f.buyers.join(", ") : "All"}`);
  if (f.account) parts.push(`Account: ${f.account}`);
  if (f.template) parts.push(`Template: ${f.template}`);
  parts.push(`Report Type: ${f.reportType}`);
  parts.push(`Spend Basis: ${f.spendBasis === "gross" ? "Gross / GST-Inclusive" : "Net / Platform"}`);
  parts.push(`Combined Rows: ${f.includeUnallocated ? "Included" : "Excluded"}`);
  if (f.search) parts.push(`Search: "${f.search}"`);
  return parts.join("  •  ");
}

async function renderReport(
  input: ComparisonPdfInput,
  opts: { title: string; subtitle: string; restrictBuyer?: string | null }
): Promise<any> {
  const { doc, autoTable } = await newDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  const { filters, meta, summary } = input;
  const aggregates = opts.restrictBuyer
    ? input.aggregates.filter((a) => a.name === opts.restrictBuyer)
    : input.aggregates;
  const dailyBreakdown = opts.restrictBuyer
    ? input.dailyBreakdown.filter((r) => r.buyerNameRaw.toLowerCase().includes(opts.restrictBuyer!.toLowerCase()))
    : input.dailyBreakdown;

  const footer = () => addFooter(doc, pageW, pageH, margin);
  const chrome = (s = "Media Buyer Performance Report") => addPageChrome(doc, s, meta.basisLabel, pageW, margin);

  // ===== Cover =====
  chrome();
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...INK);
  doc.text(opts.title, margin, 80);
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(...MUTED);
  doc.text(opts.subtitle, margin, 102);

  // Cover meta box
  autoTable(doc, {
    startY: 130,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 8 },
    headStyles: { fillColor: BG, textColor: 0, fontStyle: "bold" },
    head: [["Field", "Value"]],
    body: [
      ["Date Range", `${filters.from ? fmtDate(filters.from) : "All"} – ${filters.to ? fmtDate(filters.to) : "All"}`],
      ["Media Buyers", opts.restrictBuyer || (filters.buyers.length ? filters.buyers.join(", ") : aggregates.map((a) => a.name).join(", ") || "All")],
      ["Spend Basis", filters.spendBasis === "gross" ? "Gross / GST-Inclusive Spend" : "Net / Platform Spend"],
      ["Report Type", filters.reportType],
      ["Ad Account", filters.account || "All"],
      ["Template", filters.template || "All"],
      ["Combined Rows", filters.includeUnallocated ? "Included" : "Excluded (buyer-level split unavailable)"],
      ["Search Filter", filters.search || "—"],
      ["Generated By", meta.generatedBy],
      ["Generated At", fmtDateTime(meta.generatedAt)],
    ],
  });

  // ===== Executive Summary =====
  let y = (doc as any).lastAutoTable.finalY + 24;
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...INK);
  doc.text("Executive Summary", margin, y);
  y += 6;

  const subjectAggs = opts.restrictBuyer ? aggregates : input.aggregates;
  const totalSpend = subjectAggs.reduce((a, b) => a + b.spend, 0);
  const totalLeads = subjectAggs.reduce((a, b) => a + b.leads, 0);
  const overallCpl = totalLeads ? totalSpend / totalLeads : null;
  autoTable(doc, {
    startY: y + 6,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: BG, textColor: 0, fontStyle: "bold" },
    head: [["Metric", "Value"]],
    body: [
      ["Buyers Compared", String(subjectAggs.length)],
      [`Total Spend (${meta.basisLabel})`, inr(totalSpend)],
      ["Total Leads", fmtNum(totalLeads)],
      [`Overall CPL (${meta.basisLabel})`, overallCpl != null ? inr(overallCpl) : "—"],
      ["Best CPL", summary.bestCpl ? `${summary.bestCpl.name} · ${inr(summary.bestCpl.avgCpl!)}` : "N/A"],
      ["Highest Leads", summary.mostLeads ? `${summary.mostLeads.name} · ${fmtNum(summary.mostLeads.leads)}` : "N/A"],
      ["Best Attributed Sales", summary.bestConv ? `${summary.bestConv.name} · ${summary.bestConv.matchedSales}` : "N/A"],
      ["Best Revenue", summary.bestRev ? `${summary.bestRev.name} · ${inr(summary.bestRev.revenue)}` : "N/A"],
    ],
  });

  // Narrative
  y = (doc as any).lastAutoTable.finalY + 16;
  const narrative = buildExecutiveText(input);
  doc.setFont("helvetica", "italic"); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
  for (const line of narrative) {
    const wrapped = doc.splitTextToSize(line, pageW - margin * 2);
    if (y + wrapped.length * 12 > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12 + 4;
  }

  // ===== Comparison Table =====
  if (subjectAggs.length > 0) {
    if (y + 80 > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...INK);
    doc.text("Buyer Comparison Table", margin, y);
    autoTable(doc, {
      startY: y + 6,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold", fontSize: 8 },
      head: [["Media Buyer", "Reports", `Spend (${meta.basisLabel})`, "Leads", `Avg CPL (${meta.basisLabel})`, "Best CPL", "Worst CPL", "Sales", "Revenue", "ROAS", "Quality", "Status"]],
      body: subjectAggs.map((a) => [
        a.name,
        String(a.reportsCount) + (a.sharedReports ? ` (${a.sharedReports} shared)` : ""),
        inr(a.spend), fmtNum(a.leads),
        a.avgCpl != null ? inr(a.avgCpl) : "—",
        a.bestCpl != null ? inr(a.bestCpl) : "—",
        a.worstCpl != null ? inr(a.worstCpl) : "—",
        a.matchedSales ? String(a.matchedSales) : "—",
        a.revenue ? inr(a.revenue) : "—",
        a.realizedRoas != null ? a.realizedRoas.toFixed(2) + "x" : "—",
        a.quality != null ? String(a.quality) : "—",
        a.dataStatus,
      ]),
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  // ===== Buyer-wise cards =====
  for (const a of subjectAggs) {
    if (y + 160 > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
    doc.setFillColor(...BG);
    doc.rect(margin, y, pageW - margin * 2, 24, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...INK);
    doc.text(a.name, margin + 10, y + 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(`Status: ${a.dataStatus}`, pageW - margin - 10, y + 16, { align: "right" });
    y += 28;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [245, 244, 240], textColor: 0, fontStyle: "bold" },
      head: [["Metric", "Value", "Metric", "Value"]],
      body: [
        [`Spend (${meta.basisLabel})`, inr(a.spend), "Leads", fmtNum(a.leads)],
        [`Avg CPL (${meta.basisLabel})`, a.avgCpl != null ? inr(a.avgCpl) : "—", "Reports", String(a.reportsCount)],
        ["Best CPL", a.bestCpl != null ? `${inr(a.bestCpl)} · ${fmtDate(a.bestDate)}` : "—", "Worst CPL", a.worstCpl != null ? `${inr(a.worstCpl)} · ${fmtDate(a.worstDate)}` : "—"],
        ["Attributed Sales", a.matchedSales ? String(a.matchedSales) : "—", "Revenue", a.revenue ? inr(a.revenue) : "—"],
        ["Realized ROAS", a.realizedRoas != null ? a.realizedRoas.toFixed(2) + "x" : "—", "Quality Score", a.quality != null ? String(a.quality) + "/100" : "—"],
      ],
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // ===== Charts (bars with value labels) =====
  if (subjectAggs.length > 0) {
    const chartW = pageW - margin * 2;
    const rowH = 14;
    const sections: { title: string; items: { label: string; value: number; display: string }[]; color: [number, number, number] }[] = [
      {
        title: `Spend Comparison (${meta.basisLabel})`,
        items: subjectAggs.map((a) => ({ label: a.name, value: a.spend, display: inr(a.spend) })),
        color: INK,
      },
      {
        title: "Leads Comparison",
        items: subjectAggs.map((a) => ({ label: a.name, value: a.leads, display: fmtNum(a.leads) })),
        color: GOLD,
      },
      {
        title: `CPL Comparison (${meta.basisLabel})`,
        items: subjectAggs.map((a) => ({ label: a.name, value: a.avgCpl ?? 0, display: a.avgCpl != null ? inr(a.avgCpl) : "—" })),
        color: [37, 99, 235],
      },
    ];
    if (subjectAggs.some((a) => a.revenue > 0 || a.matchedSales > 0)) {
      sections.push({
        title: "Revenue Comparison",
        items: subjectAggs.map((a) => ({ label: a.name, value: a.revenue, display: a.revenue ? inr(a.revenue) : "—" })),
        color: [22, 163, 74],
      });
      sections.push({
        title: "Attributed Sales Comparison",
        items: subjectAggs.map((a) => ({ label: a.name, value: a.matchedSales, display: String(a.matchedSales || "—") })),
        color: [124, 58, 237],
      });
    }
    for (const sec of sections) {
      const blockH = 18 + sec.items.length * (rowH + 4) + 14;
      if (y + blockH > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
      y = drawBarChart(doc, { x: margin, y: y + 6, width: chartW, rowHeight: rowH, title: sec.title, items: sec.items, color: sec.color });
    }
  }

  // ===== Daily Spend / CPL Trend (value table) =====
  const allDates = new Set<string>();
  subjectAggs.forEach((a) => a.daily.forEach((d) => allDates.add(d.date)));
  if (allDates.size > 0) {
    if (y + 60 > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...INK);
    doc.text("Daily Spend Trend", margin, y);
    const dates = Array.from(allDates).sort();
    autoTable(doc, {
      startY: y + 6,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: INK, textColor: 255, fontSize: 8 },
      head: [["Date", ...subjectAggs.map((a) => a.name)]],
      body: dates.map((dt) => [fmtDate(dt), ...subjectAggs.map((a) => {
        const d = a.daily.find((x) => x.date === dt);
        return d ? inr(d.spend) : "—";
      })]),
    });
    y = (doc as any).lastAutoTable.finalY + 14;

    if (y + 60 > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...INK);
    doc.text("Daily CPL Trend", margin, y);
    autoTable(doc, {
      startY: y + 6,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: INK, textColor: 255, fontSize: 8 },
      head: [["Date", ...subjectAggs.map((a) => a.name)]],
      body: dates.map((dt) => [fmtDate(dt), ...subjectAggs.map((a) => {
        const d = a.daily.find((x) => x.date === dt);
        return d && d.cpl != null ? inr(d.cpl) : "—";
      })]),
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // ===== Daily Breakdown =====
  if (dailyBreakdown.length > 0) {
    if (y + 60 > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...INK);
    doc.text("Daily Breakdown", margin, y);
    autoTable(doc, {
      startY: y + 6,
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: INK, textColor: 255, fontSize: 8 },
      head: [["Date", "Report", "Buyer", "Ad Account", "Template", "Spend", "Leads", "CPL", "Status"]],
      body: dailyBreakdown.map((r) => [
        fmtDate(r.reportDate),
        r.reportName || "—",
        r.buyerNameRaw,
        r.adAccounts.join(", ") || "—",
        r.templateName || "—",
        inr(r.spend),
        fmtNum(r.leads),
        r.cpl != null ? inr(r.cpl) : "—",
        r.shared ? "Combined / Split Unavailable" : "Buyer-level",
      ]),
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // ===== Insights =====
  if (y + 80 > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...INK);
  doc.text("Insights & Interpretation", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(50, 50, 50);
  const ins = input.insights.length ? input.insights : buildExecutiveText(input);
  for (const line of ins) {
    const wrapped = doc.splitTextToSize("• " + line, pageW - margin * 2);
    if (y + wrapped.length * 12 > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12 + 2;
  }

  // ===== Recommendations =====
  y += 8;
  if (y + 80 > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...INK);
  doc.text("Recommended Actions", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(50, 50, 50);
  const recs = buildRecommendations({ ...input, aggregates: subjectAggs });
  for (const line of recs) {
    const wrapped = doc.splitTextToSize("→ " + line, pageW - margin * 2);
    if (y + wrapped.length * 12 > pageH - margin - 24) { footer(); doc.addPage(); chrome(); y = 60; }
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12 + 2;
  }

  // Filter chips footer line on last page
  y += 12;
  if (y > pageH - margin - 40) { footer(); doc.addPage(); chrome(); y = 60; }
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(filtersChips(filters), margin, y, { maxWidth: pageW - margin * 2 });

  // Footer on every page
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    addFooter(doc, pageW, pageH, margin);
  }
  return doc;
}

function periodSlug(f: PdfFilters): string {
  if (!f.from && !f.to) return "all";
  return `${f.from || "start"}_to_${f.to || "end"}`;
}

export async function exportComparisonPdf(input: ComparisonPdfInput): Promise<void> {
  const doc = await renderReport(input, {
    title: "Media Buyer Performance Comparison Report",
    subtitle: "India Photographers Club / Marketizers Performance Report",
  });
  doc.save(`Media-Buyer-Comparison-${periodSlug(input.filters)}.pdf`);
}

export async function exportIndividualBuyerPdfs(input: ComparisonPdfInput): Promise<void> {
  for (const a of input.aggregates) {
    const doc = await renderReport(input, {
      title: `${a.name} – Performance Report`,
      subtitle: "India Photographers Club / Marketizers Performance Report",
      restrictBuyer: a.name,
    });
    const safe = a.name.replace(/[^A-Za-z0-9_-]+/g, "_");
    doc.save(`${safe}-Performance-Report-${periodSlug(input.filters)}.pdf`);
    // Small yield between downloads so browser doesn't drop them.
    await new Promise((r) => setTimeout(r, 250));
  }
}
