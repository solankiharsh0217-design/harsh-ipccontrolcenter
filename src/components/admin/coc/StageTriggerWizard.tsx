import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import WizardShell from "./WizardShell";
import { IpcCombobox } from "@/components/ui/ipc-combobox";
import TagCombobox from "./TagCombobox";

export interface Pipeline { id: string; name: string; type: string }
export interface Stage { id: string; name: string; pipeline_id: string; is_active?: boolean; position: number }
export interface Template { id: string; name: string; version: string }

export interface StageTriggerRule {
  id?: string;
  name: string;
  source: "crm" | "paid_pipeline";
  pipeline_id: string;
  stage_id: string;
  template_id: string;
  mode: "suggest_only" | "auto_send";
  link_expiry_days: number;
  tag_id_after_signed: string | null;
  stage_id_after_signed: string | null;
  notify_admin: boolean;
  notify_owner: boolean;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: Partial<StageTriggerRule> | null;
  pipelines: Pipeline[];
  stages: Stage[];
  templates: Template[];
  tagNameById: (id: string | null) => string | null;
}

const STEPS = ["Source", "Pipeline & stage", "Action mode", "Template", "After signed", "Review"];

export default function StageTriggerWizard({ open, onClose, onSaved, initial, pipelines, stages, templates, tagNameById }: Props) {
  const { profile } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rule, setRule] = useState<Partial<StageTriggerRule>>(initial || {
    name: "", source: "crm", pipeline_id: "", stage_id: "", template_id: "",
    mode: "suggest_only", link_expiry_days: 7,
    tag_id_after_signed: null, stage_id_after_signed: null,
    notify_admin: true, notify_owner: true, is_active: true,
  });

  const pipelineStages = useMemo(() => stages.filter((s) => s.pipeline_id === rule.pipeline_id), [stages, rule.pipeline_id]);
  const pipeline = pipelines.find((p) => p.id === rule.pipeline_id);
  const stage = stages.find((s) => s.id === rule.stage_id);
  const template = templates.find((t) => t.id === rule.template_id);
  const moveStage = stages.find((s) => s.id === (rule.stage_id_after_signed || ""));

  const canNext = () => {
    if (step === 0) return !!rule.source;
    if (step === 1) return !!rule.pipeline_id && !!rule.stage_id;
    if (step === 2) return !!rule.mode;
    if (step === 3) return !!rule.template_id;
    if (step === 4) return true;
    if (step === 5) return !!rule.name?.trim();
    return true;
  };

  const save = async () => {
    if (!rule.name?.trim()) { toast.error("Rule name is required"); setStep(5); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: rule.name.trim(),
        source: rule.source,
        pipeline_id: rule.pipeline_id,
        stage_id: rule.stage_id,
        template_id: rule.template_id,
        mode: rule.mode,
        link_expiry_days: rule.link_expiry_days || 7,
        tag_id_after_signed: rule.tag_id_after_signed || null,
        stage_id_after_signed: rule.stage_id_after_signed || null,
        notify_admin: !!rule.notify_admin,
        notify_owner: !!rule.notify_owner,
        is_active: rule.is_active !== false,
      };
      let evType = "coc_trigger_rule_created";
      if (initial?.id) {
        const { error } = await (supabase as any).from("code_of_conduct_rules").update(payload).eq("id", initial.id);
        if (error) throw error;
        evType = "coc_trigger_rule_updated";
        toast.success("Rule updated");
      } else {
        payload.created_by = profile?.id || null;
        const { error } = await (supabase as any).from("code_of_conduct_rules").insert(payload);
        if (error) throw error;
        toast.success("Rule created");
      }
      try { await (supabase as any).from("code_of_conduct_events").insert({ event_type: evType, metadata: { ...payload, performed_by: profile?.id || null, rule_id: initial?.id || null } }); } catch { /* ignore */ }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not save rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WizardShell
      open={open}
      onClose={onClose}
      title={initial?.id ? "Edit trigger rule" : "New trigger rule"}
      step={step}
      totalSteps={STEPS.length}
      stepLabel={STEPS[step]}
      footer={
        <>
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost" disabled={saving}>Cancel</button>
          <div className="flex gap-2">
            {step > 0 && <button onClick={() => setStep(step - 1)} className="ipc-btn ipc-btn-ghost" disabled={saving}>Back</button>}
            {step < STEPS.length - 1 ? (
              <button onClick={() => canNext() && setStep(step + 1)} disabled={!canNext()} className="ipc-btn ipc-btn-black disabled:opacity-50">Next</button>
            ) : (
              <button onClick={save} disabled={saving || !rule.name?.trim()} className="ipc-btn ipc-btn-black disabled:opacity-50">{saving ? "Saving…" : "Save rule"}</button>
            )}
          </div>
        </>
      }
    >
      {step === 0 && (
        <div className="space-y-3">
          <div className="text-[12.5px] text-muted-foreground">Where does the trigger stage live?</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: "crm", t: "Calling CRM", d: "Trigger when a lead reaches a CRM stage" },
              { v: "paid_pipeline", t: "Paid Pipeline", d: "Trigger via the paid buyer's linked CRM stage" },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setRule({ ...rule, source: opt.v as any, pipeline_id: "", stage_id: "" })}
                className={`text-left p-4 rounded-lg border ${rule.source === opt.v ? "border-slate-900 bg-slate-50" : "border-line hover:border-slate-300"}`}
              >
                <div className="text-[13px] font-medium">{opt.t}</div>
                <div className="text-[11.5px] text-muted-foreground mt-1">{opt.d}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <Field label="Pipeline">
            <IpcCombobox
              value={rule.pipeline_id || null}
              onChange={(v) => setRule({ ...rule, pipeline_id: v || "", stage_id: "", stage_id_after_signed: null })}
              options={pipelines.map((p) => ({ value: p.id, label: p.name, description: p.type }))}
              placeholder="Select pipeline"
            />
          </Field>
          <Field label="Trigger stage">
            <IpcCombobox
              value={rule.stage_id || null}
              onChange={(v) => setRule({ ...rule, stage_id: v || "" })}
              options={pipelineStages.map((s) => ({ value: s.id, label: s.name, description: s.is_active === false ? "Inactive" : undefined }))}
              placeholder={rule.pipeline_id ? "Select stage" : "Select pipeline first"}
              disabled={!rule.pipeline_id}
            />
          </Field>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <div className="text-[12.5px] text-muted-foreground">What happens when a lead reaches the trigger stage?</div>
          <div className="grid gap-3">
            {[
              { v: "suggest_only", t: "Suggest only", d: "Show a banner — agent must click Send." },
              { v: "auto_send", t: "Auto-send email", d: "System sends the email automatically (once)." },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setRule({ ...rule, mode: opt.v as any })}
                className={`text-left p-4 rounded-lg border ${rule.mode === opt.v ? "border-slate-900 bg-slate-50" : "border-line hover:border-slate-300"}`}
              >
                <div className="text-[13px] font-medium">{opt.t}</div>
                <div className="text-[11.5px] text-muted-foreground mt-1">{opt.d}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <Field label="Template">
            <IpcCombobox
              value={rule.template_id || null}
              onChange={(v) => setRule({ ...rule, template_id: v || "" })}
              options={templates.map((t) => ({ value: t.id, label: t.name, description: `v${t.version}` }))}
              placeholder="Select template"
              emptyText="Create a template first"
            />
          </Field>
          <Field label="Link expiry (days)">
            <input type="number" min={1} max={60} className="ipc-input w-32" value={rule.link_expiry_days || 7} onChange={(e) => setRule({ ...rule, link_expiry_days: Number(e.target.value) || 7 })} />
          </Field>
        </div>
      )}
      {step === 4 && (
        <div className="space-y-3">
          <Field label="Apply tag after signed (optional)">
            <TagCombobox value={rule.tag_id_after_signed || null} onChange={(v) => setRule({ ...rule, tag_id_after_signed: v })} />
          </Field>
          <Field label="Move to stage after signed (optional)">
            <IpcCombobox
              value={rule.stage_id_after_signed || null}
              onChange={(v) => setRule({ ...rule, stage_id_after_signed: v })}
              options={pipelineStages.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="No stage move"
              allowClear
              disabled={!rule.pipeline_id}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-4 text-[12.5px] pt-1">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!rule.notify_admin} onChange={(e) => setRule({ ...rule, notify_admin: e.target.checked })} /> Notify admin</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!rule.notify_owner} onChange={(e) => setRule({ ...rule, notify_owner: e.target.checked })} /> Notify assigned owner</label>
          </div>
        </div>
      )}
      {step === 5 && (
        <div className="space-y-4">
          <Field label="Rule name">
            <input className="ipc-input" autoFocus value={rule.name || ""} onChange={(e) => setRule({ ...rule, name: e.target.value })} placeholder="e.g. Diamond — Token Collected" />
          </Field>
          <div className="rounded-lg border border-line bg-slate-50 p-4 text-[12.5px] leading-relaxed">
            <div className="font-semibold mb-1">Summary</div>
            When a lead reaches <span className="font-medium">{pipeline?.name || "—"} → {stage?.name || "—"}</span> in {rule.source === "crm" ? "Calling CRM" : "Paid Pipeline (linked CRM)"}, {rule.mode === "auto_send" ? "auto-send" : "suggest"} <span className="font-medium">{template ? `${template.name} v${template.version}` : "—"}</span>.
            {(rule.tag_id_after_signed || rule.stage_id_after_signed) && (
              <> After signed, {rule.tag_id_after_signed && <>apply tag <span className="font-medium">{tagNameById(rule.tag_id_after_signed) || "—"}</span></>}{rule.tag_id_after_signed && rule.stage_id_after_signed && " and "}{rule.stage_id_after_signed && <>move to <span className="font-medium">{moveStage?.name || "—"}</span></>}.</>
            )}
          </div>
          <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={rule.is_active !== false} onChange={(e) => setRule({ ...rule, is_active: e.target.checked })} /> Rule active</label>
        </div>
      )}
    </WizardShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
