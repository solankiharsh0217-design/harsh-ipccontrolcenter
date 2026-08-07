import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, SectionLabel, LoadingState, EmptyRow } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { listInvoicesForLead, loadCompanySettings } from "@/lib/invoices/api";
import { downloadInvoicePdf } from "@/lib/invoices/pdf";
import type { CompanySettings, Invoice } from "@/lib/invoices/types";

const db = supabase as any;

export default function PaidLeadInvoicesPage() {
  const { paidLeadId } = useParams();
  const nav = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [lead, setLead] = useState<any>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!paidLeadId) return;
      const [inv, c, l] = await Promise.all([
        listInvoicesForLead(paidLeadId),
        loadCompanySettings(),
        db.from("paid_pipeline_leads").select("id,name,email").eq("id", paidLeadId).maybeSingle(),
      ]);
      setInvoices(inv);
      setCompany(c);
      setLead(l.data);
      setLoading(false);
    })();
  }, [paidLeadId]);

  const downloadOne = async (id: string) => {
    const { data } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
    const { data: items } = await db.from("invoice_line_items").select("*").eq("invoice_id", id).order("sort_order");
    await downloadInvoicePdf({ ...data, line_items: items || [] }, company);
  };

  if (loading) return <div className="p-8"><LoadingState /></div>;

  return (
    <div className="max-w-[1000px]">
      <PageHead title={`Invoices — ${lead?.name || "Lead"}`} sub={lead?.email || ""} />
      <div className="flex justify-end mb-3">
        <Button onClick={() => nav(`/invoices/new?paidLeadId=${paidLeadId}`)}>+ Create Invoice</Button>
      </div>

      <div className="border border-line bg-white rounded-xl overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-off text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Invoice #</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <EmptyRow colSpan={8} title="No invoices yet." />
            )}
            {invoices.map((i) => (
              <tr key={i.id} className="border-t border-line">
                <td className="px-3 py-2 font-mono">{i.invoice_number || "DRAFT"}</td>
                <td className="px-3 py-2">{i.invoice_date || "—"}</td>
                <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-[11px] bg-gray-100">{i.status}</span></td>
                <td className="px-3 py-2">{i.invoice_type}</td>
                <td className="px-3 py-2">{i.invoice_mode}</td>
                <td className="px-3 py-2 text-right font-mono">₹{(i.total_amount || 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono">₹{(i.balance_due || 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-right">
                  <Link to={`/invoices/${i.id}`} className="text-blue-600 hover:underline mr-3">Open</Link>
                  {i.status !== "draft" && (
                    <button onClick={() => downloadOne(i.id!)} className="text-blue-600 hover:underline">PDF</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
