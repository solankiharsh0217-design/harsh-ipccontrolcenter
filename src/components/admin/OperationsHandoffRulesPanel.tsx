import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, AlertTriangle, X } from "lucide-react";
import { logActivity } from "@/lib/auditLog";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import {
  type HandoffRule,
  type HandoffMode,
  type AssignmentMethod,
  type DuplicateBehavior,
  isRuleAutoReady,
} from "@/lib/operationsCrm";

interface Pipeline { id: string; name: string; type: string }
interface Stage { id: string; pipeline_id: string; name: string; position: number }
interface Buyer { id: string; full_name: string }

const PACKAGES = ["Ads Management", "Lead Generation Support", "Custom"];
const DURATION_OPTIONS: Array<{ label: string; days: number | "custom" }> = [
  { label: "3 months", days: 90 },
  { label: "6 months", days: 180 },
  { label: "10 months", days: 300 },
  { label: "Custom", days: "custom" },
];

const blankRule = (): Partial<HandoffRule> => ({
  name: "",
  source_pipeline_id: "",
  eligible_stage_ids: [],
  mode: "suggest",
  default_service_package: "Ads Management",
  default_service_days: 90,
  default_assignment_method: "unassigned",
  default_single_buyer_id: null,
  eligible_buyer_ids: [],
  duplicate_behavior: "skip",
  is_active: true,
});

export default function OperationsHandoffRulesPanel() {
  const { profile } = useAuth();
  const [rules, setRules] = useState<HandoffRule[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [editing, setEditing] = useState<Partial<HandoffRule> | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [r, p, s, b] = await Promise.all([
      (supabase as any).from("operations_handoff_rules").select("*").order("created_at", { ascending: false }),
      supabase.from("pipelines").select("id, name, type").order("position"),
      supabase.from("stages").select("id, pipeline_id, name, position").order("position"),
      getEligibleAssignees("operations_crm").catch(() => []),
    ]);
    setRules((r.data ?? []) as HandoffRule[]);
    setPipelines((p.data ?? []) as any);
    setStages((s.data ?? []) as any);
    setBuyers(b.map((x: any) => ({ id: x.id, full_name: x.full_name })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const stagesFor = (pipelineId: string) =>
    stages.filter((s) => s.pipeline_id === pipelineId).sort((a, b) => a.position - b.position);

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error("Rule name required"); return; }
    if (!editing.source_pipeline_id) { toast.error("Pick a source pipeline"); return; }
    if (!editing.eligible_stage_ids || editing.eligible_stage_ids.length === 0) {
      toast.error("Pick at least one eligible stage"); return;
    }
    if (editing.mode === "auto" && !isRuleAutoReady(editing as HandoffRule)) {
      toast.error("Auto-send requires package, duration, and assignment settings.");
      return;
    }
    setBusy(true);
    try {
      const payload: any = {
        name: editing.name.trim(),
        source_pipeline_id: editing.source_pipeline_id,
        eligible_stage_ids: editing.eligible_stage_ids,
        mode: editing.mode,
        default_service_package: editing.default_service_package ?? null,
        default_service_days: editing.default_service_days ?? null,
        default_assignment_method: editing.default_assignment_method ?? "unassigned",
        default_single_buyer_id: editing.default_assignment_method === "single" ? (editing.default_single_buyer_id ?? null) : null,
        eligible_buyer_ids: editing.default_assignment_method === "round_robin" ? (editing.eligible_buyer_ids ?? []) : [],
        duplicate_behavior: editing.duplicate_behavior ?? "skip",
        is_active: editing.is_active ?? true,
      };
      let action = "operations_handoff_rule_created";
      if (editing.id) {
        const { error } = await (supabase as any).from("operations_handoff_rules").update(payload).eq("id", editing.id);
        if (error) throw error;
        action = "operations_handoff_rule_updated";
      } else {
        payload.created_by = profile?.id ?? null;
        const { error } = await (supabase as any).from("operations_handoff_rules").insert(payload);
        if (error) throw error;
      }
      await logActivity({
        module_key: "operations_crm",
        module_label: "Operations CRM",
        action_type: action,
        entity_type: "operations_handoff_rules",
        entity_label: payload.name,
        summary: `${editing.id ? "Updated" : "Created"} handoff rule "${payload.name}" (${payload.mode})`,
        metadata: payload,
      }).catch(() => {});
      toast.success("Rule saved");
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (rule: HandoffRule) => {
    const next = !rule.is_active;
    await (supabase as any).from("operations_handoff_rules").update({ is_active: next }).eq("id", rule.id);
    await logActivity({
      module_key: "operations_crm",
      action_type: next ? "operations_handoff_rule_updated" : "operations_handoff_rule_deactivated",
      entity_type: "operations_handoff_rules",
      entity_id: rule.id,
      entity_label: rule.name,
      summary: `${next ? "Activated" : "Deactivated"} handoff rule "${rule.name}"`,
    }).catch(() => {});
    await load();
  };

  const remove = async (rule: HandoffRule) => {
    if (!confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) return;
    await (supabase as any).from("operations_handoff_rules").delete().eq("id", rule.id);
    await logActivity({
      module_key: "operations_crm",
      action_type: "operations_handoff_rule_deactivated",
      entity_type: "operations_handoff_rules",
      entity_id: rule.id,
      entity_label: rule.name,
      summary: `Deleted handoff rule "${rule.name}"`,
    }).catch(() => {});
    await load();
  };

  const validate = (r: HandoffRule) => {
    const issues: string[] = [];
    const pipe = pipelines.find((p) => p.id === r.source_pipeline_id);
    if (!pipe) issues.push("Source pipeline no longer exists.");
    const liveStages = stagesFor(r.source_pipeline_id);
    const liveStageIds = new Set(liveStages.map((s) => s.id));
    const missingStages = (r.eligible_stage_ids ?? []).filter((id) => !liveStageIds.has(id));
    if (missingStages.length) issues.push(`${missingStages.length} selected stage(s) no longer match live CRM stages. Re-select them.`);
    if (!r.eligible_stage_ids || r.eligible_stage_ids.length === 0) issues.push("No eligible stages selected.");
    if (!r.default_service_package) issues.push("Default service package missing.");
    if (!r.default_service_days || r.default_service_days <= 0) issues.push("Default service duration missing.");
    if (r.default_assignment_method === "single" && !r.default_single_buyer_id) issues.push("Single assignment needs a media buyer.");
    if (r.default_assignment_method === "round_robin" && (!r.eligible_buyer_ids || r.eligible_buyer_ids.length === 0)) issues.push("Round robin needs at least one media buyer in the pool.");
    if (r.mode === "auto" && !isRuleAutoReady(r)) issues.push("Auto-send requires complete settings — will fall back to suggest.");
    if (issues.length === 0) {
      toast.success(`Rule "${r.name}" is ready. Mode: ${r.mode}.`);
    } else {
      toast.error(issues.join(" "), { duration: 8000 });
    }
  };


  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-serif text-[20px] text-black">Operations Handoff Rules</h2>
          <p className="font-sans text-[12.5px] font-light text-muted-foreground mt-1">
            Decide which Calling CRM stages route leads into Operations CRM, and how (manual, suggest, or auto-send).
          </p>
        </div>
        <button onClick={() => setEditing(blankRule())} className="ipc-btn ipc-btn-black !h-9 !text-xs"><Plus className="w-3.5 h-3.5" /> New Rule</button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="border border-dashed border-line rounded-lg p-6 text-center text-sm text-muted-foreground">
          No handoff rules yet. Create one to route Calling CRM leads into Operations CRM automatically.
        </div>
      ) : (
        <div className="border border-line rounded-lg bg-white divide-y">
          {rules.map((r) => {
            const pipe = pipelines.find((p) => p.id === r.source_pipeline_id);
            const liveStageIds = new Set(stagesFor(r.source_pipeline_id).map((s) => s.id));
            const stgs = stagesFor(r.source_pipeline_id).filter((s) => r.eligible_stage_ids?.includes(s.id));
            const missingStageCount = (r.eligible_stage_ids ?? []).filter((id) => !liveStageIds.has(id)).length;
            const needsCompletion = r.mode === "auto" && !isRuleAutoReady(r);
            return (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-serif text-[15px] text-black">{r.name}</div>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${r.is_active ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#F3F4F6] text-muted-foreground"}`}>{r.is_active ? "Active" : "Inactive"}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-off border border-line">{r.mode === "auto" ? "Auto-send" : r.mode === "suggest" ? "Suggest" : "Manual"}</span>
                    {needsCompletion && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Incomplete · falls back to suggest
                      </span>
                    )}
                    {missingStageCount > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-800 border border-red-200 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {missingStageCount} stale stage{missingStageCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    <span className="font-medium text-foreground">{pipe?.name ?? "—"}</span>
                  </div>
                  {stgs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {stgs.map((s) => (
                        <span key={s.id} className="text-[10px] px-2 py-0.5 rounded-full bg-off border border-line text-foreground">{s.name}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1.5">
                    {r.default_service_package ?? "—"} · {r.default_service_days ?? "—"} days · {r.default_assignment_method.replace("_", " ")} · {r.duplicate_behavior === "skip" ? "Skip duplicates" : "Update existing"}
                    {r.default_assignment_method === "round_robin" && <> · {(r.eligible_buyer_ids ?? []).length} buyer{(r.eligible_buyer_ids ?? []).length === 1 ? "" : "s"} in pool</>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => validate(r)} className="ipc-btn ipc-btn-ghost !h-8 !text-[11px]">Validate</button>
                  <button onClick={() => toggleActive(r)} className="ipc-btn ipc-btn-ghost !h-8 !text-[11px]">{r.is_active ? "Deactivate" : "Activate"}</button>
                  <button onClick={() => setEditing(r)} className="w-8 h-8 rounded hover:bg-off flex items-center justify-center" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(r)} className="w-8 h-8 rounded hover:bg-off flex items-center justify-center text-[#DC2626]" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <RuleEditor
          editing={editing}
          setEditing={setEditing}
          pipelines={pipelines}
          stagesFor={stagesFor}
          buyers={buyers}
          busy={busy}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RuleEditor({
  editing, setEditing, pipelines, stagesFor, buyers, busy, onSave, onClose,
}: {
  editing: Partial<HandoffRule>;
  setEditing: (r: Partial<HandoffRule>) => void;
  pipelines: Pipeline[];
  stagesFor: (id: string) => Stage[];
  buyers: Buyer[];
  busy: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const pipelineStages = editing.source_pipeline_id ? stagesFor(editing.source_pipeline_id) : [];
  const duration = editing.default_service_days ?? 0;
  const knownDuration = [90, 180, 300].includes(duration);
  const [customDays, setCustomDays] = useState<string>(knownDuration || !duration ? "" : String(duration));

  const set = (patch: Partial<HandoffRule>) => setEditing({ ...editing, ...patch });
  const toggleStage = (id: string) => {
    const cur = new Set(editing.eligible_stage_ids ?? []);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    set({ eligible_stage_ids: Array.from(cur) });
  };
  const toggleBuyer = (id: string) => {
    const cur = new Set(editing.eligible_buyer_ids ?? []);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    set({ eligible_buyer_ids: Array.from(cur) });
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div>
            <div className="font-serif text-xl">{editing.id ? "Edit handoff rule" : "New handoff rule"}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Route paid Calling CRM leads into Operations CRM.</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded hover:bg-off flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="form-label">Rule name</label>
            <input className="ipc-input" value={editing.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Paid Onboarding → Operations" />
          </div>

          <div>
            <label className="form-label">Source pipeline</label>
            <select className="ipc-input" value={editing.source_pipeline_id ?? ""} onChange={(e) => set({ source_pipeline_id: e.target.value, eligible_stage_ids: [] })}>
              <option value="">Pick a pipeline…</option>
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {editing.source_pipeline_id && (
            <div>
              <label className="form-label">Eligible stages</label>
              {pipelineStages.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">This pipeline has no stages yet.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {pipelineStages.map((s) => {
                    const on = (editing.eligible_stage_ids ?? []).includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleStage(s.id)}
                        className={`text-[11px] px-2 py-1 rounded border ${on ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="form-label">Handoff mode</label>
            <div className="flex gap-2 flex-wrap">
              {([
                ["manual", "Manual only"],
                ["suggest", "Suggest when eligible"],
                ["auto", "Auto-send when eligible"],
              ] as [HandoffMode, string][]).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set({ mode: k })}
                  className={`px-3 py-1.5 rounded-md text-xs border ${editing.mode === k ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Default service package</label>
            <input className="ipc-input" value={editing.default_service_package ?? ""} onChange={(e) => set({ default_service_package: e.target.value })} placeholder="Ads Management" />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {PACKAGES.map((p) => (
                <button key={p} type="button" onClick={() => set({ default_service_package: p })} className="text-[10px] px-2 py-0.5 rounded border border-line text-muted-foreground hover:text-black">{p}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Default service duration</label>
            <div className="flex flex-wrap gap-2 items-center">
              {DURATION_OPTIONS.map((opt) => {
                const isCustom = opt.days === "custom";
                const active = isCustom ? !knownDuration && (duration ?? 0) > 0 : duration === opt.days;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      if (isCustom) { set({ default_service_days: Number(customDays) || 0 }); }
                      else { set({ default_service_days: opt.days as number }); setCustomDays(""); }
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs border ${active ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
                  >{opt.label}</button>
                );
              })}
              {!knownDuration && (
                <input
                  type="number" min={1} max={730}
                  value={customDays}
                  onChange={(e) => { setCustomDays(e.target.value); set({ default_service_days: Number(e.target.value) || 0 }); }}
                  placeholder="days"
                  className="ipc-input !h-8 !text-xs w-24"
                />
              )}
            </div>
          </div>

          <div>
            <label className="form-label">Default assignment method</label>
            <div className="flex gap-2 flex-wrap">
              {([
                ["unassigned", "Leave unassigned"],
                ["single", "Assign to one media buyer"],
                ["round_robin", "Round robin"],
              ] as [AssignmentMethod, string][]).map(([k, l]) => (
                <button key={k} type="button" onClick={() => set({ default_assignment_method: k })}
                  className={`px-3 py-1.5 rounded-md text-xs border ${editing.default_assignment_method === k ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}>
                  {l}
                </button>
              ))}
            </div>
            {editing.default_assignment_method === "single" && (
              <select className="ipc-input !text-xs mt-2 max-w-xs" value={editing.default_single_buyer_id ?? ""} onChange={(e) => set({ default_single_buyer_id: e.target.value || null })}>
                <option value="">Pick a media buyer…</option>
                {buyers.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
              </select>
            )}
            {editing.default_assignment_method === "round_robin" && (
              <div className="mt-2">
                {buyers.length === 0 ? (
                  <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    No eligible media buyers. Enable “Can receive Operations leads” in Team Directory.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {buyers.map((b) => {
                      const on = (editing.eligible_buyer_ids ?? []).includes(b.id);
                      return (
                        <button key={b.id} type="button" onClick={() => toggleBuyer(b.id)} className={`text-[11px] px-2 py-1 rounded border ${on ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}>{b.full_name}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="form-label">If a lead already exists in Operations CRM</label>
            <div className="flex gap-2">
              {([
                ["skip", "Skip existing record"],
                ["update", "Update existing record"],
              ] as [DuplicateBehavior, string][]).map(([k, l]) => (
                <button key={k} type="button" onClick={() => set({ duplicate_behavior: k })}
                  className={`px-3 py-1.5 rounded-md text-xs border ${editing.duplicate_behavior === k ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}>{l}</button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => set({ is_active: e.target.checked })} className="w-3.5 h-3.5 accent-black" />
            Rule is active
          </label>

          {editing.mode === "auto" && !isRuleAutoReady(editing as HandoffRule) && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Operations handoff rule needs package, duration, and assignment settings before auto-send works. It will fall back to suggestion mode.</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost" disabled={busy}>Cancel</button>
          <button onClick={onSave} disabled={busy} className="ipc-btn ipc-btn-black disabled:opacity-50">{busy ? "Saving…" : "Save rule"}</button>
        </div>
      </div>
    </div>
  );
}
