import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHead, SectionLabel, LoadingState, EmptyState } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import { fetchPointRules, fetchScoreSettings, type PointRule } from "@/lib/accountabilityData";
import { updatePointRule, setEnforcement } from "@/lib/accountabilityAdmin";

export default function PointRulesEditor() {
  const { isAdmin, user } = useAuth();
  const [rules, setRules] = useState<PointRule[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [enforcing, setEnforcing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([fetchPointRules(), fetchScoreSettings()]);
      setRules(r);
      setValues(Object.fromEntries(r.map((x) => [x.id, String(x.points)])));
      setEnforcing(Number((s as any).enforcement_enabled) === 1);
    } catch (e: any) { toast.error(e?.message || "Could not load the rules"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (!isAdmin) return <Navigate to="/" replace />;

  const save = async (rule: PointRule) => {
    const points = Number(values[rule.id] ?? 0);
    if (!Number.isFinite(points)) return toast.error("Use a whole number.");
    setSaving(rule.id);
    try {
      await updatePointRule(rule.id, { points: Math.round(points) });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, points: Math.round(points) } : r)));
      toast.success(points === 0 ? `${rule.label} is now switched off` : `${rule.label} saved`);
    } catch (e: any) { toast.error(e?.message || "Could not save"); }
    finally { setSaving(null); }
  };

  const toggleEnforcement = async () => {
    const next = !enforcing;
    try {
      await setEnforcement(next, user?.id ?? null);
      setEnforcing(next);
      toast.success(next ? "Penalties are now being applied" : "Penalties are paused");
    } catch (e: any) { toast.error(e?.message || "Could not change enforcement"); }
  };

  const rewards = rules.filter((r) => !r.is_penalty);
  const penalties = rules.filter((r) => r.is_penalty);

  const Row = ({ r }: { r: PointRule }) => {
    const val = values[r.id] ?? "0";
    const off = Number(val) === 0;
    return (
      <div className="rounded-lg border border-[hsl(var(--line))] bg-white p-3.5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[14px]">{r.label}</p>
          {r.description && <p className="font-sans text-[12px] text-muted-foreground">{r.description}</p>}
          {off && <p className="font-sans text-[12px] text-[hsl(var(--gold-deep))] mt-0.5">Off — nothing is recorded for this.</p>}
          {r.is_penalty && !off && !enforcing && (
            <p className="font-sans text-[12px] text-muted-foreground mt-0.5">Set, but not applied while penalties are paused.</p>
          )}
        </div>
        <input
          type="number"
          aria-label={`${r.label} points`}
          className="h-10 w-24 rounded-md border border-[hsl(var(--line))] px-2.5 text-right font-serif text-[17px] tabular-nums"
          value={val}
          onChange={(e) => setValues({ ...values, [r.id]: e.target.value })}
        />
        <button
          disabled={saving === r.id || String(r.points) === val}
          onClick={() => save(r)}
          className="h-10 px-4 rounded-md bg-black text-white font-sans text-[12px] disabled:opacity-40"
        >
          Save
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-[900px]">
      <PageHead title="Points Rules" sub="What each action is worth. Setting a rule to 0 switches it off entirely — nothing is recorded for it." />

      <div className="rounded-lg border border-[hsl(var(--line))] bg-white p-4 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-serif text-[19px]">Start enforcing penalties</p>
          <p className="font-sans text-[12px] text-muted-foreground">
            While this is off, nobody loses points — penalty rules are recorded nowhere.
          </p>
        </div>
        <button
          onClick={toggleEnforcement}
          aria-label="Start enforcing penalties"
          className={`h-7 w-[52px] rounded-full shrink-0 transition-colors ${enforcing ? "bg-[hsl(var(--gold))]" : "bg-[hsl(var(--line))]"}`}
        >
          <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${enforcing ? "translate-x-[24px]" : "translate-x-[2px]"}`} />
        </button>
      </div>

      {loading ? <LoadingState label="Loading the rules…" block /> : rules.length === 0 ? (
        <EmptyState title="No rules yet" hint="Point rules will appear here once they are set up." />
      ) : (
        <>
          <SectionLabel>Points people earn</SectionLabel>
          <div className="space-y-2 mt-2 mb-6">{rewards.map((r) => <Row key={r.id} r={r} />)}</div>

          <SectionLabel>Points people can lose</SectionLabel>
          <div className="space-y-2 mt-2">{penalties.map((r) => <Row key={r.id} r={r} />)}</div>
        </>
      )}
    </div>
  );
}
