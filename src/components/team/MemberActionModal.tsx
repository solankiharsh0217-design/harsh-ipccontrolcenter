import { useEffect, useState } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  deactivateMember, restoreMember, removeMemberAccess,
  deleteMemberSafely, reassignMemberWork, getMemberLinkedCounts, type LinkedCounts
} from "@/lib/teamMember";

type Action = "deactivate" | "remove_access" | "restore" | "delete";

interface Member { id: string; full_name: string; role?: string | null; }

interface Props {
  action: Action;
  member: Member;
  actorId: string;
  onClose: () => void;
  onDone: () => void;
}

export default function MemberActionModal({ action, member, actorId, onClose, onDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [counts, setCounts] = useState<LinkedCounts | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>("");
  const [eligible, setEligible] = useState<Member[]>([]);
  const [confirmText, setConfirmText] = useState("");
  const [reassignFirst, setReassignFirst] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const c = await getMemberLinkedCounts(member.id);
      if (mounted) setCounts(c);
      if (action === "deactivate" || action === "delete") {
        const { data } = await supabase.from("profiles").select("id, full_name, role")
          .eq("status", "active").is("deactivated_at", null).neq("id", member.id).order("full_name");
        if (mounted) setEligible(((data ?? []) as any[]).map((p) => ({ id: p.id, full_name: p.full_name, role: p.role })));
      }
    })();
    return () => { mounted = false; };
  }, [member.id, action]);

  const totalLinked = counts?.total ?? 0;

  const run = async () => {
    setLoading(true);
    try {
      if (action === "deactivate") {
        if (reassignFirst && reassignTarget) {
          const tgt = eligible.find((e) => e.id === reassignTarget);
          if (!tgt) throw new Error("Select a team member to reassign to.");
          await reassignMemberWork({ fromUserId: member.id, fromName: member.full_name, toUserId: tgt.id, toName: tgt.full_name });
        }
        await deactivateMember({ userId: member.id, name: member.full_name, reason: reason.trim() || undefined, actorId });
        toast.success(`${member.full_name} deactivated`);
      } else if (action === "restore") {
        await restoreMember({ userId: member.id, name: member.full_name });
        toast.success(`${member.full_name} restored`);
      } else if (action === "remove_access") {
        await removeMemberAccess({ userId: member.id, name: member.full_name });
        toast.success(`Access removed from ${member.full_name}`);
      } else if (action === "delete") {
        if (confirmText.trim() !== "DELETE MEMBER") throw new Error('Type DELETE MEMBER to confirm.');
        await deleteMemberSafely({ userId: member.id, name: member.full_name });
        toast.success(`${member.full_name} deleted`);
      }
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const title = action === "deactivate" ? "Deactivate team member?"
    : action === "restore" ? "Restore team member?"
    : action === "remove_access" ? "Remove this member's access?"
    : "Delete team member";

  const tone = action === "delete" ? "red" : action === "deactivate" || action === "remove_access" ? "amber" : "blue";
  const toneBar = tone === "red" ? "bg-red-50 border-red-200 text-red-800"
    : tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-blue-50 border-blue-200 text-blue-800";

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-6" onClick={() => !loading && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-line">
          <div className="font-serif text-[18px] font-medium text-black">{title}</div>
          <button onClick={onClose} disabled={loading} className="text-muted-foreground hover:text-black"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div className="font-sans text-[12px] text-muted-foreground">{member.full_name}{member.role ? ` · ${member.role}` : ""}</div>

          {action === "deactivate" && (
            <>
              <p className="font-sans text-[13px] text-black">This will stop this member from receiving new assignments and hide them from active team workflows. Historical reports and assignments will remain safe.</p>
              {counts && totalLinked > 0 && (
                <div className={`rounded-md border p-3 ${toneBar}`}>
                  <div className="flex items-center gap-2 font-sans text-[12px] font-medium"><AlertTriangle className="w-3.5 h-3.5" /> This member currently owns:</div>
                  <ul className="mt-1.5 ml-5 list-disc font-sans text-[12px]">
                    {counts.callingCrmLeads > 0 && <li>{counts.callingCrmLeads} Calling CRM leads</li>}
                    {counts.paidPipelineLeads > 0 && <li>{counts.paidPipelineLeads} Paid Pipeline buyers</li>}
                    {counts.operationsLeads > 0 && <li>{counts.operationsLeads} Operations CRM clients</li>}
                    {(counts.followUpReminders + counts.paidFollowups) > 0 && <li>{counts.followUpReminders + counts.paidFollowups} pending follow-ups</li>}
                  </ul>
                  <label className="mt-3 flex items-center gap-2 text-[12px] cursor-pointer">
                    <input type="checkbox" checked={reassignFirst} onChange={(e) => setReassignFirst(e.target.checked)} />
                    Reassign active work to another team member before deactivating
                  </label>
                  {reassignFirst && (
                    <select value={reassignTarget} onChange={(e) => setReassignTarget(e.target.value)} className="mt-2 w-full h-9 px-2 rounded-md border border-line bg-white text-[12px]">
                      <option value="">Select team member…</option>
                      {eligible.map((m) => <option key={m.id} value={m.id}>{m.full_name}{m.role ? ` · ${m.role}` : ""}</option>)}
                    </select>
                  )}
                </div>
              )}
              <div>
                <label className="font-sans text-[11px] text-muted-foreground block mb-1">Reason (optional)</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-line text-[13px]" placeholder="e.g. Left company, role change…" />
              </div>
            </>
          )}

          {action === "restore" && (
            <p className="font-sans text-[13px] text-black">This member will be re-enabled in the directory. Module access and assignment eligibility will not be automatically re-granted — review them in Manage Member.</p>
          )}

          {action === "remove_access" && (
            <p className="font-sans text-[13px] text-black">This member will no longer be able to access assigned modules or receive new leads, follow-ups, or round-robin assignments. The profile and history are preserved.</p>
          )}

          {action === "delete" && (
            <>
              {counts && totalLinked > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50 text-red-800 p-3 font-sans text-[12px]">
                  <div className="flex items-center gap-2 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Cannot delete — this member has linked assignments/history.</div>
                  <ul className="mt-1.5 ml-5 list-disc">
                    {counts.callingCrmLeads > 0 && <li>{counts.callingCrmLeads} Calling CRM leads</li>}
                    {counts.paidPipelineLeads > 0 && <li>{counts.paidPipelineLeads} Paid Pipeline buyers</li>}
                    {counts.operationsLeads > 0 && <li>{counts.operationsLeads} Operations CRM clients</li>}
                    {(counts.followUpReminders + counts.paidFollowups) > 0 && <li>{counts.followUpReminders + counts.paidFollowups} pending follow-ups</li>}
                  </ul>
                  <div className="mt-2">Use <strong>Deactivate</strong> or <strong>Remove Access</strong> instead.</div>
                </div>
              ) : (
                <>
                  <p className="font-sans text-[13px] text-black">This will permanently remove the team directory record. Auth login (if any) is not removed here. This action cannot be undone.</p>
                  <div>
                    <label className="font-sans text-[11px] text-muted-foreground block mb-1">Type <strong>DELETE MEMBER</strong> to confirm</label>
                    <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-full h-9 px-3 rounded-md border border-red-300 text-[13px]" placeholder="DELETE MEMBER" />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-6 pb-5 pt-2 flex justify-end gap-2 border-t border-line">
          <button onClick={onClose} disabled={loading} className="ipc-btn">Cancel</button>
          <button
            onClick={run}
            disabled={loading || (action === "delete" && (totalLinked > 0 || confirmText.trim() !== "DELETE MEMBER")) || (action === "deactivate" && reassignFirst && !reassignTarget)}
            className={`ipc-btn ${action === "delete" ? "bg-red-600 text-white hover:bg-red-700" : action === "restore" ? "ipc-btn-black" : "bg-amber-600 text-white hover:bg-amber-700"}`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 inline" />}
            {action === "deactivate" ? "Deactivate" : action === "restore" ? "Restore" : action === "remove_access" ? "Remove access" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
