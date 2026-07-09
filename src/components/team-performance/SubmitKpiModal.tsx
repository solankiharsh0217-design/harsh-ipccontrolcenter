import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import type { MyKpiEntry } from "@/lib/myToday";
import {
  submitKpi,
  fetchSubmissionForEntry,
  measurementNeedsValue,
  type KpiSubmission,
} from "@/lib/kpiSubmissions";

interface Props {
  entry: MyKpiEntry;
  actorId: string;
  onClose: () => void;
  onSaved: (submission: KpiSubmission, entryStatus: string) => void;
}

const REVIEWED_STATUSES = ["approved", "rejected", "missed", "waived"];

export default function SubmitKpiModal({ entry, actorId, onClose, onSaved }: Props) {
  const kpi = entry.kpi;
  const readOnly = REVIEWED_STATUSES.includes(entry.status);
  const needsValue = measurementNeedsValue(kpi?.measurement_type);

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<KpiSubmission | null>(null);
  const [value, setValue] = useState<string>("");
  const [proofUrl, setProofUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sub = await fetchSubmissionForEntry(entry.id);
        if (cancelled) return;
        setExisting(sub);
        if (sub) {
          setValue(sub.submitted_value != null ? String(sub.submitted_value) : "");
          setProofUrl(sub.proof_url ?? "");
          setNotes(sub.notes ?? "");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entry.id]);

  const doSubmit = async () => {
    if (!kpi) return;
    setBusy(true); setErr(null);
    try {
      const parsedValue = value.trim() === "" ? null : Number(value);
      if (value.trim() !== "" && Number.isNaN(parsedValue)) {
        throw new Error("Submitted value must be a number.");
      }
      const res = await submitKpi({
        entry: {
          id: entry.id,
          user_id: entry.user_id,
          kpi_id: entry.kpi_id,
          status: entry.status,
          kpi: {
            id: kpi.id,
            name: kpi.name,
            measurement_type: kpi.measurement_type,
            proof_required: kpi.proof_required,
            approval_required: kpi.approval_required,
          },
        },
        input: {
          submitted_value: parsedValue,
          proof_url: proofUrl,
          notes,
        },
        actorId,
      });
      toast.success(res.autoApproved ? "Submitted and auto-approved" : "Submitted for review");
      onSaved(res.submission, res.entryStatus);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  const title = readOnly
    ? "View submission"
    : existing
      ? "Edit submission"
      : "Submit KPI";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{title}</DialogTitle>
          <DialogDescription>
            {kpi?.name}
            {entry.target_value != null && (
              <> — Target: {entry.target_value}{kpi?.target_unit ? ` ${kpi.target_unit}` : ""}</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {kpi?.proof_required && <Badge variant="outline" className="text-[10px]">Proof required</Badge>}
          {kpi?.approval_required
            ? <Badge variant="outline" className="text-[10px]">Approval required</Badge>
            : <Badge variant="outline" className="text-[10px]">Auto-approves</Badge>}
          {entry.due_at && (
            <Badge variant="outline" className="text-[10px]">
              Due {format(new Date(entry.due_at), "d MMM, hh:mm a")}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] capitalize">{entry.status}</Badge>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-4">Loading…</div>
        ) : (
          <div className="space-y-3 pt-1">
            {readOnly && (
              <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
                This KPI has already been reviewed. You can no longer edit this submission.
              </div>
            )}

            {needsValue && (
              <div className="space-y-1.5">
                <Label htmlFor="submitted-value">
                  Submitted value{kpi?.target_unit ? ` (${kpi.target_unit})` : ""}
                </Label>
                <Input
                  id="submitted-value"
                  type="number"
                  step="any"
                  value={value}
                  disabled={readOnly}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter your actual number"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="proof-url">
                Proof URL{kpi?.proof_required ? " (or add notes)" : " (optional)"}
              </Label>
              <Input
                id="proof-url"
                type="url"
                value={proofUrl}
                disabled={readOnly}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="submission-notes">Notes {kpi?.proof_required ? "(counts as proof if no URL)" : "(optional)"}</Label>
              <Textarea
                id="submission-notes"
                value={notes}
                disabled={readOnly}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything the reviewer should know…"
              />
            </div>

            {existing?.review_notes && (
              <div className="rounded-md border border-border px-3 py-2 text-xs">
                <div className="text-muted-foreground mb-0.5">Reviewer feedback</div>
                <div>{existing.review_notes}</div>
              </div>
            )}

            {err && <div className="text-sm text-rose-600">{err}</div>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!readOnly && !loading && (
            <Button onClick={doSubmit} disabled={busy}>
              {busy ? "Saving…" : existing ? "Save changes" : "Submit"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
