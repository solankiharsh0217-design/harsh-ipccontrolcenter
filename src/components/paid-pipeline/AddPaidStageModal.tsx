import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";

const STAGE_TYPES = ["Payment", "Finance / EMI", "Onboarding", "Dropped / Lost", "Custom"];

export default function AddPaidStageModal({
  onClose, onCreated, existingStages,
}: {
  onClose: () => void;
  onCreated: (label: string) => void;
  existingStages: string[];
}) {
  const { user } = useAuth();
  const [label, setLabel] = useState("");
  const [stageType, setStageType] = useState("Payment");
  const [color, setColor] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(100);
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = label.trim();
    if (!trimmed) { toast.error("Stage name is required"); return; }
    if (existingStages.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("A stage with this name already exists");
      return;
    }
    setBusy(true);
    try {
      const valueObj = { stage_type: stageType, color, description };
      const { error } = await supabase.from("paid_pipeline_settings").insert({
        setting_type: "pipeline_stage",
        label: trimmed,
        value: JSON.stringify(valueObj),
        sort_order: sortOrder,
        is_active: active,
        created_by: user?.id || null,
      } as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Stage added");
      onCreated(trimmed);
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[520px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line">
          <div className="font-serif text-[20px]">Add Paid Pipeline Stage</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">New stage will appear instantly in dropdowns and filters.</div>
        </div>
        <div className="p-6 space-y-3">
          <QuickSaveInput fieldKey="paid_pipeline_stage" label="Stage name" value={label} onChange={setLabel} placeholder="e.g. Second Token Pending" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="qsi-label">Stage type</label>
              <select className="qsi-input" value={stageType} onChange={(e) => setStageType(e.target.value)}>
                {STAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="qsi-label">Sort order</label>
              <input type="number" className="qsi-input" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </div>
            <div>
              <label className="qsi-label">Color (optional hex)</label>
              <input className="qsi-input" placeholder="#CA8A04" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            <div>
              <label className="qsi-label">Active</label>
              <select className="qsi-input" value={active ? "y" : "n"} onChange={(e) => setActive(e.target.value === "y")}>
                <option value="y">Active</option>
                <option value="n">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="qsi-label">Description (optional)</label>
            <textarea className="qsi-input !h-auto py-2" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="px-6 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black">{busy ? "Saving…" : "Add stage"}</button>
        </div>
      </div>
    </div>
  );
}
