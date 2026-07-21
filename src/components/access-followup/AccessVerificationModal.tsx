import { useState } from "react";
import { toast } from "sonner";
import {
  AccessVerification, upsertVerification, WHATSAPP_LABELS, APP_LOGIN_LABELS, CALL_LABELS,
  WhatsappStatus, AppLoginStatus, CallStatus,
} from "@/lib/accessVerification";

interface Props {
  memberLabel?: string;
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  existing: AccessVerification | null;
  onClose: () => void;
  onSaved: (v: AccessVerification) => void;
}

export default function AccessVerificationModal({
  memberLabel, crmLeadId, paidPipelineLeadId, existing, onClose, onSaved,
}: Props) {
  const [callResult, setCallResult] = useState<"" | "no_answer" | "connected" | "follow_up_needed" | "resolved">("");
  const [whatsapp, setWhatsapp] = useState<WhatsappStatus>(existing?.whatsapp_group_status || "unknown");
  const [appLogin, setAppLogin] = useState<AppLoginStatus>(existing?.app_login_status || "unknown");
  const [notes, setNotes] = useState(existing?.contact_notes || "");
  const [nextFollowUp, setNextFollowUp] = useState<string>(
    existing?.next_follow_up_at ? existing.next_follow_up_at.slice(0, 16) : ""
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await upsertVerification({
        crm_lead_id: crmLeadId || null,
        paid_pipeline_lead_id: paidPipelineLeadId || null,
        whatsapp_group_status: whatsapp,
        app_login_status: appLogin,
        call_status: (callResult || existing?.call_status || "not_called") as CallStatus,
        call_attempted: !!callResult,
        next_follow_up_at: nextFollowUp ? new Date(nextFollowUp).toISOString() : null,
        contact_notes: notes || null,
        memberLabel,
      });
      toast.success("Access verification updated");
      onSaved(saved);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl w-full max-w-[560px] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border">
          <div className="font-serif text-lg">Update Access Follow-up</div>
          {memberLabel && <div className="text-xs text-muted-foreground mt-0.5">{memberLabel}</div>}
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium mb-1.5">Call result</label>
            <div className="flex flex-wrap gap-1.5">
              {(["no_answer", "connected", "follow_up_needed", "resolved"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setCallResult(callResult === v ? "" : v)}
                  className={`text-xs px-3 py-1.5 rounded-full border ${callResult === v ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                >{CALL_LABELS[v]}</button>
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Selecting a call result counts as a new call attempt.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">WhatsApp group</label>
            <select className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background"
              value={whatsapp} onChange={(e) => setWhatsapp(e.target.value as WhatsappStatus)}>
              {(Object.keys(WHATSAPP_LABELS) as WhatsappStatus[]).map((k) => (
                <option key={k} value={k}>{WHATSAPP_LABELS[k]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">App / platform login</label>
            <select className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background"
              value={appLogin} onChange={(e) => setAppLogin(e.target.value as AppLoginStatus)}>
              {(Object.keys(APP_LOGIN_LABELS) as AppLoginStatus[]).map((k) => (
                <option key={k} value={k}>{APP_LOGIN_LABELS[k]}</option>
              ))}
            </select>
            <div className="text-[11px] text-muted-foreground mt-1">
              External course platform — manual verification only.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">Next follow-up</label>
            <input type="datetime-local" className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background"
              value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">Notes</label>
            <textarea rows={3} className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background"
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Call outcome, why they haven't joined, next step…" />
          </div>

          {existing && (
            <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
              Attempts so far: {existing.call_attempt_count}
              {existing.last_called_at && <> · Last call {new Date(existing.last_called_at).toLocaleString()}</>}
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={busy}
            className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
