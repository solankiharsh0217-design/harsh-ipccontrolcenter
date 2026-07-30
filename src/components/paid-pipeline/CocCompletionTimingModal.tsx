import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  COMPLETION_OPTIONS, computeElapsed, conditionForSelection, conditionLabel,
  daysForSelection, loadEmailVariants, renderPreview, selectionLabel, validateVariant,
  type CocEmailVariant, type CompletionSelection,
} from "@/lib/cocCompletionTiming";

export interface CompletionPayload {
  selection: CompletionSelection;
  condition_key: string;
  process_started_at: string | null;
  process_completed_at: string | null;
  duration_hours: number | null;
  duration_days: number | null;
  override_reason: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: CompletionPayload) => void;
  busy?: boolean;
  memberName: string;
  memberEmail: string;
  programName?: string | null;
  /** Canonical process start (payment confirmed / onboarding start / CRM conversion). */
  processStartedAt?: string | null;
  processStartLabel?: string | null;
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CocCompletionTimingModal(props: Props) {
  const { open, onClose, onConfirm, busy, memberName, memberEmail, programName, processStartedAt, processStartLabel } = props;
  const [variants, setVariants] = useState<CocEmailVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<CompletionSelection | null>(null);
  const [completedAt, setCompletedAt] = useState<string>(toLocalInput(new Date().toISOString()));
  const [overrideReason, setOverrideReason] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadEmailVariants().then((v) => setVariants(v)).catch(() => setVariants([])).finally(() => setLoading(false));
  }, [open]);

  // Automatic duration calculation — only when a reliable start date exists.
  const calculated = useMemo(() => {
    if (!processStartedAt) return null;
    const endIso = new Date(completedAt).toISOString();
    return computeElapsed(processStartedAt, endIso);
  }, [processStartedAt, completedAt]);

  // Prefill from the calculated category once, when the modal opens.
  useEffect(() => {
    if (!open) return;
    setSelection((prev) => prev ?? (calculated ? calculated.selection : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, calculated?.selection]);

  useEffect(() => { if (!open) { setSelection(null); setOverrideReason(""); setShowPreview(false); } }, [open]);

  if (!open) return null;

  const condition = selection ? conditionForSelection(selection) : null;
  const variant = condition ? variants.find((v) => v.condition_key === condition) || null : null;
  const issue = condition ? validateVariant(variant) : null;

  const conflictsWithCalculated = !!(calculated && condition && calculated.condition !== condition);
  const needsReason = conflictsWithCalculated && !overrideReason.trim();

  const durationHours = calculated?.hours ?? null;
  const durationDays = calculated?.days ?? (selection ? daysForSelection(selection) : null);


  const previewVars: Record<string, string> = {
    member_name: memberName || "Member",
    program_name: programName || "IPC Diamond Membership",
    signing_link: "https://ipccontrolcenter.lovable.app/code-of-conduct-guide/<secure-link>",
    expiry_days: "7",
    expiry_date: new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    company_name: "India Photographers' Club",
    support_email: "support@indiaphotographersclub.com",
    completion_time: selection ? selectionLabel(selection) : "—",
    completion_condition: condition ? conditionLabel(condition) : "—",
  };

  const confirm = () => {
    if (!selection || !condition) return;
    onConfirm({
      selection,
      condition_key: condition,
      process_started_at: processStartedAt || null,
      process_completed_at: new Date(completedAt).toISOString(),
      duration_hours: durationHours,
      duration_days: durationDays,
      override_reason: conflictsWithCalculated ? overrideReason.trim() : null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl border border-line w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-[15px] font-semibold mb-1">Select Process Completion Time</div>
        <p className="text-[11.5px] text-muted-foreground mb-3">
          Choose how quickly this member completed the onboarding/payment process. This decides which Code of Conduct email is sent, and is saved on the request for future resends.
        </p>

        <div className="rounded-lg border border-line bg-slate-50 p-3 text-[12px] space-y-1 mb-3">
          <Row k="Member" v={memberName || "—"} />
          <Row k="Email" v={memberEmail || "—"} />
          <Row k="Programme / offer" v={programName || "—"} />
          <Row k={processStartLabel || "Process start"} v={processStartedAt ? new Date(processStartedAt).toLocaleString() : "Not available"} />
        </div>

        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Completion</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {COMPLETION_OPTIONS.map((o) => {
            const active = selection === o.value;
            return (
              <button key={o.value} onClick={() => setSelection(o.value)}
                className={`text-left rounded-lg border p-3 transition ${active ? "border-black bg-black text-white" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-3.5 w-3.5 rounded-full border flex-none ${active ? "border-white bg-white" : "border-slate-300"}`} />
                  <span className="text-[13px] font-medium">{o.label}</span>
                </div>
                <div className={`text-[11.5px] mt-1 ${active ? "opacity-80" : "text-slate-500"}`}>{o.description}</div>
              </button>
            );
          })}
        </div>


        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Process completed at</label>
        <input type="datetime-local" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)}
          className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-[12.5px] mb-3" />

        {calculated && (
          <div className="mb-3 rounded-md border border-slate-200 bg-white p-2.5 text-[11.5px] text-slate-700">
            Calculated: <span className="font-medium">{calculated.hours}h</span> · {calculated.days} day{calculated.days === 1 ? "" : "s"} ·
            {" "}suggested <span className="font-medium">{conditionLabel(calculated.condition)}</span>
          </div>
        )}
        {!processStartedAt && (
          <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-[11.5px] text-slate-600">
            No reliable process start date exists for this member — select the completion duration manually.
          </div>
        )}

        {conflictsWithCalculated && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5">
            <div className="text-[11.5px] text-amber-900 font-medium">
              Your selection ({conditionLabel(condition)}) conflicts with the calculated duration ({conditionLabel(calculated!.condition)}).
            </div>
            <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Reason for overriding the calculated category (required)"
              className="mt-1.5 w-full border border-amber-300 rounded-md px-2.5 py-1.5 text-[12px] bg-white" />
          </div>
        )}

        {condition && (
          <div className={`mb-3 rounded-md border p-2.5 text-[12px] ${issue ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            <div className="font-medium">Email template selected: {conditionLabel(condition)}</div>
            {variant && !issue && <div className="opacity-80 mt-0.5">{variant.condition_name} · v{variant.version}</div>}
            {issue && (
              <div className="mt-1">
                <div>{issue.message}</div>
                <Link to="/admin-center/code-of-conduct" className="underline font-medium">Open Admin Center →</Link>
              </div>
            )}
          </div>
        )}

        {showPreview && variant && !issue && (
          <div className="mb-3 rounded-md border border-slate-200 bg-white overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-slate-200 bg-slate-50 text-[11.5px]">
              <span className="text-slate-500">Subject: </span>
              <span className="font-medium text-slate-800">{renderPreview(variant.subject, previewVars)}</span>
            </div>
            <pre className="p-2.5 text-[11.5px] whitespace-pre-wrap font-sans text-slate-700 max-h-56 overflow-y-auto">
              {renderPreview(variant.html_body, previewVars)}
            </pre>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={busy} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={() => setShowPreview((v) => !v)} disabled={!variant || !!issue}
            className="ipc-btn ipc-btn-ghost disabled:opacity-50">{showPreview ? "Hide Preview" : "Preview Email"}</button>
          <button onClick={confirm} disabled={busy || loading || !selection || !!issue || needsReason}
            className="ipc-btn ipc-btn-black disabled:opacity-50"
            title={!selection ? "Select how quickly the member completed the process." : undefined}>
            {busy ? "Sending…" : "Send Code of Conduct"}
          </button>
        </div>
        {!selection && <div className="text-[11px] text-slate-500 text-right mt-1.5">Select how quickly the member completed the process.</div>}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-slate-800 text-right truncate" title={v}>{v}</span>
    </div>
  );
}
