import { useEffect, useState } from "react";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  listAllCatalogItems, listAllItemCategories,
  upsertCatalogItem, upsertItemCategory, deleteCatalogItem, deleteItemCategory,
} from "@/lib/invoices/catalog";
import type { InvoiceCatalogItem, InvoiceItemCategory } from "@/lib/invoices/types";

export default function InvoiceItemCatalogPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<InvoiceCatalogItem[]>([]);
  const [cats, setCats] = useState<InvoiceItemCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCat, setNewCat] = useState("");
  const [newItem, setNewItem] = useState<Partial<InvoiceCatalogItem>>({ item_name: "", default_price: 0, default_gst_rate: 18, is_active: true });

  async function refresh() {
    setLoading(true);
    const [i, c] = await Promise.all([listAllCatalogItems(), listAllItemCategories()]);
    setItems(i); setCats(c);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  if (!isAdmin) return <div className="p-8 text-sm">Admin access required.</div>;
  if (loading) return <div className="p-8 text-sm">Loading…</div>;

  const addCat = async () => {
    if (!newCat.trim()) return;
    try { await upsertItemCategory({ name: newCat.trim(), default_gst_rate: 18, is_active: true }); setNewCat(""); refresh(); toast.success("Category added"); }
    catch (e: any) { toast.error(e.message); }
  };

  const addItem = async () => {
    if (!newItem.item_name?.trim()) { toast.error("Item name required"); return; }
    try { await upsertCatalogItem({ ...newItem, is_active: true }); setNewItem({ item_name: "", default_price: 0, default_gst_rate: 18, is_active: true }); refresh(); toast.success("Item added"); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="max-w-[1100px]">
      <PageHead title="Invoice Item Catalog" sub="Manage reusable items and categories used across invoices." />

      <div className="border border-line bg-white rounded-xl p-5 mb-5">
        <SectionLabel>Categories</SectionLabel>
        <div className="flex gap-2 mt-3">
          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category name" />
          <Button onClick={addCat}>Add</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {cats.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-off border border-line text-[12px]">
              {c.name}
              <button onClick={async () => { if (confirm(`Delete category "${c.name}"?`)) { await deleteItemCategory(c.id); refresh(); } }} className="text-red-500">×</button>
            </span>
          ))}
        </div>
      </div>

      <div className="border border-line bg-white rounded-xl p-5 mb-5">
        <SectionLabel>Add new item</SectionLabel>
        <div className="grid grid-cols-6 gap-2 mt-3 text-[12px]">
          <Input className="col-span-2" placeholder="Item name" value={newItem.item_name || ""} onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })} />
          <select className="border border-input rounded h-10 px-2" value={newItem.category_id || ""} onChange={(e) => setNewItem({ ...newItem, category_id: e.target.value || null })}>
            <option value="">No category</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Input placeholder="HSN/SAC" value={newItem.hsn_sac || ""} onChange={(e) => setNewItem({ ...newItem, hsn_sac: e.target.value })} />
          <Input type="number" placeholder="Price" value={newItem.default_price ?? 0} onChange={(e) => setNewItem({ ...newItem, default_price: Number(e.target.value) })} />
          <Input type="number" placeholder="GST %" value={newItem.default_gst_rate ?? 18} onChange={(e) => setNewItem({ ...newItem, default_gst_rate: Number(e.target.value) })} />
        </div>
        <div className="flex justify-end mt-3"><Button onClick={addItem}>Add item</Button></div>
      </div>

      <div className="border border-line bg-white rounded-xl overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-off text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">HSN/SAC</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">GST %</th>
              <th className="px-3 py-2">Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No items yet.</td></tr>}
            {items.map((i) => (
              <tr key={i.id} className="border-t border-line">
                <td className="px-3 py-2">{i.item_name}</td>
                <td className="px-3 py-2">{cats.find((c) => c.id === i.category_id)?.name || "—"}</td>
                <td className="px-3 py-2 font-mono">{i.hsn_sac || "—"}</td>
                <td className="px-3 py-2 text-right font-mono">₹{Number(i.default_price ?? i.default_rate ?? 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{i.default_gst_rate ?? 0}%</td>
                <td className="px-3 py-2">{i.is_active ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={async () => { if (confirm(`Delete "${i.item_name}"?`)) { await deleteCatalogItem(i.id); refresh(); } }} className="text-red-500">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
