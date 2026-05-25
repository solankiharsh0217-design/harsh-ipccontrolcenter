import { useState } from "react";
import { X } from "lucide-react";

interface ArchiveProps {
  title: string;
  description: string;
  detailLines?: string[];
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  confirmLabel?: string;
}

/** Amber, friendly confirm modal for soft-archive actions. */
export function ArchiveConfirmModal({ title, description, detailLines, busy, onConfirm, onClose, confirmLabel = "Archive" }: ArchiveProps) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-[1300] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-2">
          <div className="font-serif text-lg text-[#92400E]">{title}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-off" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="text-[12px] text-muted-foreground">{description}</div>
        {detailLines && detailLines.length > 0 && (
          <ul className="mt-2 text-[11.5px] text-muted-foreground list-disc pl-5 space-y-0.5">
            {detailLines.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
        <label className="uppercase-label !text-[10px] mt-3 block">Reason (optional)</label>
        <textarea className="ipc-input !h-auto py-2 w-full mt-1" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong import, test data, …" />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Cancel</button>
          <button disabled={busy} onClick={() => onConfirm(reason)} className="ipc-btn !h-9 !text-xs !bg-[#D97706] hover:!bg-[#B45309] !text-white disabled:opacity-50">
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteProps {
  title: string;
  description: string;
  detailLines?: string[];
  busy?: boolean;
  blocked?: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/** Red, type-DELETE-to-confirm modal for irreversible permanent delete. */
export function PermanentDeleteModal({ title, description, detailLines, busy, blocked, onConfirm, onClose }: DeleteProps) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const ok = typed === "DELETE" && !blocked;
  return (
    <div className="fixed inset-0 z-[1300] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border-2 border-[#DC2626] shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-2">
          <div className="font-serif text-lg text-[#DC2626]">{title}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-off" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="text-[12px] text-muted-foreground">{description}</div>
        {detailLines && detailLines.length > 0 && (
          <ul className="mt-2 text-[11.5px] text-muted-foreground list-disc pl-5 space-y-0.5">
            {detailLines.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
        {blocked && (
          <div className="mt-3 p-2.5 rounded-md bg-[#FEE2E2] border border-[#FCA5A5] text-[12px] text-[#991B1B]">
            {blocked}
          </div>
        )}
        {!blocked && (
          <>
            <label className="uppercase-label !text-[10px] mt-3 block">Reason</label>
            <textarea className="ipc-input !h-auto py-2 w-full mt-1" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this safe to permanently delete?" />
            <label className="uppercase-label !text-[10px] mt-3 block">Type <span className="font-mono text-[#DC2626]">DELETE</span> to confirm</label>
            <input className="ipc-input !h-9 w-full mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" />
          </>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Cancel</button>
          {!blocked && (
            <button disabled={!ok || busy} onClick={() => onConfirm(reason)} className="ipc-btn !h-9 !text-xs !bg-[#DC2626] hover:!bg-[#B91C1C] !text-white disabled:opacity-50">
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
