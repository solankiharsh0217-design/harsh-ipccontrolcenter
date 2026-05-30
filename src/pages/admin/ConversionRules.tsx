import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { toast } from "sonner";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { logActivity } from "@/lib/auditLog";
import { invalidateRulesCache, type ConversionRule, DEFAULT_TRIGGER_STAGES } from "@/lib/conversionRules";

type Pipeline = { id: string; name: string; pipeline_type: string };
type Stage = { id: string; name: string; pipeline_id: string };

const empty: Partial<ConversionRule> = {
  name: "Default conversion rule",
  source_pipeline_id: null,
  trigger_stage_names: DEFAULT_TRIGGER_STAGES,
  trigger_stage_ids: [],
  destination_pipeline_id: null,
  destination_stage_id: null,
  create_paid_buyer: true,
  hide_from_sales_workload: true,
  deassign_original: false,
  owner_policy: "same",
  default_owner_id: null,
  tag_after_conversion: "Converted",
  followup_default: "keep",
  is_active: true,
};

export default function ConversionRulesAdmin() {
  const { isAdmin, profile } = useAuth();
  const nav = useNavigate();
  const [rules, setRules] = useState<ConversionRule[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [editing, setEditing] = useState<Partial<ConversionRule> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: r }, { data: p }, { data: s }, { data: a }] = await Promise.all([
      (supabase as any).from("crm_conversion_rules").select("*").order("created_at"),
      supabase.from("pipelines").select("id, name, pipeline_type").order("position"),
      supabase.from("stages").select("id, name, pipeline_id").order("position"),
      supabase.from("profiles").select("id, full_name").eq("status", "active").order("full_name"),
    ]);
    setRules((r || []) as any);
    setPipelines((p || []) as any);
    setStages((s || []) as any);
    setAgents((a || []) as any);
  };
  useEffect(() => { load(); }, []);

  if (!isAdmin) return <div className="p-6 text-sm">Admin only.</div>;

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const payload: any = { ...editing };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      if (!payload.trigger_stage_names || payload.trigger_stage_names.length === 0) {
        payload.trigger_stage_names = DEFAULT_TRIGGER_STAGES;
      }
      if (editing.id) {
        const { error } = await (supabase as any).from("crm_conversion_rules").update(payload).eq("id", editing.id);
        if (error) throw error;
        await logActivity({ module_key: "crm", action_type: "crm_conversion_rule_updated", entity_type: "crm_conversion_rule", entity_id: editing.id, entity_label: editing.name, new_values: payload, summary: `Updated conversion rule '${editing.name}'.` });
      } else {
        payload.created_by = profile?.id || null;
        const { data, error } = await (supabase as any).from("crm_conversion_rules").insert(payload).select("id").maybeSingle();
        if (error) throw error;
        await logActivity({ module_key: "crm", action_type: "crm_conversion_rule_created", entity_type: "crm_conversion_rule", entity_id: data?.id, entity_label: payload.name, new_values: payload, summary: `Created conversion rule '${payload.name}'.` });
      }
      invalidateRulesCache();
      toast.success("Conversion rule saved");
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const del = async (r: ConversionRule) => {
    if (!confirm(`Delete rule '${r.name}'?`)) return;
    const { error } = await (supabase as any).from("crm_conversion_rules").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await logActivity({ module_key: "crm", action_type: "crm_conversion_rule_deleted", entity_type: "crm_conversion_rule", entity_id: r.id, entity_label: r.name, severity: "warning", summary: `Deleted conversion rule '${r.name}'.` });
    invalidateRulesCache();
    toast.success("Deleted");
    await load();
  };

  const setF = (patch: Partial<ConversionRule>) => setEditing((e) => ({ ...(e || {}), ...patch }));
  const destStages = stages.filter((s) => s.pipeline_id === (editing?.destination_pipeline_id || ""));
  const sourceStages = stages.filter((s) => !editing?.source_pipeline_id || s.pipeline_id === editing.source_pipeline_id);

  return (
    <div className="max-w-[1060px]">
      <button onClick={() => nav("/admin-center")} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-black mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Back to Admin Center</button>
      <PageHead title="Lead Conversion Rules" sub="Define which sales stages trigger conversion to Paid Onboarding and how converted leads should be handled." />

      {!editing && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Active rules</SectionLabel>
            <button onClick={() => setEditing(empty)} className="ipc-btn ipc-btn-black !h-9 !text-xs"><Plus className="w-3.5 h-3.5" /> New rule</button>
          </div>
          {rules.length === 0 ? (
            <div className="border border-line rounded-xl bg-white p-6 text-[13px] text-muted-foreground">
              No conversion rules yet. The system falls back to default trigger stages: <b>Conversion Successful, Payment Confirmed, Closed Won</b>. Create a rule to customize.
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className="rounded-xl border border-line bg-white px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-serif text-[15px]">{r.name} {!r.is_active && <span className="text-[10px] text-muted-foreground">(inactive)</span>}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Triggers: {r.trigger_stage_names?.join(", ") || "—"}
                      {" · "}Dest: {pipelines.find((p) => p.id === r.destination_pipeline_id)?.name || "Paid Pipeline default"}
                      {" · "}Followups: {r.followup_default}
                      {r.hide_from_sales_workload ? " · hide from sales" : ""}
                      {r.deassign_original ? " · deassign" : ""}
                    </div>
                  </div>
                  <button onClick={() => setEditing(r)} className="ipc-btn ipc-btn-ghost !h-8 !text-xs">Edit</button>
                  <button onClick={() => del(r)} className="ipc-btn ipc-btn-ghost !h-8 !text-xs text-red-600"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="rounded-xl border border-line bg-white p-5 space-y-4 max-w-[720px]">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rule name">
              <input className="ipc-input !h-9 !text-xs w-full" value={editing.name || ""} onChange={(e) => setF({ name: e.target.value })} />
            </Field>
            <Field label="Active">
              <select className="ipc-input !h-9 !text-xs w-full" value={editing.is_active ? "1" : "0"} onChange={(e) => setF({ is_active: e.target.value === "1" })}>
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </Field>
            <Field label="Source pipeline (optional)">
              <select className="ipc-input !h-9 !text-xs w-full" value={editing.source_pipeline_id || ""} onChange={(e) => setF({ source_pipeline_id: e.target.value || null })}>
                <option value="">Any unpaid pipeline</option>
                {pipelines.filter((p) => p.pipeline_type !== "paid").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Destination pipeline">
              <select className="ipc-input !h-9 !text-xs w-full" value={editing.destination_pipeline_id || ""} onChange={(e) => setF({ destination_pipeline_id: e.target.value || null, destination_stage_id: null })}>
                <option value="">Paid Pipeline only (no CRM duplicate)</option>
                {pipelines.filter((p) => p.pipeline_type === "paid").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Trigger stages (CRM stage names that show the conversion banner)">
            <div className="border border-line rounded-md p-2 max-h-[180px] overflow-y-auto grid grid-cols-2 gap-1">
              {(() => {
                const allNames = Array.from(new Set([...DEFAULT_TRIGGER_STAGES, ...sourceStages.map((s) => s.name)]));
                return allNames.map((n) => {
                  const checked = (editing.trigger_stage_names || []).includes(n);
                  return (
                    <label key={n} className="flex items-center gap-2 text-[12px] cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => {
                        const cur = editing.trigger_stage_names || [];
                        setF({ trigger_stage_names: checked ? cur.filter((x) => x !== n) : [...cur, n] });
                      }} />
                      {n}
                    </label>
                  );
                });
              })()}
            </div>
          </Field>

          {editing.destination_pipeline_id && (
            <Field label="Destination stage in paid CRM pipeline">
              <select className="ipc-input !h-9 !text-xs w-full" value={editing.destination_stage_id || ""} onChange={(e) => setF({ destination_stage_id: e.target.value || null })}>
                <option value="">First stage</option>
                {destStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Create / link Paid Pipeline buyer">
              <Toggle val={editing.create_paid_buyer ?? true} on={() => setF({ create_paid_buyer: !editing.create_paid_buyer })} />
            </Field>
            <Field label="Hide original lead from sales workload">
              <Toggle val={editing.hide_from_sales_workload ?? true} on={() => setF({ hide_from_sales_workload: !editing.hide_from_sales_workload })} />
            </Field>
            <Field label="Deassign original lead after conversion">
              <Toggle val={editing.deassign_original ?? false} on={() => setF({ deassign_original: !editing.deassign_original })} />
            </Field>
            <Field label="Owner policy for paid lead">
              <select className="ipc-input !h-9 !text-xs w-full" value={editing.owner_policy || "same"} onChange={(e) => setF({ owner_policy: e.target.value as any })}>
                <option value="same">Same owner as unpaid lead</option>
                <option value="selected">Selected owner</option>
                <option value="unassigned">Keep unassigned</option>
              </select>
            </Field>
            {editing.owner_policy === "selected" && (
              <Field label="Default owner">
                <select className="ipc-input !h-9 !text-xs w-full" value={editing.default_owner_id || ""} onChange={(e) => setF({ default_owner_id: e.target.value || null })}>
                  <option value="">—</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Tag to add after conversion (optional)">
              <input className="ipc-input !h-9 !text-xs w-full" placeholder="Converted" value={editing.tag_after_conversion || ""} onChange={(e) => setF({ tag_after_conversion: e.target.value || null })} />
            </Field>
            <Field label="Default follow-up handling">
              <select className="ipc-input !h-9 !text-xs w-full" value={editing.followup_default || "keep"} onChange={(e) => setF({ followup_default: e.target.value as any })}>
                <option value="keep">Keep on original lead</option>
                <option value="copy">Copy pending to paid lead</option>
                <option value="move">Move pending to paid lead</option>
                <option value="done">Mark pending as done</option>
              </select>
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <button onClick={() => setEditing(null)} disabled={busy} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Cancel</button>
            <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black !h-9 !text-xs"><Save className="w-3.5 h-3.5" /> {busy ? "Saving…" : "Save rule"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="uppercase-label mb-1">{label}</div>
      {children}
    </div>
  );
}
function Toggle({ val, on }: { val: boolean; on: () => void }) {
  return (
    <button onClick={on} type="button" className={`h-9 px-3 rounded-md border text-xs ${val ? "bg-black text-white border-black" : "bg-white border-line"}`}>
      {val ? "Yes" : "No"}
    </button>
  );
}
