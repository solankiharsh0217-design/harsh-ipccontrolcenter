import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PaidClientSelector from "@/components/invoices/PaidClientSelector";
import { listAllInvoices } from "@/lib/invoices/api";
import { useAuth } from "@/context/AuthContext";
import type { Invoice } from "@/lib/invoices/types";

export default function InvoicesPage() {
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [linked, setLinked] = useState<"all" | "linked" | "unlinked">("all");
  const [from, setFrom] = useState("");
  const [entryOpen, setEntryOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    const data = await listAllInvoices({
      search: search || undefined,
      status: status || undefined,
      type: type || undefined,
      linked,
      from: from || undefined,
      to: to || undefined,
    });
    setRows(data);
    setLoading(false);
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const exportCsv = () => {
    const head = ["Invoice #","Date","Billing Name","Linked Client","Status","Type","Total","Balance"];
    const lines = [head.join(",")];
    rows.forEach((r) => {
      lines.push([
        r.invoice_number || "DRAFT",
        r.invoice_date || "",
        (r.billing_name || r.member_name || "").replace(/,/g, " "),
        (r.linked_client_name || r.member_name || "").replace(/,/g, " "),
        r.status,
        r.invoice_type,
        Number(r.total_amount || 0).toFixed(2),
        Number(r.balance_due || 0).toFixed(2),
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `invoices-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const bal = rows.reduce((s, r) => s + Number(r.balance_due || 0), 0);
    return { total, bal };
  }, [rows]);

  return (
    <div className="max-w-[1300px]">
      <PageHead title="Invoices" sub={`${rows.length} invoices · Total ₹${totals.total.toFixed(0)} · Balance ₹${totals.bal.toFixed(0)}`} />

      <div className="flex flex-wrap gap-2 mb-4">
        <Button onClick={() => nav("/invoices/new")}>+ Create Invoice</Button>
        <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
        {isAdmin && (
          <>
            <Button variant="outline" onClick={() => nav("/admin-center/invoice-settings")}>Invoice Settings</Button>
            <Button variant="outline" onClick={() => nav("/admin-center/item-catalog")}>Item Catalog</Button>
            <Button variant="outline" onClick={() => nav("/admin-center/tax-codes")}>SAC/HSN Master</Button>
          </>
        )}
      </div>

      <div className="border border-line bg-white rounded-xl p-4 mb-4">
        <SectionLabel>Filters</SectionLabel>
        <div className="grid grid-cols-6 gap-2 mt-3 text-[12px]">
          <Input placeholder="Search #, name, email, phone" value={search} onChange={(e) => setSearch(e.target.value)} className="col-span-2" />
          <select className="ipc-input border border-input rounded h-10 px-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
            <option value="void">Void</option>
          </select>
          <select className="ipc-input border border-input rounded h-10 px-2" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Any type</option>
            <option value="gst">GST</option>
            <option value="non_gst">Non-GST</option>
          </select>
          <select className="ipc-input border border-input rounded h-10 px-2" value={linked} onChange={(e) => setLinked(e.target.value as any)}>
            <option value="all">Linked & Unlinked</option>
            <option value="linked">Linked only</option>
            <option value="unlinked">Unlinked only</option>
          </select>
          <Button variant="outline" onClick={refresh}>Apply</Button>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="border border-line bg-white rounded-xl overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-off text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Invoice #</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Billing Name</th>
              <th className="px-3 py-2">Linked Client</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No invoices yet.</td></tr>
            )}
            {!loading && rows.map((i) => {
              const linkedName = i.linked_client_name || i.member_name || "";
              const billing = i.billing_name || i.member_name || "—";
              const differs = linkedName && billing && linkedName !== billing;
              return (
                <tr key={i.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-mono">{i.invoice_number || <span className="text-muted-foreground">DRAFT</span>}</td>
                  <td className="px-3 py-2">{i.invoice_date || "—"}</td>
                  <td className="px-3 py-2">{billing}</td>
                  <td className="px-3 py-2">
                    {i.paid_pipeline_lead_id ? (
                      <Link to={`/paid-pipeline/${i.paid_pipeline_lead_id}/invoices`} className="text-blue-600 hover:underline">
                        {linkedName || "Open"}
                      </Link>
                    ) : <span className="text-muted-foreground italic">Standalone</span>}
                    {differs && <div className="text-[10.5px] text-amber-700">Billing differs from client</div>}
                  </td>
                  <td className="px-3 py-2">{i.invoice_type}</td>
                  <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-[11px] bg-gray-100">{i.status}</span></td>
                  <td className="px-3 py-2 text-right font-mono">₹{Number(i.total_amount || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono">₹{Number(i.balance_due || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link to={`/invoices/${i.id}`} className="text-blue-600 hover:underline">Open</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
