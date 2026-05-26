import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  requestId: string;
  currentEmail: string;
  isSigned: boolean;
  onUpdated?: () => void;
}

export default function EditMemberEmailModal({ open, onClose, requestId, currentEmail, isSigned, onUpdated }: Props) {
  const [newEmail, setNewEmail] = useState(currentEmail || "");
  const [reason, setReason] = useState("");
  const [resend, setResend] = useState(!isSigned);
  const [alsoUpdateLead, setAlsoUpdateLead] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) && newEmail.trim().toLowerCase() !== (currentEmail || "").trim().toLowerCase();

  const submit = async () => {
    if (!valid) { toast.error("Enter a different, valid email"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("coc-update-email", {
        body: {
          request_id: requestId,
          new_email: newEmail.trim(),
          reason,
          resend: !isSigned && resend,
          also_update_lead: alsoUpdateLead,
          origin: window.location.origin,
        },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false) throw new Error(`[${res.error_code}] ${res.message}`);
      if (isSigned) toast.success("Contact email updated. Signed evidence preserved.");
      else if (resend) toast.success("Email updated. Old link cancelled. New signing link sent.");
      else toast.success("Member email updated.");
      onUpdated?.();
      onClose();
    } catch (e: any) {
      toast.error("Could not update email", { description: e?.message || "Unknown error" });
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-[15px] font-semibold mb-1">Edit Member Email</div>
        <p className="text-[12px] text-slate-500 mb-4">
          {isSigned
            ? "This request is already signed. The signed evidence email is immutable. We will save a corrected contact email separately."
            : "We will cancel the old signing link and optionally email a fresh one."}
        </p>

        <div className="space-y-3 text-[13px]">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Current email</label>
            <div className="text-slate-700">{currentEmail || "—"}</div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">New email</label>
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-2.5 py-1.5" placeholder="member@example.com" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Reason</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-2.5 py-1.5" placeholder="Typo / member provided new email" />
          </div>
          {!isSigned && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} className="w-4 h-4" />
              <span>Resend a new signing link to the new email</span>
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={alsoUpdateLead} onChange={(e) => setAlsoUpdateLead(e.target.checked)} className="w-4 h-4" />
            <span>Also update the linked lead's contact email</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost" disabled={busy}>Cancel</button>
          <button onClick={submit} disabled={!valid || busy} className="ipc-btn ipc-btn-black disabled:opacity-50">
            {busy ? "Saving…" : isSigned ? "Save Corrected Email" : resend ? "Update & Resend New Link" : "Update Email"}
          </button>
        </div>
      </div>
    </div>
  );
}
