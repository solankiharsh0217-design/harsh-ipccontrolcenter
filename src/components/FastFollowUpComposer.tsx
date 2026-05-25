import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import { saveCentralFollowUp } from "@/lib/followUps";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import { CheckCircle2, Pencil, X, ChevronDown, ChevronRight, Plus } from "lucide-react";

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

type FU = {
  id: string;
  follow_up_date: string;
  follow_up_time: string | null;
  follow_up_type: string | null;
  priority: string | null;
  notes: string | null;
  assigned_to: string | null;
  status: string;
  source_module: string | null;
  completed_at?: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");

const SOURCE_LABEL: Record<string, string> = {
  paid_pipeline: "Paid Pipeline",
  calling_crm: "Calling CRM",
  crm: "Calling CRM",
  finance: "Finance / EMI",
  onboarding: "Onboarding",
};

function statusBadge(row: FU): { label: string; cls: string } {
  if (row.status === "Done") return { label: "Done", cls: "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]" };
  if (row.status === "Cancelled") return { label: "Cancelled", cls: "bg-[#F3F4F6] text-[#4B5563] border-[#D1D5DB]" };
  if (row.status === "Missed") return { label: "Missed", cls: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]" };
  const t = today();
  if (row.follow_up_date < t) return { label: "Overdue", cls: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]" };
  if (row.follow_up_date === t) return { label: "Due Today", cls: "bg-[#FEF3C7] text-[#92400E] border-[#FBBF24]" };
  return { label: "Upcoming", cls: "bg-[#DBEAFE] text-[#1E3A8A] border-[#93C5FD]" };
}

export default function FastFollowUpComposer({
  crmLeadId, paidLeadId, leadName, defaultType, defaultPriority, ownerId, source, onSaved,
}: Props) {
  const { user } = useAuth();
  const now = new Date();
  const defaultWhen = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T11:00`;

  const [rows, setRows] = useState<FU[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [when, setWhen] = useState(defaultWhen);
  const [type, setType] = useState(defaultType || "");
  const [priority, setPriority] = useState(defaultPriority || "Normal");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [activePreset, setActivePreset] = useState<number | "custom" | null>(0);
  const dtInputRef = useRef<HTMLInputElement | null>(null);

  const resetComposer = () => {
    setWhen(defaultWhen);
    setType(defaultType || "");
    setPriority(defaultPriority || "Normal");
    setNote("");
    setActivePreset(0);
    setEditingId(null);
  };

  const load = async () => {
    if (!crmLeadId && !paidLeadId) { setRows([]); return; }
    let q = (supabase as any).from("paid_pipeline_followups")
      .select("id, follow_up_date, follow_up_time, follow_up_type, priority, notes, assigned_to, status, source_module, completed_at")
      .eq("is_deleted", false)
      .order("follow_up_date", { ascending: true })
      .order("follow_up_time", { ascending: true });
    q = paidLeadId
      ? q.eq("paid_pipeline_lead_id", paidLeadId)
      : q.is("paid_pipeline_lead_id", null).eq("related_crm_lead_id", crmLeadId);
    const { data } = await q;
    const list = (data || []) as FU[];
    setRows(list);
    // resolve owner names
    const ids = Array.from(new Set(list.map(r => r.assigned_to).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await (supabase as any).from("profiles").select("id, full_name").in("id", ids);
      const m: Record<string, string> = {};
      (profs || []).forEach((p: any) => { m[p.id] = p.full_name || ""; });
      setNameMap(m);
    } else setNameMap({});
  };

  useEffect(() => { load(); resetComposer(); /* eslint-disable-next-line */ }, [crmLeadId, paidLeadId]);

  const pending = useMemo(() => rows.filter(r => r.status === "Pending"), [rows]);
  const history = useMemo(() => rows.filter(r => r.status !== "Pending"), [rows]);
  const next = pending[0];

  const setPreset = (days: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    const currentTime = (when?.split("T")[1] || "11:00").slice(0, 5);
    setWhen(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${currentTime}`);
    setActivePreset(days);
  };

  const beginEdit = (row: FU) => {
    setEditingId(row.id);
    setWhen(`${row.follow_up_date}T${(row.follow_up_time || "11:00").slice(0, 5)}`);
    setType(row.follow_up_type || "");
    setPriority(row.priority || "Normal");
    setNote(row.notes || "");
    setActivePreset("custom");
    setTimeout(() => dtInputRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 50);
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
        editId: editingId,
        auditActionType: editingId
          ? "followup_rescheduled"
          : (source === "paid_pipeline_drawer"
            ? "followup_created_from_paid_pipeline_drawer"
            : "followup_created_from_calling_crm_drawer"),
        metadata: { source: source || (paidLeadId ? "paid_pipeline_drawer" : "calling_crm_drawer") },
      });
      toast.success(editingId ? "Follow-up updated" : "Follow-up added");
      resetComposer();
      await load();
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally { setBusy(false); }
  };

  const markDone = async (row: FU) => {
    setBusy(true);
    try {
      await (supabase as any).from("paid_pipeline_followups")
        .update({ status: "Done", completed_at: new Date().toISOString(), completed_by: user?.id })
        .eq("id", row.id);
      if (crmLeadId) {
        await (supabase as any).from("follow_up_reminders")
          .update({ is_completed: true })
          .eq("lead_id", crmLeadId)
          .eq("reminder_date", row.follow_up_date)
          .eq("is_completed", false);
      }
      logActivity({
        module_key: "follow_up_command_center", module_label: "Follow-Up Command Center",
        action_type: "followup_marked_done", action_label: "Follow-up marked done",
        entity_type: paidLeadId ? "paid_pipeline_lead" : "crm_lead",
        entity_id: paidLeadId || crmLeadId, entity_label: leadName,
        metadata: { followup_id: row.id, due_at: `${row.follow_up_date} ${row.follow_up_time || ""}`.trim(), type: row.follow_up_type, priority: row.priority, owner_id: row.assigned_to, source: row.source_module },
      });
      toast.success("Marked done");
      await load();
      onSaved?.();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const cancel = async (row: FU) => {
    if (!confirm("Cancel this follow-up?")) return;
    setBusy(true);
    try {
      await (supabase as any).from("paid_pipeline_followups")
        .update({ status: "Cancelled", is_deleted: true })
        .eq("id", row.id);
      logActivity({
        module_key: "follow_up_command_center", module_label: "Follow-Up Command Center",
        action_type: "followup_cancelled", action_label: "Follow-up cancelled",
        entity_type: paidLeadId ? "paid_pipeline_lead" : "crm_lead",
        entity_id: paidLeadId || crmLeadId, entity_label: leadName,
        metadata: { followup_id: row.id, due_at: `${row.follow_up_date} ${row.follow_up_time || ""}`.trim(), type: row.follow_up_type, source: row.source_module },
      });
      toast.success("Follow-up cancelled");
      if (editingId === row.id) resetComposer();
      await load();
      onSaved?.();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const renderRow = (row: FU) => {
    const st = statusBadge(row);
    const src = row.source_module || (paidLeadId ? "paid_pipeline" : "crm");
    const owner = row.assigned_to ? (nameMap[row.assigned_to] || "—") : "—";
    const isEditing = editingId === row.id;
    return (
      <div key={row.id} className={`rounded-lg border p-3 space-y-2 ${isEditing ? "border-[#92400E] bg-[#FEF3C7]/30" : "border-line bg-white"}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${st.cls}`}>{st.label}</span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{SOURCE_LABEL[src] || src}</span>
          </div>
          <div className="text-[12px] font-medium">
            {row.follow_up_date}{row.follow_up_time ? ` · ${row.follow_up_time.slice(0,5)}` : ""}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
          <div><span className="text-muted-foreground">Type:</span> <b>{row.follow_up_type || "—"}</b></div>
          <div><span className="text-muted-foreground">Priority:</span> <b>{row.priority || "Normal"}</b></div>
          <div className="col-span-2"><span className="text-muted-foreground">Owner:</span> <b>{owner}</b></div>
          {row.notes && <div className="col-span-2 text-muted-foreground italic">"{row.notes}"</div>}
        </div>
        {row.status === "Pending" && (
          <div className="flex gap-2 pt-1 flex-wrap">
            <button onClick={() => beginEdit(row)} disabled={busy} className="ipc-btn ipc-btn-ghost !h-8 !text-[11px] !px-2">
              <Pencil className="w-3 h-3" /> {isEditing ? "Editing…" : "Edit / Reschedule"}
            </button>
            <button onClick={() => markDone(row)} disabled={busy} className="ipc-btn !bg-[#16A34A] !text-white !h-8 !text-[11px] !px-2">
              <CheckCircle2 className="w-3 h-3" /> Mark Done
            </button>
            <button onClick={() => cancel(row)} disabled={busy} className="ipc-btn ipc-btn-ghost !h-8 !text-[11px] !px-2 !text-[#991B1B]">
              <X className="w-3 h-3" /> Cancel Follow-up
            </button>
          </div>
        )}
      </div>
    );
  };

  const headerStatus = !next
    ? { label: "No follow-up set", cls: "bg-[#F3F4F6] text-[#4B5563] border-[#D1D5DB]" }
    : statusBadge(next);

  return (
    <div className="space-y-3">
      {/* Header summary */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold">Next Follow-up</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${headerStatus.cls}`}>{headerStatus.label}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {pending.length === 0 ? "No follow-up scheduled yet." : `${pending.length} scheduled follow-up${pending.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {/* Scheduled list */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Scheduled Follow-ups</div>
          {pending.map(renderRow)}
        </div>
      )}

      {/* Composer */}
      <div className="rounded-lg border border-line bg-white p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            {editingId ? "Edit Follow-up" : "Add New Follow-up"}
          </div>
          {editingId && (
            <button onClick={resetComposer} className="text-[11px] text-muted-foreground underline">Cancel edit</button>
          )}
        </div>
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
          {busy ? "Saving…" : editingId ? "Save Changes" : "Add Follow-up"}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="border-t border-line pt-2">
          <button
            type="button"
            onClick={() => setShowHistory(s => !s)}
            className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Follow-up History ({history.length})
          </button>
          {showHistory && (
            <div className="space-y-2 mt-2">
              {history.map(renderRow)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
