import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AccessVerification, fetchVerificationsForPaidLeads, computeOverall, OverallStatus,
  WHATSAPP_LABELS, APP_LOGIN_LABELS, CALL_LABELS,
} from "@/lib/accessVerification";
import AccessVerificationModal from "./AccessVerificationModal";

type Row = {
  paidLeadId: string;
  crmLeadId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  batch: string | null;
  webinarDate: string | null;
  cocStatus: string | null;
  ownerName: string | null;
  verification: AccessVerification | null;
  overall: OverallStatus;
};

interface Props {
  paidLeads: Array<{
    id: string; crm_lead_id: string | null; email: string | null; phone: string | null;
    paid_batch_name: string | null; source_report_date: string | null; source_webinar: string | null;
    code_of_conduct_status: string | null;
  }>;
  crmLeads: Array<{ id: string; full_name: string | null; email: string | null; phone: string | null; assigned_agent_id: string | null; webinar_date: string | null; webinar_name: string | null }>;
  owners: Array<{ id: string; full_name: string | null }>;
}

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

export default function AccessFollowupTab({ paidLeads, crmLeads, owners }: Props) {
  const qc = useQueryClient();
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
      return {
        paidLeadId: p.id,
        crmLeadId: p.crm_lead_id,
        name: crm?.full_name || p.email || "Unnamed",
        email: p.email || crm?.email || null,
        phone: p.phone || crm?.phone || null,
        batch: p.paid_batch_name || p.source_webinar || crm?.webinar_name || null,
        webinarDate: p.source_report_date || crm?.webinar_date || null,
        cocStatus: p.code_of_conduct_status || null,
        ownerName: owner?.full_name || null,
        verification: v,
        overall: computeOverall(v),
      };
    });
  }, [paidLeads, crmById, verifications, ownerById]);

  const [filter, setFilter] = useState<"all" | OverallStatus | "no_call">("all");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Row | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "no_call" && (r.verification?.call_attempt_count ?? 0) > 0) return false;
      if (filter !== "all" && filter !== "no_call" && r.overall !== filter) return false;
      if (ownerFilter !== "all" && (r.ownerName || "") !== ownerFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${r.name} ${r.email ?? ""} ${r.phone ?? ""} ${r.batch ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search, ownerFilter]);

  const summary = useMemo(() => {
    const s = { total: rows.length, completed: 0, needs: 0, incomplete: 0, uncontacted: 0 };
    for (const r of rows) {
      if (r.overall === "completed") s.completed++;
      else if (r.overall === "needs_help") s.needs++;
      else s.incomplete++;
      if ((r.verification?.call_attempt_count ?? 0) === 0) s.uncontacted++;
    }
    return s;
  }, [rows]);

  const cards: Array<{ label: string; value: string; tone: string; filter: typeof filter }> = [
    { label: "Total Paid Members", value: String(summary.total), tone: "bg-background", filter: "all" },
    { label: "Access Completed", value: String(summary.completed), tone: "bg-emerald-50", filter: "completed" },
    { label: "Needs Help", value: String(summary.needs), tone: "bg-amber-50", filter: "needs_help" },
    { label: "Incomplete", value: String(summary.incomplete), tone: "bg-slate-50", filter: "incomplete" },
    { label: "Never Called", value: String(summary.uncontacted), tone: "bg-rose-50", filter: "no_call" },
  ];

  const ownerNames = useMemo(
    () => Array.from(new Set(rows.map((r) => r.ownerName).filter(Boolean) as string[])).sort(),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {cards.map((c) => (
          <button key={c.label} onClick={() => setFilter(c.filter)}
            className={`text-left border rounded-lg px-3 py-2.5 hover:border-primary transition ${c.tone} ${filter === c.filter ? "border-primary ring-1 ring-primary" : "border-border"}`}>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</div>
            <div className="text-lg font-semibold">{c.value}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name / email / phone / batch"
          className="text-sm border border-border rounded-md px-3 py-1.5 bg-background w-64"
        />
        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}
          className="text-sm border border-border rounded-md px-3 py-1.5 bg-background">
          <option value="all">All owners</option>
          {ownerNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} of {rows.length}</div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-background">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Member</th>
                <th className="text-left px-3 py-2">Batch</th>
                <th className="text-left px-3 py-2">CoC</th>
                <th className="text-left px-3 py-2">WhatsApp</th>
                <th className="text-left px-3 py-2">App Login</th>
                <th className="text-left px-3 py-2">Calls</th>
                <th className="text-left px-3 py-2">Overall</th>
                <th className="text-left px-3 py-2">Owner</th>
                <th className="text-right px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">No members match these filters.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.paidLeadId} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.email || r.phone || "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.batch || "—"}
                    {r.webinarDate && <div className="text-[10px] text-muted-foreground">{r.webinarDate}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.cocStatus || "—"}</td>
                  <td className="px-3 py-2 text-xs">{WHATSAPP_LABELS[r.verification?.whatsapp_group_status || "unknown"]}</td>
                  <td className="px-3 py-2 text-xs">{APP_LOGIN_LABELS[r.verification?.app_login_status || "unknown"]}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.verification?.call_attempt_count || 0} · {CALL_LABELS[r.verification?.call_status || "not_called"]}
                    {r.verification?.last_called_at && (
                      <div className="text-[10px] text-muted-foreground">{new Date(r.verification.last_called_at).toLocaleDateString()}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${OVERALL_STYLES[r.overall]}`}>{OVERALL_LABEL[r.overall]}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.ownerName || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setSelected(r)}
                      className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted">Update</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
