import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import { logActivity } from "@/lib/auditLog";

export default function QuickFollowUpModal({
  leadId, leadName, crmLeadId, defaults, onClose, onSaved,
}: {
  leadId: string; leadName?: string; crmLeadId?: string | null;
  defaults?: { date?: string; time?: string; reason?: string; priority?: string };
  onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [date, setDate] = useState(defaults?.date || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(defaults?.time || "11:00");
  const [reason, setReason] = useState(defaults?.reason || "");
  const [priority, setPriority] = useState(defaults?.priority || "Normal");
  const [status, setStatus] = useState("Pending");
  const [assignee, setAssignee] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!date) { toast.error("Date required"); return; }
    setBusy(true);
    try {
      await supabase.from("paid_pipeline_followups").insert({
        paid_pipeline_lead_id: leadId, follow_up_date: date, follow_up_time: time,
        follow_up_reason: reason || null, follow_up_type: reason || null,
        priority, status, assigned_to: assignee || null,
        notes: notes || null, created_by: user?.id,
        related_crm_lead_id: crmLeadId || null,
        source_module: "paid_pipeline",
      } as any);
      await supabase.from("paid_pipeline_leads").update({
        next_follow_up_date: date, next_follow_up_time: time,
        follow_up_reason: reason || null, follow_up_priority: priority,
        follow_up_status: status,
      } as any).eq("id", leadId);
      await supabase.from("paid_pipeline_activity_logs").insert({
        paid_pipeline_lead_id: leadId, activity_type: "followup_set",
        note: `${date} ${time} · ${reason || "Follow-up"} · ${priority}`, created_by: user?.id,
      } as any);
      logActivity({
        module_key: "follow_up_command_center", module_label: "Follow-Up Command Center",
        action_type: "follow_up_created", action_label: "Follow-up created",
        entity_type: "paid_pipeline_lead", entity_id: leadId, entity_label: leadName,
        new_values: { date, time, reason, priority, status, assignee, notes },
        summary: `Follow-up set for ${leadName || "lead"} on ${date} ${time} (${reason || "—"}, ${priority}).`,
      });
      toast.success("Follow-up saved");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[560px]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line">
          <div className="font-serif text-[20px]">Set follow-up</div>
          {leadName && <div className="text-[12px] text-muted-foreground mt-0.5">{leadName}</div>}
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="qsi-label">Date</label>
              <input type="date" className="qsi-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="qsi-label">Time</label>
              <input type="time" className="qsi-input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <label className="qsi-label">Follow-up Type</label>
              <select className="qsi-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">— Select —</option>
                {["Call","WhatsApp","Email","SMS","Payment Follow-Up","Balance Follow-Up","Finance Follow-Up","Document Follow-Up","Other"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <QuickSaveInput fieldKey="follow_up_priority" label="Priority" value={priority} onChange={setPriority} placeholder="Hot" />
            <div>
              <label className="qsi-label">Status</label>
              <select className="qsi-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {["Pending","Done","Missed","Rescheduled","Cancelled"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="qsi-label">Assignee (optional)</label>
              <input className="qsi-input" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Sales executive" />
            </div>
          </div>
          <div>
            <label className="qsi-label">Notes</label>
            <textarea className="qsi-input !h-auto py-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What needs to happen on this follow-up?" />
          </div>
        </div>
        <div className="px-6 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black">{busy ? "Saving…" : "Save follow-up"}</button>
        </div>
      </div>
    </div>
  );
}
