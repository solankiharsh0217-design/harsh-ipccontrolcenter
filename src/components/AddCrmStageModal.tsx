import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STAGE_COLOR_OPTIONS, type Pipeline, type Stage } from "@/lib/crmTypes";

export default function AddCrmStageModal({
  pipelines, stages, defaultPipelineId, onClose, onCreated,
}: {
  pipelines: Pipeline[];
  stages: Stage[];
  defaultPipelineId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [pipelineId, setPipelineId] = useState<string>(defaultPipelineId || (pipelines[0]?.id || ""));
  const [name, setName] = useState("");
  const [color, setColor] = useState("gray");
  const [sortOrder, setSortOrder] = useState<number | "">("");
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (defaultPipelineId) setPipelineId(defaultPipelineId);
  }, [defaultPipelineId]);

  const save = async () => {
    const trimmed = name.trim();
    if (!pipelineId) { toast.error("Select a pipeline"); return; }
    if (!trimmed) { toast.error("Stage name is required"); return; }
    const dup = stages.find(s => s.pipeline_id === pipelineId && s.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) { toast.error("Stage with same name already exists in this pipeline"); return; }
    setBusy(true);
    try {
      const pipeStages = stages.filter(s => s.pipeline_id === pipelineId);
      const pos = sortOrder === "" ? pipeStages.length : Number(sortOrder);
      const { error } = await supabase.from("stages").insert({
        pipeline_id: pipelineId, name: trimmed, color, position: pos,
      } as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Stage added");
      onCreated();
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[520px]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line">
          <div className="font-serif text-[20px]">Add CRM Stage</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">New stage appears immediately in this pipeline's Kanban &amp; filters.</div>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="form-label">Pipeline</label>
            <select className="ipc-input" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Stage name</label>
            <input className="ipc-input" placeholder="e.g. Welcome Call Done" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Color</label>
              <div className="flex items-center gap-1 h-10">
                {STAGE_COLOR_OPTIONS.map((c) => (
                  <button key={c.key} onClick={() => setColor(c.key)} type="button"
                    className={`w-6 h-6 rounded-full border-2 ${color === c.key ? "border-black" : "border-transparent"}`}
                    style={{ background: c.hex }} />
                ))}
              </div>
            </div>
            <div>
              <label className="form-label">Sort order (optional)</label>
              <input type="number" className="ipc-input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value === "" ? "" : Number(e.target.value))} placeholder="end" />
            </div>
          </div>
          <div>
            <label className="form-label">Description (optional)</label>
            <textarea className="ipc-input !h-auto py-2" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
          </label>
        </div>
        <div className="px-6 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black">{busy ? "Saving…" : "Add stage"}</button>
        </div>
      </div>
    </div>
  );
}
