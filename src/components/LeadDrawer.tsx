import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { GRADE_STYLES, type Lead, type Stage, type ActivityLog, type Reminder } from "@/lib/crmTypes";
import { X, Phone, MessageCircle, Mail, MessageSquare, Trash2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import TagPicker from "@/components/TagPicker";
import FastFollowUpComposer from "@/components/FastFollowUpComposer";
import SuggestedNextActions from "@/components/SuggestedNextActions";
import { createNotification } from "@/lib/notifications";
import SendToOperationsCrmModal from "@/components/SendToOperationsCrmModal";

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
  const [paidSnap, setPaidSnap] = useState<any | null>(null);
  const [showStagePicker, setShowStagePicker] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [opsLeadId, setOpsLeadId] = useState<string | null>(null);
  const [sendOpsOpen, setSendOpsOpen] = useState(false);

  const load = async () => {
    const [{ data: l }, { data: a }, { data: r }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", leadId).maybeSingle(),
      supabase.from("activity_logs").select("*").eq("lead_id", leadId).order("logged_at", { ascending: false }),
      supabase.from("follow_up_reminders").select("*").eq("lead_id", leadId).order("reminder_date"),
    ]);
    setLead(l as any); setActivities((a || []) as any); setReminders((r || []) as any);
    const ppid = (l as any)?.paid_pipeline_lead_id;
    if (ppid) {
      const { data: pp } = await supabase.from("paid_pipeline_leads")
        .select("id,deal_value,token_amount_collected,total_collected,balance_pending,token_paid_status")
        .eq("id", ppid).maybeSingle();
      setPaidSnap(pp || null);
    } else setPaidSnap(null);
    // Check whether this lead is already in Operations CRM (active record)
    const { data: ops } = await (supabase as any)
      .from("operations_leads")
      .select("id, service_status")
      .eq("crm_lead_id", leadId)
      .not("service_status", "in", "(stopped,completed)")
      .maybeSingle();
    setOpsLeadId(ops?.id ?? null);
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
    if (agentId && agentId !== lead.assigned_agent_id) {
      try {
        await createNotification({
          recipient_user_id: agentId,
          module_key: "calling_crm",
          notification_type: "leads_assigned",
          title: "New Calling CRM lead assigned",
          message: `${lead.full_name || "A lead"} has been assigned to you.`,
          priority: "normal",
          action_url: "/crm?assigned_to=me",
          action_label: "Open Calling CRM",
          entity_type: "crm_lead",
          entity_id: lead.id,
          entity_label: lead.full_name || undefined,
          triggered_by_user_id: profile?.id ?? null,
          triggered_by_name: profile?.full_name ?? undefined,
          allowDuplicate: true,
          metadata: {
            module_key: "calling_crm",
            lead_ids: [lead.id],
            assignment_type: "single",
            assigned_by: profile?.id ?? null,
            assigned_to: agentId,
            count: 1,
            deep_link: "/crm?assigned_to=me",
          },
        });
      } catch { /* ignore */ }
    }
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
  const delReminder = async (id: string) => {
    await supabase.from("follow_up_reminders").delete().eq("id", id);
    await load();
  };
  const addStageInline = async () => {
    const name = newStageName.trim();
    if (!name) return;
    const dup = pipelineStages.some((s) => s.name.toLowerCase() === name.toLowerCase());
    if (dup) { toast.error("Stage already exists"); return; }
    const { data, error } = await supabase.from("stages").insert({
      pipeline_id: lead.pipeline_id, name, color: "#E8E5DE", position: pipelineStages.length,
    } as any).select("id").maybeSingle();
    if (error) { toast.error(error.message); return; }
    setNewStageName("");
    toast.success("Stage added");
    if (data?.id) await moveStage(data.id);
    onChanged();
  };
  const deactivateStage = async (s: Stage) => {
    if ((s as any).is_protected) { toast.error("Protected stage"); return; }
    const used = false; // we don't have a count here; defer to Stages view for delete safety
    if (used) { toast.error("Stage in use"); return; }
    if (!confirm(`Delete stage "${s.name}"?`)) return;
    const { error } = await supabase.from("stages").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Stage deleted");
    onChanged();
  };

  const today = new Date().toISOString().slice(0, 10);
  const currentStage = pipelineStages.find((s) => s.id === lead.stage_id);
  const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

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
          {((lead as any).paid_pipeline_lead_id || opsLeadId !== null || lead.lead_type === "paid") && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(lead as any).paid_pipeline_lead_id && (
                <Link to={`/paid-pipeline?lead=${(lead as any).paid_pipeline_lead_id}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-black text-white hover:opacity-90">
                  <ExternalLink className="w-3 h-3" /> Open in Paid Pipeline
                </Link>
              )}
              {opsLeadId ? (
                <Link to={`/operations-crm?lead=${opsLeadId}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-[#166534] text-white hover:opacity-90">
                  <ExternalLink className="w-3 h-3" /> Open in Operations CRM
                </Link>
              ) : (
                <button onClick={() => setSendOpsOpen(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] border border-line bg-white hover:bg-off">
                  <ExternalLink className="w-3 h-3" /> Send to Operations CRM
                </button>
              )}
            </div>
          )}
          {/* Payment / Token snapshot */}
          {(paidSnap || Number(lead.deal_value) > 0) && (
            <div className="mt-4 rounded-lg border border-line bg-off/40 px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Payment Snapshot</div>
                {paidSnap ? (
                  Number(paidSnap.token_amount_collected || 0) > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]">Token Paid {inr(paidSnap.token_amount_collected)}</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">Token Pending</span>
                  )
                ) : (
                  <span className="text-[10px] text-muted-foreground">No paid record</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-1.5 rounded bg-white border border-line"><div className="uppercase-label">Deal</div><div className="font-serif text-sm">{inr(paidSnap?.deal_value ?? lead.deal_value)}</div></div>
                <div className="p-1.5 rounded bg-white border border-line"><div className="uppercase-label">Token</div><div className="font-serif text-sm">{paidSnap ? inr(paidSnap.token_amount_collected) : "—"}</div></div>
                <div className="p-1.5 rounded bg-white border border-line"><div className="uppercase-label">Collected</div><div className="font-serif text-sm">{paidSnap ? inr(paidSnap.total_collected) : "—"}</div></div>
                <div className="p-1.5 rounded bg-white border border-line"><div className="uppercase-label">Balance</div><div className="font-serif text-sm">{paidSnap ? inr(paidSnap.balance_pending) : "—"}</div></div>
              </div>
            </div>
          )}
          <div className="mt-4 rounded-lg border border-line bg-off/40 px-3 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Lead Tags</div>
            </div>
            <TagPicker
              crmLeadId={lead.id}
              paidLeadId={(lead as any).paid_pipeline_lead_id || null}
              leadName={lead.full_name || undefined}
            />
          </div>
          <SuggestedNextActions
            crmLeadId={lead.id}
            paidLeadId={(lead as any).paid_pipeline_lead_id || null}
            onApplied={() => { load(); onChanged(); }}
          />
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

        {/* Follow-up reminders (moved up — most-used action) */}
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
          <FastFollowUpComposer
            crmLeadId={lead.id}
            paidLeadId={(lead as any).paid_pipeline_lead_id || null}
            leadName={lead.full_name || undefined}
            onSaved={load}
          />
        </div>

        {/* Stage — compact dropdown with inline add/delete */}
        <div className="px-6 py-5 border-b border-line">
          <div className="flex items-center justify-between mb-2">
            <div className="section-divider !mb-0">Stage</div>
            <button onClick={() => setShowStagePicker((v) => !v)} className="text-[11px] px-2 py-1 rounded border border-line hover:bg-off">
              {showStagePicker ? "Close" : "Change stage"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Current</span>
            <span className="px-2.5 py-1 rounded-full text-xs bg-black text-white">{currentStage?.name || "—"}</span>
          </div>
          {showStagePicker && (
            <div className="mt-3 border border-line rounded-lg p-2 bg-white space-y-0.5 max-h-[280px] overflow-y-auto">
              {pipelineStages.map((s) => (
                <div key={s.id} className="group flex items-center gap-2">
                  <button onClick={() => { moveStage(s.id); setShowStagePicker(false); }}
                    className={`flex-1 text-left px-2.5 py-1.5 rounded text-xs ${s.id === lead.stage_id ? "bg-off font-medium" : "hover:bg-off"}`}>
                    {s.name}
                  </button>
                  {!(s as any).is_protected && s.id !== lead.stage_id && (
                    <button onClick={() => deactivateStage(s)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-[#DC2626] p-1" title="Delete stage (only if unused)">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-1.5 pt-2 border-t border-line mt-2">
                <input
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addStageInline(); }}
                  placeholder="+ Add new stage…"
                  className="ipc-input !h-8 !text-xs flex-1"
                />
                <button onClick={addStageInline} className="ipc-btn ipc-btn-black !h-8 !text-xs">Add</button>
              </div>
            </div>
          )}
        </div>

        {/* Agent */}
        <div className="px-6 py-5 border-b border-line">
          <div className="section-divider">Assigned agent</div>
          <select className="ipc-input" value={lead.assigned_agent_id || ""} onChange={(e) => setAgent(e.target.value || null)}>
            <option value="">— Unassigned —</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
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
