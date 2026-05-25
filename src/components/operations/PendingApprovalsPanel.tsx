import { useEffect, useState } from "react";
import { Check, X as XIcon, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  listPendingConversions, approveConversion, rejectConversion,
  type ConversionReport,
} from "@/lib/operationsConversions";

export default function PendingApprovalsPanel({ onChanged, onOpenLead }: { onChanged?: () => void; onOpenLead?: (leadId: string) => void }) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ConversionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<ConversionReport | null>(null);
  const [note, setNote] = useState("");

  const load = async () => {
    setLoading(true);
    try { setRows(await listPendingConversions(200)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const approve = async (c: ConversionReport) => {
    if (!profile?.id) return;
    setBusyId(c.id);
    try {
      await approveConversion(c, { id: profile.id, name: profile.full_name });
      toast.success("Approved");
      await load(); onChanged?.();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusyId(null); }
  };
  const reject = async () => {
    if (!rejectFor || !profile?.id) return;
    setBusyId(rejectFor.id);
    try {
      await rejectConversion(rejectFor, { id: profile.id, name: profile.full_name }, note.trim() || undefined);
      toast.success("Rejected");
      setRejectFor(null); setNote("");
      await load(); onChanged?.();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusyId(null); }
  };

  return (
    <div className="bg-white border border-line rounded-lg">
      <div className="px-3 py-2 border-b border-line flex items-center justify-between">
        <div className="font-serif text-sm">Pending conversion approvals</div>
        <div className="text-[10px] text-muted-foreground">{rows.length} pending</div>
      </div>
      {loading ? (
        <div className="p-4 text-xs text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground text-center">All caught up. No pending approvals.</div>
      ) : (
        <div className="divide-y divide-line max-h-[400px] overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.lead_name || "—"}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{r.conversion_count} conv</span>
                    {r.conversion_value != null && <span className="text-muted-foreground">· ₹{Number(r.conversion_value).toLocaleString()}</span>}
                    <span className="text-muted-foreground">· {r.conversion_date}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    by {r.media_buyer_name || "—"}{r.campaign_name ? ` · ${r.campaign_name}` : ""}
                  </div>
                  {r.notes && <div className="text-[11px] mt-1 whitespace-pre-wrap line-clamp-2">{r.notes}</div>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {r.proof_url && (
                    <a href={r.proof_url} target="_blank" rel="noreferrer" className="w-6 h-6 rounded hover:bg-off flex items-center justify-center" title="Proof"><ExternalLink className="w-3 h-3" /></a>
                  )}
                  {onOpenLead && (
                    <button onClick={() => onOpenLead(r.operations_lead_id)} className="ipc-btn ipc-btn-ghost !h-6 !text-[10px] !px-1.5">Open</button>
                  )}
                  <button disabled={busyId === r.id} onClick={() => approve(r)} className="ipc-btn ipc-btn-ghost !h-6 !text-[10px] !px-1.5">
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button disabled={busyId === r.id} onClick={() => { setRejectFor(r); setNote(""); }} className="ipc-btn ipc-btn-ghost !h-6 !text-[10px] !px-1.5 border-[#FCA5A5] text-[#991B1B]">
                    <XIcon className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectFor && (
        <div className="fixed inset-0 z-[1400] bg-black/50 flex items-center justify-center p-4" onClick={() => setRejectFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-sm p-5">
            <div className="font-serif text-base mb-2">Reject conversion?</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="ipc-input !text-xs w-full" placeholder="Reason (optional)" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRejectFor(null)} className="ipc-btn ipc-btn-ghost">Cancel</button>
              <button onClick={reject} className="ipc-btn ipc-btn-black">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
