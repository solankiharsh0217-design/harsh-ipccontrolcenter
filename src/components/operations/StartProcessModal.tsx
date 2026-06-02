import { useEffect, useMemo, useState } from "react";
import { X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { computeReadiness, getChecklistItems, getChecklistState, type ProcessTemplate, listProcessTemplates } from "@/lib/operationsTemplates";
import { todayStr, addDays } from "@/lib/operationsCrm";

export default function StartProcessModal({
  lead, onClose, onDone,
}: {
  lead: { id: string; name: string; process_template_id?: string | null; service_days_committed: number | null; service_months: number | null; assigned_media_buyer_id: string | null; readiness_override_reason?: string | null };
  onClose: () => void;
  onDone: () => void;
}) {
  const { profile, isAdmin } = useAuth();
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>(lead.process_template_id ?? "");
  const [owners, setOwners] = useState<{ id: string; full_name: string }[]>([]);
  const [ownerId, setOwnerId] = useState<string>(lead.assigned_media_buyer_id ?? "");
  const [startDate, setStartDate] = useState(todayStr());
  const [duration, setDuration] = useState<number>(lead.service_days_committed ?? 60);
  const [firstCall, setFirstCall] = useState<string>("");
  const [note, setNote] = useState("");
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [busy, setBusy] = useState(false);

  const [readiness, setReadiness] = useState<{ pct: number; blocked: boolean; total: number } | null>(null);
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    listProcessTemplates(true).then(setTemplates).catch(() => {});
    supabase.from("profiles").select("id, full_name").eq("can_receive_operations_leads", true as any)
      .then(({ data }) => setOwners(((data ?? []) as any).map((p: any) => ({ id: p.id, full_name: p.full_name ?? "Unnamed" }))));
  }, []);

  useEffect(() => {
    (async () => {
      if (!templateId) { setReadiness(null); return; }
      const [items, st] = await Promise.all([getChecklistItems(templateId), getChecklistState(lead.id)]);
      const r = computeReadiness(items, st);
      setReadiness({ pct: r.pct, blocked: r.blocked, total: items.length });
    })();
  }, [templateId, lead.id]);

  const canStart = useMemo(() => {
    if (!readiness) return false;
    if (!readiness.blocked) return true;
    return isAdmin && override && overrideReason.trim().length > 0;
  }, [readiness, isAdmin, override, overrideReason]);

  const submit = async () => {
    if (!profile?.id) { toast.error("Not signed in"); return; }
    if (!templateId) { toast.error("Select a template"); return; }
    if (!canStart) { toast.error("Required checklist items are not complete"); return; }
    setBusy(true);
    try {
      const ownerName = owners.find((o) => o.id === ownerId)?.full_name ?? null;
      const updates: any = {
        process_template_id: templateId,
        intake_status: "active",
        service_status: "active",
        ad_launch_date: startDate,
        current_active_start_date: startDate,
        last_resumed_at: startDate,
        last_paused_at: null,
        service_days_committed: duration,
        service_end_target_date: addDays(startDate, Math.max(0, duration)),
        assigned_media_buyer_id: ownerId || null,
        assigned_media_buyer_name: ownerName,
      };
      if (override && overrideReason) {
        updates.readiness_override_reason = overrideReason;
        updates.readiness_override_by = profile.id;
        updates.readiness_override_at = new Date().toISOString();
      }
      const { error } = await supabase.from("operations_leads" as any).update(updates).eq("id", lead.id);
      if (error) throw error;

      await supabase.from("operations_service_events" as any).insert({
        operations_lead_id: lead.id,
        event_type: "start",
        event_date: startDate,
        note: note.trim() || null,
        reason: override ? `Override: ${overrideReason}` : null,
        created_by: profile.id,
      } as any);

      if (createFollowUp && firstCall) {
        await supabase.from("follow_up_reminders" as any).insert({
          operations_lead_id: lead.id,
          remind_at: firstCall,
          note: `Kickoff call: ${lead.name}`,
          created_by: profile.id,
          assigned_to: ownerId || profile.id,
        } as any).then(({ error: e }) => { if (e) console.warn("follow_up_reminders insert", e); });
      }

      toast.success("Operations process started");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Failed to start process");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div className="font-serif text-lg">Start Operations Process</div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-off flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Process template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="ipc-input !h-9 !text-xs w-full">
              <option value="">— Choose —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {readiness && (
            <div className={`text-xs p-2 rounded border ${readiness.blocked ? "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" : "bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]"}`}>
              Readiness {readiness.pct}% — {readiness.blocked ? "required items still pending" : "all required items complete"}
            </div>
          )}

          {readiness?.blocked && isAdmin && (
            <div className="border border-line rounded p-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                Admin override (skip required checks)
              </label>
              {override && (
                <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason for override (required)"
                  className="ipc-input !text-xs w-full mt-2" rows={2} />
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Assigned owner</label>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="ipc-input !h-9 !text-xs w-full">
                <option value="">Unassigned</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="ipc-input !h-9 !text-xs w-full" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Duration (days)</label>
              <input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="ipc-input !h-9 !text-xs w-full" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">First call (optional)</label>
              <input type="datetime-local" value={firstCall} onChange={(e) => setFirstCall(e.target.value)} className="ipc-input !h-9 !text-xs w-full" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Note</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="ipc-input !text-xs w-full" />
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={createFollowUp} onChange={(e) => setCreateFollowUp(e.target.checked)} />
            Create follow-up reminder (uses first call date)
          </label>
        </div>
        <div className="px-5 py-3 border-t border-line flex justify-end gap-2 bg-off/30">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost !text-xs">Cancel</button>
          <button onClick={submit} disabled={busy || !canStart} className="ipc-btn ipc-btn-black !text-xs">
            {busy ? "Starting…" : "Start Process"}
          </button>
        </div>
      </div>
    </div>
  );
}
