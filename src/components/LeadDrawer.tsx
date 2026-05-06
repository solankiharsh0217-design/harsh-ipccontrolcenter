import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { GRADE_STYLES, type Lead, type Stage, type ActivityLog, type Reminder } from "@/lib/crmTypes";
import { X, Phone, MessageCircle, Mail, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  leadId: string;
  stages: Stage[];
  agents: { id: string; full_name: string }[];
  onClose: () => void;
  onChanged: () => void;
}

const channelStyle: Record<string, string> = {
  call: "#16A34A", whatsapp: "#22C55E", email: "#2563EB", sms: "#7C3AED", note: "#888888", system: "#0a0a0a",
};

export default function LeadDrawer({ leadId, stages, agents, onClose, onChanged }: Props) {
  const { profile } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activityNote, setActivityNote] = useState("");
  const [activityChannel, setActivityChannel] = useState<ActivityLog["channel"]>("call");
  const [rDate, setRDate] = useState(new Date().toISOString().slice(0, 10));
  const [rTime, setRTime] = useState("10:00");
  const [rChannel, setRChannel] = useState<Reminder["channel"]>("call");
  const [rNote, setRNote] = useState("");

  const load = async () => {
    const [{ data: l }, { data: a }, { data: r }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", leadId).maybeSingle(),
      supabase.from("activity_logs").select("*").eq("lead_id", leadId).order("logged_at", { ascending: false }),
      supabase.from("follow_up_reminders").select("*").eq("lead_id", leadId).order("reminder_date"),
    ]);
    setLead(l as any); setActivities((a || []) as any); setReminders((r || []) as any);
  };
  useEffect(() => { load(); }, [leadId]);

  if (!lead) return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-[560px] bg-white p-8" onClick={(e) => e.stopPropagation()}>Loading…</div>
    </div>
  );

  const g = GRADE_STYLES[lead.grade];
  const pipelineStages = stages.filter((s) => s.pipeline_id === lead.pipeline_id).sort((a, b) => a.position - b.position);

  const moveStage = async (stageId: string) => {
    await supabase.from("leads").update({ stage_id: stageId }).eq("id", lead.id);
    toast.success("Stage updated");
    await load(); onChanged();
  };
  const setAgent = async (agentId: string | null) => {
    await supabase.from("leads").update({ assigned_agent_id: agentId }).eq("id", lead.id);
    toast.success("Agent updated");
    await load(); onChanged();
  };
  const logActivity = async () => {
    if (!activityNote.trim()) return;
    await supabase.from("activity_logs").insert({
      lead_id: lead.id, agent_id: profile?.id, agent_name: profile?.full_name,
      channel: activityChannel, note: activityNote.trim(),
    });
    setActivityNote(""); await load();
  };
  const addReminder = async () => {
    await supabase.from("follow_up_reminders").insert({
      lead_id: lead.id, agent_id: profile?.id,
      reminder_date: rDate, reminder_time: rTime, channel: rChannel, note: rNote || null,
    });
    setRNote(""); await load();
  };
  const delReminder = async (id: string) => {
    await supabase.from("follow_up_reminders").delete().eq("id", id);
    await load();
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-[560px] bg-white border-l border-line overflow-y-auto pb-24" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-line">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-serif text-[22px] leading-tight">{lead.full_name || "Unnamed lead"}</div>
              <div className="font-sans text-xs text-muted-foreground mt-1">{lead.phone || "—"} · {lead.email || "—"}</div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider" style={{ background: g.bg, color: g.fg, border: `1px solid ${g.border}` }}>{g.label}</span>
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-off border border-line text-muted-foreground">{lead.program_name}</span>
                {lead.webinar_source && <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-off border border-line text-muted-foreground">{lead.webinar_source}</span>}
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-off border border-line text-muted-foreground">{lead.lead_type}</span>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-off flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Score + signals */}
        <div className="px-6 py-5 border-b border-line">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#E8E5DE" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke={g.fg} strokeWidth="3" strokeDasharray={`${(lead.score / 100) * 94.2} 94.2`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-serif text-xl">{lead.score}</div>
                <div className="font-sans text-[9px] uppercase text-muted-foreground tracking-wider">{g.label}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 flex-1">
              <div className="p-2 rounded-md bg-off border border-line"><div className="uppercase-label">Attendance</div><div className="font-serif text-base">{lead.total_minutes} min · {lead.sessions_count}×</div></div>
              <div className="p-2 rounded-md bg-off border border-line"><div className="uppercase-label">Webinars</div><div className="font-serif text-base">{lead.webinar_count}{lead.is_super_hot ? " ★" : ""}</div></div>
              <div className="p-2 rounded-md bg-off border border-line"><div className="uppercase-label">First join</div><div className="font-sans text-xs">{lead.first_join_time?.slice(0, 16) || "—"}</div></div>
              <div className="p-2 rounded-md bg-off border border-line"><div className="uppercase-label">Deal value</div><div className="font-serif text-base">₹{Number(lead.deal_value).toLocaleString("en-IN")}</div></div>
            </div>
          </div>

          {/* Contact actions */}
          <div className="grid grid-cols-4 gap-2">
            <a href={`tel:${lead.phone}`} className="ipc-btn !bg-[#16A34A] !text-white !h-10"><Phone className="w-3.5 h-3.5" /> Call</a>
            <a href={`https://wa.me/${(lead.phone || "").replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="ipc-btn ipc-btn-ghost !h-10"><MessageCircle className="w-3.5 h-3.5" /> WA</a>
            <a href={`mailto:${lead.email}`} className="ipc-btn ipc-btn-ghost !h-10"><Mail className="w-3.5 h-3.5" /> Email</a>
            <a href={`sms:${lead.phone}`} className="ipc-btn ipc-btn-ghost !h-10"><MessageSquare className="w-3.5 h-3.5" /> SMS</a>
          </div>
        </div>

        {/* Move stage */}
        <div className="px-6 py-5 border-b border-line">
          <div className="section-divider">Move stage</div>
          <div className="flex flex-wrap gap-1.5">
            {pipelineStages.map((s) => (
              <button key={s.id} onClick={() => moveStage(s.id)} className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${s.id === lead.stage_id ? "bg-black text-white border-black" : "bg-white border-line hover:bg-off"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Agent */}
        <div className="px-6 py-5 border-b border-line">
          <div className="section-divider">Assigned agent</div>
          <select className="ipc-input" value={lead.assigned_agent_id || ""} onChange={(e) => setAgent(e.target.value || null)}>
            <option value="">— Unassigned —</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </div>

        {/* Reminders */}
        <div className="px-6 py-5 border-b border-line">
          <div className="section-divider">Follow-up reminders</div>
          <div className="space-y-2 mb-3">
            {reminders.length === 0 && <div className="text-xs text-muted-foreground">No reminders yet.</div>}
            {reminders.map((r) => {
              const overdue = r.reminder_date < today;
              const isToday = r.reminder_date === today;
              const cls = overdue ? "bg-[#FEF2F2] border-[#FECACA]" : isToday ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#EFF6FF] border-[#BFDBFE]";
              return (
                <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cls}`}>
                  <div className="flex-1 text-xs">
                    <span className="font-medium">{r.reminder_date}</span> {r.reminder_time?.slice(0, 5)} · <span className="uppercase">{r.channel}</span>
                    {r.note && <div className="text-muted-foreground mt-0.5">{r.note}</div>}
                  </div>
                  <button onClick={() => delReminder(r.id)} className="text-muted-foreground hover:text-black"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input type="date" className="ipc-input !h-10 !text-xs" value={rDate} onChange={(e) => setRDate(e.target.value)} />
            <input type="time" className="ipc-input !h-10 !text-xs" value={rTime} onChange={(e) => setRTime(e.target.value)} />
            <select className="ipc-input !h-10 !text-xs" value={rChannel} onChange={(e) => setRChannel(e.target.value as any)}>
              <option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="sms">SMS</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input type="text" className="ipc-input !h-10 !text-xs flex-1" placeholder="Optional note…" value={rNote} onChange={(e) => setRNote(e.target.value)} />
            <button onClick={addReminder} className="ipc-btn ipc-btn-black !h-10">Add</button>
          </div>
        </div>

        {/* Activity */}
        <div className="px-6 py-5 border-b border-line">
          <div className="section-divider">Log activity</div>
          <textarea className="ipc-input !h-auto py-2.5" rows={3} placeholder="Write call notes, WhatsApp summary…" value={activityNote} onChange={(e) => setActivityNote(e.target.value)} />
          <div className="flex gap-2 mt-2">
            <select className="ipc-input !h-10 !text-xs flex-1" value={activityChannel} onChange={(e) => setActivityChannel(e.target.value as any)}>
              <option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="sms">SMS</option><option value="note">Note</option>
            </select>
            <button onClick={logActivity} className="ipc-btn ipc-btn-black !h-10">Save</button>
          </div>
        </div>

        {/* History */}
        <div className="px-6 py-5">
          <div className="section-divider">Activity history</div>
          <div className="space-y-3">
            {activities.length === 0 && <div className="text-xs text-muted-foreground">No activity yet.</div>}
            {activities.map((a) => (
              <div key={a.id} className="flex gap-3">
                <div className="w-1 rounded-full" style={{ background: channelStyle[a.channel] }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: channelStyle[a.channel] }}>{a.channel}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(a.logged_at).toLocaleString()}</span>
                  </div>
                  <div className="font-sans text-xs">{a.note}</div>
                  {a.agent_name && <div className="text-[10px] text-muted-foreground mt-0.5">— {a.agent_name}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky Save & Close */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-line px-6 py-3 flex items-center justify-between gap-3">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button
            onClick={() => { toast.success("Saved"); onChanged(); onClose(); }}
            className="ipc-btn !bg-[#16A34A] hover:!bg-[#15803D] !text-white !h-10 flex-1"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
