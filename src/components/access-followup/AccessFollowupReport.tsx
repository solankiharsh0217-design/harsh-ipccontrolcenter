import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyRow } from "@/components/ui-bits";
import {
  AccessRow, useAccessFollowupRows, PaidLeadInput, CrmLeadInput,
} from "@/lib/accessFollowupRows";
import { toCsv, downloadCsv } from "@/lib/operationsExport";
import { formatDateShort } from "@/lib/format";

interface Props {
  paidLeads: PaidLeadInput[];
  crmLeads: CrmLeadInput[];
  owners: Array<{ id: string; full_name: string | null }>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

function statusLabel(r: AccessRow): string {
  if (r.cocSigned && r.groupJoined) return "Fully complete";
  if (r.cocSigned) return "Signed · group pending";
  if (r.cocSent) return "Awaiting signature";
  return "Not sent";
}

export default function AccessFollowupReport({ paidLeads, crmLeads, owners }: Props) {
  const { allRows } = useAccessFollowupRows(paidLeads, crmLeads, owners);
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [owner, setOwner] = useState("all");
  const [batch, setBatch] = useState("all");

  const ownerOptions = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.ownerKey))).sort(),
    [allRows],
  );
  const batchOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) m.set(r.batchKey, r.batchLabel);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allRows]);

  const inRange = (iso: string | null) => {
    const d = dayOf(iso);
    if (!d) return false;
    return d >= from && d <= to;
  };

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (owner !== "all" && r.ownerKey !== owner) return false;
      if (batch !== "all" && r.batchKey !== batch) return false;
      const touched =
        inRange(r.cocSentAt) ||
        inRange(r.cocSignedAt) ||
        inRange(r.groupJoinedAt) ||
        inRange(r.verification?.last_called_at || null);
      return touched;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, owner, batch, from, to]);

  const summary = useMemo(() => ({
    contacted: rows.filter((r) => inRange(r.verification?.last_called_at || null)).length,
    sent: rows.filter((r) => inRange(r.cocSentAt)).length,
    signed: rows.filter((r) => inRange(r.cocSignedAt)).length,
    joined: rows.filter((r) => inRange(r.groupJoinedAt)).length,
    awaiting: rows.filter((r) => r.cocSent && !r.cocSigned).length,
    groupPending: rows.filter((r) => r.cocSigned && !r.groupJoined).length,
    complete: rows.filter((r) => r.cocSigned && r.groupJoined).length,
    total: rows.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, from, to]);

  const tableRows = useMemo(() => rows.map((r) => ({
    name: r.name,
    phone: r.phone || "",
    coc_sent_date: r.cocSentAt ? formatDateShort(r.cocSentAt) : "",
    coc_signed_date: r.cocSignedAt ? formatDateShort(r.cocSignedAt) : "",
    group_joined_date: r.groupJoinedAt ? formatDateShort(r.groupJoinedAt) : "",
    status: statusLabel(r),
    owner: r.ownerName || "Unassigned",
    last_call_note: r.verification?.contact_notes || "",
  })), [rows]);

  const exportCsv = () => {
    if (!tableRows.length) { toast.error("Nothing to export for this range"); return; }
    downloadCsv(`access-followup-${from}-to-${to}.csv`, toCsv(tableRows, [
      "name", "phone", "coc_sent_date", "coc_signed_date", "group_joined_date", "status", "owner", "last_call_note",
    ]));
  };

  const copySummary = async () => {
    const label = from === to ? from : `${from} → ${to}`;
    const text = [
      `*Access Follow-up — ${label}*`,
      `Members contacted: ${summary.contacted}`,
      `CoC sent: ${summary.sent}`,
      `CoC signed: ${summary.signed}`,
      `Group joined: ${summary.joined}`,
      `Awaiting signature: ${summary.awaiting}`,
      `Signed · group pending: ${summary.groupPending}`,
      `Fully complete: ${summary.complete}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Summary copied for WhatsApp");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const stats: Array<[string, number]> = [
    ["Contacted", summary.contacted],
    ["CoC Sent", summary.sent],
    ["CoC Signed", summary.signed],
    ["Group Joined", summary.joined],
    ["Awaiting Signature", summary.awaiting],
    ["Signed · Group Pending", summary.groupPending],
    ["Fully Complete", summary.complete],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block font-sans text-[10px] uppercase tracking-wide text-muted-foreground mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="font-sans text-sm border border-line rounded-lg px-3 py-2 bg-white" />
        </div>
        <div>
          <label className="block font-sans text-[10px] uppercase tracking-wide text-muted-foreground mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="font-sans text-sm border border-line rounded-lg px-3 py-2 bg-white" />
        </div>
        <div>
          <label className="block font-sans text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Owner</label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}
            className="font-sans text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[160px]">
            <option value="all">All owners</option>
            {ownerOptions.map((o) => (
              <option key={o} value={o}>{o === "__unassigned__" ? "Unassigned" : o}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-sans text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Batch</label>
          <select value={batch} onChange={(e) => setBatch(e.target.value)}
            className="font-sans text-sm border border-line rounded-lg px-3 py-2 bg-white min-w-[200px]">
            <option value="all">All batches</option>
            {batchOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={copySummary}
            className="font-sans text-sm px-3.5 py-2 rounded-lg border border-line bg-white hover:bg-off">
            Copy summary for WhatsApp
          </button>
          <button onClick={exportCsv}
            className="font-sans text-sm px-3.5 py-2 rounded-lg bg-foreground text-background hover:opacity-90">
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-white px-4 py-3">
            <div className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="font-serif text-2xl leading-tight mt-1">{value}</div>
          </div>
        ))}
      </div>

      <div className="border border-line rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead className="bg-off font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Member</th>
                <th className="text-left px-4 py-2.5">Phone</th>
                <th className="text-left px-4 py-2.5">CoC Sent</th>
                <th className="text-left px-4 py-2.5">Signed</th>
                <th className="text-left px-4 py-2.5">Group Joined</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Owner</th>
                <th className="text-left px-4 py-2.5 min-w-[200px]">Last Call Note</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <EmptyRow colSpan={8} title="No activity in this range." />
              ) : tableRows.map((t, i) => (
                <tr key={i} className="hover:bg-off/60">
                  <td className="px-4 py-2.5 border-t border-line font-serif text-[15px]">{t.name}</td>
                  <td className="px-4 py-2.5 border-t border-line font-sans text-xs">{t.phone || "—"}</td>
                  <td className="px-4 py-2.5 border-t border-line font-sans text-xs">{t.coc_sent_date || "—"}</td>
                  <td className="px-4 py-2.5 border-t border-line font-sans text-xs">{t.coc_signed_date || "—"}</td>
                  <td className="px-4 py-2.5 border-t border-line font-sans text-xs">{t.group_joined_date || "—"}</td>
                  <td className="px-4 py-2.5 border-t border-line font-sans text-xs">{t.status}</td>
                  <td className="px-4 py-2.5 border-t border-line font-sans text-xs">{t.owner}</td>
                  <td className="px-4 py-2.5 border-t border-line font-sans text-xs text-muted-foreground">{t.last_call_note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
