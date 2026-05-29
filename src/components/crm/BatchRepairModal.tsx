import { useEffect, useState } from "react";
import { X, Loader2, ShieldCheck, AlertTriangle, Download, Archive, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { dryRunBatchRepair, applyBatchRepair, planToCsv, downloadCsv, type RepairDryRun } from "@/lib/crmRepair";

type Props = {
  batchName: string;
  batchDate: string | null;
  pipelineId: string | null;
  pipelineName?: string | null;
  agentNames?: Map<string, string>;
  onClose: () => void;
  onApplied?: () => void;
};

export default function BatchRepairModal({ batchName, batchDate, pipelineId, pipelineName, agentNames, onClose, onApplied }: Props) {
  const [step, setStep] = useState<"loading" | "preview" | "applying" | "done">("loading");
  const [dry, setDry] = useState<RepairDryRun | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await dryRunBatchRepair({ batchName, batchDate, pipelineId });
        setDry(r);
        setStep("preview");
      } catch (e: any) {
        setErr(e?.message || "Dry-run failed");
        setStep("preview");
      }
    })();
  }, [batchName, batchDate, pipelineId]);

  const apply = async () => {
    if (!dry) return;
    setStep("applying");
    try {
      const r = await applyBatchRepair(dry.plan, { batchName, batchDate, pipelineId });
      setAppliedCount(r.archived);
      setStep("done");
      toast.success(`Repair complete — ${r.archived} duplicate${r.archived === 1 ? "" : "s"} archived`);
      onApplied?.();
    } catch (e: any) {
      toast.error(e?.message || "Apply failed");
      setStep("preview");
    }
  };

  const exportCsv = () => {
    if (!dry) return;
    const csv = planToCsv(dry.plan, agentNames);
    const safe = batchName.replace(/[^\w.-]+/g, "_").slice(0, 60);
    downloadCsv(`batch_repair_${safe}_${batchDate || "nodate"}.csv`, csv);
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-line">
          <div>
            <div className="font-serif text-lg text-black">Deduplicate / Repair Batch</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">{batchName}</span>
              {batchDate && <> · {batchDate}</>}
              {pipelineName && <> · {pipelineName}</>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-black"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {step === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Scanning batch for duplicates…
            </div>
          )}

          {err && step === "preview" && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{err}</div>
          )}

          {step !== "loading" && dry && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <Stat label="Active leads" value={dry.activeCount} />
                <Stat label="Unique identities" value={dry.uniqueIdentities + dry.duplicateIdentities} />
                <Stat label="Duplicate identities" value={dry.duplicateIdentities} tone={dry.duplicateIdentities > 0 ? "amber" : undefined} />
                <Stat label="Duplicate records" value={dry.duplicateRecords} tone={dry.duplicateRecords > 0 ? "amber" : undefined} />
                <Stat label="Safe to archive" value={dry.safeToArchive} tone={dry.safeToArchive > 0 ? "amber" : undefined} />
                <Stat label="Protected duplicates" value={dry.protectedDuplicates} tone={dry.protectedDuplicates > 0 ? "blue" : undefined} />
                <Stat label="Weak (review)" value={dry.weakReview} tone={dry.weakReview > 0 ? "blue" : undefined} />
                <Stat label="Will be archived" value={dry.safeToArchive} tone={dry.safeToArchive > 0 ? "red" : undefined} />
              </div>

              {step === "done" ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                  <div className="font-serif text-base">Repair applied</div>
                  <div className="text-xs text-muted-foreground">{appliedCount} duplicate{appliedCount === 1 ? "" : "s"} archived and de-assigned.</div>
                </div>
              ) : (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Plan preview</div>
                  <div className="max-h-72 overflow-y-auto border border-line rounded-md">
                    <table className="w-full text-[11.5px]">
                      <thead className="bg-off sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium">Action</th>
                          <th className="text-left px-2 py-1.5 font-medium">Name</th>
                          <th className="text-left px-2 py-1.5 font-medium">Email / Phone</th>
                          <th className="text-left px-2 py-1.5 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dry.plan.slice(0, 200).map((p) => (
                          <tr key={p.lead.id} className="border-t border-line">
                            <td className="px-2 py-1.5"><ActionBadge action={p.action} /></td>
                            <td className="px-2 py-1.5 text-foreground truncate max-w-[140px]">{p.lead.full_name || "—"}</td>
                            <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[180px]">{p.lead.email || p.lead.phone || "—"}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{p.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dry.plan.length > 200 && (
                      <div className="text-[10px] text-muted-foreground p-2 border-t border-line">Showing first 200 of {dry.plan.length} rows. Full plan available in CSV.</div>
                    )}
                  </div>

                  <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground bg-off rounded p-2.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div>
                      Safety: payments, invoices, Code of Conduct, follow-ups, and paid-buyer links are never touched. Duplicates with any business history are kept active automatically. Weak (name-only) matches are flagged for manual review, never auto-archived.
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center gap-2">
          <button onClick={exportCsv} disabled={!dry} className="ipc-btn ipc-btn-ghost !h-9 !text-xs disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Download CSV report
          </button>
          <div className="flex-1" />
          {step === "done" ? (
            <button onClick={onClose} className="ipc-btn ipc-btn-black !h-9 !text-xs">Close</button>
          ) : (
            <>
              <button onClick={onClose} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Cancel</button>
              <button
                onClick={apply}
                disabled={!dry || step === "applying" || (dry?.safeToArchive ?? 0) === 0}
                className="ipc-btn ipc-btn-black !h-9 !text-xs disabled:opacity-50"
              >
                {step === "applying" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Applying…</> : <><Archive className="w-3.5 h-3.5" /> Archive {dry?.safeToArchive ?? 0} duplicate{(dry?.safeToArchive ?? 0) === 1 ? "" : "s"}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" | "red" | "blue" }) {
  const toneClass =
    tone === "amber" ? "text-[#92400E]" :
    tone === "red" ? "text-[#B91C1C]" :
    tone === "blue" ? "text-[#1D4ED8]" : "text-black";
  return (
    <div className="border border-line rounded-md px-2.5 py-2 bg-white">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-lg leading-tight mt-0.5 ${toneClass}`}>{value}</div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; cls: string; icon?: any }> = {
    keep: { label: "Keep", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    archive_duplicate: { label: "Archive", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    protected_duplicate: { label: "Protected", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    weak_review: { label: "Review", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  };
  const m = map[action] || map.keep;
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${m.cls}`}>{m.label}</span>;
}
