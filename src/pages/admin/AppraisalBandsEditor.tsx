import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHead, SectionLabel, LoadingState, EmptyState } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import { listBands, updateBand, type BandRow } from "@/lib/accountabilityAdmin";

export default function AppraisalBandsEditor() {
  const { isAdmin } = useAuth();
  const [bands, setBands] = useState<BandRow[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<BandRow>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setBands(await listBands()); setDraft({}); }
    catch (e: any) { toast.error(e?.message || "Could not load the bands"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (!isAdmin) return <Navigate to="/" replace />;

  const val = (b: BandRow, k: keyof BandRow) => (draft[b.id]?.[k] ?? b[k]) as any;
  const set = (b: BandRow, k: keyof BandRow, v: any) => setDraft({ ...draft, [b.id]: { ...draft[b.id], [k]: v } });

  const save = async (b: BandRow) => {
    const patch = draft[b.id];
    if (!patch) return;
    const min = Number(patch.min_score ?? b.min_score);
    if (!Number.isFinite(min) || min < 0 || min > 1000) return toast.error("Use a score between 0 and 1,000.");
    setSaving(b.id);
    try {
      await updateBand(b.id, { ...patch, min_score: min });
      toast.success("Band saved");
      load();
    } catch (e: any) { toast.error(e?.message || "Could not save"); }
    finally { setSaving(null); }
  };

  return (
    <div className="max-w-[880px]">
      <PageHead title="Appraisal Bands" sub="The words attached to a score out of 1,000. Each band starts at the score you set here." />
      <SectionLabel>Bands</SectionLabel>
      <div className="mt-2 space-y-2">
        {loading ? <LoadingState label="Loading the bands…" block /> : bands.length === 0 ? (
          <EmptyState title="No bands yet" hint="Bands turn a score into a word people understand." />
        ) : bands.map((b) => (
          <div key={b.id} className="rounded-lg border border-[hsl(var(--line))] bg-white p-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-full sm:w-auto">
                <label className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">From score</label>
                <input
                  type="number"
                  className="h-10 w-28 rounded-md border border-[hsl(var(--line))] px-2.5 text-right font-serif text-[18px] tabular-nums"
                  value={val(b, "min_score")}
                  onChange={(e) => set(b, "min_score", e.target.value === "" ? 0 : Number(e.target.value))}
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">Name</label>
                <input
                  className="h-10 w-full rounded-md border border-[hsl(var(--line))] px-2.5 font-sans text-[14px]"
                  value={val(b, "label") ?? ""}
                  onChange={(e) => set(b, "label", e.target.value)}
                />
              </div>
              <button
                disabled={saving === b.id || !draft[b.id]}
                onClick={() => save(b)}
                className="h-10 px-4 rounded-md bg-black text-white font-sans text-[12px] disabled:opacity-40 self-end"
              >
                Save
              </button>
            </div>
            <div className="mt-2.5">
              <label className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">What it means</label>
              <input
                className="h-10 w-full rounded-md border border-[hsl(var(--line))] px-2.5 font-sans text-[13px]"
                value={val(b, "description") ?? ""}
                onChange={(e) => set(b, "description", e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
