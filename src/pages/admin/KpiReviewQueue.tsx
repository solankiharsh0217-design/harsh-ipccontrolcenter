import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { PageHead, SectionLabel, LoadingState, EmptyState } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import { listGradedQueue, gradeSubmission, type ReviewRow } from "@/lib/accountabilityAdmin";
import type { Grade } from "@/lib/accountabilityScoring";

const GRADE_LABEL: Record<Grade, string> = { green: "Green", yellow: "Yellow", red: "Red" };

function gradeStyle(g: Grade, active: boolean) {
  if (!active) return "border-[hsl(var(--line))] bg-white hover:bg-[hsl(var(--gold-pale))]";
  if (g === "green") return "border-[hsl(var(--gold))] bg-[hsl(var(--gold))] text-black";
  if (g === "yellow") return "border-[hsl(var(--gold-mid))] bg-[hsl(var(--gold-mid))] text-black";
  return "border-black bg-black text-white";
}

export default function KpiReviewQueue() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);

  const load = async (all = showAll) => {
    setLoading(true);
    try { setRows(await listGradedQueue(!all)); }
    catch (e: any) { toast.error(e?.message || "Could not load the queue"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showAll]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const grade = async (row: ReviewRow, g: Grade) => {
    if (!user?.id) return;
    setBusy(row.submissionId);
    try {
      await gradeSubmission({ row, grade: g, reviewNotes: notes[row.submissionId], actorId: user.id });
      toast.success(`Marked ${GRADE_LABEL[g].toLowerCase()}`);
      setRows((prev) => prev.filter((r) => r.submissionId !== row.submissionId || showAll).map((r) => (r.submissionId === row.submissionId ? { ...r, grade: g } : r)));
    } catch (e: any) { toast.error(e?.message || "Could not save the grade"); }
    finally { setBusy(null); }
  };

  return (
    <div className="max-w-[1000px]">
      <PageHead title="KPI Review Queue" sub="Grade what people submitted against the target they were set — green, yellow or red." />

      <div className="flex items-center justify-between mb-3">
        <SectionLabel>{showAll ? "All submissions" : "Waiting on you"}</SectionLabel>
        <button
          className="h-9 px-3 rounded-md border border-[hsl(var(--line))] font-sans text-[12px] hover:bg-[hsl(var(--gold-pale))]"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show only pending" : "Show everything"}
        </button>
      </div>

      {loading ? <LoadingState label="Loading submissions…" block /> : rows.length === 0 ? (
        <EmptyState title="Nothing to review" hint="Submitted KPIs will land here with their evidence." />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.submissionId} className="rounded-lg border border-[hsl(var(--line))] bg-white p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <p className="font-serif text-[18px] truncate">{r.kpiName}</p>
                  <p className="font-sans text-[12px] text-muted-foreground">{r.userName} · {r.periodStart}</p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-[22px] tabular-nums">
                    {r.actual ?? "—"}<span className="text-[13px] text-muted-foreground"> / {r.target ?? "no target"}</span>
                  </p>
                  <p className="font-sans text-[12px] text-muted-foreground tabular-nums">
                    {r.attainment == null ? "Cannot be scored" : `${Math.round(r.attainment * 100)}% of target`}
                    {r.suggested && ` · suggests ${GRADE_LABEL[r.suggested].toLowerCase()}`}
                  </p>
                </div>
              </div>

              {(r.notes || r.proofUrl) && (
                <div className="mt-2 font-sans text-[13px] space-y-1">
                  {r.notes && <p className="text-muted-foreground">{r.notes}</p>}
                  {r.proofUrl && (
                    <a href={r.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[hsl(var(--gold-deep))] underline">
                      Open the evidence <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}

              <input
                className="mt-2.5 h-9 w-full rounded-md border border-[hsl(var(--line))] px-2.5 font-sans text-[13px]"
                placeholder="A note back to them (optional)"
                value={notes[r.submissionId] ?? ""}
                onChange={(e) => setNotes({ ...notes, [r.submissionId]: e.target.value })}
              />

              <div className="mt-2.5 flex flex-wrap gap-2">
                {(["green", "yellow", "red"] as Grade[]).map((g) => (
                  <button
                    key={g}
                    disabled={busy === r.submissionId}
                    onClick={() => grade(r, g)}
                    className={`h-10 px-4 rounded-md border font-sans text-[13px] disabled:opacity-50 ${gradeStyle(g, r.grade === g)}`}
                  >
                    {GRADE_LABEL[g]}
                  </button>
                ))}
                {r.grade && <span className="self-center font-sans text-[12px] text-muted-foreground">Currently {GRADE_LABEL[r.grade].toLowerCase()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
