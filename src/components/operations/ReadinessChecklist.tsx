import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  getChecklistItems, getChecklistState, setChecklistItemChecked,
  computeReadiness, type ChecklistItem, type ChecklistState,
} from "@/lib/operationsTemplates";

export default function ReadinessChecklist({
  leadId, templateId, onChange,
}: { leadId: string; templateId: string | null; onChange?: (pct: number, blocked: boolean) => void }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [state, setState] = useState<ChecklistState[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!templateId) { setItems([]); setState([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [it, st] = await Promise.all([getChecklistItems(templateId), getChecklistState(leadId)]);
      setItems(it); setState(st);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [leadId, templateId]);

  useEffect(() => {
    if (!onChange) return;
    const r = computeReadiness(items, state);
    onChange(r.pct, r.blocked);
  }, [items, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (item: ChecklistItem, next: boolean) => {
    try {
      await setChecklistItemChecked(leadId, item.id, next, profile?.id ?? null);
      await load();
    } catch (e: any) { toast.error(e.message || "Failed"); }
  };

  if (!templateId) {
    return <div className="text-[11px] text-muted-foreground">Select a process template to load its checklist.</div>;
  }
  if (loading) return <div className="text-[11px] text-muted-foreground">Loading checklist…</div>;
  if (items.length === 0) return <div className="text-[11px] text-muted-foreground">This template has no checklist items.</div>;

  const stateMap = new Map(state.map((s) => [s.checklist_item_id, s]));
  const r = computeReadiness(items, state);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 bg-off rounded-full overflow-hidden">
          <div className={`h-full ${r.blocked ? "bg-[#F59E0B]" : "bg-[#16A34A]"}`} style={{ width: `${r.pct}%` }} />
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">{r.pct}%</div>
      </div>
      <div className="text-[10px] text-muted-foreground mb-2">
        {r.checkedRequired}/{r.totalRequired} required · {r.checkedOptional}/{r.totalOptional} optional
      </div>
      <div className="space-y-1.5">
        {items.map((it) => {
          const s = stateMap.get(it.id);
          const checked = !!s?.is_checked;
          return (
            <label key={it.id} className="flex items-start gap-2 p-2 border border-line rounded hover:bg-off/40 cursor-pointer">
              <button
                type="button"
                onClick={() => toggle(it, !checked)}
                className={`w-4 h-4 mt-0.5 rounded border flex-shrink-0 flex items-center justify-center ${checked ? "bg-black border-black text-white" : "bg-white border-line"}`}
              >
                {checked && <Check className="w-3 h-3" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-xs flex items-center gap-1.5">
                  <span className={checked ? "line-through text-muted-foreground" : ""}>{it.label}</span>
                  {it.is_required ? <span className="text-[9px] px-1 py-px rounded bg-[#FEE2E2] text-[#991B1B]">required</span>
                    : <span className="text-[9px] px-1 py-px rounded bg-off text-muted-foreground">optional</span>}
                </div>
                {it.note && <div className="text-[10px] text-muted-foreground mt-0.5">{it.note}</div>}
                {checked && s?.checked_at && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    ✓ {new Date(s.checked_at).toLocaleString()}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
