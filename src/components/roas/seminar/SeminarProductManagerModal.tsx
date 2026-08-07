import { useEffect, useState } from "react";
import { X, Plus, Archive, RotateCcw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/auditLog";
import {
  listAllCatalogProductsForAdmin,
  upsertCatalogProduct,
  archiveCatalogProduct,
  restoreCatalogProduct,
  type CatalogProduct,
  type ProductGstMode,
  computeProductGst,
} from "@/lib/roas/seminarProduct";
import { inr } from "@/lib/format";
import { LoadingState } from "@/components/ui-bits";

interface Props {
  onClose: () => void;
  onChanged: () => void; // parent refreshes the product list
}

type FormState = {
  id: string | null;
  product_name: string;
  business_unit: string;
  price: string;
  gstMode: ProductGstMode;
  gstPercent: string;
  is_active: boolean;
};

const emptyForm = (): FormState => ({
  id: null, product_name: "", business_unit: "IPC", price: "", gstMode: "excludes_gst", gstPercent: "18", is_active: true,
});



export default function SeminarProductManagerModal({ onClose, onChanged }: Props) {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setRows(await listAllCatalogProductsForAdmin());
    } catch (e: any) {
      toast.error(e?.message || "Failed to load products");
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const startCreate = () => setForm(emptyForm());
  const startEdit = (p: CatalogProduct) => setForm({
    id: p.id,
    product_name: p.product_name,
    business_unit: p.business_unit || "IPC",
    // program_products stores gross (including-GST) price → open the form pre-set to includes_gst
    price: String(p.product_price_including_gst ?? 0),
    gstMode: "includes_gst",
    gstPercent: String(p.gst_rate ?? 18),
    is_active: p.is_active,
  });

  const save = async () => {
    if (!form) return;
    const name = form.product_name.trim();
    const price = Number(form.price);
    const rate = Number(form.gstPercent);
    if (!name) { toast.error("Product name is required"); return; }
    if (!(price > 0)) { toast.error("Enter a valid price"); return; }
    if (rate < 0) { toast.error("GST percentage cannot be negative"); return; }
    setBusy(true);
    try {
      const saved = await upsertCatalogProduct({
        id: form.id, product_name: name, business_unit: form.business_unit,
        price, gstMode: form.gstMode, gstPercent: rate, is_active: form.is_active,
      }, user?.id ?? null);
      await logActivity({
        module_key: "roas",
        action_type: form.id ? "roas_product_updated" : "roas_product_created",
        entity_type: "program_product",
        entity_id: saved.id,
        entity_label: saved.product_name,
      });
      toast.success(form.id ? "Product updated" : "Product created");
      setForm(null);
      await refresh();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally { setBusy(false); }
  };

  const archive = async (p: CatalogProduct) => {
    if (!confirm(`Archive "${p.product_name}"? Old reports will keep their snapshot values.`)) return;
    try {
      await archiveCatalogProduct(p.id);
      await logActivity({ module_key: "roas", action_type: "roas_product_archived", entity_type: "program_product", entity_id: p.id, entity_label: p.product_name });
      toast.success("Product archived");
      await refresh(); onChanged();
    } catch (e: any) { toast.error(e?.message || "Failed to archive"); }
  };

  const restore = async (p: CatalogProduct) => {
    try {
      await restoreCatalogProduct(p.id);
      await logActivity({ module_key: "roas", action_type: "roas_product_restored", entity_type: "program_product", entity_id: p.id, entity_label: p.product_name });
      toast.success("Product restored");
      await refresh(); onChanged();
    } catch (e: any) { toast.error(e?.message || "Failed to restore"); }
  };

  const preview = form ? computeProductGst(Number(form.price) || 0, form.gstMode, Number(form.gstPercent) || 0) : null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost',sans-serif",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--ww)", borderRadius: 12, border: "1px solid var(--bd)", width: "100%", maxWidth: 780,
        maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--bd)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18 }}>Manage Products / Offers</div>
          <button className="srBtn srBtn-g" style={{ width: 32, height: 30, padding: 0, justifyContent: "center" }} onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isAdmin && (
          <div className="srHint" style={{ margin: "12px 20px 0" }}>
            Only admins can create, edit, archive or restore products.
          </div>
        )}

        <div style={{ padding: "14px 20px", overflowY: "auto", flex: 1 }}>
          {!form ? (
            <>
              {isAdmin && (
                <button className="srBtn srBtn-k" onClick={startCreate} style={{ marginBottom: 12 }}>
                  <Plus className="w-3.5 h-3.5" /> Create Product
                </button>
              )}
              {loading ? (
                <div style={{ padding: 20 }}><LoadingState label="Loading catalog…" /></div>
              ) : rows.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "var(--mt)", fontSize: 12 }}>No products yet.</div>
              ) : (
                <table className="srTbl" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Programme</th>
                      <th style={{ textAlign: "right" }}>Price (incl. GST)</th>
                      <th>GST %</th>
                      <th>Status</th>
                      {isAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
                        <td>{p.product_name}</td>
                        <td>{p.business_unit || "—"}</td>
                        <td style={{ textAlign: "right" }}>{inr(Number(p.product_price_including_gst || 0))}</td>
                        <td>{Number(p.gst_rate || 0)}%</td>
                        <td>{p.is_active ? "Active" : "Archived"}</td>
                        {isAdmin && (
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <button className="srBtn srBtn-g" style={{ height: 28, fontSize: 11 }} onClick={() => startEdit(p)}>
                              <Pencil className="w-3 h-3" /> Edit
                            </button>{" "}
                            {p.is_active ? (
                              <button className="srBtn srBtn-d" style={{ height: 28, fontSize: 11 }} onClick={() => archive(p)}>
                                <Archive className="w-3 h-3" /> Archive
                              </button>
                            ) : (
                              <button className="srBtn srBtn-g" style={{ height: 28, fontSize: 11 }} onClick={() => restore(p)}>
                                <RotateCcw className="w-3 h-3" /> Restore
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <div className="srGrid c2" style={{ gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="srLbl">Product / Offer Name *</div>
                <input className="srInput" value={form.product_name}
                  onChange={(e) => setForm({ ...form, product_name: e.target.value })} placeholder="e.g. IPC Diamond Membership" />
              </div>
              <div>
                <div className="srLbl">Programme / Business Unit</div>
                <input className="srInput" value={form.business_unit}
                  onChange={(e) => setForm({ ...form, business_unit: e.target.value })} placeholder="IPC / IWC" />
              </div>
              <div>
                <div className="srLbl">Default Price *</div>
                <input className="srInput" type="number" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0" />
              </div>
              <div>
                <div className="srLbl">GST Mode *</div>
                <select className="srSelect" value={form.gstMode}
                  onChange={(e) => setForm({ ...form, gstMode: e.target.value as ProductGstMode })}>
                  <option value="excludes_gst">Excludes GST</option>
                  <option value="includes_gst">Includes GST</option>
                </select>
              </div>
              <div>
                <div className="srLbl">GST %</div>
                <input className="srInput" type="number" value={form.gstPercent}
                  onChange={(e) => setForm({ ...form, gstPercent: e.target.value })} placeholder="18" />
              </div>
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })} id="pm-active" />
                <label htmlFor="pm-active" style={{ fontSize: 12 }}>Active</label>
              </div>
              {preview && Number(form.price) > 0 && (
                <div style={{ gridColumn: "1 / -1" }} className="srHint">
                  Net: <strong>{inr(preview.net)}</strong> · GST: <strong>{inr(preview.gst)}</strong> · Gross: <strong>{inr(preview.gross)}</strong>
                </div>
              )}
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="srBtn srBtn-g" onClick={() => setForm(null)} disabled={busy}>Cancel</button>
                <button className="srBtn srBtn-k" onClick={save} disabled={busy || !isAdmin}>
                  {busy ? "Saving…" : (form.id ? "Update Product" : "Create Product")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
