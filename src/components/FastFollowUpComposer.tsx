import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import { logActivity } from "@/lib/auditLog";

interface Props {
  crmLeadId?: string | null;
  paidLeadId?: string | null;
  leadName?: string;
  defaultType?: string;
  defaultPriority?: string;
  onSaved?: () => void;
}

/**
 * Compact unified follow-up composer.
 * Always writes ONE row to `paid_pipeline_followups` (the unified follow-up store
 * that Follow-Up Command Center reads from), populating whichever id(s) we have.
 * If a CRM lead is involved, also mirrors a row into `follow_up_reminders` so
 * legacy CRM views still work — uniqued on (lead_id, reminder_date, reminder_time, channel).
 */
export default function FastFollowUpComposer({
  crmLeadId, paidLeadId, leadName, defaultType, defaultPriority, onSaved,
}: Props) {
  const { user } = useAuth();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultWhen = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T11:00`;

  const [when, setWhen] = useState(defaultWhen);
  const [type, setType] = useState(defaultType || "");
  const [priority, setPriority] = useState(defaultPriority || "Normal");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const setPreset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setWhen(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T11:00`);
  };

  const save = async () => {
    if (!when) { toast.error("Pick a date/time"); return; }
    if (!crmLeadId && !paidLeadId) { toast.error("No lead linked"); return; }
    setBusy(true);
    try {
      const [datePart, timePart] = when.split("T");
      const followUpDate = datePart;
      const followUpTime = (timePart || "11:00").slice(0, 5);

      // 1) Unified follow-up store
      const row: any = {
        paid_pipeline_lead_id: paidLeadId || null,
        related_crm_lead_id: crmLeadId || null,
        follow_up_date: followUpDate,
        follow_up_time: followUpTime,
        follow_up_type: type || null,
        follow_up_reason: type || null,
        priority,
        status: "Pending",
        notes: note || null,
        source_module: paidLeadId ? "paid_pipeline" : "calling_crm",
        created_by: user?.id,
      };

      // Dedup guard: skip if an identical pending follow-up already exists
      let dupQ = (supabase as any).from("paid_pipeline_followups").select("id").eq("follow_up_date", followUpDate).eq("status", "Pending").eq("is_deleted", false);
      if (paidLeadId) dupQ = dupQ.eq("paid_pipeline_lead_id", paidLeadId);
      else dupQ = dupQ.is("paid_pipeline_lead_id", null).eq("related_crm_lead_id", crmLeadId);
      if (followUpTime) dupQ = dupQ.eq("follow_up_time", followUpTime);
      const { data: dup } = await dupQ.limit(1);
      if (!dup || dup.length === 0) {
        await supabase.from("paid_pipeline_followups" as any).insert(row);
      }

      // 2) Mirror to legacy follow_up_reminders when we have a CRM lead
      if (crmLeadId) {
        const ch = mapTypeToChannel(type);
        const { data: rDup } = await supabase
          .from("follow_up_reminders")
          .select("id")
          .eq("lead_id", crmLeadId)
          .eq("reminder_date", followUpDate)
          .eq("channel", ch)
          .limit(1);
        if (!rDup || rDup.length === 0) {
          await supabase.from("follow_up_reminders").insert({
            lead_id: crmLeadId,
            agent_id: user?.id || null,
            reminder_date: followUpDate,
            reminder_time: followUpTime,
            channel: ch,
            note: note || type || null,
          });
        }
      }

      // 3) Update lead's next follow-up snapshot
      if (paidLeadId) {
        await supabase.from("paid_pipeline_leads").update({
          next_follow_up_date: followUpDate,
          next_follow_up_time: followUpTime,
          follow_up_reason: type || null,
          follow_up_priority: priority,
          follow_up_status: "Pending",
        } as any).eq("id", paidLeadId);
      }

      logActivity({
        module_key: "follow_up_command_center",
        module_label: "Follow-Up Command Center",
        action_type: "follow_up_created",
        action_label: "Follow-up created",
        entity_type: paidLeadId ? "paid_pipeline_lead" : "crm_lead",
        entity_id: (paidLeadId || crmLeadId) as string,
        entity_label: leadName,
        new_values: { date: followUpDate, time: followUpTime, type, priority, note },
        summary: `Follow-up set for ${leadName || "lead"} on ${followUpDate} ${followUpTime} (${type || "—"}, ${priority}).`,
      });

      toast.success("Follow-up saved");
      setNote("");
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-line bg-white p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="qsi-label">Date & time</label>
          <input
            type="datetime-local"
            className="qsi-input !h-9 !text-[12px]"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <div>
          <label className="qsi-label">Priority</label>
          <select className="qsi-input !h-9 !text-[12px]" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {["Urgent", "Hot", "Warm", "Normal", "Cold", "Low"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setPreset(0)} className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-[#FDE68A] bg-[#FFFBEB] text-[#92400E] hover:bg-[#FEF3C7]">Today</button>
        <button onClick={() => setPreset(1)} className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-line bg-white hover:bg-off">Tomorrow</button>
        <button onClick={() => setPreset(3)} className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-line bg-white hover:bg-off">+3 days</button>
        <button onClick={() => setPreset(7)} className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-line bg-white hover:bg-off">Next week</button>
        <button
          type="button"
          onClick={() => {
            const el = document.activeElement as HTMLElement | null;
            el?.blur?.();
            const input = (document.querySelector('input[type="datetime-local"]') as HTMLInputElement | null);
            input?.focus?.();
            try { (input as any)?.showPicker?.(); } catch {}
          }}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed border-line bg-white hover:bg-off"
        >Custom…</button>
      </div>
      <QuickSaveInput
        fieldKey="follow_up_type"
        label="Follow-up type"
        value={type}
        onChange={setType}
        placeholder="Call"
      />
      <div>
        <label className="qsi-label">Note (optional)</label>
        <textarea
          className="qsi-input !h-auto py-2 !text-[12px]"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Short context for this follow-up…"
        />
      </div>
      <button onClick={save} disabled={busy} className="w-full ipc-btn ipc-btn-black !h-10 !text-[13px] font-medium">
        {busy ? "Saving…" : "Save Follow-up"}
      </button>
    </div>
  );
}

function mapTypeToChannel(t: string | undefined): "call" | "whatsapp" | "email" | "sms" | "note" {
  const v = (t || "").toLowerCase();
  if (v.includes("whatsapp")) return "whatsapp";
  if (v.includes("email")) return "email";
  if (v.includes("sms")) return "sms";
  if (v.includes("note")) return "note";
  return "call";
}
