import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import WizardShell from "./WizardShell";
import { IpcCombobox } from "@/components/ui/ipc-combobox";
import type { Pipeline, Stage, Template } from "./StageTriggerWizard";

export interface PostSendRule {
  id?: string;
  name: string;
  event_type: string;
  template_id: string | null;
  source_type: "crm" | "paid_pipeline" | "both";
  current_pipeline_id: string | null;
  current_stage_id: string | null;
  destination_pipeline_id: string;
  destination_stage_id: string;
  also_update_paid_pipeline_stage: boolean;
  destination_paid_pipeline_stage: string | null;
  allow_repeat: boolean;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: Partial<PostSendRule> | null;
  pipelines: Pipeline[];
  stages: Stage[];
  templates: Template[];
}

const STEPS = ["Event", "Template scope", "Source", "Destination", "Repeat", "Review"];

export default function PostSendWizard({ open, onClose, onSaved, initial, pipelines, stages, templates }: Props) {
  const { profile } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rule, setRule] = useState<Partial<PostSendRule>>(initial || {
    name: "", event_type: "email_sent", template_id: null, source_type: "both",
    current_pipeline_id: null, current_stage_id: null,
    destination_pipeline_id: "", destination_stage_id: "",
    also_update_paid_pipeline_stage: false, destination_paid_pipeline_stage: null,
    allow_repeat: false, is_active: true,
  });

  const destStages = useMemo(() => stages.filter((s) => s.pipeline_id === rule.destination_pipeline_id), [stages, rule.destination_pipeline_id]);
  const destPipe = pipelines.find((p) => p.id === rule.destination_pipeline_id);
  const destStage = stages.find((s) => s.id === rule.destination_stage_id);
  const template = templates.find((t) => t.id === (rule.template_id || ""));

  const canNext = () => {
    if (step === 3) return !!rule.destination_pipeline_id && !!rule.destination_stage_id;
    if (step === 5) return !!rule.name?.trim();
    return true;
  };

  const save = async () => {
    if (!rule.name?.trim()) { toast.error("Rule name is required"); setStep(5); return; }
    if (!rule.destination_pipeline_id || !rule.destination_stage_id) { toast.error("Destination required"); setStep(3); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: rule.name.trim(),
        event_type: "email_sent",
        template_id: rule.template_id || null,
        source_type: rule.source_type || "both",
        current_pipeline_id: rule.current_pipeline_id || null,
        current_stage_id: rule.current_stage_id || null,
        destination_pipeline_id: rule.destination_pipeline_id,
        destination_stage_id: rule.destination_stage_id,
        also_update_paid_pipeline_stage: !!rule.also_update_paid_pipeline_stage,
        destination_paid_pipeline_stage: rule.also_update_paid_pipeline_stage ? (rule.destination_paid_pipeline_stage || null) : null,
        allow_repeat: !!rule.allow_repeat,
        is_active: rule.is_active !== false,
        updated_by: profile?.id || null,
      };
      let evType = "coc_post_send_rule_created";
      if (initial?.id) {
        const { error } = await (supabase as any).from("code_of_conduct_automation_rules").update(payload).eq("id", initial.id);
        if (error) throw error;
        evType = "coc_post_send_rule_updated";
        toast.success("Rule updated");
      } else {
        payload.created_by = profile?.id || null;
        const { error } = await (supabase as any).from("code_of_conduct_automation_rules").insert(payload);
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
      title={initial?.id ? "Edit post-send rule" : "New post-send rule"}
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
        <div className="rounded-lg border border-line p-4 bg-slate-50">
          <div className="text-[13px] font-medium">Code of Conduct email sent successfully</div>
          <div className="text-[12px] text-muted-foreground mt-1">This rule runs only after the provider confirms the email was sent.</div>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <div className="text-[12.5px] text-muted-foreground">Run this rule for…</div>
          <div className="grid gap-2">
            <button onClick={() => setRule({ ...rule, template_id: null })} className={`text-left p-3 rounded-lg border ${!rule.template_id ? "border-slate-900 bg-slate-50" : "border-line"}`}>
              <div className="text-[12.5px] font-medium">Any Code of Conduct template</div>
            </button>
          </div>
          <Field label="Or a specific template">
            <IpcCombobox
              value={rule.template_id || null}
              onChange={(v) => setRule({ ...rule, template_id: v })}
              options={templates.map((t) => ({ value: t.id, label: t.name, description: `v${t.version}` }))}
              placeholder="Select template (optional)"
              allowClear
            />
          </Field>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <div className="text-[12.5px] text-muted-foreground">Apply to which source?</div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { v: "both", t: "Both" },
              { v: "crm", t: "Calling CRM" },
              { v: "paid_pipeline", t: "Paid Pipeline linked CRM" },
            ].map((opt) => (
              <button key={opt.v} onClick={() => setRule({ ...rule, source_type: opt.v as any })} className={`text-left p-3 rounded-lg border ${rule.source_type === opt.v ? "border-slate-900 bg-slate-50" : "border-line hover:border-slate-300"}`}>
                <div className="text-[12.5px] font-medium">{opt.t}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <Field label="Destination CRM pipeline">
            <IpcCombobox
              value={rule.destination_pipeline_id || null}
              onChange={(v) => setRule({ ...rule, destination_pipeline_id: v || "", destination_stage_id: "" })}
              options={pipelines.map((p) => ({ value: p.id, label: p.name, description: p.type }))}
              placeholder="Select pipeline"
            />
          </Field>
          <Field label="Destination CRM stage">
            <IpcCombobox
              value={rule.destination_stage_id || null}
              onChange={(v) => setRule({ ...rule, destination_stage_id: v || "" })}
              options={destStages.map((s) => ({ value: s.id, label: s.name, description: s.is_active === false ? "Inactive" : undefined }))}
              placeholder={rule.destination_pipeline_id ? "Select stage" : "Select pipeline first"}
              disabled={!rule.destination_pipeline_id}
            />
          </Field>
        </div>
      )}
      {step === 4 && (
        <div className="space-y-3">
          <div className="text-[12.5px] text-muted-foreground">What if the email is sent again later (resend)?</div>
          <div className="grid gap-2">
            {[
              { v: false, t: "Do not move again on resend", d: "Default — safer for stage history" },
              { v: true, t: "Move again on resend", d: "Re-applies the stage move every send" },
            ].map((opt) => (
              <button key={String(opt.v)} onClick={() => setRule({ ...rule, allow_repeat: opt.v })} className={`text-left p-3 rounded-lg border ${rule.allow_repeat === opt.v ? "border-slate-900 bg-slate-50" : "border-line"}`}>
                <div className="text-[12.5px] font-medium">{opt.t}</div>
                <div className="text-[11px] text-muted-foreground">{opt.d}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {step === 5 && (
        <div className="space-y-4">
          <Field label="Rule name">
            <input className="ipc-input" autoFocus value={rule.name || ""} onChange={(e) => setRule({ ...rule, name: e.target.value })} placeholder="e.g. CoC Sent → Documents Pending" />
          </Field>
          <div className="rounded-lg border border-line bg-slate-50 p-4 text-[12.5px] leading-relaxed">
            <div className="font-semibold mb-1">Summary</div>
            When a Code of Conduct email is sent successfully{template ? <> for <span className="font-medium">{template.name} v{template.version}</span></> : " for any template"}, move the linked CRM lead to <span className="font-medium">{destPipe?.name || "—"} → {destStage?.name || "—"}</span>. Source: <span className="font-medium">{rule.source_type === "both" ? "Both" : rule.source_type === "crm" ? "Calling CRM" : "Paid Pipeline linked CRM"}</span>. {rule.allow_repeat ? "Will re-apply on resend." : "Will not re-apply on resend."}
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
