import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import type { DedupSummary } from "@/lib/qualifier";

export default function DedupPreflightPanel({ summary, mode }: { summary: DedupSummary; mode: 1 | 2 }) {
  const [open, setOpen] = useState(false);
  const att = summary.attendance;
  const reg = summary.registration;
  const hasDups = att.duplicates > 0 || reg.duplicates > 0;

  return (
    <div className="rounded-xl border border-line bg-off/30">
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="space-y-1 text-xs">
          <div className="font-serif text-base text-foreground">Dedup preflight</div>
          <div className="text-muted-foreground">
            {mode === 2 && (
              <span className="mr-3">
                Registration: <b>{reg.rawRows}</b> raw → <b>{reg.unique}</b> unique
                {reg.duplicates > 0 && <span className="text-amber-700"> ({reg.duplicates} duplicates removed)</span>}
              </span>
            )}
            <span>
              Attendance: <b>{att.rawRows}</b> raw rows → <b>{att.unique}</b> unique attendees
              {att.duplicates > 0 && <span className="text-amber-700"> ({att.duplicates} session rows merged)</span>}
            </span>
          </div>
          {(reg.weak + att.weak) > 0 && (
            <div className="text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {reg.weak + att.weak} weak-identity row(s) (no email/phone) — name-match only.
            </div>
          )}
        </div>
        {summary.topDuplicates.length > 0 && (
          <button onClick={() => setOpen((v) => !v)} className="ipc-btn ipc-btn-ghost !h-8 !text-xs whitespace-nowrap">
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Duplicate breakdown ({summary.topDuplicates.length})
          </button>
        )}
      </div>
      {open && summary.topDuplicates.length > 0 && (
        <div className="border-t border-line max-h-72 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-off sticky top-0">
              <tr className="text-left">
                <th className="px-3 py-2 uppercase-label !text-[10px]">Name</th>
                <th className="px-3 py-2 uppercase-label !text-[10px]">Email / Phone</th>
                <th className="px-3 py-2 uppercase-label !text-[10px] text-right">Raw rows</th>
                <th className="px-3 py-2 uppercase-label !text-[10px] text-right">Raw min</th>
                <th className="px-3 py-2 uppercase-label !text-[10px] text-right">Capped min</th>
                <th className="px-3 py-2 uppercase-label !text-[10px]">Grade</th>
                <th className="px-3 py-2 uppercase-label !text-[10px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {summary.topDuplicates.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-1.5">{r.name || "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.email || r.phone || "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.rawRows}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.rawMinutes}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.cappedMinutes}</td>
                  <td className="px-3 py-1.5">{r.grade}</td>
                  <td className="px-3 py-1.5">{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasDups && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-line bg-white">
              Only deduped unique leads will be sent to CRM. Raw rows are never imported.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
