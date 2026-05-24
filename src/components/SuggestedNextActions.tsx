import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  computeSuggestions,
  listSyncRules,
  loadSuggestionContext,
  logIgnoreSuggestion,
  type Suggestion,
} from "@/lib/stageSyncSuggestions";

interface Props {
  crmLeadId?: string | null;
  paidLeadId?: string | null;
  onApplied?: () => void;
  onOpenFollowUp?: () => void;
}

export default function SuggestedNextActions({ crmLeadId, paidLeadId, onApplied, onOpenFollowUp }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ctxSnapshot, setCtxSnapshot] = useState<{ crm: any; paid: any } | null>(null);

  const load = async () => {
    if (!crmLeadId && !paidLeadId) { setSuggestions([]); return; }
    const ctx = await loadSuggestionContext({ crmLeadId, paidLeadId });
    setCtxSnapshot({ crm: ctx.crm, paid: ctx.paid });
    const rules = await listSyncRules().catch(() => []);
    const sugs = computeSuggestions({ ...ctx, refresh: load }, rules);
    setSuggestions(sugs);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [crmLeadId, paidLeadId]);

  const visible = suggestions.filter(s => !ignored.has(s.id));
  if (visible.length === 0) return null;

  const handleApply = async (s: Suggestion) => {
    if (s.confirm && !confirm(s.confirm)) return;
    setBusyId(s.id);
    try {
      const result = await s.apply();
      if (result === "OPEN_FOLLOWUP" && onOpenFollowUp) {
        onOpenFollowUp();
      } else {
        toast.success(result || "Suggestion applied");
      }
      await load();
      onApplied?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to apply suggestion");
    } finally {
      setBusyId(null);
    }
  };

  const handleIgnore = async (s: Suggestion) => {
    setIgnored(prev => new Set(prev).add(s.id));
    if (ctxSnapshot) await logIgnoreSuggestion(s.id, ctxSnapshot).catch(() => {});
  };

  return (
    <div className="mt-4 rounded-lg border border-gold-pale bg-gold-pale/30 px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gold-deep">
          Suggested Next Action{visible.length > 1 ? `s (${visible.length})` : ""}
        </div>
      </div>
      <div className="space-y-2">
        {visible.map(s => (
          <div key={s.id} className="bg-white border border-line rounded-md p-2.5">
            <div className="font-sans text-[13px] font-medium text-black">{s.title}</div>
            <div className="font-sans text-[11.5px] text-muted-foreground mt-0.5">{s.reason}</div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleApply(s)}
                disabled={busyId === s.id}
                className="h-7 px-2.5 bg-black text-white text-[11.5px] rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {busyId === s.id ? "Applying…" : "Apply Suggestion"}
              </button>
              <button
                onClick={() => handleIgnore(s)}
                className="h-7 px-2.5 border border-line text-[11.5px] rounded-md hover:bg-off"
              >
                Ignore
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
