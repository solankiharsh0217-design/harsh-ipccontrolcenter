import { useEffect, useMemo, useState } from "react";
import { Check, X as XIcon, ExternalLink, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { LoadingState } from "@/components/ui-bits";
import {
  listPendingConversions, listAllConversionsForMonth,
  approveConversion, rejectConversion,
  bulkApproveConversions, bulkRejectConversions,
  currentMonthStr, type ConversionReport, type ConversionStatus,
} from "@/lib/operationsConversions";
import { toCsv, downloadCsv } from "@/lib/operationsExport";

interface Props {
  isAdmin: boolean;
  onOpenLead?: (leadId: string) => void;
  onChanged?: () => void;
}

export default function OpsConversionsTab({ isAdmin, onOpenLead, onChanged }: Props) {
  const { profile } = useAuth();
  const [scope, setScope] = useState<"pending" | "month">("pending");
  const [month, setMonth] = useState<string>(currentMonthStr());
  const [statusFilter, setStatusFilter] = useState<"all" | ConversionStatus>("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ConversionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rejectFor, setRejectFor] = useState<ConversionReport | "bulk" | null>(null);
  const [note, setNote] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = scope === "pending"
        ? await listPendingConversions(500)
        : await listAllConversionsForMonth(month);
      setRows(data);
      setSelected(new Set());
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope, month]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (scope === "month" && statusFilter !== "all" && r.verification_status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hit = [r.lead_name, r.client_name, r.media_buyer_name, r.campaign_name, r.notes].some((v) => v && String(v).toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, statusFilter, search, scope]);

  const selectAll = (checked: boolean) => {
    if (checked) setSelected(new Set(filtered.filter((r) => r.verification_status === "pending").map((r) => r.id)));
    else setSelected(new Set());
  };
  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const selectedRows = useMemo(() => filtered.filter((r) => selected.has(r.id) && r.verification_status === "pending"), [filtered, selected]);

  const approveOne = async (c: ConversionReport) => {
    if (!profile?.id) return;
    setBusy(true);
    try {
      await approveConversion(c, { id: profile.id, name: profile.full_name });
      toast.success("Approved");
      await load(); onChanged?.();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(false); }
  };
  const doReject = async () => {
    if (!rejectFor || !profile?.id) return;
    setBusy(true);
    try {
      if (rejectFor === "bulk") {
        const res = await bulkRejectConversions(selectedRows, { id: profile.id, name: profile.full_name }, note.trim() || undefined);
        toast.success(`Rejected ${res.ok}${res.failed ? ` · ${res.failed} failed` : ""}`);
      } else {
        await rejectConversion(rejectFor, { id: profile.id, name: profile.full_name }, note.trim() || undefined);
        toast.success("Rejected");
      }
      setRejectFor(null); setNote("");
      await load(); onChanged?.();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(false); }
  };
  const doBulkApprove = async () => {
    if (!profile?.id || selectedRows.length === 0) return;
    if (!confirm(`Approve ${selectedRows.length} conversion${selectedRows.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    try {
      const res = await bulkApproveConversions(selectedRows, { id: profile.id, name: profile.full_name });
      toast.success(`Approved ${res.ok}${res.failed ? ` · ${res.failed} failed` : ""}`);
      await load(); onChanged?.();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(false); }
  };

  const exportCsv = () => {
    const data = filtered.map((r) => ({
      conversion_date: r.conversion_date,
      client: r.lead_name ?? r.client_name ?? "",
      media_buyer: r.media_buyer_name ?? "",
      count: r.conversion_count,
      value: r.conversion_value ?? "",
      campaign: r.campaign_name ?? "",
      status: r.verification_status,
      proof: r.proof_url ?? "",
      submitted_at: r.created_at,
      verification_note: r.verification_note ?? "",
      notes: r.notes ?? "",
    }));
    downloadCsv(`conversions-${scope === "pending" ? "pending" : month}.csv`, toCsv(data));
  };

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-line rounded-lg p-2.5">
        <div className="inline-flex rounded-md border border-line overflow-hidden">
          <button onClick={() => setScope("pending")}
            className={`px-2.5 py-1 text-xs ${scope === "pending" ? "bg-black text-white" : "bg-white text-black"}`}>Pending</button>
          <button onClick={() => setScope("month")}
            className={`px-2.5 py-1 text-xs ${scope === "month" ? "bg-black text-white" : "bg-white text-black"}`}>By month</button>
        </div>
        {scope === "month" && (
          <>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ipc-input !h-8 !text-xs" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="ipc-input !h-8 !text-xs">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </>
        )}
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
          className="ipc-input !h-8 !text-xs w-44" />
        <button onClick={load} className="ipc-btn ipc-btn-ghost !h-8 !text-xs"><RefreshCw className="w-3 h-3" /></button>
        <div className="ml-auto flex items-center gap-1.5">
          {isAdmin && selectedRows.length > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground">{selectedRows.length} selected</span>
              <button disabled={busy} onClick={doBulkApprove} className="ipc-btn ipc-btn-black !h-8 !text-xs"><Check className="w-3 h-3" /> Approve all</button>
              <button disabled={busy} onClick={() => { setRejectFor("bulk"); setNote(""); }} className="ipc-btn ipc-btn-ghost !h-8 !text-xs border-[#FCA5A5] text-[#991B1B]"><XIcon className="w-3 h-3" /> Reject all</button>
            </>
          )}
          {isAdmin && <button onClick={exportCsv} className="ipc-btn ipc-btn-ghost !h-8 !text-xs"><Download className="w-3 h-3" /> CSV</button>}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        {loading ? (
          <LoadingState block />
        ) : filtered.length === 0 ? (
          <div className="p-6 text-xs text-muted-foreground text-center">No conversions match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-line bg-off/40">
                  {isAdmin && (
                    <th className="px-2 py-2 w-8">
                      <input type="checkbox"
                        checked={selectedRows.length > 0 && selectedRows.length === filtered.filter((r) => r.verification_status === "pending").length}
                        onChange={(e) => selectAll(e.target.checked)} />
                    </th>
                  )}
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Client</th>
                  <th className="px-2 py-2">Media buyer</th>
                  <th className="px-2 py-2 text-right">Count</th>
                  <th className="px-2 py-2 text-right">Value</th>
                  <th className="px-2 py-2">Campaign / Notes</th>
                  <th className="px-2 py-2">Proof</th>
                  <th className="px-2 py-2">Submitted</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const statusBadge =
                    r.verification_status === "approved" ? "bg-[#DCFCE7] text-[#166534]" :
                    r.verification_status === "rejected" ? "bg-[#FEE2E2] text-[#991B1B]" :
                    "bg-[#FEF3C7] text-[#92400E]";
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-off/40">
                      {isAdmin && (
                        <td className="px-2 py-2">
                          {r.verification_status === "pending" && (
                            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                          )}
                        </td>
                      )}
                      <td className="px-2 py-2 whitespace-nowrap">{r.conversion_date}</td>
                      <td className="px-2 py-2 truncate max-w-[160px]">
                        {onOpenLead ? (
                          <button onClick={() => onOpenLead(r.operations_lead_id)} className="hover:underline text-left">
                            {r.lead_name ?? r.client_name ?? "—"}
                          </button>
                        ) : (r.lead_name ?? r.client_name ?? "—")}
                      </td>
                      <td className="px-2 py-2 truncate max-w-[140px]">{r.media_buyer_name ?? "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.conversion_count}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.conversion_value != null ? `₹${Number(r.conversion_value).toLocaleString()}` : "—"}</td>
                      <td className="px-2 py-2 truncate max-w-[200px]">
                        {r.campaign_name && <div className="truncate">{r.campaign_name}</div>}
                        {r.notes && <div className="text-[10px] text-muted-foreground truncate">{r.notes}</div>}
                      </td>
                      <td className="px-2 py-2">
                        {r.proof_url ? (
                          <a href={r.proof_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline"><ExternalLink className="w-3 h-3" />Link</a>
                        ) : "—"}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-2 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${statusBadge}`}>{r.verification_status}</span>
                        {r.verification_note && <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[150px]" title={r.verification_note}>{r.verification_note}</div>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {isAdmin && r.verification_status === "pending" && (
                          <div className="flex items-center justify-end gap-1">
                            <button disabled={busy} onClick={() => approveOne(r)} className="ipc-btn ipc-btn-ghost !h-6 !text-[10px] !px-1.5"><Check className="w-3 h-3" /></button>
                            <button disabled={busy} onClick={() => { setRejectFor(r); setNote(""); }} className="ipc-btn ipc-btn-ghost !h-6 !text-[10px] !px-1.5 border-[#FCA5A5] text-[#991B1B]"><XIcon className="w-3 h-3" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectFor && (
        <div className="fixed inset-0 z-[1400] bg-black/50 flex items-center justify-center p-4" onClick={() => setRejectFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-sm p-5">
            <div className="font-serif text-base mb-2">{rejectFor === "bulk" ? `Reject ${selectedRows.length} conversions?` : "Reject conversion?"}</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="ipc-input !text-xs w-full" placeholder="Reason (optional)" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRejectFor(null)} className="ipc-btn ipc-btn-ghost">Cancel</button>
              <button onClick={doReject} disabled={busy} className="ipc-btn ipc-btn-black">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
