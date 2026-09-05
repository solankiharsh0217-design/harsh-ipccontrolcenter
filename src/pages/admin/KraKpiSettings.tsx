import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Plus, Save, X } from "lucide-react";
import { PageHead, SectionLabel, LoadingState, EmptyState } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import {
  listKras, saveKra, deactivateKra, listKpiDefinitions, createKpiDefinition, saveKpiDefinition,
  setAiCheck, totalAllocated, kpisMissingTarget, needsNewVersion, listPeople, POINTS_BUDGET,
  type Kra, type KpiDefinition,
} from "@/lib/accountabilityAdmin";

const CADENCES = ["daily", "weekly", "monthly", "quarterly"];

const inputCls = "h-9 w-full rounded-md border border-[hsl(var(--line))] px-2.5 font-sans text-[13px] bg-white focus:outline-none focus:border-[hsl(var(--gold))]";
const labelCls = "font-sans text-[11px] uppercase tracking-wide text-muted-foreground mb-1 block";
const btnDark = "h-9 px-3 rounded-md bg-black text-white hover:bg-[#222] font-sans text-[12px] inline-flex items-center gap-1.5";
const btnGhost = "h-9 px-3 rounded-md border border-[hsl(var(--line))] hover:bg-[hsl(var(--gold-pale))] font-sans text-[12px]";

type KpiDraft = Partial<KpiDefinition> & { name: string };

export default function KraKpiSettings() {
  const { isAdmin } = useAuth();
  const [kras, setKras] = useState<Kra[]>([]);
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);
  const [people, setPeople] = useState<Array<{ id: string; full_name: string; role: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [kraDraft, setKraDraft] = useState<Partial<Kra> | null>(null);
  const [kpiDraft, setKpiDraft] = useState<{ base: KpiDefinition | null; draft: KpiDraft } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [k, d, p] = await Promise.all([listKras(), listKpiDefinitions(), listPeople()]);
      setKras(k); setKpis(d); setPeople(p);
    } catch (e: any) { toast.error(e?.message || "Could not load settings"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const allocated = useMemo(() => totalAllocated(kpis), [kpis]);
  const missing = useMemo(() => kpisMissingTarget(kpis), [kpis]);
  const pctFull = Math.min(100, (allocated / POINTS_BUDGET) * 100);

  if (!isAdmin) return <Navigate to="/" replace />;

  const submitKra = async () => {
    if (!kraDraft?.name?.trim()) return toast.error("Give the KRA a name.");
    try { await saveKra(kraDraft as any); setKraDraft(null); toast.success("KRA saved"); load(); }
    catch (e: any) { toast.error(e?.message || "Could not save"); }
  };

  const submitKpi = async () => {
    if (!kpiDraft) return;
    const { base, draft } = kpiDraft;
    if (!draft.name?.trim()) return toast.error("Give the KPI a name.");
    try {
      if (!base) { await createKpiDefinition(draft); toast.success("KPI created"); }
      else {
        const { versioned } = await saveKpiDefinition(base, draft);
        toast.success(versioned ? `Saved as version ${Number(base.version ?? 1) + 1} — earlier scores keep their old numbers` : "KPI updated");
      }
      setKpiDraft(null); load();
    } catch (e: any) { toast.error(e?.message || "Could not save"); }
  };

  const toggleAi = async (k: KpiDefinition) => {
    try {
      await setAiCheck(k.id, !k.ai_check_enabled);
      setKpis((prev) => prev.map((x) => (x.id === k.id ? { ...x, ai_check_enabled: !k.ai_check_enabled } : x)));
    } catch (e: any) { toast.error(e?.message || "Could not change the AI check"); }
  };

  const willVersion = kpiDraft?.base ? needsNewVersion(kpiDraft.base, kpiDraft.draft) : false;

  return (
    <div className="max-w-[1100px]">
      <PageHead title="KRA & KPI Settings" sub="Define the areas people are responsible for, and the measures underneath them." />

      {/* Allocation meter */}
      <div className="rounded-lg border border-[hsl(var(--line))] bg-white p-4 mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-serif text-[20px]">
            You have allocated <span className="text-[hsl(var(--gold-deep))] tabular-nums">{allocated.toLocaleString()}</span> of 1,000 points
          </span>
          <span className="font-sans text-[12px] text-muted-foreground tabular-nums">
            {allocated > POINTS_BUDGET ? `${(allocated - POINTS_BUDGET).toLocaleString()} over budget` : `${(POINTS_BUDGET - allocated).toLocaleString()} left`}
          </span>
        </div>
        <div className="mt-2.5 h-2 rounded-full bg-[hsl(var(--gold-pale))] overflow-hidden">
          <div className="h-full bg-[hsl(var(--gold))]" style={{ width: `${pctFull}%` }} />
        </div>
      </div>

      {/* Missing targets — flagged once, in one place */}
      {missing.length > 0 && (
        <div className="rounded-lg border border-[hsl(var(--gold-mid))] bg-[hsl(var(--gold-pale))] p-3.5 mb-4 flex gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--gold-deep))]" />
          <div className="font-sans text-[13px]">
            <p className="font-medium">{missing.length} {missing.length === 1 ? "KPI has" : "KPIs have"} no target, so they cannot be scored.</p>
            <p className="text-muted-foreground mt-0.5">{missing.map((m) => m.name).join(", ")}</p>
          </div>
        </div>
      )}

      {loading ? <LoadingState label="Loading settings…" block /> : (
        <>
          {/* KRAs */}
          <div className="flex items-center justify-between mb-2 mt-6">
            <SectionLabel>Key result areas</SectionLabel>
            <button className={btnDark} onClick={() => setKraDraft({ name: "", weight: 1, sort_order: kras.length + 1, is_active: true })}>
              <Plus className="w-3.5 h-3.5" /> New KRA
            </button>
          </div>
          {kras.length === 0 ? (
            <EmptyState title="No KRAs yet" description="Start with the handful of areas each role is truly responsible for." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {kras.map((k) => (
                <div key={k.id} className={`rounded-lg border p-3 bg-white ${k.is_active ? "border-[hsl(var(--line))]" : "border-dashed border-[hsl(var(--line))] opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-serif text-[17px] truncate">{k.name}</p>
                      <p className="font-sans text-[12px] text-muted-foreground">
                        {k.owner_role || (k.assigned_user_id ? people.find((p) => p.id === k.assigned_user_id)?.full_name : null) || "Unassigned"}
                        {" · "}weight {k.weight}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button className={btnGhost} onClick={() => setKraDraft(k)}>Edit</button>
                      {k.is_active && (
                        <button className={btnGhost} onClick={async () => { await deactivateKra(k.id); load(); }}>Retire</button>
                      )}
                    </div>
                  </div>
                  {k.description && <p className="font-sans text-[12px] text-muted-foreground mt-1.5">{k.description}</p>}
                </div>
              ))}
            </div>
          )}

          {/* KPIs */}
          <div className="flex items-center justify-between mb-2 mt-8">
            <SectionLabel>KPIs</SectionLabel>
            <button className={btnDark} onClick={() => setKpiDraft({ base: null, draft: { name: "", cadence: "daily", direction: "higher_is_better", weight: 1, points_allocation: 0, is_active: true } })}>
              <Plus className="w-3.5 h-3.5" /> New KPI
            </button>
          </div>
          {kpis.length === 0 ? (
            <EmptyState title="No KPIs yet" description="Add measures under a KRA, each with a target and a share of the 1,000 points." />
          ) : (
            <div className="rounded-lg border border-[hsl(var(--line))] bg-white overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-[hsl(var(--line))] font-sans text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left py-2.5 px-3">KPI</th>
                    <th className="text-left py-2.5 px-3">KRA</th>
                    <th className="text-right py-2.5 px-3">Target</th>
                    <th className="text-left py-2.5 px-3">Cadence</th>
                    <th className="text-right py-2.5 px-3">Weight</th>
                    <th className="text-right py-2.5 px-3">Points</th>
                    <th className="text-center py-2.5 px-3">AI check</th>
                    <th className="py-2.5 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {kpis.map((k) => (
                    <tr key={k.id} className="border-b border-[hsl(var(--line))] last:border-0">
                      <td className="py-2.5 px-3 font-sans text-[13px]">
                        {k.name}
                        {k.version > 1 && <span className="ml-1.5 font-sans text-[11px] text-muted-foreground">v{k.version}</span>}
                        {k.target_default == null && <span className="ml-1.5 text-[11px] text-[hsl(var(--gold-deep))]">no target</span>}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[12px] text-muted-foreground">{kras.find((x) => x.id === k.kra_id)?.name ?? "—"}</td>
                      <td className="py-2.5 px-3 text-right font-sans text-[13px] tabular-nums">
                        {k.target_default == null ? "—" : `${k.target_default}${k.target_unit ? ` ${k.target_unit}` : ""}`}
                        <span className="block text-[11px] text-muted-foreground">{k.direction === "lower_is_better" ? "lower is better" : "higher is better"}</span>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[12px]">{k.cadence}</td>
                      <td className="py-2.5 px-3 text-right font-sans text-[13px] tabular-nums">{k.weight}</td>
                      <td className="py-2.5 px-3 text-right font-serif text-[16px] tabular-nums">{k.points_allocation ?? 0}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => toggleAi(k)}
                          aria-label={`AI check for ${k.name}`}
                          className={`h-6 w-11 rounded-full transition-colors ${k.ai_check_enabled ? "bg-[hsl(var(--gold))]" : "bg-[hsl(var(--line))]"}`}
                        >
                          <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${k.ai_check_enabled ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button className={btnGhost} onClick={() => setKpiDraft({ base: k, draft: { ...k } })}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* KRA editor */}
      {kraDraft && (
        <Modal title={kraDraft.id ? "Edit KRA" : "New KRA"} onClose={() => setKraDraft(null)} onSave={submitKra}>
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={kraDraft.name ?? ""} onChange={(e) => setKraDraft({ ...kraDraft, name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input className={inputCls} value={kraDraft.description ?? ""} onChange={(e) => setKraDraft({ ...kraDraft, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Role</label>
              <input className={inputCls} placeholder="e.g. Media Buyer" value={kraDraft.owner_role ?? ""} onChange={(e) => setKraDraft({ ...kraDraft, owner_role: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Or a person</label>
              <select className={inputCls} value={kraDraft.assigned_user_id ?? ""} onChange={(e) => setKraDraft({ ...kraDraft, assigned_user_id: e.target.value || null })}>
                <option value="">—</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Weight</label>
              <input type="number" step="0.1" className={inputCls} value={kraDraft.weight ?? 1} onChange={(e) => setKraDraft({ ...kraDraft, weight: Number(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls}>Order</label>
              <input type="number" className={inputCls} value={kraDraft.sort_order ?? 0} onChange={(e) => setKraDraft({ ...kraDraft, sort_order: Number(e.target.value) })} />
            </div>
          </div>
        </Modal>
      )}

      {/* KPI editor */}
      {kpiDraft && (
        <Modal title={kpiDraft.base ? `Edit ${kpiDraft.base.name}` : "New KPI"} onClose={() => setKpiDraft(null)} onSave={submitKpi}>
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={kpiDraft.draft.name} onChange={(e) => setKpiDraft({ ...kpiDraft, draft: { ...kpiDraft.draft, name: e.target.value } })} />
          </div>
          <div>
            <label className={labelCls}>Under which KRA</label>
            <select className={inputCls} value={kpiDraft.draft.kra_id ?? ""} onChange={(e) => setKpiDraft({ ...kpiDraft, draft: { ...kpiDraft.draft, kra_id: e.target.value || null } })}>
              <option value="">—</option>
              {kras.filter((k) => k.is_active).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Target</label>
              <input type="number" className={inputCls} value={kpiDraft.draft.target_default ?? ""} onChange={(e) => setKpiDraft({ ...kpiDraft, draft: { ...kpiDraft.draft, target_default: e.target.value === "" ? null : Number(e.target.value) } })} />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input className={inputCls} placeholder="calls, %, ₹" value={kpiDraft.draft.target_unit ?? ""} onChange={(e) => setKpiDraft({ ...kpiDraft, draft: { ...kpiDraft.draft, target_unit: e.target.value } })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Direction</label>
              <select className={inputCls} value={kpiDraft.draft.direction ?? "higher_is_better"} onChange={(e) => setKpiDraft({ ...kpiDraft, draft: { ...kpiDraft.draft, direction: e.target.value as any } })}>
                <option value="higher_is_better">Higher is better</option>
                <option value="lower_is_better">Lower is better</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Cadence</label>
              <select className={inputCls} value={kpiDraft.draft.cadence ?? "daily"} onChange={(e) => setKpiDraft({ ...kpiDraft, draft: { ...kpiDraft.draft, cadence: e.target.value } })}>
                {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Weight</label>
              <input type="number" step="0.1" className={inputCls} value={kpiDraft.draft.weight ?? 1} onChange={(e) => setKpiDraft({ ...kpiDraft, draft: { ...kpiDraft.draft, weight: Number(e.target.value) } })} />
            </div>
            <div>
              <label className={labelCls}>Points (of 1,000)</label>
              <input type="number" className={inputCls} value={kpiDraft.draft.points_allocation ?? 0} onChange={(e) => setKpiDraft({ ...kpiDraft, draft: { ...kpiDraft.draft, points_allocation: Number(e.target.value) } })} />
            </div>
          </div>
          <label className="flex items-center gap-2 font-sans text-[13px]">
            <input type="checkbox" checked={!!kpiDraft.draft.ai_check_enabled} onChange={(e) => setKpiDraft({ ...kpiDraft, draft: { ...kpiDraft.draft, ai_check_enabled: e.target.checked } })} />
            AI check on evidence (never blocks a submission)
          </label>
          {willVersion && (
            <p className="font-sans text-[12px] text-[hsl(var(--gold-deep))] bg-[hsl(var(--gold-pale))] rounded-md p-2.5">
              You changed the target or weight, so this saves as a new version. Past periods keep the numbers they were scored under.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, onSave }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-0 z-[1300] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-[520px] max-h-[90vh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-[hsl(var(--line))]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--line))]">
          <h2 className="font-serif text-[19px]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="h-9 w-9 grid place-items-center rounded-md hover:bg-[hsl(var(--gold-pale))]"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
        <div className="px-4 py-3 border-t border-[hsl(var(--line))] flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnDark} onClick={onSave}><Save className="w-3.5 h-3.5" /> Save</button>
        </div>
      </div>
    </div>
  );
}
