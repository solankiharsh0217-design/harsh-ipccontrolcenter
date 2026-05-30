import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import RuleCard from "./coc/RuleCard";
import PostSendWizard, { type PostSendRule } from "./coc/PostSendWizard";
import type { Pipeline, Stage, Template } from "./coc/StageTriggerWizard";

interface Props {
  pipelines: Pipeline[];
  stages: Stage[];
  templates: Template[];
  lastRunMap?: Record<string, { status: string; created_at: string }>;
  formatLastRun?: (last: { status: string; created_at: string } | undefined) => string | null;
  onTest?: (rule: PostSendRule) => void;
}

export default function PostSendAutomationRulesSection({ pipelines, stages, templates, lastRunMap, formatLastRun, onTest }: Props) {
  const { isAdmin } = useAuth();
  const [rules, setRules] = useState<PostSendRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState<{ open: boolean; initial: Partial<PostSendRule> | null }>({ open: false, initial: null });

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("code_of_conduct_automation_rules")
      .select("*")
      .eq("event_type", "email_sent")
      .order("created_at", { ascending: false });
    setRules((data || []) as PostSendRule[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (r: PostSendRule) => {
    const { error } = await (supabase as any).from("code_of_conduct_automation_rules").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    await load();
  };
  const remove = async (r: PostSendRule) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    const { error } = await (supabase as any).from("code_of_conduct_automation_rules").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    try { await (supabase as any).from("code_of_conduct_events").insert({ event_type: "coc_post_send_rule_deleted", metadata: { rule_id: r.id, name: r.name } }); } catch { /* ignore */ }
    toast.success("Rule deleted"); await load();
  };
  const duplicate = (r: PostSendRule) => {
    const { id, ...rest } = r as any;
    setWizard({ open: true, initial: { ...rest, name: `${r.name} (copy)` } });
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-3 pt-6 border-t border-line">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[14px] font-semibold">What happens after email is sent?</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">When a Code of Conduct email is successfully sent, automatically move the linked CRM lead to a destination stage.</div>
        </div>
        <button onClick={() => setWizard({ open: true, initial: null })} className="ipc-btn ipc-btn-black">+ Add post-send rule</button>
      </div>

      {loading ? (
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="bg-white border border-dashed border-line rounded-xl p-6 text-center text-[12px] text-muted-foreground">No post-send rules yet.</div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => {
            const destPipe = pipelines.find((p) => p.id === r.destination_pipeline_id);
            const destStage = stages.find((s) => s.id === r.destination_stage_id);
            const tpl = templates.find((t) => t.id === (r.template_id || ""));
            return (
              <RuleCard
                key={r.id}
                title={r.name}
                chips={[
                  { label: r.source_type === "both" ? "Both" : r.source_type === "crm" ? "Calling CRM" : "Paid linked CRM", tone: "slate" },
                  { label: r.allow_repeat ? "Repeat on resend" : "Once", tone: r.allow_repeat ? "violet" : "blue" },
                ]}
                summary={
                  <>
                    When CoC email is sent{tpl ? <> for <span className="font-medium">{tpl.name} v{tpl.version}</span></> : " for any template"}, move linked CRM lead to <span className="font-medium">{destPipe?.name || "—"} → {destStage?.name || "—"}</span>.
                  </>
                }
                active={r.is_active}
                onToggleActive={() => toggleActive(r)}
                actions={[
                  { label: "Edit", onClick: () => setWizard({ open: true, initial: r }) },
                  { label: "Duplicate", onClick: () => duplicate(r) },
                  ...(onTest ? [{ label: "Test rule", onClick: () => onTest(r) }] : []),
                  { label: r.is_active ? "Disable" : "Enable", onClick: () => toggleActive(r) },
                  { label: "Delete", onClick: () => remove(r), destructive: true },
                ]}
              />
            );
          })}
        </div>
      )}

      {wizard.open && (
        <PostSendWizard
          open={wizard.open}
          onClose={() => setWizard({ open: false, initial: null })}
          onSaved={load}
          initial={wizard.initial}
          pipelines={pipelines}
          stages={stages}
          templates={templates}
        />
      )}
    </div>
  );
}
