import { useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import { saveCentralFollowUp } from "@/lib/followUps";

interface Props {
  crmLeadId?: string | null;
  paidLeadId?: string | null;
  leadName?: string;
  defaultType?: string;
  defaultPriority?: string;
  ownerId?: string | null;
  source?: "calling_crm_drawer" | "paid_pipeline_drawer" | "quick_action";
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
  crmLeadId, paidLeadId, leadName, defaultType, defaultPriority, ownerId, source, onSaved,
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
  const [activePreset, setActivePreset] = useState<number | "custom" | null>(0);
  const dtInputRef = useRef<HTMLInputElement | null>(null);

  const setPreset = (days: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    // Preserve existing time-of-day if already set, else 11:00
    const currentTime = (when?.split("T")[1] || "11:00").slice(0, 5);
    const next = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${currentTime}`;
    setWhen(next);
    setActivePreset(days);
  };

  const save = async () => {
    if (!when) { toast.error("Pick a date/time"); return; }
    if (!crmLeadId && !paidLeadId) { toast.error("No lead linked"); return; }
    setBusy(true);
    try {
      const [datePart, timePart] = when.split("T");
      const followUpDate = datePart;
      const followUpTime = (timePart || "11:00").slice(0, 5);

      await saveCentralFollowUp({
        crmLeadId,
        paidLeadId,
        leadName,
        date: followUpDate,
        time: followUpTime,
        type,
        priority,
        note,
        ownerId: ownerId || user?.id || null,
        createdBy: user?.id || null,
        sourceModule: paidLeadId ? "paid_pipeline" : "crm",
        auditActionType: source === "paid_pipeline_drawer" ? "followup_saved_from_paid_pipeline_drawer" : "followup_saved_from_calling_crm_drawer",
        metadata: { source: source || (paidLeadId ? "paid_pipeline_drawer" : "calling_crm_drawer") },
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
            ref={dtInputRef}
            type="datetime-local"
            className="qsi-input !h-9 !text-[12px]"
            value={when}
            onChange={(e) => { setWhen(e.target.value); setActivePreset("custom"); }}
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
        {[
          { days: 0, label: "Today" },
          { days: 1, label: "Tomorrow" },
          { days: 3, label: "+3 days" },
          { days: 7, label: "Next week" },
        ].map((p) => {
          const active = activePreset === p.days;
          return (
            <button
              key={p.days}
              type="button"
              onClick={() => setPreset(p.days)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${active ? "border-[#92400E] bg-[#FEF3C7] text-[#78350F]" : "border-line bg-white hover:bg-off"}`}
            >{p.label}</button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setActivePreset("custom");
            const input = dtInputRef.current;
            input?.focus?.();
            try { (input as any)?.showPicker?.(); } catch {}
          }}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed ${activePreset === "custom" ? "border-[#92400E] bg-[#FEF3C7] text-[#78350F]" : "border-line bg-white hover:bg-off"}`}
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
