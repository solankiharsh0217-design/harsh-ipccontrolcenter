import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import { saveCentralFollowUp } from "@/lib/followUps";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Pencil } from "lucide-react";

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

type ExistingFU = {
  id: string;
  follow_up_date: string;
  follow_up_time: string | null;
  follow_up_type: string | null;
  priority: string | null;
  notes: string | null;
  assigned_to: string | null;
  status: string;
  source_module: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

const SOURCE_LABEL: Record<string, string> = {
  paid_pipeline: "Paid Pipeline",
  calling_crm: "Calling CRM",
  crm: "Calling CRM",
  finance: "Finance / EMI",
  onboarding: "Onboarding",
};

function statusFor(date: string): { label: string; cls: string } {
  const t = today();
  if (date < t) return { label: "Overdue", cls: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]" };
  if (date === t) return { label: "Due Today", cls: "bg-[#FEF3C7] text-[#92400E] border-[#FBBF24]" };
  return { label: "Upcoming", cls: "bg-[#DBEAFE] text-[#1E3A8A] border-[#93C5FD]" };
}

export default function FastFollowUpComposer({
  crmLeadId, paidLeadId, leadName, defaultType, defaultPriority, ownerId, source, onSaved,
}: Props) {
  const { user } = useAuth();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultWhen = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T11:00`;

  const [existing, setExisting] = useState<ExistingFU | null>(null);
  const [editing, setEditing] = useState(false);
  const [ownerName, setOwnerName] = useState<string>("");
  const [when, setWhen] = useState(defaultWhen);
  const [type, setType] = useState(defaultType || "");
  const [priority, setPriority] = useState(defaultPriority || "Normal");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [activePreset, setActivePreset] = useState<number | "custom" | null>(0);
  const dtInputRef = useRef<HTMLInputElement | null>(null);

  const loadExisting = async () => {
    if (!crmLeadId && !paidLeadId) { setExisting(null); return; }
    let q = (supabase as any).from("paid_pipeline_followups")
      .select("id, follow_up_date, follow_up_time, follow_up_type, priority, notes, assigned_to, status, source_module")
      .eq("status", "Pending").eq("is_deleted", false)
      .order("follow_up_date", { ascending: true }).limit(1);
    q = paidLeadId
      ? q.eq("paid_pipeline_lead_id", paidLeadId)
      : q.is("paid_pipeline_lead_id", null).eq("related_crm_lead_id", crmLeadId);
    const { data } = await q;
    const row = data?.[0] || null;
    setExisting(row);
    if (row) {
      setWhen(`${row.follow_up_date}T${(row.follow_up_time || "11:00").slice(0, 5)}`);
      setType(row.follow_up_type || defaultType || "");
      setPriority(row.priority || defaultPriority || "Normal");
      setNote(row.notes || "");
      setActivePreset("custom");
      if (row.assigned_to) {
        const { data: p } = await (supabase as any).from("profiles").select("full_name").eq("id", row.assigned_to).maybeSingle();
        setOwnerName(p?.full_name || "");
      } else setOwnerName("");
    }
  };

  useEffect(() => { loadExisting(); /* eslint-disable-next-line */ }, [crmLeadId, paidLeadId]);

  const setPreset = (days: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    const currentTime = (when?.split("T")[1] || "11:00").slice(0, 5);
    setWhen(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${currentTime}`);
    setActivePreset(days);
  };

  const save = async () => {
    if (!when) { toast.error("Pick a date/time"); return; }
    if (!crmLeadId && !paidLeadId) { toast.error("No lead linked"); return; }
    setBusy(true);
    try {
      const [datePart, timePart] = when.split("T");
      await saveCentralFollowUp({
        crmLeadId, paidLeadId, leadName,
        date: datePart, time: (timePart || "11:00").slice(0, 5),
        type, priority, note,
        ownerId: ownerId || user?.id || null,
        createdBy: user?.id || null,
        sourceModule: paidLeadId ? "paid_pipeline" : "crm",
        auditActionType: source === "paid_pipeline_drawer" ? "followup_saved_from_paid_pipeline_drawer" : "followup_saved_from_calling_crm_drawer",
        metadata: { source: source || (paidLeadId ? "paid_pipeline_drawer" : "calling_crm_drawer") },
      });
      toast.success("Follow-up saved");
      setEditing(false);
      await loadExisting();
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally { setBusy(false); }
  };

  const markDone = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await (supabase as any).from("paid_pipeline_followups")
        .update({ status: "Done", completed_at: new Date().toISOString(), completed_by: user?.id })
        .eq("id", existing.id);
      // mirror to CRM reminder if exists
      if (crmLeadId) {
        await (supabase as any).from("follow_up_reminders")
          .update({ is_completed: true })
          .eq("lead_id", crmLeadId)
          .eq("reminder_date", existing.follow_up_date)
          .eq("is_completed", false);
      }
      toast.success("Marked done");
      setExisting(null);
      setEditing(false);
      onSaved?.();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  // ---- Render: summary if existing & not editing ----
  if (existing && !editing) {
    const st = statusFor(existing.follow_up_date);
    const src = existing.source_module || (paidLeadId ? "paid_pipeline" : "crm");
    return (
      <div className="rounded-lg border border-line bg-white p-3 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${st.cls}`}>{st.label}</span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{SOURCE_LABEL[src] || src}</span>
          </div>
          <div className="text-[12px] font-medium">
            {existing.follow_up_date}{existing.follow_up_time ? ` · ${existing.follow_up_time.slice(0,5)}` : ""}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
          <div><span className="text-muted-foreground">Type:</span> <b>{existing.follow_up_type || "—"}</b></div>
          <div><span className="text-muted-foreground">Priority:</span> <b>{existing.priority || "Normal"}</b></div>
          <div className="col-span-2"><span className="text-muted-foreground">Owner:</span> <b>{ownerName || "—"}</b></div>
          {existing.notes && <div className="col-span-2 text-muted-foreground italic">"{existing.notes}"</div>}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(true)} className="ipc-btn ipc-btn-ghost !h-8 !text-[12px] flex-1">
            <Pencil className="w-3 h-3" /> Edit / Reschedule
          </button>
          <button onClick={markDone} disabled={busy} className="ipc-btn !bg-[#16A34A] !text-white !h-8 !text-[12px] flex-1">
            <CheckCircle2 className="w-3 h-3" /> {busy ? "…" : "Mark Done"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Render: editor (no existing OR editing) ----
  return (
    <div className="rounded-lg border border-line bg-white p-3 space-y-2.5">
      {!existing && (
        <div className="text-[11px] text-muted-foreground italic">No follow-up set — schedule one below.</div>
      )}
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
      <div className="flex gap-2">
        {existing && (
          <button onClick={() => { setEditing(false); }} className="ipc-btn ipc-btn-ghost !h-10 !text-[13px]">Cancel</button>
        )}
        <button onClick={save} disabled={busy} className="flex-1 ipc-btn ipc-btn-black !h-10 !text-[13px] font-medium">
          {busy ? "Saving…" : existing ? "Update Follow-up" : "Save Follow-up"}
        </button>
      </div>
    </div>
  );
}
