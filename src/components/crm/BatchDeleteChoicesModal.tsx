import { useState } from "react";
import { X, Archive, RotateCcw, Trash2, AlertTriangle } from "lucide-react";

interface Props {
  batchName: string;
  linkedPaid: number;
  linkedOps: number;
  totalLeads: number;
  isAdmin: boolean;
  busy?: boolean;
  onClose: () => void;
  onArchive: () => void;
  onReset: (reason: string) => void;
  onSafeDelete: (reason: string) => void;
}

/** Shown when a permanent batch delete is blocked by linked records.
 *  Offers: Cancel · Archive · Reset for re-import (CONFIRM) · Safe permanent delete (DELETE) */
export function BatchDeleteChoicesModal({
  batchName, linkedPaid, linkedOps, totalLeads, isAdmin, busy,
  onClose, onArchive, onReset, onSafeDelete,
}: Props) {
  const [mode, setMode] = useState<"choices" | "reset" | "safe">("choices");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const safeCount = Math.max(totalLeads - linkedPaid - linkedOps, 0);

  return (
    <div className="fixed inset-0 z-[1300] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-2">
          <div className="font-serif text-lg text-[#92400E] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Cannot permanently delete this batch safely
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-off" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="text-[12px] text-muted-foreground">
          Batch <b className="text-foreground">"{batchName}"</b> has linked records:
        </div>
        <ul className="mt-2 text-[12px] text-muted-foreground list-disc pl-5 space-y-0.5">
          <li><b className="text-foreground">{linkedPaid}</b> lead{linkedPaid === 1 ? "" : "s"} linked to Paid Pipeline</li>
          <li><b className="text-foreground">{linkedOps}</b> lead{linkedOps === 1 ? "" : "s"} linked to Operations CRM</li>
          <li><b className="text-foreground">{safeCount}</b> unlinked lead{safeCount === 1 ? "" : "s"} (safe to delete)</li>
        </ul>
        <div className="text-[11.5px] text-muted-foreground mt-2">
          Permanent delete may break payment history, finance tracking, operations records, reports, and audit logs.
        </div>

        {mode === "choices" && (
          <div className="mt-4 grid gap-2">
            <button
              onClick={onArchive}
              className="w-full text-left px-3 py-2.5 rounded-md border border-[#FDE68A] bg-[#FFFBEB] hover:bg-[#FEF3C7] flex items-start gap-2.5"
            >
              <Archive className="w-4 h-4 mt-0.5 text-[#92400E]" />
              <div>
                <div className="text-[12.5px] font-medium text-[#92400E]">Archive Batch Instead</div>
                <div className="text-[11px] text-muted-foreground">Hide from active CRM views. Restore anytime. All linked records preserved.</div>
              </div>
            </button>

            <button
              onClick={() => setMode("reset")}
              className="w-full text-left px-3 py-2.5 rounded-md border border-[#BFDBFE] bg-[#EFF6FF] hover:bg-[#DBEAFE] flex items-start gap-2.5"
            >
              <RotateCcw className="w-4 h-4 mt-0.5 text-[#1D4ED8]" />
              <div>
                <div className="text-[12.5px] font-medium text-[#1D4ED8]">Reset Batch for Re-import</div>
                <div className="text-[11px] text-muted-foreground">Removes the batch from active views so you can upload a fresh list. Paid Pipeline, payments, and operations stay safe.</div>
              </div>
            </button>

            {isAdmin && (
              <button
                onClick={() => setMode("safe")}
                disabled={safeCount === 0}
                className="w-full text-left px-3 py-2.5 rounded-md border border-[#FCA5A5] bg-[#FEF2F2] hover:bg-[#FEE2E2] flex items-start gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4 mt-0.5 text-[#DC2626]" />
                <div>
                  <div className="text-[12.5px] font-medium text-[#DC2626]">Permanent Delete Only Safe Leads</div>
                  <div className="text-[11px] text-muted-foreground">
                    Permanently deletes the {safeCount} unlinked lead{safeCount === 1 ? "" : "s"}. Linked leads are archived. Linked Paid Pipeline / Operations records are never touched.
                  </div>
                </div>
              </button>
            )}

            <div className="flex justify-end mt-2">
              <button onClick={onClose} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Cancel</button>
            </div>
          </div>
        )}

        {mode === "reset" && (
          <div className="mt-4">
            <div className="text-[12px] text-foreground">
              This will remove the batch from active CRM views and allow you to upload a fresh list again. Linked payment and operations records will remain safe.
            </div>
            <label className="uppercase-label !text-[10px] mt-3 block">Reason (optional)</label>
            <textarea className="ipc-input !h-auto py-2 w-full mt-1" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong list, corrected file, re-upload…" />
            <label className="uppercase-label !text-[10px] mt-3 block">Type <span className="font-mono text-[#1D4ED8]">CONFIRM</span> to reset</label>
            <input className="ipc-input !h-9 w-full mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="CONFIRM" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setMode("choices"); setTyped(""); }} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Back</button>
              <button
                disabled={typed !== "CONFIRM" || busy}
                onClick={() => onReset(reason)}
                className="ipc-btn !h-9 !text-xs !bg-[#1D4ED8] hover:!bg-[#1E40AF] !text-white disabled:opacity-50"
              >{busy ? "Resetting…" : "Reset batch for re-import"}</button>
            </div>
          </div>
        )}

        {mode === "safe" && (
          <div className="mt-4">
            <div className="text-[12px] text-foreground">
              Will permanently delete <b>{safeCount}</b> unlinked lead{safeCount === 1 ? "" : "s"}. {linkedPaid + linkedOps} linked lead{(linkedPaid + linkedOps) === 1 ? "" : "s"} will be archived instead. Linked Paid Pipeline / Operations records are not touched.
            </div>
            <label className="uppercase-label !text-[10px] mt-3 block">Reason</label>
            <textarea className="ipc-input !h-auto py-2 w-full mt-1" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this safe to permanently delete?" />
            <label className="uppercase-label !text-[10px] mt-3 block">Type <span className="font-mono text-[#DC2626]">DELETE</span> to confirm</label>
            <input className="ipc-input !h-9 w-full mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setMode("choices"); setTyped(""); }} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Back</button>
              <button
                disabled={typed !== "DELETE" || busy}
                onClick={() => onSafeDelete(reason)}
                className="ipc-btn !h-9 !text-xs !bg-[#DC2626] hover:!bg-[#B91C1C] !text-white disabled:opacity-50"
              >{busy ? "Working…" : "Delete safe leads"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
