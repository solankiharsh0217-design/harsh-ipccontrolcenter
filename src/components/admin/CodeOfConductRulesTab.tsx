import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import RuleCard from "./coc/RuleCard";
import StageTriggerWizard, { type Pipeline, type Stage, type Template, type StageTriggerRule } from "./coc/StageTriggerWizard";
import AfterSignedWizard from "./coc/AfterSignedWizard";
import PostSendAutomationRulesSection from "./PostSendAutomationRulesSection";
import RuleTestModal from "./coc/RuleTestModal";

interface Tag { id: string; name: string; color: string | null }

type LastRunMap = Record<string, { status: string; created_at: string }>;

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatLastRun(last: { status: string; created_at: string } | undefined): string | null {
  if (!last) return null;
  const label = last.status === "applied" ? "Applied" : last.status === "skipped" ? "Skipped" : last.status === "failed" ? "Failed" : last.status;
  return `${label} · ${relTime(last.created_at)}`;
}

export default function CodeOfConductRulesTab() {
  const { isAdmin } = useAuth();
  const [rules, setRules] = useState<StageTriggerRule[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [lastRunMap, setLastRunMap] = useState<LastRunMap>({});
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState<{ open: boolean; initial: Partial<StageTriggerRule> | null }>({ open: false, initial: null });
  const [signedWizard, setSignedWizard] = useState<{ open: boolean; initial: Partial<StageTriggerRule> | null }>({ open: false, initial: null });
  const [testing, setTesting] = useState<{ kind: "trigger" | "post_send"; rule: any } | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: p }, { data: s }, { data: t }, { data: tg }, { data: ev }] = await Promise.all([
      (supabase as any).from("code_of_conduct_rules").select("*").order("created_at", { ascending: false }),
      supabase.from("pipelines").select("id,name,type").order("position", { ascending: true }),
      supabase.from("stages").select("id,name,pipeline_id,is_active,position").order("position", { ascending: true }),
      (supabase as any).from("code_of_conduct_templates").select("id,name,version").eq("is_active", true).order("created_at", { ascending: false }),
      supabase.from("tags").select("id,name,color").eq("is_deleted", false).eq("is_active", true).order("name"),
      (supabase as any).from("code_of_conduct_automation_events").select("rule_id,status,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    setRules((r || []) as StageTriggerRule[]);
    setPipelines((p || []) as Pipeline[]);
    setStages((s || []) as Stage[]);
    setTemplates((t || []) as Template[]);
    setTags((tg || []) as Tag[]);
    const m: LastRunMap = {};
    for (const row of (ev || []) as any[]) {
      if (!row?.rule_id) continue;
      if (!m[row.rule_id]) m[row.rule_id] = { status: row.status, created_at: row.created_at };
    }
    setLastRunMap(m);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const tagNameById = (id: string | null) => (id ? tags.find((t) => t.id === id)?.name || null : null);

  const toggleActive = async (r: StageTriggerRule) => {
    const { error } = await (supabase as any).from("code_of_conduct_rules").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    await load();
  };
  const remove = async (r: StageTriggerRule) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    const { error } = await (supabase as any).from("code_of_conduct_rules").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    try { await (supabase as any).from("code_of_conduct_events").insert({ event_type: "coc_trigger_rule_deleted", metadata: { rule_id: r.id, name: r.name } }); } catch { /* ignore */ }
    toast.success("Rule deleted"); await load();
  };
  const duplicate = (r: StageTriggerRule) => {
    const { id, ...rest } = r as any;
    setWizard({ open: true, initial: { ...rest, name: `${r.name} (copy)` } });
  };

  const sections = useMemo(() => ({
    triggers: rules,
    afterSigned: rules.filter((r) => r.tag_id_after_signed || r.stage_id_after_signed || r.notify_admin || r.notify_owner),
  }), [rules]);

  if (!isAdmin) return <div className="text-[12.5px] text-muted-foreground">Admin only.</div>;
  if (loading) return <div className="text-[12.5px] text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-8">
      {/* Section 1: stage triggers */}
      <Section
        title="When should Code of Conduct be sent?"
        description="Define which CRM or Paid Pipeline stage triggers a Code of Conduct email — suggested or auto-sent."
        actionLabel="+ Add trigger rule"
        actionDisabled={templates.length === 0}
        actionHint={templates.length === 0 ? "Create a template first" : undefined}
        onAction={() => setWizard({ open: true, initial: null })}
      >
        {templates.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 text-[12px]">
            You must create an active Code of Conduct template before adding rules.
          </div>
        )}
        {sections.triggers.length === 0 ? (
          <Empty message="No trigger rules yet." />
        ) : (
          <div className="space-y-3">
            {sections.triggers.map((r) => {
              const pipe = pipelines.find((p) => p.id === r.pipeline_id);
              const stage = stages.find((s) => s.id === r.stage_id);
              const tpl = templates.find((t) => t.id === r.template_id);
              return (
                <RuleCard
                  key={r.id}
                  title={r.name}
                  chips={[
                    { label: r.source === "crm" ? "Calling CRM" : "Paid Pipeline", tone: "slate" },
                    { label: r.mode === "auto_send" ? "Auto-send" : "Suggest", tone: r.mode === "auto_send" ? "violet" : "blue" },
                  ]}
                  summary={
                    <>
                      When lead reaches <span className="font-medium">{pipe?.name || "—"} → {stage?.name || "—"}</span>, {r.mode === "auto_send" ? "auto-send" : "suggest"} <span className="font-medium">{tpl ? `${tpl.name} v${tpl.version}` : "—"}</span>.
                    </>
                  }
                  active={r.is_active}
                  onToggleActive={() => toggleActive(r)}
                  lastRun={formatLastRun(lastRunMap[r.id!])}
                  actions={[
                    { label: "Edit", onClick: () => setWizard({ open: true, initial: r }) },
                    { label: "Configure after-signed", onClick: () => setSignedWizard({ open: true, initial: r }) },
                    { label: "Duplicate", onClick: () => duplicate(r) },
                    { label: "Test rule", onClick: () => setTesting({ kind: "trigger", rule: r }) },
                    { label: r.is_active ? "Disable" : "Enable", onClick: () => toggleActive(r) },
                    { label: "Delete", onClick: () => remove(r), destructive: true },
                  ]}
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* Section 2: after signed — dedicated wizard */}
      <Section
        title="What happens after member signs?"
        description="Configure tag, stage move, and notifications that fire after a member signs the Code of Conduct."
        actionLabel="+ Configure after-signed"
        actionDisabled={rules.length === 0}
        actionHint={rules.length === 0 ? "Create a trigger rule first" : undefined}
        onAction={() => setSignedWizard({ open: true, initial: null })}
      >
        {sections.afterSigned.length === 0 ? (
          <Empty message="No after-signed actions configured yet." />
        ) : (
          <div className="space-y-3">
            {sections.afterSigned.map((r) => {
              const moveStage = stages.find((s) => s.id === (r.stage_id_after_signed || ""));
              return (
                <RuleCard
                  key={`signed-${r.id}`}
                  title={r.name}
                  summary={
                    <>
                      After signed: {r.tag_id_after_signed && <>apply tag <span className="font-medium">{tagNameById(r.tag_id_after_signed) || "—"}</span></>}
                      {r.tag_id_after_signed && r.stage_id_after_signed && " and "}
                      {r.stage_id_after_signed && <>move to <span className="font-medium">{moveStage?.name || "—"}</span></>}
                      {(r.notify_admin || r.notify_owner) && <> · Notify {[r.notify_admin && "admin", r.notify_owner && "owner"].filter(Boolean).join(" + ")}</>}
                    </>
                  }
                  active={r.is_active}
                  onToggleActive={() => toggleActive(r)}
                  lastRun={formatLastRun(lastRunMap[r.id!])}
                  actions={[
                    { label: "Edit after-signed", onClick: () => setSignedWizard({ open: true, initial: r }) },
                    { label: "Edit trigger rule", onClick: () => setWizard({ open: true, initial: r }) },
                  ]}
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* Section 3: post-send */}
      <PostSendAutomationRulesSection pipelines={pipelines} stages={stages} templates={templates} lastRunMap={lastRunMap} formatLastRun={formatLastRun} onTest={(rule) => setTesting({ kind: "post_send", rule })} />

      {wizard.open && (
        <StageTriggerWizard
          open={wizard.open}
          onClose={() => setWizard({ open: false, initial: null })}
          onSaved={load}
          initial={wizard.initial}
          pipelines={pipelines}
          stages={stages}
          templates={templates}
          tagNameById={tagNameById}
        />
      )}
      {signedWizard.open && (
        <AfterSignedWizard
          open={signedWizard.open}
          onClose={() => setSignedWizard({ open: false, initial: null })}
          onSaved={load}
          initial={signedWizard.initial}
          rules={rules}
          pipelines={pipelines}
          stages={stages}
          tagNameById={tagNameById}
        />
      )}
      {testing && (
        <RuleTestModal open={!!testing} onClose={() => setTesting(null)} kind={testing.kind} rule={testing.rule} />
      )}
    </div>
  );
}

function Section({ title, description, actionLabel, onAction, actionDisabled, actionHint, children }: {
  title: string; description: string; actionLabel?: string; onAction?: () => void; actionDisabled?: boolean; actionHint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[14px] font-semibold">{title}</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">{description}</div>
        </div>
        {actionLabel && onAction && (
          <button onClick={onAction} disabled={actionDisabled} title={actionHint} className="ipc-btn ipc-btn-black disabled:opacity-50">{actionLabel}</button>
        )}
      </div>
      {children}
    </div>
  );
}
function Empty({ message }: { message: string }) {
  return <div className="bg-white border border-dashed border-line rounded-xl p-6 text-center text-[12px] text-muted-foreground">{message}</div>;
}
