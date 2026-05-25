import { useEffect, useState } from "react";
import { Plus, Check, X as XIcon, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  listConversionsForLead, approveConversion, rejectConversion,
  type ConversionReport,
} from "@/lib/operationsConversions";
import ReportConversionModal from "./ReportConversionModal";

export default function ConversionsSection({
  leadId, leadName, assignedBuyerId, onChanged,
}: {
  leadId: string;
  leadName: string | null;
  assignedBuyerId: string | null;
  onChanged?: () => void;
}) {
  const { profile, isAdmin } = useAuth();
  const [rows, setRows] = useState<ConversionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState<ConversionReport | null>(null);
  const [rejectFor, setRejectFor] = useState<ConversionReport | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await listConversionsForLead(leadId)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [leadId]);

  const canReport = !!profile?.id && (isAdmin || profile.id === assignedBuyerId);

  const summary = (() => {
    let total = 0, pending = 0, approved = 0, rejected = 0, value = 0;
    for (const r of rows) {
      total += r.conversion_count;
      if (r.verification_status === "pending") pending += r.conversion_count;
      else if (r.verification_status === "approved") { approved += r.conversion_count; value += Number(r.conversion_value || 0); }
      else if (r.verification_status === "rejected") rejected += r.conversion_count;
    }
    return { total, pending, approved, rejected, value };
  })();

  const handleApprove = async (c: ConversionReport) => {
    if (!profile?.id) return;
    if (c.media_buyer_id === profile.id && !isAdmin) { toast.error("You cannot approve your own conversion"); return; }
    setBusyId(c.id);
    try {
      await approveConversion(c, { id: profile.id, name: profile.full_name });
      toast.success("Approved");
      await load(); onChanged?.();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusyId(null); }
  };

  const handleReject = async () => {
    if (!rejectFor || !profile?.id) return;
    setBusyId(rejectFor.id);
    try {
      await rejectConversion(rejectFor, { id: profile.id, name: profile.full_name }, rejectNote.trim() || undefined);
      toast.success("Rejected");
      setRejectFor(null); setRejectNote("");
      await load(); onChanged?.();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusyId(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Client conversions</div>
        {canReport && (
          <button onClick={() => { setEditing(null); setReportOpen(true); }} className="ipc-btn ipc-btn-ghost !h-7 !text-[11px]">
            <Plus className="w-3 h-3" /> Report
          </button>
        )}
      </div>

      <div className="grid grid-cols-5 gap-1 mb-2">
        <Stat label="Total" value={summary.total} />
        <Stat label="Pending" value={summary.pending} tone="amber" />
        <Stat label="Approved" value={summary.approved} tone="green" />
        <Stat label="Rejected" value={summary.rejected} tone="red" />
        <Stat label="Value" value={summary.value > 0 ? `₹${Math.round(summary.value).toLocaleString()}` : "—"} />
      </div>

      {loading ? (
        <div className="text-[11px] text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground border border-dashed border-line rounded-md p-3 text-center">No conversions reported yet.</div>
      ) : (
        <div className="border border-line rounded-md divide-y divide-line">
          {rows.map((r) => {
            const mine = r.media_buyer_id === profile?.id;
            const canEdit = r.verification_status === "pending" && (mine || isAdmin);
            const canDecide = isAdmin && r.verification_status === "pending" && !mine;
            return (
              <div key={r.id} className="p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.conversion_date}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{r.conversion_count} conv</span>
                      {r.conversion_value != null && (
                        <span className="text-muted-foreground">· ₹{Number(r.conversion_value).toLocaleString()}</span>
                      )}
                      <StatusChip s={r.verification_status} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {r.media_buyer_name || "—"}
                      {r.campaign_name ? ` · ${r.campaign_name}` : ""}
                    </div>
                    {r.notes && <div className="text-[11px] mt-1 whitespace-pre-wrap">{r.notes}</div>}
                    {r.verification_note && (
                      <div className="text-[10px] mt-1 text-muted-foreground italic">Reviewer: {r.verification_note}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {r.proof_url && (
                      <a href={r.proof_url} target="_blank" rel="noreferrer" className="w-6 h-6 rounded hover:bg-off flex items-center justify-center" title="Proof">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {canEdit && (
                      <button onClick={() => { setEditing(r); setReportOpen(true); }} className="w-6 h-6 rounded hover:bg-off flex items-center justify-center" title="Edit"><Pencil className="w-3 h-3" /></button>
                    )}
                    {canDecide && (
                      <>
                        <button disabled={busyId === r.id} onClick={() => handleApprove(r)} className="ipc-btn ipc-btn-ghost !h-6 !text-[10px] !px-1.5" title="Approve">
                          <Check className="w-3 h-3" /> Approve
                        </button>
                        <button disabled={busyId === r.id} onClick={() => { setRejectFor(r); setRejectNote(""); }} className="ipc-btn ipc-btn-ghost !h-6 !text-[10px] !px-1.5 border-[#FCA5A5] text-[#991B1B]" title="Reject">
                          <XIcon className="w-3 h-3" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {reportOpen && profile?.id && (
        <ReportConversionModal
          leadId={leadId}
          leadName={leadName}
          buyerId={editing?.media_buyer_id ?? (assignedBuyerId ?? profile.id)}
          actor={{ id: profile.id, name: profile.full_name }}
          existing={editing}
          onClose={() => { setReportOpen(false); setEditing(null); }}
          onSaved={async () => { setReportOpen(false); setEditing(null); await load(); onChanged?.(); }}
        />
      )}

      {rejectFor && (
        <div className="fixed inset-0 z-[1400] bg-black/50 flex items-center justify-center p-4" onClick={() => setRejectFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-sm p-5">
            <div className="font-serif text-base mb-2">Reject conversion?</div>
            <div className="text-[11px] text-muted-foreground mb-2">Optional note will be shared with the media buyer.</div>
            <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} className="ipc-input !text-xs w-full" placeholder="Reason (optional)" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRejectFor(null)} className="ipc-btn ipc-btn-ghost" disabled={busyId === rejectFor.id}>Cancel</button>
              <button onClick={handleReject} className="ipc-btn ipc-btn-black" disabled={busyId === rejectFor.id}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "amber" | "green" | "red" }) {
  const cls = tone === "amber" ? "text-[#92400E]" : tone === "green" ? "text-[#166534]" : tone === "red" ? "text-[#991B1B]" : "text-black";
  return (
    <div className="border border-line rounded-md p-1.5 bg-off/40">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function StatusChip({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending: "bg-[#FEF3C7] text-[#92400E]",
    approved: "bg-[#DCFCE7] text-[#166534]",
    rejected: "bg-[#FEE2E2] text-[#991B1B]",
  };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider ${map[s] ?? "bg-[#F3F4F6] text-[#6B7280]"}`}>{s}</span>;
}
