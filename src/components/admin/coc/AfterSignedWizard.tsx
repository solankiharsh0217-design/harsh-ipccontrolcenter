import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import WizardShell from "./WizardShell";
import { IpcCombobox } from "@/components/ui/ipc-combobox";
import TagCombobox from "./TagCombobox";
import type { Pipeline, Stage, StageTriggerRule } from "./StageTriggerWizard";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: Partial<StageTriggerRule> | null;
  rules: StageTriggerRule[];
  pipelines: Pipeline[];
  stages: Stage[];
  tagNameById: (id: string | null) => string | null;
}

const STEPS_WITH_PICK = ["Select rule", "Apply tag", "Move to stage", "Notifications", "Review"];
const STEPS_NO_PICK = ["Apply tag", "Move to stage", "Notifications", "Review"];

export default function AfterSignedWizard({ open, onClose, onSaved, initial, rules, pipelines, stages, tagNameById }: Props) {
  const { profile } = useAuth();
  const hasInitial = !!initial?.id;
  const STEPS = hasInitial ? STEPS_NO_PICK : STEPS_WITH_PICK;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [ruleId, setRuleId] = useState<string>(initial?.id || "");
  const baseRule = useMemo(() => rules.find((r) => r.id === ruleId) || initial || null, [rules, ruleId, initial]);
  const [draft, setDraft] = useState<Partial<StageTriggerRule>>({
    tag_id_after_signed: initial?.tag_id_after_signed ?? null,
    stage_id_after_signed: initial?.stage_id_after_signed ?? null,
    notify_admin: initial?.notify_admin ?? true,
    notify_owner: initial?.notify_owner ?? true,
  });

  const pipelineId = baseRule?.pipeline_id;
  const pipelineStages = useMemo(() => stages.filter((s) => s.pipeline_id === pipelineId), [stages, pipelineId]);
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const moveStage = stages.find((s) => s.id === (draft.stage_id_after_signed || ""));

  // step index offset when "pick rule" step is present
  const idx = (key: "pick" | "tag" | "stage" | "notify" | "review") => {
    if (hasInitial) return ({ pick: -1, tag: 0, stage: 1, notify: 2, review: 3 } as const)[key];
    return ({ pick: 0, tag: 1, stage: 2, notify: 3, review: 4 } as const)[key];
  };

  const canNext = () => {
    if (step === idx("pick")) return !!ruleId;
    if (step === idx("review")) return !!baseRule?.id;
    return true;
  };

  const save = async () => {
    if (!baseRule?.id) { toast.error("Select a rule first"); return; }
    setSaving(true);
    try {
      const payload: any = {
        tag_id_after_signed: draft.tag_id_after_signed || null,
        stage_id_after_signed: draft.stage_id_after_signed || null,
        notify_admin: !!draft.notify_admin,
        notify_owner: !!draft.notify_owner,
      };
      const { error } = await (supabase as any).from("code_of_conduct_rules").update(payload).eq("id", baseRule.id);
      if (error) throw error;
      try {
        await (supabase as any).from("code_of_conduct_events").insert({
          event_type: "coc_after_signed_updated",
          metadata: { ...payload, rule_id: baseRule.id, performed_by: profile?.id || null },
        });
      } catch { /* ignore */ }
      toast.success("After-signed actions updated");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WizardShell
      open={open}
      onClose={onClose}
      title={hasInitial ? `After-signed actions — ${initial?.name || ""}` : "Configure after-signed actions"}
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
              <button onClick={save} disabled={saving || !baseRule?.id} className="ipc-btn ipc-btn-black disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            )}
          </div>
        </>
      }
    >
      {step === idx("pick") && (
        <div className="space-y-3">
          <Field label="Trigger rule">
            <IpcCombobox
              value={ruleId || null}
              onChange={(v) => {
                setRuleId(v || "");
                const r = rules.find((x) => x.id === v);
                if (r) setDraft({
                  tag_id_after_signed: r.tag_id_after_signed ?? null,
                  stage_id_after_signed: r.stage_id_after_signed ?? null,
                  notify_admin: r.notify_admin ?? true,
                  notify_owner: r.notify_owner ?? true,
                });
              }}
              options={rules.map((r) => ({ value: r.id!, label: r.name, description: r.source === "crm" ? "Calling CRM" : "Paid Pipeline" }))}
              placeholder="Select a trigger rule to configure"
              emptyText="Create a trigger rule first"
            />
          </Field>
          <div className="text-[11.5px] text-muted-foreground">After-signed actions run when the member signs the Code of Conduct.</div>
        </div>
      )}
      {step === idx("tag") && (
        <div className="space-y-3">
          <Field label="Apply tag after signed (optional)">
            <TagCombobox value={draft.tag_id_after_signed || null} onChange={(v) => setDraft({ ...draft, tag_id_after_signed: v })} />
          </Field>
          <div className="text-[11.5px] text-muted-foreground">Leave empty to skip tagging.</div>
        </div>
      )}
      {step === idx("stage") && (
        <div className="space-y-3">
          <Field label={`Move to stage after signed (in ${pipeline?.name || "rule's pipeline"})`}>
            <IpcCombobox
              value={draft.stage_id_after_signed || null}
              onChange={(v) => setDraft({ ...draft, stage_id_after_signed: v })}
              options={pipelineStages.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="No stage move"
              allowClear
              disabled={!pipelineId}
            />
          </Field>
        </div>
      )}
      {step === idx("notify") && (
        <div className="space-y-3">
          <div className="text-[12.5px] text-muted-foreground">Who should be notified when the member signs?</div>
          <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={!!draft.notify_admin} onChange={(e) => setDraft({ ...draft, notify_admin: e.target.checked })} /> Notify admin</label>
          <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={!!draft.notify_owner} onChange={(e) => setDraft({ ...draft, notify_owner: e.target.checked })} /> Notify assigned owner</label>
        </div>
      )}
      {step === idx("review") && (
        <div className="rounded-lg border border-line bg-slate-50 p-4 text-[12.5px] leading-relaxed">
          <div className="font-semibold mb-1">Summary</div>
          For rule <span className="font-medium">{baseRule?.name || "—"}</span>, after signed:
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            <li>{draft.tag_id_after_signed ? <>Apply tag <span className="font-medium">{tagNameById(draft.tag_id_after_signed) || "—"}</span></> : <span className="text-muted-foreground">No tag applied</span>}</li>
            <li>{draft.stage_id_after_signed ? <>Move to <span className="font-medium">{moveStage?.name || "—"}</span></> : <span className="text-muted-foreground">No stage move</span>}</li>
            <li>Notify: {[draft.notify_admin && "admin", draft.notify_owner && "assigned owner"].filter(Boolean).join(" + ") || <span className="text-muted-foreground">none</span>}</li>
          </ul>
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
