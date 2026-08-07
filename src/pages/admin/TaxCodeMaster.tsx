import { useEffect, useState } from "react";
import { PageHead, SectionLabel, LoadingRow } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { listAllTaxCodes, searchTaxCodes, upsertTaxCode, deleteTaxCode } from "@/lib/invoices/taxCodes";
import type { TaxCode } from "@/lib/invoices/types";

export default function TaxCodeMasterPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<TaxCode[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [newC, setNewC] = useState<Partial<TaxCode>>({ type: "SAC", code: "", description: "", gst_rate_default: 18, is_active: true });

  async function refresh() {
    setLoading(true);
    const data = q.trim().length >= 3 ? await searchTaxCodes(q) : await listAllTaxCodes();
    setRows(data); setLoading(false);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  if (!isAdmin) return <div className="p-8 text-sm">Admin access required.</div>;

  const add = async () => {
    if (!newC.code?.trim() || !newC.description?.trim()) { toast.error("Code & description required"); return; }
    try {
      await upsertTaxCode({ ...newC, keywords: newC.keywords || [] });
      setNewC({ type: "SAC", code: "", description: "", gst_rate_default: 18, is_active: true });
      refresh();
      toast.success("Tax code added");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="max-w-[1100px]">
      <PageHead title="SAC / HSN Master" sub="Reusable tax code catalog used by the Find SAC/HSN finder in invoice line items." />

      <div className="border border-line bg-white rounded-xl p-5 mb-5">
        <SectionLabel>Add new code</SectionLabel>
        <div className="grid grid-cols-6 gap-2 mt-3 text-[12px]">
          <select className="border border-input rounded h-10 px-2" value={newC.type} onChange={(e) => setNewC({ ...newC, type: e.target.value as any })}>
            <option value="SAC">SAC</option>
            <option value="HSN">HSN</option>
          </select>
          <Input placeholder="Code" value={newC.code || ""} onChange={(e) => setNewC({ ...newC, code: e.target.value })} />
          <Input className="col-span-2" placeholder="Description" value={newC.description || ""} onChange={(e) => setNewC({ ...newC, description: e.target.value })} />
          <Input placeholder="Category" value={newC.category || ""} onChange={(e) => setNewC({ ...newC, category: e.target.value })} />
          <Input type="number" placeholder="GST %" value={newC.gst_rate_default ?? 18} onChange={(e) => setNewC({ ...newC, gst_rate_default: Number(e.target.value) })} />
        </div>
        <Input className="mt-2" placeholder="Comma-separated keywords (e.g. coaching, training)" onBlur={(e) => setNewC({ ...newC, keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
        <div className="flex justify-end mt-3"><Button onClick={add}>Add</Button></div>
      </div>

      <div className="flex gap-2 mb-3">
        <Input placeholder="Search code, description, keyword (3+ chars)" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="outline" onClick={refresh}>Search</Button>
      </div>

      <div className="border border-line bg-white rounded-xl overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-off text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">GST %</th>
              <th className="px-3 py-2">Keywords</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={7} />}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No codes.</td></tr>}
            {!loading && rows.map((c) => (
              <tr key={c.id} className="border-t border-line align-top">
                <td className="px-3 py-2 font-mono">{c.code}</td>
                <td className="px-3 py-2">{c.type}</td>
                <td className="px-3 py-2">{c.description}</td>
                <td className="px-3 py-2">{c.category || "—"}</td>
                <td className="px-3 py-2 text-right">{c.gst_rate_default ?? "—"}</td>
                <td className="px-3 py-2 text-[11px] text-muted-foreground">{(c.keywords || []).join(", ")}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={async () => { if (confirm(`Delete code ${c.code}?`)) { await deleteTaxCode(c.id); refresh(); } }} className="text-red-500">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
