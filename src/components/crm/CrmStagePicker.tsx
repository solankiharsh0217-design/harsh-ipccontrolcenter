import { useMemo, useState } from "react";
import { ArrowRightCircle, ChevronDown, Search, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { stageChip } from "@/lib/stageColors";

export type CrmStagePickerStage = {
  id: string;
  name: string;
  pipeline_id: string | null;
  color?: string | null;
  position?: number | null;
  is_protected?: boolean | null;
  is_active?: boolean | null;
};

type Props = {
  stages: CrmStagePickerStage[];
  currentStageId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newStageName: string;
  onNewStageNameChange: (value: string) => void;
  onChangeStage: (stageId: string) => void;
  onAddStage: () => void;
  onDeleteStage: (stage: CrmStagePickerStage) => void;
  addingStage?: boolean;
  triggerLabel?: string;
  title?: string;
};

export default function CrmStagePicker({
  stages,
  currentStageId,
  open,
  onOpenChange,
  newStageName,
  onNewStageNameChange,
  onChangeStage,
  onAddStage,
  onDeleteStage,
  addingStage,
  triggerLabel = "Change Stage",
  title = "Change CRM Stage",
}: Props) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stages.filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [stages, search]);

  return (
    <Popover open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-black text-white hover:opacity-90">
          <ArrowRightCircle className="w-3.5 h-3.5" />
          {triggerLabel}
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        avoidCollisions
        collisionPadding={96}
        className="z-[1100] w-[320px] p-0 bg-white border border-line rounded-md shadow-lg overflow-hidden"
      >
        <div className="px-3 py-2 border-b border-line">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground mb-1.5">{title} <span className="text-muted-foreground font-normal">({stages.length})</span></div>
          <div className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stages…" className="flex-1 text-xs outline-none bg-transparent" />
          </div>
        </div>
        <div className="max-h-[260px] overflow-y-auto">
          {filtered.length === 0 && <EmptyState title="No stages found." />}
          {filtered.map((s) => {
            const ch = stageChip(s.name, s.color);
            const isCurrent = s.id === currentStageId;
            return (
              <div key={s.id} className={`group flex items-center hover:bg-off ${isCurrent ? "bg-off" : ""}`}>
                <button onClick={() => onChangeStage(s.id)} className="flex-1 flex items-center gap-2 text-left px-3 py-2 text-xs min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ch.dot }} />
                  <span className={`flex-1 truncate ${isCurrent ? "font-medium" : ""}`}>{s.name}</span>
                  {isCurrent && <span className="text-[10px] text-muted-foreground">current</span>}
                </button>
                {!isCurrent && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteStage(s); }}
                    className="opacity-0 group-hover:opacity-100 px-2 py-2 text-muted-foreground hover:text-[#DC2626]"
                    title={s.is_protected ? "Deactivate protected stage" : "Delete or deactivate stage"}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t border-line p-2 flex items-center gap-1.5">
          <input
            value={newStageName}
            onChange={(e) => onNewStageNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onAddStage(); }}
            placeholder="+ Add new CRM stage…"
            className="ipc-input !h-8 !text-xs flex-1"
          />
          <button type="button" disabled={addingStage} onClick={onAddStage} className="ipc-btn ipc-btn-black !h-8 !text-xs">
            {addingStage ? "Adding…" : "Add"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}