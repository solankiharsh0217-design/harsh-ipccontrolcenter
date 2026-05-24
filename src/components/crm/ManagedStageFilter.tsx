import { useMemo, useState } from "react";
import { Layers, X, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import type { Stage } from "@/lib/crmTypes";

export default function ManagedStageFilter({
  value,
  onChange,
  stages,
  pipelineId,
  leadsCountByStage,
  onChanged,
}: {
  value: string;
  onChange: (v: string) => void;
  stages: Stage[];
  pipelineId: string | null;
  leadsCountByStage: Record<string, number>;
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return stages;
    return stages.filter((s) => s.name.toLowerCase().includes(term));
  }, [stages, q]);

  const exactMatch = useMemo(() => {
    const term = q.trim().toLowerCase();
    return !!term && stages.some((s) => s.name.toLowerCase() === term);
  }, [stages, q]);

  const current = stages.find((s) => s.id === value);
  const label = value === "all" ? "All stages" : current?.name || "All stages";

  const handleCreate = async () => {
    const name = q.trim();
    if (!name || !pipelineId) return;
    const { data, error } = await supabase.from("stages").insert({
      pipeline_id: pipelineId,
      name,
      color: "gray",
      position: stages.length,
    } as any).select().maybeSingle();
    if (error) { toast.error(error.message); return; }
    toast.success(`Stage "${name}" created`);
    logActivity({ module_key: "calling_crm", action_type: "crm_stage_created", entity_type: "crm_stage", entity_id: (data as any)?.id, entity_label: name, summary: `Stage "${name}" created` });
    setQ("");
    await onChanged();
    if ((data as any)?.id) onChange((data as any).id);
    setOpen(false);
  };

  const handleDelete = async (s: Stage) => {
    if (s.is_protected) { toast.error("Protected stage — cannot delete"); return; }
    const count = leadsCountByStage[s.id] || 0;
    if (count > 0) {
      toast.error(`${count} lead(s) still in "${s.name}". Move them first.`);
      return;
    }
    if (!confirm(`Delete stage "${s.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("stages").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Stage "${s.name}" deleted`);
    logActivity({ module_key: "calling_crm", action_type: "crm_stage_deleted", entity_type: "crm_stage", entity_id: s.id, entity_label: s.name, summary: `Stage "${s.name}" deleted`, severity: "warning" });
    if (value === s.id) onChange("all");
    await onChanged();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ipc-input !h-10 !text-xs flex items-center gap-1.5 min-w-[160px] justify-between bg-white"
          title="Filter & manage stages"
        >
          <span className="flex items-center gap-1.5 truncate"><Layers className="w-3.5 h-3.5" /> {label}</span>
          <span className="text-[9px] text-muted-foreground">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        className="z-[1100] w-[300px] p-0 bg-white border border-line rounded-md shadow-lg overflow-hidden"
      >
        <div className="p-2 border-b border-line flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stages…"
            className="flex-1 text-xs outline-none bg-transparent"
            onKeyDown={(e) => { if (e.key === "Enter" && q.trim() && !exactMatch && pipelineId) handleCreate(); }}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange("all"); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-off ${value === "all" ? "bg-off font-medium" : ""}`}
          >All stages</button>
          {filtered.map((s) => {
            const selected = value === s.id;
            const count = leadsCountByStage[s.id] || 0;
            return (
              <div key={s.id} className={`group flex items-center hover:bg-off ${selected ? "bg-off" : ""}`}>
                <button
                  type="button"
                  onClick={() => { onChange(s.id); setOpen(false); }}
                  className="flex-1 text-left px-3 py-1.5 text-xs truncate flex items-center justify-between gap-2"
                >
                  <span className="truncate">{s.name}</span>
                  <span className="text-[10px] text-muted-foreground">{count}</span>
                </button>
                {!s.is_protected && (
                  <button
                    type="button"
                    title="Delete stage"
                    onClick={(e) => { e.stopPropagation(); handleDelete(s); }}
                    className="opacity-0 group-hover:opacity-100 px-2 text-muted-foreground hover:text-[#DC2626]"
                  ><X className="w-3 h-3" /></button>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && !q && (
            <div className="px-3 py-3 text-[11px] text-muted-foreground text-center">No stages yet</div>
          )}
        </div>
        {q.trim() && !exactMatch && pipelineId && (
          <button
            type="button"
            onClick={handleCreate}
            className="w-full border-t border-line px-3 py-2 text-xs text-left text-[#2563EB] hover:bg-off flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Create "{q.trim()}"
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
