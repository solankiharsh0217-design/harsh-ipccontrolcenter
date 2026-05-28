import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CompanySettings, Invoice } from "./types";
import { amountToWordsINR } from "./amountInWords";

function fmt(n: number) { return `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function renderInvoicePdf(invoice: Invoice, fallbackCompany: CompanySettings | null): Promise<jsPDF> {
  const seller: any = invoice.seller_snapshot_json || fallbackCompany || {};
  const buyer: any = invoice.buyer_snapshot_json || {
    name: invoice.member_name, email: invoice.member_email, phone: invoice.member_phone,
    billing_address: invoice.billing_address, place_of_supply: invoice.place_of_supply,
  };
  const tax: any = invoice.tax_snapshot_json || {};
  const isGst = invoice.invoice_type === "gst";
  const accent = seller.accent_color || "#111827";

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 36;
  let y = M;

  // Header band
  doc.setFillColor(accent);
  doc.rect(0, 0, W, 6, "F");
  y += 4;

  // Logo + company
  const logoUrl = seller.logo_url;
  if (logoUrl) {
    const data = await loadImageDataUrl(logoUrl);
    if (data) {
      try { doc.addImage(data, "PNG", M, y, 60, 60); } catch { /* */ }
    }
  }

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(seller.legal_name || "Company Name", M + 72, y + 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const sellerLines: string[] = [];
  if (seller.brand_name && seller.brand_name !== seller.legal_name) sellerLines.push(seller.brand_name);
  if (seller.address) sellerLines.push(seller.address);
  const cityLine = [seller.city, seller.state, seller.state_code].filter(Boolean).join(", ");
  if (cityLine) sellerLines.push(cityLine);
  if (seller.email) sellerLines.push(seller.email);
  if (seller.phone) sellerLines.push("Tel: " + seller.phone);
  if (seller.gstin) sellerLines.push("GSTIN: " + seller.gstin);
  if (seller.company_id) sellerLines.push("CIN: " + seller.company_id);
  if (seller.pan) sellerLines.push("PAN: " + seller.pan);
  doc.text(sellerLines, M + 72, y + 32);

  // Title
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  const title = isGst ? "TAX INVOICE" : "INVOICE";
  doc.text(title, W - M, y + 16, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Invoice #: ${invoice.invoice_number || "DRAFT"}`, W - M, y + 32, { align: "right" });
  doc.text(`Date: ${invoice.invoice_date || ""}`, W - M, y + 44, { align: "right" });
  if (invoice.due_date) doc.text(`Due: ${invoice.due_date}`, W - M, y + 56, { align: "right" });

  y += 90;

  // Bill To
  doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 12;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("Bill To", M, y);
  doc.text("Place of Supply", W / 2, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const billLines = [buyer.name, buyer.email, buyer.phone, buyer.billing_address].filter(Boolean) as string[];
  doc.text(billLines, M, y);
  doc.text(buyer.place_of_supply || "—", W / 2, y);
  y += Math.max(billLines.length * 12, 14) + 12;

  // Items table
  const items = invoice.line_items || [];
  const head: any[][] = isGst
    ? [["#", "Item / Description", "HSN/SAC", "Qty", "Rate", "Tax %", "Tax Amt", "Amount"]]
    : [["#", "Item / Description", "Qty", "Rate", "Amount"]];
  const body = items.map((li, i) => {
    const desc = li.description ? `${li.item_name}\n${li.description}` : li.item_name;
    const taxAmt = (li.cgst_amount || 0) + (li.sgst_amount || 0) + (li.igst_amount || 0);
    return isGst
      ? [String(i + 1), desc, li.hsn_sac || "", String(li.quantity), fmt(li.rate), `${li.tax_rate}%`, fmt(taxAmt), fmt(li.amount)]
      : [String(i + 1), desc, String(li.quantity), fmt(li.rate), fmt(li.amount)];
  });

  autoTable(doc, {
    startY: y, head, body, theme: "grid",
    headStyles: { fillColor: hexToRgb(accent), textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    styles: { cellPadding: 5 },
    margin: { left: M, right: M },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Totals
  const totalsX = W - M - 220;
  const right = W - M;
  const lineH = 14;
  doc.setFontSize(9);
  const rows: [string, string][] = [["Subtotal", fmt(invoice.subtotal)]];
  if (invoice.discount_amount) rows.push(["Discount", `- ${fmt(invoice.discount_amount)}`]);
  if (isGst) {
    if (invoice.cgst_amount) rows.push(["CGST", fmt(invoice.cgst_amount)]);
    if (invoice.sgst_amount) rows.push(["SGST", fmt(invoice.sgst_amount)]);
    if (invoice.igst_amount) rows.push(["IGST", fmt(invoice.igst_amount)]);
  }
  if (invoice.adjustment_amount) rows.push(["Adjustment", fmt(invoice.adjustment_amount)]);
  rows.push(["Total", fmt(invoice.total_amount)]);
  rows.push(["Payment Made", `- ${fmt(invoice.payment_made)}`]);
  rows.push(["Balance Due", fmt(invoice.balance_due)]);

  for (const [label, val] of rows) {
    const isBold = label === "Total" || label === "Balance Due";
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.text(label, totalsX, y);
    doc.text(val, right, y, { align: "right" });
    y += lineH;
  }
  doc.setFont("helvetica", "italic"); doc.setFontSize(9);
  y += 4;
  doc.text(`Amount in words: ${invoice.amount_in_words || amountToWordsINR(invoice.total_amount)}`, M, y);
  y += 18;

  // Notes / Terms / Bank
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  if (invoice.notes) {
    doc.text("Notes", M, y); y += 12;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(invoice.notes, W - 2 * M);
    doc.text(noteLines, M, y); y += noteLines.length * 11 + 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  }
  if (invoice.terms_and_conditions) {
    doc.text("Terms & Conditions", M, y); y += 12;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const lines = doc.splitTextToSize(invoice.terms_and_conditions, W - 2 * M);
    doc.text(lines, M, y); y += lines.length * 11 + 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  }

  // Bank
  if (seller.bank_account_number) {
    doc.text("Bank Details", M, y); y += 12;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const bankLines = [
      seller.bank_account_name && `A/c Name: ${seller.bank_account_name}`,
      seller.bank_name && `Bank: ${seller.bank_name}${seller.bank_branch ? ", " + seller.bank_branch : ""}`,
      seller.bank_account_number && `A/c No: ${seller.bank_account_number}`,
      seller.bank_ifsc && `IFSC: ${seller.bank_ifsc}`,
      seller.bank_account_type && `Type: ${seller.bank_account_type}`,
      seller.upi_id && `UPI: ${seller.upi_id}`,
    ].filter(Boolean) as string[];
    doc.text(bankLines, M, y); y += bankLines.length * 11 + 8;
  }

  // Signature / stamp
  const sigY = Math.max(y + 20, doc.internal.pageSize.getHeight() - 110);
  if (seller.signature_url) {
    const data = await loadImageDataUrl(seller.signature_url);
    if (data) { try { doc.addImage(data, "PNG", W - M - 140, sigY - 36, 120, 36); } catch { /* */ } }
  }
  if (seller.stamp_url) {
    const data = await loadImageDataUrl(seller.stamp_url);
    if (data) { try { doc.addImage(data, "PNG", W - M - 240, sigY - 50, 70, 60); } catch { /* */ } }
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Authorized Signature", W - M, sigY + 8, { align: "right" });

  // Footer
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`${seller.brand_name || seller.legal_name || ""} • ${seller.support_email || seller.email || ""}`,
    W / 2, doc.internal.pageSize.getHeight() - 16, { align: "center" });

  return doc;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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
