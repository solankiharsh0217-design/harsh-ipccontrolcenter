import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AccessVerification, fetchVerificationsForPaidLeads, computeOverall, OverallStatus,
  WHATSAPP_LABELS, APP_LOGIN_LABELS, CALL_LABELS,
} from "@/lib/accessVerification";
import AccessVerificationModal from "./AccessVerificationModal";
import DailyQueueView from "./DailyQueueView";
import AccessRowActions from "./AccessRowActions";
import { CoCStatusChip } from "@/lib/cocStatus";
import MultiSelectFilter from "@/components/crm/MultiSelectFilter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/context/AuthContext";

type Row = {
  paidLeadId: string;
  crmLeadId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  batch: string | null;
  batchKey: string;
  batchLabel: string;
  webinarDate: string | null;
  cocStatus: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerKey: string;
  crmStage: string | null;
  verification: AccessVerification | null;
  overall: OverallStatus;
};

interface Props {
  paidLeads: Array<{
    id: string; crm_lead_id: string | null; email: string | null; phone: string | null;
    paid_batch_name: string | null; source_report_date: string | null; source_webinar: string | null;
    code_of_conduct_status: string | null;
  }>;
  crmLeads: Array<{ id: string; full_name: string | null; email: string | null; phone: string | null; assigned_agent_id: string | null; webinar_date: string | null; webinar_name: string | null; stage_name?: string | null }>;
  owners: Array<{ id: string; full_name: string | null }>;
}

type QuickFilter =
  | "all"
  | "all_incomplete"
  | "not_called"
  | "no_answer"
  | "wa_not_joined"
  | "invite_sent"
  | "never_logged_in"
  | "access_issue"
  | "follow_up_due"
  | "needs_help"
  | "completed";

const OVERALL_STYLES: Record<OverallStatus, string> = {
  completed: "bg-emerald-100 text-emerald-800",
  needs_help: "bg-amber-100 text-amber-800",
  incomplete: "bg-slate-100 text-slate-700",
};
const OVERALL_LABEL: Record<OverallStatus, string> = {
  completed: "Completed",
  needs_help: "Needs Help",
  incomplete: "Incomplete",
};

function chipTone(tone: "green" | "amber" | "red" | "neutral" | "muted-red") {
  switch (tone) {
    case "green": return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "amber": return "bg-amber-50 text-amber-800 border-amber-200";
    case "red": return "bg-red-50 text-red-800 border-red-200";
    case "muted-red": return "bg-rose-50 text-rose-700 border-rose-200";
    default: return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function matchesQuick(r: Row, f: QuickFilter, nowMs: number): boolean {
  if (f === "all") return true;
  const v = r.verification;
  if (f === "all_incomplete") return r.overall !== "completed";
  if (f === "not_called") return !v || v.call_status === "not_called";
  if (f === "no_answer") return v?.call_status === "no_answer";
  if (f === "wa_not_joined") return v?.whatsapp_group_status === "not_joined";
  if (f === "invite_sent") return v?.whatsapp_group_status === "invite_sent";
  if (f === "never_logged_in") return v?.app_login_status === "never_logged_in";
  if (f === "access_issue") return v?.app_login_status === "access_issue" || v?.whatsapp_group_status === "link_issue";
  if (f === "follow_up_due") {
    if (!v?.next_follow_up_at) return false;
    if (r.overall === "completed") return false;
    return new Date(v.next_follow_up_at).getTime() <= nowMs;
  }
  if (f === "needs_help") return r.overall === "needs_help";
  if (f === "completed") return r.overall === "completed";
  return true;
}

export default function AccessFollowupTab({ paidLeads, crmLeads, owners }: Props) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const paidIds = useMemo(() => paidLeads.map((p) => p.id), [paidLeads]);
  const { data: verifications = new Map() } = useQuery({
    queryKey: ["access-verifications", paidIds.join(",")],
    enabled: paidIds.length > 0,
    queryFn: () => fetchVerificationsForPaidLeads(paidIds),
  });

  const crmById = useMemo(() => new Map(crmLeads.map((l) => [l.id, l])), [crmLeads]);
  const ownerById = useMemo(() => new Map(owners.map((o) => [o.id, o])), [owners]);

  const rows: Row[] = useMemo(() => {
    return paidLeads.map((p) => {
      const crm = p.crm_lead_id ? crmById.get(p.crm_lead_id) : undefined;
      const v = (verifications as Map<string, AccessVerification>).get(p.id) || null;
      const owner = crm?.assigned_agent_id ? ownerById.get(crm.assigned_agent_id) : undefined;
      const batchName = p.paid_batch_name || p.source_webinar || crm?.webinar_name || null;
      const webDate = p.source_report_date || crm?.webinar_date || null;
      const batchKey = (batchName || "__none__") + "|" + (webDate || "");
      const batchLabel = batchName
        ? webDate ? `${batchName} — ${webDate}` : batchName
        : "No batch";
      return {
        paidLeadId: p.id,
        crmLeadId: p.crm_lead_id,
        name: crm?.full_name || p.email || "Unnamed",
        email: p.email || crm?.email || null,
        phone: p.phone || crm?.phone || null,
        batch: batchName,
        batchKey,
        batchLabel,
        webinarDate: webDate,
        cocStatus: p.code_of_conduct_status || null,
        ownerId: crm?.assigned_agent_id || null,
        ownerName: owner?.full_name || null,
        ownerKey: owner?.full_name || "__unassigned__",
        crmStage: (crm as any)?.stage_name || null,
        verification: v,
        overall: computeOverall(v),
      };
    });
  }, [paidLeads, crmById, verifications, ownerById]);

  const [quick, setQuick] = useState<QuickFilter>("all");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
  const [batchFilter, setBatchFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [view, setView] = useState<"members" | "daily">("members");

  const nowMs = Date.now();

  // Base scoped rows (before quick filter) drive card counts + other filters.
  const scopedRows = useMemo(() => {
    return rows.filter((r) => {
      if (ownerFilter.length && !ownerFilter.includes(r.ownerKey)) return false;
      if (batchFilter.length && !batchFilter.includes(r.batchKey)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${r.name} ${r.email ?? ""} ${r.phone ?? ""} ${r.batchLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, ownerFilter, batchFilter, search]);

  const filtered = useMemo(
    () => scopedRows.filter((r) => matchesQuick(r, quick, nowMs)),
    [scopedRows, quick, nowMs],
  );

  const counts = useMemo(() => {
    const c: Record<QuickFilter, number> = {
      all: scopedRows.length,
      all_incomplete: 0, not_called: 0, no_answer: 0, wa_not_joined: 0,
      invite_sent: 0, never_logged_in: 0, access_issue: 0, follow_up_due: 0,
      needs_help: 0, completed: 0,
    };
    for (const r of scopedRows) {
      const keys: QuickFilter[] = ["all_incomplete", "not_called", "no_answer", "wa_not_joined", "invite_sent", "never_logged_in", "access_issue", "follow_up_due", "needs_help", "completed"];
      for (const k of keys) if (matchesQuick(r, k, nowMs)) c[k]++;
    }
    return c;
  }, [scopedRows, nowMs]);

  const ownerOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.ownerKey, (map.get(r.ownerKey) || 0) + 1);
    return Array.from(map.entries()).map(([value, count]) => ({
      value,
      label: value === "__unassigned__" ? "Unassigned" : value,
      count,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const batchOptions = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      const existing = map.get(r.batchKey);
      if (existing) existing.count++;
      else map.set(r.batchKey, { label: r.batchLabel, count: 1 });
    }
    return Array.from(map.entries()).map(([value, v]) => ({
      value, label: v.label, count: v.count,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const primaryCards: Array<{ key: QuickFilter; label: string; tone: string }> = [
    { key: "all_incomplete", label: "Incomplete", tone: chipTone("neutral") },
    { key: "needs_help", label: "Needs Help", tone: chipTone("amber") },
    { key: "completed", label: "Fully Verified", tone: chipTone("green") },
    { key: "not_called", label: "Not Called", tone: chipTone("neutral") },
    { key: "follow_up_due", label: "Follow-up Due", tone: chipTone("amber") },
  ];
  const secondaryCards: Array<{ key: QuickFilter; label: string; tone: string }> = [
    { key: "no_answer", label: "No Answer", tone: chipTone("muted-red") },
    { key: "wa_not_joined", label: "WhatsApp Not Joined", tone: chipTone("neutral") },
    { key: "invite_sent", label: "Invite Sent", tone: chipTone("neutral") },
    { key: "never_logged_in", label: "Never Logged In", tone: chipTone("neutral") },
    { key: "access_issue", label: "Access Issue", tone: chipTone("red") },
  ];

  const reset = () => {
    setQuick("all");
    setSearch("");
    setOwnerFilter([]);
    setBatchFilter([]);
  };

  const isActive = (k: QuickFilter) => quick === k;

  return (
    <div className="space-y-4">
      {/* View switch */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-background p-0.5">
          <button
            onClick={() => setView("members")}
            className={`text-xs px-3 py-1.5 rounded ${view === "members" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            All Members
          </button>
          <button
            onClick={() => setView("daily")}
            className={`text-xs px-3 py-1.5 rounded ${view === "daily" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Daily Queue
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          {view === "daily"
            ? "Focused calling list for today, sorted by urgency"
            : "Full verification list with granular filters"}
        </div>
      </div>

      {/* Shared filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name / email / phone / batch"
          className="text-sm border border-border rounded-md px-3 py-1.5 bg-background w-full md:w-64"
        />
        <MultiSelectFilter
          label="Owner"
          options={ownerOptions}
          selectedValues={ownerFilter}
          onChange={setOwnerFilter}
          placeholder="All owners"
        />
        <MultiSelectFilter
          label="Webinar / Batch"
          options={batchOptions}
          selectedValues={batchFilter}
          onChange={setBatchFilter}
          placeholder="All batches"
          panelWidth={340}
        />
        {(quick !== "all" || search || ownerFilter.length || batchFilter.length) ? (
          <button onClick={reset} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted">Reset</button>
        ) : null}
        <div className="text-xs text-muted-foreground ml-auto">
          {view === "members"
            ? <>Showing <span className="font-medium text-foreground">{filtered.length}</span> of {scopedRows.length} members
              {scopedRows.length !== rows.length && <span className="text-muted-foreground"> · {rows.length} total</span>}</>
            : <>{scopedRows.length} member{scopedRows.length === 1 ? "" : "s"} in scope</>}
        </div>
      </div>

      {view === "daily" ? (
        <DailyQueueView
          rows={scopedRows}
          owners={owners}
          isAdmin={isAdmin}
          onOpenMember={(r) => setSelected(r as Row)}
        />
      ) : (
        <>
          {/* Primary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {primaryCards.map((c) => (
              <button
                key={c.key}
                onClick={() => setQuick(isActive(c.key) ? "all" : c.key)}
                className={`text-left border rounded-lg px-3 py-2.5 transition ${c.tone} ${isActive(c.key) ? "ring-2 ring-primary border-primary" : "hover:border-primary/60"}`}
              >
                <div className="text-[10px] uppercase tracking-wide opacity-70">{c.label}</div>
                <div className="text-lg font-semibold">{counts[c.key]}</div>
              </button>
            ))}
          </div>

          {/* Secondary compact chips */}
          <div className="flex flex-wrap gap-1.5">
            {secondaryCards.map((c) => (
              <button
                key={c.key}
                onClick={() => setQuick(isActive(c.key) ? "all" : c.key)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${c.tone} ${isActive(c.key) ? "ring-2 ring-primary" : "opacity-90 hover:opacity-100"}`}
              >
                {c.label} · <span className="font-semibold">{counts[c.key]}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          {isMobile ? (
            <MobileCards rows={filtered} onSelect={setSelected} />
          ) : (
            <DesktopTable rows={filtered} onSelect={setSelected} />
          )}
        </>
      )}

      {selected && (
        <AccessVerificationModal
          memberLabel={selected.name}
          crmLeadId={selected.crmLeadId}
          paidPipelineLeadId={selected.paidLeadId}
          existing={selected.verification}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            qc.invalidateQueries({ queryKey: ["access-verifications"] });
          }}
        />
      )}
    </div>
  );
}

function DesktopTable({ rows, onSelect }: { rows: Row[]; onSelect: (r: Row) => void }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 sticky left-0 bg-muted/95 backdrop-blur z-10 border-r border-border min-w-[220px]">Member</th>
              <th className="text-left px-3 py-2">Overall</th>
              <th className="text-left px-3 py-2">WhatsApp</th>
              <th className="text-left px-3 py-2">App Login</th>
              <th className="text-left px-3 py-2">Call</th>
              <th className="text-left px-3 py-2">Attempts</th>
              <th className="text-left px-3 py-2">Last Called</th>
              <th className="text-left px-3 py-2">Next Follow-up</th>
              <th className="text-left px-3 py-2">CRM Stage</th>
              <th className="text-left px-3 py-2">CoC</th>
              <th className="text-left px-3 py-2">Webinar / Batch</th>
              <th className="text-left px-3 py-2">Owner</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={13} className="px-3 py-6 text-center text-muted-foreground">No members match these filters.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.paidLeadId} className="hover:bg-muted/30 align-middle">
                <td className="px-3 py-2 sticky left-0 bg-background border-t border-r border-border z-[1] align-middle">
                  <div className="font-medium truncate max-w-[220px] leading-tight">{r.name}</div>
                  <div className="text-[11.5px] truncate max-w-[220px] leading-tight">
                    {r.phone ? (
                      <a href={`tel:${r.phone}`} className="text-foreground hover:underline font-medium">{r.phone}</a>
                    ) : (
                      <span className="text-muted-foreground italic">Phone not recorded</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate max-w-[220px] leading-tight">{r.email || "—"}</div>
                </td>
                <td className="px-3 py-2 border-t border-border align-middle whitespace-nowrap">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${OVERALL_STYLES[r.overall]}`}>{OVERALL_LABEL[r.overall]}</span>
                </td>
                <td className="px-3 py-2 border-t border-border text-xs align-middle whitespace-nowrap">{WHATSAPP_LABELS[r.verification?.whatsapp_group_status || "unknown"]}</td>
                <td className="px-3 py-2 border-t border-border text-xs align-middle whitespace-nowrap">{APP_LOGIN_LABELS[r.verification?.app_login_status || "unknown"]}</td>
                <td className="px-3 py-2 border-t border-border text-xs align-middle whitespace-nowrap">{CALL_LABELS[r.verification?.call_status || "not_called"]}</td>
                <td className="px-3 py-2 border-t border-border text-xs align-middle whitespace-nowrap">{r.verification?.call_attempt_count || 0}</td>
                <td className="px-3 py-2 border-t border-border text-xs align-middle whitespace-nowrap">
                  {r.verification?.last_called_at ? new Date(r.verification.last_called_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 border-t border-border text-xs align-middle whitespace-nowrap">
                  {r.verification?.next_follow_up_at ? new Date(r.verification.next_follow_up_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 border-t border-border text-xs align-middle" title={r.crmStage || ""}>
                  <div className="truncate max-w-[140px]">{r.crmStage || "—"}</div>
                </td>
                <td className="px-3 py-2 border-t border-border text-xs align-middle whitespace-nowrap">
                  <CoCStatusChip status={r.cocStatus} hasCrmLink={!!r.crmLeadId} />
                </td>
                <td className="px-3 py-2 border-t border-border text-xs align-middle" title={r.batch || ""}>
                  <div className="truncate max-w-[180px] leading-tight">{r.batch || "—"}</div>
                  {r.webinarDate && <div className="text-[10px] text-muted-foreground leading-tight">{r.webinarDate}</div>}
                </td>
                <td className="px-3 py-2 border-t border-border text-xs align-middle whitespace-nowrap" title={r.ownerName || ""}>
                  <div className="truncate max-w-[120px]">{r.ownerName || "—"}</div>
                </td>
                <td className="px-3 py-2 border-t border-border text-right align-middle" style={{ minWidth: 270 }}>
                  <AccessRowActions
                    phone={r.phone}
                    crmLeadId={r.crmLeadId}
                    cocStatus={r.cocStatus}
                    onUpdate={() => onSelect(r)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MobileCards({ rows, onSelect }: { rows: Row[]; onSelect: (r: Row) => void }) {
  if (rows.length === 0) {
    return <div className="border border-border rounded-lg bg-background px-3 py-6 text-center text-muted-foreground text-sm">No members match these filters.</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.paidLeadId} className="border border-border rounded-lg bg-background p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">{r.name}</div>
              <div className="text-[12px] truncate">
                {r.phone ? (
                  <a href={`tel:${r.phone}`} className="text-foreground hover:underline font-medium">{r.phone}</a>
                ) : (
                  <span className="text-muted-foreground italic">Phone not recorded</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{r.email || "—"}</div>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 ${OVERALL_STYLES[r.overall]}`}>{OVERALL_LABEL[r.overall]}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div><span className="text-muted-foreground">WhatsApp:</span> {WHATSAPP_LABELS[r.verification?.whatsapp_group_status || "unknown"]}</div>
            <div><span className="text-muted-foreground">App:</span> {APP_LOGIN_LABELS[r.verification?.app_login_status || "unknown"]}</div>
            <div><span className="text-muted-foreground">Call:</span> {CALL_LABELS[r.verification?.call_status || "not_called"]} · {r.verification?.call_attempt_count || 0}</div>
            <div className="flex items-center gap-1"><span className="text-muted-foreground">CoC:</span> <CoCStatusChip status={r.cocStatus} hasCrmLink={!!r.crmLeadId} /></div>
            <div><span className="text-muted-foreground">Last:</span> {r.verification?.last_called_at ? new Date(r.verification.last_called_at).toLocaleDateString() : "—"}</div>
            <div><span className="text-muted-foreground">Next:</span> {r.verification?.next_follow_up_at ? new Date(r.verification.next_follow_up_at).toLocaleDateString() : "—"}</div>
            <div className="col-span-2"><span className="text-muted-foreground">Batch:</span> {r.batch || "—"}{r.webinarDate ? ` · ${r.webinarDate}` : ""}</div>
            <div className="col-span-2"><span className="text-muted-foreground">Stage:</span> {r.crmStage || "—"} · <span className="text-muted-foreground">Owner:</span> {r.ownerName || "—"}</div>
          </div>
          <AccessRowActions
            phone={r.phone}
            crmLeadId={r.crmLeadId}
            cocStatus={r.cocStatus}
            onUpdate={() => onSelect(r)}
            fullWidthPrimary
          />
        </div>
      ))}
    </div>
  );
}
