import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LoadingState } from "@/components/ui-bits";
import type { EligibleAssignee } from "@/lib/eligibleAssignees";
import {
  type MBCase, type MBServicePeriod,
  computeServiceMetrics, markCalled, markNotPicked, sendFollowUpEmail,
  setAdAccessStatus, requestAccessEmail, launchAds, pauseAds, resumeAds, stopAds,
  completeService, addCaseNote, assignCase, autoAssignRoundRobin,
} from "@/lib/mediaBuyerOps";

const CALL_OUTCOMES = ["Connected", "Not Picked", "Switched Off", "Wrong Number", "Will Share Access", "Needs Help", "Asked to Email", "Not Interested", "Escalate to Admin"];
const ACCESS_STATUSES = ["not_requested", "requested", "pending_from_student", "received", "partial_received", "issue", "revoked", "not_required"];

export default function CaseDrawer({ caseId, onClose, canEdit, isAdmin, buyers }: {
  caseId: string; onClose: () => void; canEdit: boolean; isAdmin: boolean; buyers: EligibleAssignee[];
}) {
  const [c, setC] = useState<MBCase | null>(null);
  const [periods, setPeriods] = useState<MBServicePeriod[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState(CALL_OUTCOMES[0]);
  const [reason, setReason] = useState("");
  const [reassignTo, setReassignTo] = useState("");

  async function load() {
    setLoading(true);
    const [cr, pr, er, mr] = await Promise.all([
      (supabase as any).from("media_buyer_cases").select("*").eq("id", caseId).maybeSingle(),
      (supabase as any).from("media_buyer_service_periods").select("*").eq("case_id", caseId).eq("is_deleted", false).order("started_at"),
      (supabase as any).from("media_buyer_case_events").select("*").eq("case_id", caseId).eq("is_deleted", false).order("event_date", { ascending: false }),
      (supabase as any).from("media_buyer_case_emails").select("*").eq("case_id", caseId).eq("is_deleted", false).order("created_at", { ascending: false }),
    ]);
    setC(cr.data as MBCase | null);
    setPeriods((pr.data ?? []) as MBServicePeriod[]);
    setEvents(er.data ?? []);
    setEmails(mr.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [caseId]);

  async function run(fn: () => Promise<any>, ok: string) {
    try { await fn(); toast.success(ok); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Action failed"); }
  }

  if (loading || !c) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
        <div className="w-full max-w-2xl bg-white p-6"><LoadingState /></div>
      </div>
    );
  }
  const m = computeServiceMetrics(c, periods);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="font-serif text-xl text-black">{c.student_name}</div>
            <div className="text-[12px] text-muted-foreground font-sans">{c.student_phone ?? "—"} · {c.student_email ?? "—"} · {c.program_name ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground mt-1 font-sans">
              Stage: <span className="capitalize">{c.case_stage.replace(/_/g, " ")}</span> · Assigned: {c.assigned_media_buyer_name ?? "—"}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-black">✕</button>
        </div>

        {/* Assignment / Reassign */}
        {isAdmin && (
          <Section title="Assignment">
            <div className="flex items-center gap-2">
              <select className="ipc-input h-9" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">— Pick media buyer —</option>
                {buyers.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
              </select>
              <button className="ipc-btn" disabled={!reassignTo} onClick={() => run(() => assignCase(c.id, reassignTo), "Reassigned")}>Reassign</button>
              <button className="ipc-btn" onClick={() => run(() => autoAssignRoundRobin(c.id), "Round-robin assigned")}>Auto round robin</button>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">First call due: {c.first_call_due_at ? new Date(c.first_call_due_at).toLocaleString() : "—"}</div>
          </Section>
        )}

        {/* Call */}
        <Section title="Call tracking">
          <div className="grid grid-cols-2 gap-3 mb-3 text-[12px]">
            <Stat label="Call status" value={c.call_status.replace(/_/g, " ")} />
            <Stat label="Attempts" value={String(c.total_call_attempts)} />
            <Stat label="First called" value={c.first_called_at ? new Date(c.first_called_at).toLocaleString() : "—"} />
            <Stat label="Last outcome" value={c.last_call_outcome ?? "—"} />
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {c.student_phone && <a href={`tel:${c.student_phone}`} className="ipc-btn">📞 Call now</a>}
              <select className="ipc-input h-9" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {CALL_OUTCOMES.map((o) => <option key={o}>{o}</option>)}
              </select>
              <button className="ipc-btn ipc-btn-black" onClick={() => run(() => markCalled(c, outcome), "Call marked")}>Mark called</button>
              <button className="ipc-btn" onClick={() => run(() => markNotPicked(c), "Marked not picked")}>Mark not picked</button>
              <button className="ipc-btn" onClick={() => run(() => sendFollowUpEmail(c), "Follow-up email queued")}>Send follow-up email</button>
            </div>
          )}
        </Section>

        {/* Ad access */}
        <Section title="Ad account access">
          <div className="grid grid-cols-2 gap-3 mb-3 text-[12px]">
            <Stat label="Status" value={c.ad_access_status.replace(/_/g, " ")} />
            <Stat label="Received at" value={c.ad_account_access_received_at ? new Date(c.ad_account_access_received_at).toLocaleString() : "—"} />
            <Stat label="Ad account" value={c.ad_account_name ?? "—"} />
            <Stat label="BM / Page / Ad / Pixel" value={`${c.business_manager_access ? "✓" : "—"} / ${c.page_access ? "✓" : "—"} / ${c.ad_account_access ? "✓" : "—"} / ${c.pixel_domain_access ? "✓" : "—"}`} />
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <select className="ipc-input h-9" defaultValue={c.ad_access_status} onChange={(e) => run(() => setAdAccessStatus(c, e.target.value), "Access status updated")}>
                {ACCESS_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
              <button className="ipc-btn" onClick={() => run(() => requestAccessEmail(c), "Access email queued")}>Request access email</button>
            </div>
          )}
        </Section>

        {/* Ads lifecycle */}
        <Section title="Ads lifecycle">
          <div className="grid grid-cols-2 gap-3 mb-3 text-[12px]">
            <Stat label="Ads status" value={c.ads_status.replace(/_/g, " ")} />
            <Stat label="Launch date" value={c.ads_launch_date ?? "—"} />
            <Stat label="Active days used" value={String(m.activeDays)} />
            <Stat label="Paused days" value={String(m.pausedDays)} />
            <Stat label="Contract days" value={m.contractDays != null ? String(m.contractDays) : "—"} />
            <Stat label="Remaining" value={m.remainingDays != null ? String(m.remainingDays) : "—"} />
            <Stat label="Projected end" value={m.projectedEnd ?? (c.ads_status === "paused" ? "Paused — extends after resume" : "—")} />
            <Stat label="Stop date" value={c.ads_stop_date ?? "—"} />
          </div>
          {canEdit && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <button className="ipc-btn ipc-btn-black" disabled={c.ads_status === "active"} onClick={() => run(() => launchAds(c), "Ads launched")}>Mark ads launched</button>
                <button className="ipc-btn" disabled={c.ads_status !== "active"} onClick={() => run(() => pauseAds(c, reason), "Ads paused")}>Pause</button>
                <button className="ipc-btn" disabled={c.ads_status !== "paused"} onClick={() => run(() => resumeAds(c, reason), "Ads resumed")}>Resume</button>
                <button className="ipc-btn" disabled={["stopped", "completed"].includes(c.ads_status)} onClick={() => run(() => stopAds(c, reason), "Ads stopped")}>Stop</button>
                <button className="ipc-btn" disabled={c.ads_status === "completed"} onClick={() => run(() => completeService(c), "Service completed")}>Complete service</button>
              </div>
              <input className="ipc-input w-full" placeholder="Reason (for pause/resume/stop)" value={reason} onChange={(e) => setReason(e.target.value)} />
            </>
          )}
        </Section>

        {/* Emails */}
        <Section title="Email proof history">
          {emails.length === 0 ? <div className="text-[12px] text-muted-foreground">No emails yet.</div> : (
            <div className="space-y-2">
              {emails.map((e) => (
                <div key={e.id} className="border border-line rounded-md p-3 text-[12px]">
                  <div className="flex items-center justify-between">
                    <div className="font-serif text-[13px]">{e.subject}</div>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${e.status === "sent" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : e.status === "failed" ? "bg-red-50 text-red-700 border-red-200" : "bg-off border-line text-muted-foreground"}`}>{e.status}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{e.email_type} · {e.recipient_email ?? "—"} · {new Date(e.created_at).toLocaleString()}</div>
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] text-black font-sans bg-off rounded p-2 max-h-32 overflow-auto">{e.body}</pre>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Timeline */}
        <Section title="Timeline">
          {events.length === 0 ? <div className="text-[12px] text-muted-foreground">No events yet.</div> : (
            <ol className="border-l border-line ml-2 space-y-2">
              {events.map((ev) => (
                <li key={ev.id} className="pl-3 relative">
                  <span className="absolute -left-[5px] top-2 w-2 h-2 rounded-full bg-black" />
                  <div className="text-[12px] font-serif text-black">{ev.event_label ?? ev.event_type}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(ev.event_date).toLocaleString()}{ev.notes ? ` — ${ev.notes}` : ""}</div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* Notes */}
        <Section title="Add note">
          <div className="flex gap-2">
            <input className="ipc-input flex-1" placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="ipc-btn ipc-btn-black" disabled={!note.trim() || !canEdit} onClick={() => run(async () => { await addCaseNote(c, note.trim()); setNote(""); }, "Note added")}>Add</button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-b border-line">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2 font-sans">{title}</div>
      {children}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line rounded-md px-3 py-2 bg-off">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[12px] text-black capitalize">{value}</div>
    </div>
  );
}
