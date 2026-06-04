import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  Task, TaskActivity, TaskPriority, TaskStatus, STATUSES, TAGS, PRIORITY_PILL,
  createTask, updateTask, archiveTask, fetchActivity, todayISO, timeAgo, initialsOf, whatsappText, labelOfStatus,
} from "@/lib/tasks";
import AssigneePicker from "./AssigneePicker";

interface Member { id: string; full_name: string; role: string | null }

export default function TaskDrawer({
  task, defaultStatus, onClose, onSaved, onArchived,
}: {
  task: Task | null;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onSaved: (t: Task) => void;
  onArchived?: (t: Task) => void;
}) {
  const { user, profile, isAdmin } = useAuth();
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title ?? "");
  const [assignedTo, setAssignedTo] = useState<string>(task?.assigned_to ?? user?.id ?? "");
  const [assignedName, setAssignedName] = useState<string>(task?.assigned_name ?? profile?.full_name ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? todayISO());
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus ?? "todo");
  const [tag, setTag] = useState(task?.tag ?? "Operations");
  const [note, setNote] = useState(task?.note ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await (supabase as any).from("profiles").select("id, full_name, role")
        .eq("status", "active").order("full_name");
      setMembers((data ?? []) as Member[]);
    })();
  }, [isAdmin]);

  useEffect(() => {
    if (!task) return;
    fetchActivity(task.id).then(setActivity).catch(() => {});
  }, [task?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    if (!user || !profile) return;
    if (!title.trim()) { setTitleError(true); return; }
    setBusy(true);
    try {
      if (isEdit && task) {
        const patch: Partial<Task> = {};
        if (title !== task.title) patch.title = title.trim();
        if (note !== (task.note ?? "")) patch.note = note || null;
        if (priority !== task.priority) patch.priority = priority;
        if (status !== task.status) patch.status = status;
        if (tag !== task.tag) patch.tag = tag;
        if (dueDate !== task.due_date) patch.due_date = dueDate;
        if (isAdmin && assignedTo !== task.assigned_to) {
          patch.assigned_to = assignedTo;
          patch.assigned_name = assignedName;
        }
        const me = { id: user.id, name: profile.full_name };
        const updated = Object.keys(patch).length ? await updateTask(task, patch, me) : task;
        onSaved(updated);
      } else {
        const me = { id: user.id, name: profile.full_name, isAdmin };
        const created = await createTask(
          { title: title.trim(), note: note || null, assigned_to: assignedTo, assigned_name: assignedName,
            priority, status, tag, due_date: dueDate }, me);
        onSaved(created);
      }
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save task");
    } finally { setBusy(false); }
  };

  const doArchive = async () => {
    if (!task || !user || !profile) return;
    if (!confirm("Archive this task?")) return;
    try {
      await archiveTask(task, { id: user.id, name: profile.full_name });
      onArchived?.(task); onClose();
    } catch (e: any) { toast.error(e?.message || "Failed to archive"); }
  };

  const copy = async () => {
    if (!task) return;
    await navigator.clipboard.writeText(whatsappText({
      ...task, title, note, priority, status, tag, due_date: dueDate, assigned_name: assignedName,
    } as Task));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const visibleActivity = showAllActivity ? activity : activity.slice(0, 5);

  return (
    <div className="fixed inset-0 z-[1300] bg-black/40" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-[420px] bg-white border-l border-line shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        <div className="px-5 py-4 border-b border-line flex items-center justify-between flex-shrink-0">
          <div className="font-serif text-[20px] font-medium truncate">
            {isEdit ? (task!.title.length > 36 ? task!.title.slice(0,36) + "…" : task!.title) : "New Task"}
          </div>
          <button onClick={onClose} className="w-7 h-7 border border-line rounded-[7px] flex items-center justify-center hover:bg-off">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <Field label="Task">
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleError(false); }}
              placeholder="What needs to be done?"
              className={`ipc-input !h-11 !text-[13px] w-full ${titleError ? "!border-[#DC2626]" : ""}`}
            />
          </Field>

          {isAdmin && (
            <Field label="Assign to">
              <select
                value={assignedTo}
                onChange={(e) => {
                  const id = e.target.value;
                  setAssignedTo(id);
                  setAssignedName(members.find((m) => m.id === id)?.full_name ?? "");
                }}
                className="ipc-input !h-10 !text-[13px] w-full"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}{m.role ? ` — ${m.role}` : ""}</option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <div className="flex gap-1.5">
                {(["high","medium","low"] as TaskPriority[]).map((p) => (
                  <button key={p} onClick={() => setPriority(p)}
                    className={`flex-1 h-8 text-[11px] rounded-[7px] border capitalize ${
                      priority === p ? PRIORITY_PILL[p] + " font-medium" : "bg-white text-[#888] border-line"
                    }`}>{p}</button>
                ))}
              </div>
            </Field>
            <Field label="Due Date">
              <input type="date" value={dueDate ?? ""} min={todayISO()}
                onChange={(e) => setDueDate(e.target.value)}
                className="ipc-input !h-10 !text-[13px] w-full" />
            </Field>
          </div>

          <Field label="Status">
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button key={s.key} onClick={() => setStatus(s.key)}
                  className={`h-8 px-2.5 text-[11px] rounded-[7px] border ${
                    status === s.key ? s.pillClass + " font-medium" : "bg-white text-[#888] border-line"
                  }`}>{s.label}</button>
              ))}
            </div>
          </Field>

          <Field label="Tag">
            <select value={tag} onChange={(e) => setTag(e.target.value)} className="ipc-input !h-10 !text-[13px] w-full">
              {TAGS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Note (optional)">
            <textarea value={note ?? ""} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="Add context, links, or instructions…"
              className="ipc-input !text-[13px] w-full" style={{ minHeight: 72, resize: "vertical" }} />
          </Field>

          {isEdit && (
            <div>
              <button onClick={copy} className="text-[11px] text-muted-foreground hover:text-black">
                📋 {copied ? "Copied!" : "Copy task summary for WhatsApp"}
              </button>
            </div>
          )}

          {isEdit && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-line pb-1.5 mb-2.5">Activity</div>
              {activity.length === 0 && <div className="text-[12px] text-muted-foreground italic">No activity yet</div>}
              <div className="space-y-2.5">
                {visibleActivity.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center font-serif text-[8px] text-gold flex-shrink-0">
                      {initialsOf(a.user_name)}
                    </div>
                    <div className="flex-1 text-[12px]"><b className="font-medium">{a.user_name ?? "Someone"}</b> {a.action}</div>
                    <div className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(a.created_at)}</div>
                  </div>
                ))}
              </div>
              {activity.length > 5 && !showAllActivity && (
                <button onClick={() => setShowAllActivity(true)} className="text-[11px] text-gold mt-2">Show all activity →</button>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center justify-between flex-shrink-0 bg-off/40">
          <div>
            {isEdit && isAdmin && (
              <button onClick={doArchive} className="text-[11px] text-[#DC2626] opacity-70 hover:opacity-100">Archive task</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="ipc-btn ipc-btn-ghost !text-xs">Cancel</button>
            <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black !text-xs">
              {busy ? "Saving…" : "Save task"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}
