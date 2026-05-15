import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";

type WBatch = { id: string; batch_name: string; webinar_name: string; webinar_date: string | null };
type Product = { id: string; product_name: string; business_unit: string | null };

export default function NewPaidBatchModal({
  onClose, onCreated, defaults,
}: {
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
  defaults?: { source_webinar_batch_id?: string; product_id?: string; business_unit?: string };
}) {
  const { user } = useAuth();
  const [batchName, setBatchName] = useState("");
  const [businessUnit, setBusinessUnit] = useState(defaults?.business_unit || "IPC");
  const [webinarBatchId, setWebinarBatchId] = useState(defaults?.source_webinar_batch_id || "");
  const [productId, setProductId] = useState(defaults?.product_id || "");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Active");
  const [busy, setBusy] = useState(false);
  const [webinars, setWebinars] = useState<WBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: w }, { data: p }] = await Promise.all([
        supabase.from("webinar_batches").select("id, batch_name, webinar_name, webinar_date").eq("is_deleted", false).order("created_at", { ascending: false }).limit(100),
        supabase.from("program_products").select("id, product_name, business_unit").eq("is_active", true).eq("is_deleted", false).order("product_name"),
      ]);
      setWebinars((w as any) || []);
      setProducts((p as any) || []);
    })();
  }, []);

  const save = async () => {
    if (!batchName.trim()) { toast.error("Paid batch name is required"); return; }
    setBusy(true);
    try {
      // Duplicate check
      const { data: existing } = await (supabase as any)
        .from("paid_pipeline_batches")
        .select("id")
        .eq("batch_name", batchName.trim())
        .eq("is_deleted", false)
        .maybeSingle();
      if (existing?.id) {
        toast.error("A paid batch with this name already exists");
        onCreated(existing.id, batchName.trim());
        onClose();
        return;
      }
      const wb = webinars.find(w => w.id === webinarBatchId);
      const pr = products.find(p => p.id === productId);
      const { data, error } = await (supabase as any)
        .from("paid_pipeline_batches")
        .insert({
          batch_name: batchName.trim(),
          business_unit: businessUnit || null,
          source_webinar_batch_id: webinarBatchId || null,
          source_webinar_name: wb?.webinar_name || null,
          source_webinar_date: wb?.webinar_date || null,
          product_id: productId || null,
          product_name_snapshot: pr?.product_name || null,
          description: description || null,
          batch_status: status,
          created_by: user?.id || null,
        })
        .select("id")
        .maybeSingle();
      if (error) { toast.error(error.message); return; }
      toast.success("Paid batch created");
      onCreated(data?.id || "", batchName.trim());
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[560px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line sticky top-0 bg-white z-10">
          <div className="font-serif text-[20px]">New Paid Batch</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">Group paid leads into a reusable batch (separate from webinar &amp; onboarding batches).</div>
        </div>
        <div className="p-6 space-y-3">
          <QuickSaveInput fieldKey="paid_batch_name" label="Paid batch name" value={batchName} onChange={setBatchName} placeholder="e.g. Diamond Token Buyers - May 2026" />
          <div className="grid grid-cols-2 gap-3">
            <QuickSaveInput fieldKey="business_unit" label="Business unit / Coach" value={businessUnit} onChange={setBusinessUnit} placeholder="IPC" />
            <div>
              <label className="qsi-label">Status</label>
              <select className="qsi-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>
          <div>
            <label className="qsi-label">Source webinar batch (optional)</label>
            <select className="qsi-input" value={webinarBatchId} onChange={(e) => setWebinarBatchId(e.target.value)}>
              <option value="">— None —</option>
              {webinars.map(w => <option key={w.id} value={w.id}>{w.batch_name} {w.webinar_date ? `(${w.webinar_date})` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="qsi-label">Product / Program (optional)</label>
            <select className="qsi-input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">— None —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}
            </select>
          </div>
          <div>
            <label className="qsi-label">Description (optional)</label>
            <textarea className="qsi-input !h-auto py-2" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="px-6 py-3 border-t border-line flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black">{busy ? "Saving…" : "Create paid batch"}</button>
        </div>
      </div>
    </div>
  );
}
