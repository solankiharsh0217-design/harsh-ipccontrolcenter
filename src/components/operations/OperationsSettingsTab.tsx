import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listProcessTemplates, listCommunicationTemplates,
  type ProcessTemplate, type CommunicationTemplate,
} from "@/lib/operationsTemplates";
import ProcessTemplateEditor from "@/components/operations/ProcessTemplateEditor";
import CommunicationTemplateEditor from "@/components/operations/CommunicationTemplateEditor";
import { ensureOperationsPipeline } from "@/lib/operationsCrm";
import { getReadinessSettings, updateReadinessSettings, type ReadinessSettings } from "@/lib/operationsReadiness";
import type { Stage } from "@/lib/crmTypes";

export default function OperationsSettingsTab({ isAdmin }: { isAdmin: boolean }) {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [comms, setComms] = useState<CommunicationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTpl, setEditingTpl] = useState<ProcessTemplate | null>(null);
  const [creatingTpl, setCreatingTpl] = useState(false);
  const [editingComm, setEditingComm] = useState<CommunicationTemplate | null>(null);
  const [creatingComm, setCreatingComm] = useState(false);
  const [opsStages, setOpsStages] = useState<Stage[]>([]);
  const [readiness, setReadiness] = useState<ReadinessSettings>({
    operations_readiness_target_stage_id: null,
    operations_readiness_auto_move: false,
  });
  const [savingReadiness, setSavingReadiness] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [t, c, r] = await Promise.all([
        listProcessTemplates(false),
        listCommunicationTemplates(false),
        getReadinessSettings(),
      ]);
      setTemplates(t); setComms(c); setReadiness(r);
      try {
        const { pipelineId } = await ensureOperationsPipeline();
        const { data } = await supabase.from("stages").select("*").eq("pipeline_id", pipelineId).order("position");
        setOpsStages((data ?? []) as any);
      } catch { /* stages optional */ }
    } catch (e: any) { toast.error(e.message || "Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const saveReadiness = async (patch: Partial<ReadinessSettings>) => {
    setSavingReadiness(true);
    try {
      await updateReadinessSettings(patch);
      setReadiness((r) => ({ ...r, ...patch }));
      toast.success("Readiness settings saved");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSavingReadiness(false);
    }
  };

  if (!isAdmin) {
    return <div className="text-sm text-muted-foreground py-12 text-center">Only admins can edit Operations settings.</div>;
  }
  if (loading) return <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>;

  return (
    <div className="space-y-6">
      <section className="border border-line rounded-md p-4 bg-off/30">
        <div className="font-serif text-base text-black mb-1">Readiness completion</div>
        <div className="text-[11px] text-muted-foreground mb-3">
          When an operations lead's onboarding checklist reaches 100%, they can be moved to the next stage. Choose the target stage below. Enable auto-move only if you want the system to advance leads without a manual click.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Operations Readiness Target Stage</label>
            <select
              disabled={savingReadiness}
              value={readiness.operations_readiness_target_stage_id ?? ""}
              onChange={(e) => saveReadiness({ operations_readiness_target_stage_id: e.target.value || null })}
              className="ipc-input !h-9 !text-xs w-full mt-1"
            >
              <option value="">— Auto-detect (Active / In Progress / next stage) —</option>
              {opsStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="text-[10px] text-muted-foreground mt-1">
              If no stage is selected, the system uses the first stage whose name contains "Active" or "In Progress", or otherwise the next stage after the lead's current one.
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Auto-move</label>
            <div className="flex items-start gap-2 mt-1">
              <input
                id="ops-readiness-automove"
                type="checkbox"
                disabled={savingReadiness}
                checked={readiness.operations_readiness_auto_move}
                onChange={(e) => saveReadiness({ operations_readiness_auto_move: e.target.checked })}
                className="mt-0.5"
              />
              <label htmlFor="ops-readiness-automove" className="text-xs">
                Auto-move lead when readiness reaches 100%
                <div className="text-[10px] text-muted-foreground">
                  Off by default. When off, the drawer shows a Ready badge and a manual "Move to next stage" button. Never moves a lead backwards.
                </div>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="font-serif text-base text-black">Process Templates</div>
          <button onClick={() => setCreatingTpl(true)} className="ipc-btn ipc-btn-black !h-9 !text-xs"><Plus className="w-3.5 h-3.5" /> New template</button>
        </div>
        {templates.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No templates yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {templates.map((t) => (
              <div key={t.id} className="border border-line rounded p-3 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-serif text-sm">{t.name} {!t.is_active && <span className="text-[10px] text-muted-foreground">(inactive)</span>}</div>
                    {t.description && <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.description}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">{t.default_service_duration_days ?? "—"} days · {t.default_owner_rule}</div>
                  </div>
                  <button onClick={() => setEditingTpl(t)} className="text-muted-foreground hover:text-black"><Pencil className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="font-serif text-base text-black">Communication Templates</div>
          <button onClick={() => setCreatingComm(true)} className="ipc-btn ipc-btn-black !h-9 !text-xs"><Plus className="w-3.5 h-3.5" /> New message</button>
        </div>
        {comms.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No templates yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {comms.map((c) => (
              <div key={c.id} className="border border-line rounded p-3 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-serif text-sm">{c.name} <span className="text-[10px] text-muted-foreground">· {c.template_type}</span></div>
                    {c.subject && <div className="text-[11px] mt-0.5 truncate">{c.subject}</div>}
                    <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{c.body}</div>
                  </div>
                  <button onClick={() => setEditingComm(c)} className="text-muted-foreground hover:text-black"><Pencil className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {(editingTpl || creatingTpl) && (
        <ProcessTemplateEditor template={editingTpl} onClose={() => { setEditingTpl(null); setCreatingTpl(false); }} onSaved={() => { setEditingTpl(null); setCreatingTpl(false); load(); }} />
      )}
      {(editingComm || creatingComm) && (
        <CommunicationTemplateEditor template={editingComm} onClose={() => { setEditingComm(null); setCreatingComm(false); }} onSaved={() => { setEditingComm(null); setCreatingComm(false); load(); }} />
      )}
    </div>
  );
}
