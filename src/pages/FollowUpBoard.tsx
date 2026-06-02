import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { saveCentralFollowUp } from "@/lib/followUps";
import { logActivity } from "@/lib/auditLog";

type FU = {
  id: string;
  paid_pipeline_lead_id: string | null;
  related_crm_lead_id: string | null;
  follow_up_date: string;
  follow_up_time: string | null;
  follow_up_type: string | null;
  follow_up_reason: string | null;
  priority: string | null;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  source_module: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
};

type CrmLead = { id: string; name: string | null; phone: string | null; grade: string | null; pipeline_id: string | null; stage_id: string | null; assigned_agent_id: string | null };
type PaidLead = { id: string; name: string | null; phone: string | null; crm_lead_id: string | null; assigned_sales_executive: string | null; pipeline_stage: string | null };

const PRIORITIES = ["Urgent", "Hot", "Warm", "Normal", "Cold", "Low"];
const STATUSES = ["Pending", "Done", "Missed", "Rescheduled", "Cancelled"];
const REMINDER_OFFSETS = [5, 10, 15, 30];

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function parseFU(f: FU): Date {
  const [h, m] = (f.follow_up_time || "11:00").split(":").map(Number);
  const d = new Date(f.follow_up_date + "T00:00:00");
  d.setHours(h || 11, m || 0, 0, 0);
  return d;
}
function bucketOf(f: FU): "overdue" | "today" | "tomorrow" | "thisWeek" | "future" | "completed" {
  if (["Done", "Cancelled"].includes(f.status)) return "completed";
  const due = parseFU(f);
  const today = startOfDay();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today); dayAfter.setDate(dayAfter.getDate() + 2);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  if (due < today) return "overdue";
  if (due < tomorrow) return "today";
  if (due < dayAfter) return "tomorrow";
  if (due < weekEnd) return "thisWeek";
  return "future";
}

const BUCKET_LABELS: Record<string, string> = {
  overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", thisWeek: "This Week", future: "Future", completed: "Completed",
};

const PRIO_COLOR: Record<string, string> = {
  Urgent: "bg-red-50 text-red-700 border-red-200",
  Hot: "bg-orange-50 text-orange-700 border-orange-200",
  Warm: "bg-amber-50 text-amber-800 border-amber-200",
  Normal: "bg-slate-50 text-slate-700 border-slate-200",
  Cold: "bg-blue-50 text-blue-700 border-blue-200",
  Low: "bg-gray-50 text-gray-600 border-gray-200",
};
const GRADE_COLOR: Record<string, string> = {
  "super-hot": "bg-rose-100 text-rose-800",
  hot: "bg-orange-100 text-orange-800",
  warm: "bg-amber-100 text-amber-800",
  cold: "bg-blue-100 text-blue-800",
  inactive: "bg-gray-100 text-gray-600",
  "true-absentee": "bg-gray-100 text-gray-600",
};

export default function FollowUpBoard() {
  const { user, isAdmin, hasModule } = useAuth();
  const nav = useNavigate();
  const allowed = isAdmin || hasModule("follow_up_command_center") || hasModule("crm") || hasModule("calling_crm");

  const [fus, setFus] = useState<FU[]>([]);
  const [crmMap, setCrmMap] = useState<Record<string, CrmLead>>({});
  const [paidMap, setPaidMap] = useState<Record<string, PaidLead>>({});
  const [profMap, setProfMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // filters
  const [tab, setTab] = useState<"mine" | "team" | "all">("mine");
  const [bucketFilter, setBucketFilter] = useState<string>("all"); // show everything by default
  const [search, setSearch] = useState("");
  const [priorityF, setPriorityF] = useState("all");
  const [statusF, setStatusF] = useState("Pending");
  const [ownerF, setOwnerF] = useState("all");
  const [gradeF, setGradeF] = useState("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  // reminder
  const [reminderMin, setReminderMin] = useState<number>(() => {
    const v = Number(localStorage.getItem("fub_reminder_min") || "10");
    return REMINDER_OFFSETS.includes(v) ? v : 10;
  });
  const notifiedRef = useRef<Set<string>>(new Set());

  // modals
  const [rescheduleFor, setRescheduleFor] = useState<FU | null>(null);
  const [noteFor, setNoteFor] = useState<FU | null>(null);

  useEffect(() => { localStorage.setItem("fub_reminder_min", String(reminderMin)); }, [reminderMin]);

  const load = async () => {
    if (!allowed) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: fdata } = await (supabase as any)
        .from("paid_pipeline_followups")
        .select("*")
        .eq("is_deleted", false)
        .order("follow_up_date", { ascending: true });
      const list = (fdata as FU[]) || [];
      setFus(list);

      const crmIds = Array.from(new Set(list.map((f) => f.related_crm_lead_id).filter(Boolean) as string[]));
      const paidIds = Array.from(new Set(list.map((f) => f.paid_pipeline_lead_id).filter(Boolean) as string[]));

      if (crmIds.length) {
        const { data } = await supabase.from("leads").select("id,name,phone,grade,pipeline_id,stage_id,assigned_agent_id").in("id", crmIds);
        const m: Record<string, CrmLead> = {};
        (data || []).forEach((l: any) => { m[l.id] = l; });
        setCrmMap(m);
      }
      if (paidIds.length) {
        const { data } = await supabase.from("paid_pipeline_leads").select("id,name,phone,crm_lead_id,assigned_sales_executive,pipeline_stage").in("id", paidIds);
        const m: Record<string, PaidLead> = {};
        (data || []).forEach((l: any) => { m[l.id] = l; });
        setPaidMap(m);
      }
      const { data: profs } = await (supabase as any).from("profiles").select("id,full_name");
      const pm: Record<string, string> = {};
      (profs || []).forEach((p: any) => { pm[p.id] = p.full_name || "—"; });
      setProfMap(pm);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [allowed]);

  // Realtime + focus refetch
  useEffect(() => {
    if (!allowed) return;
    const ch = (supabase as any)
      .channel("followup-board-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "paid_pipeline_followups" }, () => load())
      .subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { try { (supabase as any).removeChannel(ch); } catch {} window.removeEventListener("focus", onFocus); };
    // eslint-disable-next-line
  }, [allowed]);


  // owner resolution for "mine" filter
  const ownerOf = (f: FU): string | null => {
    if (f.assigned_to && /^[0-9a-f-]{36}$/i.test(f.assigned_to)) return f.assigned_to;
    if (f.related_crm_lead_id && crmMap[f.related_crm_lead_id]?.assigned_agent_id) return crmMap[f.related_crm_lead_id].assigned_agent_id;
    if (f.paid_pipeline_lead_id && paidMap[f.paid_pipeline_lead_id]?.assigned_sales_executive) return paidMap[f.paid_pipeline_lead_id].assigned_sales_executive;
    return f.created_by;
  };

  const leadOf = (f: FU) => {
    if (f.related_crm_lead_id && crmMap[f.related_crm_lead_id]) {
      const l = crmMap[f.related_crm_lead_id];
      return { name: l.name || "—", phone: l.phone, grade: l.grade, stage: l.stage_id, kind: "crm" as const, id: l.id };
    }
    if (f.paid_pipeline_lead_id && paidMap[f.paid_pipeline_lead_id]) {
      const l = paidMap[f.paid_pipeline_lead_id];
      return { name: l.name || "—", phone: l.phone, grade: null, stage: l.pipeline_stage, kind: "paid" as const, id: l.id, crmId: l.crm_lead_id };
    }
    return { name: "(unlinked)", phone: null, grade: null, stage: null, kind: "none" as const, id: null };
  };

  const filtered = useMemo(() => {
    return fus.filter((f) => {
      // tab
      if (tab === "mine" && user) {
        const owner = ownerOf(f);
        const mine = owner === user.id || f.created_by === user.id || f.assigned_to === user.id;
        if (!mine) return false;
      }
      // tab "team" and "all" show everything visible to admin (admin-only buttons)
      // bucket
      const b = bucketOf(f);
      if (bucketFilter === "default") {
        if (!["overdue", "today"].includes(b)) return false;
      } else if (bucketFilter !== "all" && bucketFilter !== b) return false;
      // status
      if (statusF !== "all" && f.status !== statusF) return false;
      // priority
      if (priorityF !== "all" && (f.priority || "Normal") !== priorityF) return false;
      // owner
      if (ownerF !== "all" && ownerOf(f) !== ownerF) return false;
      // grade
      if (gradeF !== "all") {
        const l = leadOf(f);
        if ((l.grade || "") !== gradeF) return false;
      }
      // search
      if (search.trim()) {
        const q = search.toLowerCase();
        const l = leadOf(f);
        const hay = `${l.name || ""} ${l.phone || ""} ${f.notes || ""} ${f.follow_up_type || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [fus, tab, bucketFilter, statusF, priorityF, ownerF, gradeF, search, crmMap, paidMap, user]);

  // group by bucket
  const grouped = useMemo(() => {
    const g: Record<string, FU[]> = { overdue: [], today: [], tomorrow: [], thisWeek: [], future: [], completed: [] };
    filtered.forEach((f) => { g[bucketOf(f)].push(f); });
    Object.values(g).forEach((arr) => arr.sort((a, b) => parseFU(a).getTime() - parseFU(b).getTime()));
    return g;
  }, [filtered]);

  // summary
  const summary = useMemo(() => {
    const my = user ? fus.filter((f) => ownerOf(f) === user.id) : fus;
    const todayStr = ymd(new Date());
    return {
      overdue: my.filter((f) => f.status === "Pending" && bucketOf(f) === "overdue").length,
      today: my.filter((f) => f.status === "Pending" && bucketOf(f) === "today").length,
      week: my.filter((f) => f.status === "Pending" && ["tomorrow", "thisWeek"].includes(bucketOf(f))).length,
      doneToday: my.filter((f) => f.status === "Done" && f.completed_at && f.completed_at.slice(0, 10) === todayStr).length,
    };
  }, [fus, user, crmMap, paidMap]);

  // reminder polling
  useEffect(() => {
    if (!user || !allowed) return;
    const tick = () => {
      const now = Date.now();
      const horizon = now + reminderMin * 60 * 1000;
      fus.forEach((f) => {
        if (f.status !== "Pending") return;
        if (ownerOf(f) !== user.id) return;
        const due = parseFU(f).getTime();
        if (due < now - 60_000) return; // already passed
        if (due > horizon) return;
        if (notifiedRef.current.has(f.id)) return;
        notifiedRef.current.add(f.id);
        const l = leadOf(f);
        toast(`Follow-up due in ${Math.max(0, Math.round((due - now) / 60000))} min: ${l.name}`, {
          action: {
            label: "Open",
            onClick: () => {
              const crmId = l.kind === "crm" ? l.id : (l as any).crmId;
              if (crmId) nav(`/crm?lead=${crmId}`);
              else if (f.paid_pipeline_lead_id) nav(`/paid-pipeline?lead=${f.paid_pipeline_lead_id}`);
            },
          },
          duration: 15000,
        });
      });
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [fus, user, allowed, reminderMin, crmMap, paidMap]);

  const markDone = async (f: FU) => {
    const { error } = await (supabase as any).from("paid_pipeline_followups").update({
      status: "Done", completed_at: new Date().toISOString(), completed_by: user?.id || null,
    }).eq("id", f.id);
    if (error) return toast.error(error.message);
    toast.success("Marked done");
    logActivity({ module_key: "follow_up_command_center", module_label: "Follow-up Board", action_type: "follow_up_completed", action_label: "Marked done", entity_type: "follow_up", entity_id: f.id, summary: `Follow-up marked done.` });
    load();
  };

  const snooze = async (f: FU, mins: number) => {
    const d = parseFU(f);
    const newDate = new Date(Math.max(Date.now(), d.getTime()) + mins * 60_000);
    const { error } = await (supabase as any).from("paid_pipeline_followups").update({
      follow_up_date: ymd(newDate), follow_up_time: `${String(newDate.getHours()).padStart(2, "0")}:${String(newDate.getMinutes()).padStart(2, "0")}`,
    }).eq("id", f.id);
    if (error) return toast.error(error.message);
    notifiedRef.current.delete(f.id);
    toast.success(`Snoozed ${mins} min`);
    load();
  };

  const openLead = (f: FU) => {
    const l = leadOf(f);
    const crmId = l.kind === "crm" ? l.id : (l as any).crmId;
    if (crmId) nav(`/crm?lead=${crmId}`);
    else if (f.paid_pipeline_lead_id) nav(`/paid-pipeline?lead=${f.paid_pipeline_lead_id}`);
    else toast("No lead linked");
  };

  if (!allowed) return <div className="p-8 text-sm text-muted-foreground">You don't have access to the Follow-up Board.</div>;

  const ownerOptions = Array.from(new Set(fus.map(ownerOf).filter(Boolean) as string[]));

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-serif text-[24px] text-black">Follow-up Board</h1>
          <p className="text-[12px] text-muted-foreground mt-1">Your daily call list — what to call now, today, and this week.</p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">Reminder:</span>
          <select className="qsi-input !h-8 !w-auto" value={reminderMin} onChange={(e) => setReminderMin(Number(e.target.value))}>
            {REMINDER_OFFSETS.map((m) => <option key={m} value={m}>{m} min before</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="Overdue" value={summary.overdue} tone="red" onClick={() => { setBucketFilter("overdue"); setStatusF("Pending"); }} />
        <SummaryCard label="Due Today" value={summary.today} tone="blue" onClick={() => { setBucketFilter("today"); setStatusF("Pending"); }} />
        <SummaryCard label="Upcoming This Week" value={summary.week} tone="amber" onClick={() => { setBucketFilter("thisWeek"); setStatusF("Pending"); }} />
        <SummaryCard label="Completed Today" value={summary.doneToday} tone="green" onClick={() => { setBucketFilter("all"); setStatusF("Done"); }} />
      </div>

      {/* Tabs + filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3 p-2 border border-line rounded-lg bg-off/40">
        <div className="flex bg-white border border-line rounded-md overflow-hidden text-[12px]">
          <button onClick={() => setTab("mine")} className={`px-3 py-1.5 ${tab === "mine" ? "bg-black text-white" : ""}`}>My Follow-ups</button>
          {isAdmin && <button onClick={() => setTab("team")} className={`px-3 py-1.5 ${tab === "team" ? "bg-black text-white" : ""}`}>Team Follow-ups</button>}
        </div>
        <div className="flex gap-1 text-[12px]">
          {(["default", "overdue", "today", "tomorrow", "thisWeek", "future", "completed", "all"] as const).map((b) => (
            <button key={b} onClick={() => setBucketFilter(b)} className={`px-2.5 py-1 rounded border ${bucketFilter === b ? "bg-black text-white border-black" : "bg-white border-line"}`}>
              {b === "default" ? "Today + Overdue" : b === "all" ? "All" : BUCKET_LABELS[b]}
            </button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / phone / note" className="qsi-input !h-8 !w-[220px] ml-auto" />
        <button onClick={() => setMoreOpen((v) => !v)} className="text-[12px] px-2.5 py-1 rounded border border-line bg-white">More filters</button>
      </div>
      {moreOpen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 mb-3 border border-line rounded-lg bg-white text-[12px]">
          <div>
            <label className="qsi-label">Status</label>
            <select className="qsi-input !h-8" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
              <option value="all">All</option>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="qsi-label">Priority</label>
            <select className="qsi-input !h-8" value={priorityF} onChange={(e) => setPriorityF(e.target.value)}>
              <option value="all">All</option>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="qsi-label">Owner</label>
              <select className="qsi-input !h-8" value={ownerF} onChange={(e) => setOwnerF(e.target.value)}>
                <option value="all">All</option>
                {ownerOptions.map((id) => <option key={id} value={id}>{profMap[id] || id.slice(0, 8)}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="qsi-label">Lead grade</label>
            <select className="qsi-input !h-8" value={gradeF} onChange={(e) => setGradeF(e.target.value)}>
              <option value="all">All</option>
              {["super-hot", "hot", "warm", "cold", "inactive", "true-absentee"].map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-sm text-muted-foreground border border-dashed border-line rounded-lg">No follow-ups match your filters.</div>
      ) : (
        <div className="space-y-5">
          {(["overdue", "today", "tomorrow", "thisWeek", "future", "completed"] as const).map((b) =>
            grouped[b].length === 0 ? null : (
              <div key={b}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-serif text-[15px] text-black">{BUCKET_LABELS[b]}</h3>
                  <span className="text-[11px] text-muted-foreground">({grouped[b].length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {grouped[b].map((f) => (
                    <FollowUpCard key={f.id} f={f} lead={leadOf(f)} ownerName={profMap[ownerOf(f) || ""] || "—"} bucket={b}
                      onOpen={() => openLead(f)} onDone={() => markDone(f)} onReschedule={() => setRescheduleFor(f)} onNote={() => setNoteFor(f)} onSnooze={(m) => snooze(f, m)} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {rescheduleFor && (
        <RescheduleModal f={rescheduleFor} fus={fus} userId={user?.id || null} onClose={() => setRescheduleFor(null)} onSaved={() => { setRescheduleFor(null); load(); }} />
      )}
      {noteFor && (
        <NoteModal f={noteFor} onClose={() => setNoteFor(null)} onSaved={() => { setNoteFor(null); load(); }} />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone, onClick }: { label: string; value: number; tone: "red" | "blue" | "amber" | "green"; onClick: () => void }) {
  const map: Record<string, string> = {
    red: "border-red-200 bg-red-50/50",
    blue: "border-blue-200 bg-blue-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    green: "border-emerald-200 bg-emerald-50/50",
  };
  return (
    <button onClick={onClick} className={`text-left border ${map[tone]} rounded-lg p-3 hover:shadow-sm transition`}>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-[26px] font-serif text-black mt-1">{value}</div>
    </button>
  );
}

function FollowUpCard({
  f, lead, ownerName, bucket, onOpen, onDone, onReschedule, onNote, onSnooze,
}: {
  f: FU; lead: any; ownerName: string; bucket: string;
  onOpen: () => void; onDone: () => void; onReschedule: () => void; onNote: () => void; onSnooze: (m: number) => void;
}) {
  const [expandNote, setExpandNote] = useState(false);
  const borderTone =
    bucket === "overdue" ? "border-l-4 border-l-red-500"
      : bucket === "today" ? "border-l-4 border-l-blue-500"
        : bucket === "completed" ? "border-l-4 border-l-emerald-500 opacity-80"
          : "border-l-4 border-l-transparent";
  const prio = (f.priority || "Normal");
  const note = f.notes || "";
  const longNote = note.length > 80;
  return (
    <div className={`bg-white border border-line ${borderTone} rounded-lg p-3 text-[12px]`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button onClick={onOpen} className="font-medium text-black text-[13px] hover:underline truncate block max-w-[200px]">{lead.name}</button>
          <div className="text-[11px] text-muted-foreground">{lead.phone || "—"}</div>
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          {lead.grade && <span className={`px-1.5 py-0.5 rounded text-[10px] ${GRADE_COLOR[lead.grade] || "bg-gray-100"}`}>{lead.grade}</span>}
          <span className={`px-1.5 py-0.5 rounded border text-[10px] ${PRIO_COLOR[prio] || PRIO_COLOR.Normal}`}>{prio}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>📅 {f.follow_up_date} {f.follow_up_time || ""}</span>
        {f.follow_up_type && <span>· {f.follow_up_type}</span>}
      </div>
      {note && (
        <div className="mt-1.5 text-[12px] text-slate-700">
          {expandNote || !longNote ? note : note.slice(0, 80) + "…"}
          {longNote && <button onClick={() => setExpandNote((v) => !v)} className="ml-1 text-blue-600 text-[11px]">{expandNote ? "less" : "more"}</button>}
        </div>
      )}
      <div className="mt-1 text-[10px] text-muted-foreground">Owner: {ownerName}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button onClick={onOpen} className="px-2 py-1 text-[11px] rounded border border-line bg-white hover:bg-off">Open</button>
        {f.status === "Pending" && <button onClick={onDone} className="px-2 py-1 text-[11px] rounded bg-emerald-600 text-white hover:bg-emerald-700">Mark Done</button>}
        {f.status === "Pending" && <button onClick={onReschedule} className="px-2 py-1 text-[11px] rounded border border-line bg-white hover:bg-off">Reschedule</button>}
        <button onClick={onNote} className="px-2 py-1 text-[11px] rounded border border-line bg-white hover:bg-off">Note</button>
        {f.status === "Pending" && <button onClick={() => onSnooze(10)} className="px-2 py-1 text-[11px] rounded border border-line bg-white hover:bg-off">Snooze 10m</button>}
        {lead.phone && <a href={`tel:${lead.phone}`} className="px-2 py-1 text-[11px] rounded bg-black text-white">Call</a>}
      </div>
    </div>
  );
}

function RescheduleModal({ f, fus, userId, onClose, onSaved }: { f: FU; fus: FU[]; userId: string | null; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(f.follow_up_date);
  const [time, setTime] = useState((f.follow_up_time || "11:00").slice(0, 5));
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState(false);

  const clash = useMemo(() => {
    if (!userId) return false;
    return fus.some((x) =>
      x.id !== f.id && x.status === "Pending" && x.follow_up_date === date && (x.follow_up_time || "").slice(0, 5) === time
      && (x.created_by === userId || x.assigned_to === userId)
    );
  }, [fus, date, time, userId, f.id]);

  const save = async () => {
    if (clash && !override) return;
    setBusy(true);
    try {
      await saveCentralFollowUp({
        editId: f.id,
        crmLeadId: f.related_crm_lead_id || null,
        paidLeadId: f.paid_pipeline_lead_id || null,
        date, time,
        type: f.follow_up_type, priority: f.priority, note: f.notes,
        status: "Rescheduled", ownerId: null, createdBy: userId,
        sourceModule: f.source_module || "follow_up_board",
        auditActionType: "follow_up_rescheduled",
      });
      // Restore status to Pending so it appears in upcoming buckets
      await (supabase as any).from("paid_pipeline_followups").update({ status: "Pending" }).eq("id", f.id);
      toast.success("Rescheduled");
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[460px]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-line font-serif text-[18px]">Reschedule follow-up</div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="qsi-label">Date</label><input type="date" className="qsi-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label className="qsi-label">Time</label><input type="time" className="qsi-input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          {clash && (
            <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[12px] text-amber-900">
              You already have another follow-up at this time.
              <label className="flex items-center gap-1.5 mt-1.5"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Continue anyway</label>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy || (clash && !override)} className="ipc-btn ipc-btn-black">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function NoteModal({ f, onClose, onSaved }: { f: FU; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(f.notes || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await (supabase as any).from("paid_pipeline_followups").update({ notes: text }).eq("id", f.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Note saved");
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[460px]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-line font-serif text-[18px]">Add note</div>
        <div className="p-5">
          <textarea className="qsi-input !h-auto py-2" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened on this call?" />
        </div>
        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
