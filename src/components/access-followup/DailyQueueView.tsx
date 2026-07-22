import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { upsertVerification, AccessVerification, OverallStatus, CALL_LABELS, WHATSAPP_LABELS, APP_LOGIN_LABELS } from "@/lib/accessVerification";
import { cocActionLabel, cocActionTooltip } from "@/lib/cocStatus";
import { buildCrmDeepLinkFromAccessFollowup } from "@/lib/accessFollowupReturn";
import { logActivity } from "@/lib/auditLog";

export type QueueRow = {
  paidLeadId: string;
  crmLeadId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  batch: string | null;
  batchLabel: string;
  webinarDate: string | null;
  ownerId: string | null;
  ownerName: string | null;
  crmStage: string | null;
  cocStatus: string | null;
  verification: AccessVerification | null;
  overall: OverallStatus;
};

type Section = "overdue" | "due_today" | "never_called" | "no_followup";
type CardKey = Section | "unassigned" | "completed_today";

interface Props {
  rows: QueueRow[];
  owners: Array<{ id: string; full_name: string | null }>;
  isAdmin: boolean;
  onOpenMember: (r: QueueRow) => void;
  /** Return path for CRM drawer's "Back to Access Follow-up" / Save & Return. */
  returnTo?: string;
  /** Fires just before navigating into the CRM drawer so the caller can persist view state. */
  onBeforeCrmNav?: () => void;
}

function startOfDay(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function endOfDay(d = new Date()) {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
}
function tomorrowAt10Iso() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

function classifyRow(r: QueueRow, nowMs: number, dayStart: number, dayEnd: number): Section | null {
  if (r.overall === "completed") return null;
  const v = r.verification;
  const next = v?.next_follow_up_at ? new Date(v.next_follow_up_at).getTime() : null;
  const attempts = v?.call_attempt_count || 0;
  const callStatus = v?.call_status || "not_called";
  if (next !== null && next < dayStart) return "overdue";
  if (next !== null && next >= dayStart && next <= dayEnd) return "due_today";
  if (callStatus === "not_called" && attempts === 0) return "never_called";
  if (attempts > 0 && next === null && callStatus !== "resolved") return "no_followup";
  return null;
}

function isCompletedToday(r: QueueRow, dayStart: number, dayEnd: number): boolean {
  if (r.overall !== "completed") return false;
  const v = r.verification; if (!v) return false;
  const stamps = [v.whatsapp_verified_at, v.app_login_verified_at, v.updated_at]
    .filter(Boolean).map((s) => new Date(s as string).getTime());
  return stamps.some((t) => t >= dayStart && t <= dayEnd);
}

function hygieneBadges(r: QueueRow, nowMs: number): Array<{ label: string; tone: string }> {
  const out: Array<{ label: string; tone: string }> = [];
  const v = r.verification;
  const next = v?.next_follow_up_at ? new Date(v.next_follow_up_at).getTime() : null;
  const attempts = v?.call_attempt_count || 0;
  if (r.overall !== "completed" && next !== null && next < nowMs) out.push({ label: "Follow-up overdue", tone: "bg-red-100 text-red-800" });
  if (attempts > 0 && next === null && r.overall !== "completed") out.push({ label: "No next follow-up", tone: "bg-amber-100 text-amber-800" });
  if (attempts >= 3 && r.overall !== "completed") out.push({ label: `${attempts} attempts`, tone: "bg-rose-100 text-rose-800" });
  if (!r.ownerId) out.push({ label: "No owner", tone: "bg-slate-100 text-slate-800" });
  const badStages = ["successful", "paid", "closed won", "won"];
  if (r.crmStage && r.overall !== "completed" && badStages.some((s) => (r.crmStage || "").toLowerCase().includes(s))) {
    out.push({ label: "Stage reached · not verified", tone: "bg-amber-100 text-amber-800" });
  }
  if (v?.whatsapp_group_status === "joined_verified" && v?.app_login_status !== "logged_in") {
    out.push({ label: "WhatsApp ok · app pending", tone: "bg-slate-100 text-slate-700" });
  }
  if (v?.app_login_status === "logged_in" && v?.whatsapp_group_status !== "joined_verified") {
    out.push({ label: "App ok · WhatsApp pending", tone: "bg-slate-100 text-slate-700" });
  }
  return out;
}

export default function DailyQueueView({ rows, owners, isAdmin, onOpenMember, returnTo, onBeforeCrmNav }: Props) {
  const qc = useQueryClient();
  const nowMs = Date.now();
  const dayStart = startOfDay().getTime();
  const dayEnd = endOfDay().getTime();

  const [card, setCard] = useState<CardKey | "all">("all");
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<QueueRow | null>(null);

  const classified = useMemo(() => {
    const map = new Map<string, Section>();
    for (const r of rows) {
      const s = classifyRow(r, nowMs, dayStart, dayEnd);
      if (s) map.set(r.paidLeadId, s);
    }
    return map;
  }, [rows, nowMs, dayStart, dayEnd]);

  const completedToday = useMemo(
    () => rows.filter((r) => isCompletedToday(r, dayStart, dayEnd)),
    [rows, dayStart, dayEnd]
  );

  const counts = useMemo(() => {
    const c = { overdue: 0, due_today: 0, never_called: 0, no_followup: 0, unassigned: 0, completed_today: completedToday.length };
    for (const r of rows) {
      const s = classified.get(r.paidLeadId);
      if (s) c[s]++;
      if (!r.ownerId && r.overall !== "completed") c.unassigned++;
    }
    return c;
  }, [rows, classified, completedToday]);

  const queueRows = useMemo(() => {
    const items = rows
      .map((r) => ({ r, s: classified.get(r.paidLeadId) }))
      .filter((x) => !!x.s) as Array<{ r: QueueRow; s: Section }>;
    // Filter by card
    let filtered = items;
    if (card === "overdue" || card === "due_today" || card === "never_called" || card === "no_followup") {
      filtered = items.filter((x) => x.s === card);
    } else if (card === "unassigned") {
      filtered = items.filter((x) => !x.r.ownerId);
    } else if (card === "completed_today") {
      filtered = []; // rendered separately below
    }
    const sectionOrder: Record<Section, number> = { overdue: 0, due_today: 1, never_called: 2, no_followup: 3 };
    filtered.sort((a, b) => {
      if (a.s !== b.s) return sectionOrder[a.s] - sectionOrder[b.s];
      // oldest overdue first
      const na = a.r.verification?.next_follow_up_at ? new Date(a.r.verification.next_follow_up_at).getTime() : Number.POSITIVE_INFINITY;
      const nb = b.r.verification?.next_follow_up_at ? new Date(b.r.verification.next_follow_up_at).getTime() : Number.POSITIVE_INFINITY;
      if (a.s === "overdue" || a.s === "due_today") {
        if (na !== nb) return na - nb;
      }
      // then highest attempt count
      const aa = a.r.verification?.call_attempt_count || 0;
      const ab = b.r.verification?.call_attempt_count || 0;
      if (aa !== ab) return ab - aa;
      return a.r.name.localeCompare(b.r.name);
    });
    return filtered;
  }, [rows, classified, card]);

  const ownerWorkload = useMemo(() => {
    type W = { ownerId: string | null; ownerName: string; incomplete: number; due_today: number; overdue: number; never_called: number; no_followup: number; completed_today: number };
    const map = new Map<string, W>();
    for (const r of rows) {
      const key = r.ownerId || "__unassigned__";
      if (!map.has(key)) map.set(key, {
        ownerId: r.ownerId, ownerName: r.ownerName || (r.ownerId ? "Unknown" : "Unassigned"),
        incomplete: 0, due_today: 0, overdue: 0, never_called: 0, no_followup: 0, completed_today: 0,
      });
      const w = map.get(key)!;
      if (r.overall !== "completed") w.incomplete++;
      const s = classified.get(r.paidLeadId);
      if (s === "due_today") w.due_today++;
      if (s === "overdue") w.overdue++;
      if (s === "never_called") w.never_called++;
      if (s === "no_followup") w.no_followup++;
      if (isCompletedToday(r, dayStart, dayEnd)) w.completed_today++;
    }
    return Array.from(map.values()).sort((a, b) => b.incomplete - a.incomplete);
  }, [rows, classified, dayStart, dayEnd]);

  const activeOwners = ownerWorkload.filter((w) => w.ownerId).length;
  const mostOverloaded = ownerWorkload.filter((w) => w.ownerId)[0];

  const quickNoAnswer = async (r: QueueRow) => {
    setBusyRow(r.paidLeadId);
    try {
      const nextIso = r.verification?.next_follow_up_at || tomorrowAt10Iso();
      await upsertVerification({
        crm_lead_id: r.crmLeadId || null,
        paid_pipeline_lead_id: r.paidLeadId,
        call_status: "no_answer",
        call_attempted: true,
        next_follow_up_at: nextIso,
        memberLabel: r.name,
      });
      toast.success(`Marked no-answer for ${r.name}`);
      qc.invalidateQueries({ queryKey: ["access-verifications"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to record call");
    } finally {
      setBusyRow(null);
    }
  };

  const copyPhone = (phone: string | null) => {
    if (!phone) { toast.error("No phone number"); return; }
    navigator.clipboard?.writeText(phone);
    toast.success(`Copied ${phone}`);
  };

  const cards: Array<{ key: CardKey; label: string; tone: string; value: number }> = [
    { key: "overdue", label: "Overdue", tone: "bg-red-50 text-red-800 border-red-200", value: counts.overdue },
    { key: "due_today", label: "Due Today", tone: "bg-amber-50 text-amber-800 border-amber-200", value: counts.due_today },
    { key: "never_called", label: "Never Called", tone: "bg-slate-50 text-slate-800 border-slate-200", value: counts.never_called },
    { key: "no_followup", label: "No Follow-up", tone: "bg-rose-50 text-rose-700 border-rose-200", value: counts.no_followup },
    { key: "unassigned", label: "Unassigned", tone: "bg-slate-50 text-slate-700 border-slate-200", value: counts.unassigned },
    { key: "completed_today", label: "Completed Today", tone: "bg-emerald-50 text-emerald-800 border-emerald-200", value: counts.completed_today },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {cards.map((c) => (
          <button
            key={c.key}
            onClick={() => setCard(card === c.key ? "all" : c.key)}
            className={`text-left border rounded-lg px-3 py-2.5 transition ${c.tone} ${card === c.key ? "ring-2 ring-primary border-primary" : "hover:border-primary/60"}`}
          >
            <div className="text-[10px] uppercase tracking-wide opacity-70">{c.label}</div>
            <div className="text-lg font-semibold">{c.value}</div>
          </button>
        ))}
      </div>

      {/* Owner workload */}
      <div className="border border-border rounded-lg bg-background">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="font-medium text-sm">Owner Workload</div>
          <div className="text-[11px] text-muted-foreground">
            {activeOwners} active owner{activeOwners === 1 ? "" : "s"}
            {mostOverloaded && ` · Most loaded: ${mostOverloaded.ownerName} (${mostOverloaded.incomplete})`}
            {counts.unassigned > 0 && ` · ${counts.unassigned} unassigned`}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2">Owner</th>
                <th className="text-right px-3 py-2">Incomplete</th>
                <th className="text-right px-3 py-2">Due Today</th>
                <th className="text-right px-3 py-2">Overdue</th>
                <th className="text-right px-3 py-2">Never Called</th>
                <th className="text-right px-3 py-2">No Follow-up</th>
                <th className="text-right px-3 py-2">Completed Today</th>
              </tr>
            </thead>
            <tbody>
              {ownerWorkload.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">No members in scope.</td></tr>
              ) : ownerWorkload.map((w) => (
                <tr key={w.ownerId || "__u__"} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className={w.ownerId ? "font-medium" : "text-muted-foreground italic"}>{w.ownerName}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{w.incomplete}</td>
                  <td className="px-3 py-2 text-right">{w.due_today}</td>
                  <td className="px-3 py-2 text-right text-red-700">{w.overdue || ""}</td>
                  <td className="px-3 py-2 text-right">{w.never_called || ""}</td>
                  <td className="px-3 py-2 text-right">{w.no_followup || ""}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{w.completed_today || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Completed today (when card selected) */}
      {card === "completed_today" && (
        <div className="border border-border rounded-lg bg-background">
          <div className="px-3 py-2 border-b border-border font-medium text-sm">Completed Today</div>
          {completedToday.length === 0 ? (
            <div className="px-3 py-6 text-center text-muted-foreground text-sm">No members completed today.</div>
          ) : (
            <div className="divide-y divide-border">
              {completedToday.map((r) => {
                const v = r.verification;
                const completedAt = [v?.whatsapp_verified_at, v?.app_login_verified_at, v?.updated_at]
                  .filter(Boolean).map((s) => new Date(s as string)).sort((a, b) => b.getTime() - a.getTime())[0];
                return (
                  <div key={r.paidLeadId} className="px-3 py-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.ownerName || "Unassigned"} · {r.batchLabel} · {v?.call_attempt_count || 0} attempt{(v?.call_attempt_count || 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{completedAt ? completedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Queue */}
      {card !== "completed_today" && (
        <div className="border border-border rounded-lg bg-background overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="font-medium text-sm">
              {card === "all" ? "Daily Queue" :
                card === "overdue" ? "Overdue" :
                card === "due_today" ? "Due Today" :
                card === "never_called" ? "Never Called" :
                card === "no_followup" ? "No Follow-up Scheduled" :
                card === "unassigned" ? "Unassigned" : "Queue"}
            </div>
            <div className="text-[11px] text-muted-foreground">{queueRows.length} member{queueRows.length === 1 ? "" : "s"}</div>
          </div>
          {queueRows.length === 0 ? (
            <div className="px-3 py-8 text-center text-muted-foreground text-sm">No members in this queue.</div>
          ) : (
            <div className="divide-y divide-border">
              {queueRows.map(({ r, s }) => {
                const badges = hygieneBadges(r, nowMs);
                const sectionLabel: Record<Section, string> = {
                  overdue: "Overdue", due_today: "Due Today",
                  never_called: "Never Called", no_followup: "No Follow-up",
                };
                const sectionTone: Record<Section, string> = {
                  overdue: "bg-red-100 text-red-800",
                  due_today: "bg-amber-100 text-amber-800",
                  never_called: "bg-slate-100 text-slate-700",
                  no_followup: "bg-rose-100 text-rose-700",
                };
                return (
                  <div key={r.paidLeadId} className="px-3 py-3 hover:bg-muted/30">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${sectionTone[s]}`}>{sectionLabel[s]}</span>
                          <span className="font-medium text-sm">{r.name}</span>
                          <span className="text-[11px] text-muted-foreground">{r.ownerName ? `· ${r.ownerName}` : "· Unassigned"}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {r.phone || "—"} · {r.batchLabel} · {r.crmStage || "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          WA: {WHATSAPP_LABELS[r.verification?.whatsapp_group_status || "unknown"]} ·
                          App: {APP_LOGIN_LABELS[r.verification?.app_login_status || "unknown"]} ·
                          Call: {CALL_LABELS[r.verification?.call_status || "not_called"]} ({r.verification?.call_attempt_count || 0}){" "}
                          {r.verification?.next_follow_up_at ? `· Next: ${new Date(r.verification.next_follow_up_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                        </div>
                        {badges.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {badges.map((b, i) => (
                              <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${b.tone}`}>{b.label}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-nowrap gap-1 justify-end items-center shrink-0">
                        {r.phone ? (
                          <>
                            <a
                              href={`tel:${r.phone}`}
                              title={`Call ${r.phone}`}
                              className="inline-flex items-center justify-center h-8 px-2 rounded-md border border-border bg-background hover:bg-muted text-[11.5px] font-medium whitespace-nowrap"
                            >
                              Call
                            </a>
                            <button
                              onClick={() => copyPhone(r.phone)}
                              title="Copy phone"
                              className="inline-flex items-center justify-center h-8 px-2 rounded-md border border-border bg-background hover:bg-muted text-[11.5px] whitespace-nowrap"
                            >
                              Copy
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic whitespace-nowrap">No phone</span>
                        )}
                        <button
                          disabled={busyRow === r.paidLeadId}
                          onClick={() => quickNoAnswer(r)}
                          title="Mark no answer and schedule follow-up for tomorrow"
                          className="inline-flex items-center justify-center h-8 px-2 rounded-md border border-border bg-background hover:bg-muted text-[11.5px] whitespace-nowrap disabled:opacity-50"
                        >
                          {busyRow === r.paidLeadId ? "…" : "No Ans"}
                        </button>
                        {r.crmLeadId ? (
                          <Link
                            to={`/crm?lead=${r.crmLeadId}&focus=code-of-conduct`}
                            title={cocActionTooltip(r.cocStatus, true)}
                            className="inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-amber-400/70 bg-amber-50 text-amber-900 hover:bg-amber-100 font-medium text-[11.5px] whitespace-nowrap"
                          >
                            {cocActionLabel(r.cocStatus, true)}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center h-8 px-2 rounded-md border border-dashed border-slate-300 text-slate-500 bg-slate-50 text-[11.5px] whitespace-nowrap">Not linked</span>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => setAssignFor(r)}
                            title="Assign owner"
                            className="inline-flex items-center justify-center h-8 px-2 rounded-md border border-border bg-background hover:bg-muted text-[11.5px] whitespace-nowrap"
                          >
                            Assign
                          </button>
                        )}
                        <button
                          onClick={() => onOpenMember(r)}
                          title="Update Access Follow-up"
                          className="inline-flex items-center justify-center h-8 px-3 rounded-md bg-foreground text-background hover:opacity-90 font-semibold shadow-sm text-[11.5px] whitespace-nowrap"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {assignFor && (
        <AssignOwnerModal
          row={assignFor}
          owners={owners}
          onClose={() => setAssignFor(null)}
          onAssigned={() => {
            setAssignFor(null);
            qc.invalidateQueries({ queryKey: ["fsd-crm-leads"] });
            qc.invalidateQueries({ queryKey: ["access-verifications"] });
          }}
        />
      )}
    </div>
  );
}

function AssignOwnerModal({
  row, owners, onClose, onAssigned,
}: {
  row: QueueRow;
  owners: Array<{ id: string; full_name: string | null }>;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [ownerId, setOwnerId] = useState<string>(row.ownerId || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!row.crmLeadId) { toast.error("No CRM lead linked to this member"); return; }
    setBusy(true);
    try {
      const newOwner = ownerId || null;
      const { error } = await supabase
        .from("crm_leads" as any)
        .update({ assigned_agent_id: newOwner })
        .eq("id", row.crmLeadId);
      if (error) throw error;
      const oldName = row.ownerName || "Unassigned";
      const newName = newOwner ? (owners.find((o) => o.id === newOwner)?.full_name || "Unknown") : "Unassigned";
      await logActivity({
        module_key: "access_followup", module_label: "Access Follow-up",
        action_type: "access_followup_owner_reassigned", action_label: "Owner reassigned",
        entity_type: "crm_lead", entity_id: row.crmLeadId, entity_label: row.name,
        old_values: { owner_id: row.ownerId, owner_name: oldName },
        new_values: { owner_id: newOwner, owner_name: newName },
        summary: `${row.name}: owner changed from ${oldName} to ${newName}.`,
      });
      toast.success(`Owner set to ${newName}`);
      onAssigned();
    } catch (e: any) {
      toast.error(e?.message || "Failed to reassign owner");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-lg w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">Assign owner</div>
        <div className="text-xs text-muted-foreground">{row.name} · current: {row.ownerName || "Unassigned"}</div>
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background"
        >
          <option value="">Unassigned</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>{o.full_name || "Unnamed"}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted">Cancel</button>
          <button disabled={busy} onClick={save} className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? "Saving…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
