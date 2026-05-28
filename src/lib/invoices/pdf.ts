import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CompanySettings, Invoice } from "./types";
import { amountToWordsINR } from "./amountInWords";

// ---------- Currency ----------
function formatNumberINR(n: number): string {
  const fixed = Math.abs(n).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const lastThree = intPart.slice(-3);
  const otherNumbers = intPart.slice(0, -3);
  const formattedInt =
    (otherNumbers ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : "") + lastThree;
  return `${formattedInt}.${decPart}`;
}

export function formatINR(amount: number | null | undefined): string {
  const n = Number(amount) || 0;
  return `${n < 0 ? "(-) " : ""}Rs. ${formatNumberINR(n)}`;
}

// Compact form for table cells (no currency prefix; saves column width)
function formatAmt(amount: number | null | undefined): string {
  const n = Number(amount) || 0;
  return `${n < 0 ? "-" : ""}${formatNumberINR(n)}`;
}

async function loadImageDataUrl(
  url: string
): Promise<{ data: string; format: "PNG" | "JPEG" | "WEBP" } | null> {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    const blob = await r.blob();
    const mime = (blob.type || "").toLowerCase();
    const dataUrl = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.readAsDataURL(blob);
    });
    let format: "PNG" | "JPEG" | "WEBP" = "PNG";
    if (mime.includes("jpeg") || mime.includes("jpg")) format = "JPEG";
    else if (mime.includes("webp")) format = "WEBP";
    else if (mime.includes("png")) format = "PNG";
    else {
      const lower = url.toLowerCase();
      if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) format = "JPEG";
      else if (lower.endsWith(".webp")) format = "WEBP";
    }
    return { data: dataUrl, format };
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "#111827").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function renderInvoicePdf(
  invoice: Invoice,
  fallbackCompany: CompanySettings | null
): Promise<jsPDF> {
  const seller: any = invoice.seller_snapshot_json || fallbackCompany || {};
  const buyer: any =
    invoice.buyer_snapshot_json || {
      name: invoice.member_name,
      email: invoice.member_email,
      phone: invoice.member_phone,
      billing_address: invoice.billing_address,
      place_of_supply: invoice.place_of_supply,
    };
  const isGst = invoice.invoice_type === "gst";
  const hasCgstSgst = isGst && (invoice.cgst_amount > 0 || invoice.sgst_amount > 0);
  const hasIgst = isGst && invoice.igst_amount > 0;
  const accent = seller.accent_color || "#111827";
  const accentRgb = hexToRgb(accent);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const contentW = W - 2 * M;
  let y = M;

  // Top accent bar
  doc.setFillColor(...accentRgb);
  doc.rect(0, 0, W, 4, "F");
  y = M;

  // ---------- HEADER (two columns, fixed widths) ----------
  const leftColW = contentW * 0.55;
  const rightColX = M + leftColW + 16;
  const rightColW = contentW - leftColW - 16;

  // Logo
  let leftTextX = M;
  let leftTextY = y;
  if (seller.logo_url) {
    const img = await loadImageDataUrl(seller.logo_url);
    if (img) {
      try {
        doc.addImage(img.data, img.format, M, y, 48, 48);
        leftTextX = M + 56;
      } catch {
        /* */
      }
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20);
  const legalName = seller.legal_name || seller.brand_name || "Company Name";
  const nameLines = doc.splitTextToSize(legalName, leftColW - (leftTextX - M));
  doc.text(nameLines, leftTextX, leftTextY + 12);
  let leftY = leftTextY + 12 + nameLines.length * 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60);
  const sellerLines: string[] = [];
  if (seller.brand_name && seller.brand_name !== legalName) sellerLines.push(seller.brand_name);
  if (seller.address) sellerLines.push(seller.address);
  const cityLine = [seller.city, seller.state, seller.state_code].filter(Boolean).join(", ");
  if (cityLine) sellerLines.push(cityLine);
  if (seller.country) sellerLines.push(seller.country);
  if (seller.gstin) sellerLines.push("GSTIN: " + seller.gstin);
  if (seller.pan) sellerLines.push("PAN: " + seller.pan);
  if (seller.company_id) sellerLines.push("CIN: " + seller.company_id);
  if (seller.email) sellerLines.push(seller.email);
  if (seller.phone) sellerLines.push("Tel: " + seller.phone);
  const wrappedSeller = doc.splitTextToSize(sellerLines.join("\n"), leftColW - (leftTextX - M));
  doc.text(wrappedSeller, leftTextX, leftY + 10);
  leftY += 10 + wrappedSeller.length * 11;

  // Right column — TAX INVOICE block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20);
  const title = isGst ? "TAX INVOICE" : "INVOICE";
  doc.text(title, W - M, y + 14, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  let rY = y + 32;
  doc.text("Invoice #", rightColX, rY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20);
  doc.text(invoice.invoice_number || "DRAFT", W - M, rY, { align: "right" });
  rY += 14;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text("Invoice Date", rightColX, rY);
  doc.setTextColor(20);
  doc.text(invoice.invoice_date || "—", W - M, rY, { align: "right" });
  rY += 14;

  if (invoice.terms) {
    doc.setTextColor(80);
    doc.text("Terms", rightColX, rY);
    doc.setTextColor(20);
    doc.text(String(invoice.terms), W - M, rY, { align: "right" });
    rY += 14;
  }
  if (invoice.due_date) {
    doc.setTextColor(80);
    doc.text("Due Date", rightColX, rY);
    doc.setTextColor(20);
    doc.text(invoice.due_date, W - M, rY, { align: "right" });
    rY += 14;
  }

  // Balance Due highlighted box
  rY += 4;
  doc.setFillColor(245, 247, 250);
  doc.rect(rightColX, rY, rightColW, 28, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text("Balance Due", rightColX + 8, rY + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text(formatINR(invoice.balance_due), W - M - 8, rY + 18, { align: "right" });
  rY += 36;

  y = Math.max(leftY, rY) + 14;

  // ---------- BILL TO / META ----------
  doc.setDrawColor(225);
  doc.line(M, y, W - M, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("BILL TO", M, y);
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(20);
  doc.text(buyer.name || invoice.member_name || "—", M, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  const billLines: string[] = [];
  if (buyer.billing_address || invoice.billing_address)
    billLines.push(String(buyer.billing_address || invoice.billing_address));
  if (buyer.email || invoice.member_email) billLines.push(String(buyer.email || invoice.member_email));
  if (buyer.phone || invoice.member_phone) billLines.push(String(buyer.phone || invoice.member_phone));
  const billWrapped = doc.splitTextToSize(billLines.join("\n"), contentW * 0.6);
  doc.text(billWrapped, M, y);
  y += billWrapped.length * 11 + 8;

  // Place of supply
  if (isGst && (buyer.place_of_supply || invoice.place_of_supply)) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("Place Of Supply: ", M, y);
    const labelW = doc.getTextWidth("Place Of Supply: ");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20);
    doc.text(String(buyer.place_of_supply || invoice.place_of_supply), M + labelW, y);
    y += 14;
  }

  y += 6;

  // ---------- ITEM TABLE ----------
  const items = invoice.line_items || [];

  let head: any[];
  let colStyles: any = {};
  let body: any[][];

  if (hasCgstSgst) {
    head = ["#", "Item & Description", "HSN/SAC", "Qty", "Rate", "CGST", "SGST", "Amount"];
    const widths = [0.04, 0.32, 0.09, 0.06, 0.11, 0.115, 0.115, 0.14];
    widths.forEach((w, i) => {
      colStyles[i] = {
        cellWidth: contentW * w,
        halign: i >= 3 ? "right" : i === 0 ? "center" : "left",
      };
    });
    body = items.map((li, i) => {
      const desc = li.description ? `${li.item_name}\n${li.description}` : li.item_name;
      return [
        String(i + 1),
        desc,
        li.hsn_sac || "",
        String(li.quantity),
        formatAmt(li.rate),
        `${formatAmt(li.cgst_amount)}\n(${li.tax_rate / 2}%)`,
        `${formatAmt(li.sgst_amount)}\n(${li.tax_rate / 2}%)`,
        formatAmt(li.amount),
      ];
    });
  } else if (hasIgst) {
    head = ["#", "Item & Description", "HSN/SAC", "Qty", "Rate", "IGST", "Amount"];
    const widths = [0.04, 0.36, 0.1, 0.07, 0.13, 0.15, 0.15];
    widths.forEach((w, i) => {
      colStyles[i] = {
        cellWidth: contentW * w,
        halign: i >= 3 ? "right" : i === 0 ? "center" : "left",
      };
    });
    body = items.map((li, i) => {
      const desc = li.description ? `${li.item_name}\n${li.description}` : li.item_name;
      return [
        String(i + 1),
        desc,
        li.hsn_sac || "",
        String(li.quantity),
        formatAmt(li.rate),
        `${formatAmt(li.igst_amount)}\n(${li.tax_rate}%)`,
        formatAmt(li.amount),
      ];
    });
  } else {
    head = ["#", "Item & Description", "HSN/SAC", "Qty", "Rate", "Amount"];
    const widths = [0.05, 0.47, 0.12, 0.08, 0.14, 0.14];
    widths.forEach((w, i) => {
      colStyles[i] = {
        cellWidth: contentW * w,
        halign: i >= 3 ? "right" : i === 0 ? "center" : "left",
      };
    });
    body = items.map((li, i) => {
      const desc = li.description ? `${li.item_name}\n${li.description}` : li.item_name;
      return [
        String(i + 1),
        desc,
        li.hsn_sac || "",
        String(li.quantity),
        formatAmt(li.rate),
        formatAmt(li.amount),
      ];
    });
  }

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    theme: "grid",
    headStyles: {
      fillColor: accentRgb,
      textColor: 255,
      fontSize: 8.5,
      fontStyle: "bold",
      halign: "left",
      cellPadding: { top: 6, right: 4, bottom: 6, left: 4 },
    },
    bodyStyles: {
      fontSize: 8.5,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      textColor: 30,
      valign: "top",
      overflow: "linebreak",
    },
    columnStyles: colStyles,
    margin: { left: M, right: M },
    tableWidth: contentW,
    didParseCell: (data) => {
      // Right-align header for numeric columns
      if (data.section === "head" && data.column.index >= 3) {
        data.cell.styles.halign = "right";
      }
      if (data.section === "head" && data.column.index === 0) {
        data.cell.styles.halign = "center";
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // ---------- TOTALS ----------
  const totalsW = 240;
  const totalsX = W - M - totalsW;
  const labelX = totalsX + 8;
  const valueX = W - M - 8;
  const rowH = 16;

  const rows: Array<{ label: string; value: string; bold?: boolean; highlight?: boolean }> = [];
  rows.push({ label: "Sub Total", value: formatINR(invoice.taxable_amount || invoice.subtotal) });
  if (invoice.discount_amount) rows.push({ label: "Discount", value: "(-) " + formatINR(invoice.discount_amount) });
  if (hasCgstSgst) {
    rows.push({ label: "CGST", value: formatINR(invoice.cgst_amount) });
    rows.push({ label: "SGST", value: formatINR(invoice.sgst_amount) });
  }
  if (hasIgst) rows.push({ label: "IGST", value: formatINR(invoice.igst_amount) });
  if (invoice.adjustment_amount) rows.push({ label: "Adjustment", value: formatINR(invoice.adjustment_amount) });
  rows.push({ label: "Total", value: formatINR(invoice.total_amount), bold: true });
  if (invoice.payment_made) rows.push({ label: "Payment Made", value: "(-) " + formatINR(invoice.payment_made) });
  rows.push({ label: "Balance Due", value: formatINR(invoice.balance_due), bold: true, highlight: true });

  // Page break if needed
  const totalsHeight = rows.length * rowH + 8;
  if (y + totalsHeight > H - 80) {
    doc.addPage();
    y = M;
  }

  for (const r of rows) {
    if (r.highlight) {
      doc.setFillColor(245, 247, 250);
      doc.rect(totalsX, y - 11, totalsW, rowH, "F");
    }
    doc.setFont("helvetica", r.bold ? "bold" : "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(20);
    doc.text(r.label, labelX, y);
    doc.text(r.value, valueX, y, { align: "right" });
    y += rowH;
  }
  y += 8;

  // Amount in words
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(60);
  const wordsLabel = "Total In Words: ";
  const wordsValue = invoice.amount_in_words || amountToWordsINR(invoice.total_amount);
  const wordsLines = doc.splitTextToSize(wordsLabel + wordsValue, contentW);
  if (y + wordsLines.length * 11 > H - 60) {
    doc.addPage();
    y = M;
  }
  doc.text(wordsLines, M, y);
  y += wordsLines.length * 11 + 14;

  // ---------- NOTES / TERMS / BANK ----------
  const renderBlock = (heading: string, text: string) => {
    const wrapped = doc.splitTextToSize(text, contentW);
    const blockH = 16 + wrapped.length * 11 + 6;
    if (y + blockH > H - 80) {
      doc.addPage();
      y = M;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(20);
    doc.text(heading, M, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(wrapped, M, y);
    y += wrapped.length * 11 + 8;
  };

  if (invoice.notes) renderBlock("Notes", invoice.notes);
  if (invoice.terms_and_conditions) renderBlock("Terms & Conditions", invoice.terms_and_conditions);

  if (seller.bank_account_number || seller.bank_name) {
    const bankLines = [
      seller.bank_account_name && `Account Name: ${seller.bank_account_name}`,
      seller.bank_name && `Bank Name: ${seller.bank_name}${seller.bank_branch ? " (" + seller.bank_branch + ")" : ""}`,
      seller.bank_account_number && `Account Number: ${seller.bank_account_number}`,
      seller.bank_ifsc && `IFSC Code: ${seller.bank_ifsc}`,
      seller.bank_account_type && `Account Type: ${seller.bank_account_type}`,
      seller.upi_id && `UPI: ${seller.upi_id}`,
    ].filter(Boolean) as string[];
    if (bankLines.length) renderBlock("Bank Details", bankLines.join("\n"));
  }

  // ---------- SIGNATURE + STAMP ----------
  const sigBlockH = 80;
  if (y + sigBlockH > H - 40) {
    doc.addPage();
    y = M;
  }
  const sigY = y + 10;
  const sigRight = W - M;
  const sigBoxW = 160;
  const sigBoxH = 44;
  const sigBoxX = sigRight - sigBoxW;

  // Stamp (optional) — placed to the left of signature
  if (seller.stamp_url) {
    const stamp = await loadImageDataUrl(seller.stamp_url);
    if (stamp) {
      try {
        const stampW = 60;
        doc.addImage(stamp.data, stamp.format, sigBoxX - stampW - 16, sigY, stampW, 60);
      } catch {
        /* ignore */
      }
    }
  }

  let signatureRendered = false;
  if (seller.signature_url) {
    const img = await loadImageDataUrl(seller.signature_url);
    if (img) {
      try {
        doc.addImage(img.data, img.format, sigBoxX, sigY, sigBoxW, sigBoxH);
        signatureRendered = true;
      } catch {
        signatureRendered = false;
      }
    }
  }
  if (!signatureRendered) {
    doc.setDrawColor(180);
    doc.line(sigBoxX, sigY + sigBoxH - 4, sigRight, sigY + sigBoxH - 4);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text("Authorized Signature", sigRight, sigY + sigBoxH + 12, { align: "right" });
  y = sigY + sigBoxH + 20;

  // Footer page numbers
  const pageCount = (doc as any).internal.getNumberOfPages();
  if (pageCount > 1) {
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Page ${i} of ${pageCount}`, W / 2, H - 18, { align: "center" });
    }
  }

  return doc;
}

export async function downloadInvoicePdf(invoice: Invoice, company: CompanySettings | null) {
  const doc = await renderInvoicePdf(invoice, company);
  doc.save(`${invoice.invoice_number || "draft"}.pdf`);
}

export async function openInvoicePdf(invoice: Invoice, company: CompanySettings | null) {
  const doc = await renderInvoicePdf(invoice, company);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
