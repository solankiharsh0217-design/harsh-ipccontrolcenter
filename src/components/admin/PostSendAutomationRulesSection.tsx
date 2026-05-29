import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

interface Pipeline { id: string; name: string; type: string }
interface Stage { id: string; name: string; pipeline_id: string; is_active?: boolean; position: number }
interface Template { id: string; name: string; version: string }

interface PostSendRule {
  id: string;
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

export default function PostSendAutomationRulesSection({
  pipelines, stages, templates,
}: { pipelines: Pipeline[]; stages: Stage[]; templates: Template[] }) {
  const { profile, isAdmin } = useAuth();
  const [rules, setRules] = useState<PostSendRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<PostSendRule> | null>(null);
  const [saving, setSaving] = useState(false);

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

  const startNew = () => setEditing({
    name: "",
    event_type: "email_sent",
    template_id: null,
    source_type: "both",
    current_pipeline_id: null,
    current_stage_id: null,
    destination_pipeline_id: "",
    destination_stage_id: "",
    also_update_paid_pipeline_stage: false,
    destination_paid_pipeline_stage: null,
    allow_repeat: false,
    is_active: true,
  });

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) return toast.error("Rule name is required");
    if (!editing.destination_pipeline_id) return toast.error("Destination pipeline required");
    if (!editing.destination_stage_id) return toast.error("Destination stage required");
    setSaving(true);
    try {
      const payload: any = {
        name: editing.name.trim(),
        event_type: "email_sent",
        template_id: editing.template_id || null,
        source_type: editing.source_type || "both",
        current_pipeline_id: editing.current_pipeline_id || null,
        current_stage_id: editing.current_stage_id || null,
        destination_pipeline_id: editing.destination_pipeline_id,
        destination_stage_id: editing.destination_stage_id,
        also_update_paid_pipeline_stage: !!editing.also_update_paid_pipeline_stage,
        destination_paid_pipeline_stage: editing.also_update_paid_pipeline_stage ? (editing.destination_paid_pipeline_stage || null) : null,
        allow_repeat: !!editing.allow_repeat,
        is_active: editing.is_active !== false,
        updated_by: profile?.id || null,
      };
      if ((editing as any).id) {
        const { error } = await (supabase as any).from("code_of_conduct_automation_rules").update(payload).eq("id", (editing as any).id);
        if (error) throw error;
        toast.success("Rule updated");
      } else {
        payload.created_by = profile?.id || null;
        const { error } = await (supabase as any).from("code_of_conduct_automation_rules").insert(payload);
        if (error) throw error;
        toast.success("Rule created");
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not save rule");
    } finally { setSaving(false); }
  };

  const toggleActive = async (r: PostSendRule) => {
    const { error } = await (supabase as any).from("code_of_conduct_automation_rules").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    await load();
  };
  const remove = async (r: PostSendRule) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    const { error } = await (supabase as any).from("code_of_conduct_automation_rules").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Rule deleted");
    await load();
  };

  if (!isAdmin) return null;

  const editCurrentStages = editing?.current_pipeline_id ? stages.filter((s) => s.pipeline_id === editing.current_pipeline_id) : [];
  const editDestStages = editing?.destination_pipeline_id ? stages.filter((s) => s.pipeline_id === editing.destination_pipeline_id) : [];

  return (
    <div className="space-y-4 pt-6 border-t border-line">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold">After Code of Conduct Email Sent</div>
          <div className="text-[11.5px] text-muted-foreground">When a CoC email is successfully sent, automatically move the linked CRM lead to a destination stage.</div>
        </div>
        {!editing && (
          <button onClick={startNew} className="ipc-btn ipc-btn-black">+ Add Post-Send Rule</button>
        )}
      </div>

      {editing && (
        <div className="bg-white border border-line rounded-xl p-5 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Rule name">
              <input className="ipc-input" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Move to CoC Sent" />
            </Field>
            <Field label="Source">
              <select className="ipc-input" value={editing.source_type} onChange={(e) => setEditing({ ...editing, source_type: e.target.value as any })}>
                <option value="both">Both Calling CRM and Paid Pipeline</option>
                <option value="crm">Calling CRM only</option>
                <option value="paid_pipeline">Paid Pipeline linked CRM only</option>
              </select>
            </Field>
            <Field label="Apply when template is">
              <select className="ipc-input" value={editing.template_id || ""} onChange={(e) => setEditing({ ...editing, template_id: e.target.value || null })}>
                <option value="">Any Code of Conduct template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} v{t.version}</option>)}
              </select>
            </Field>
            <Field label="Current stage condition">
              <select className="ipc-input" value={editing.current_pipeline_id || ""} onChange={(e) => setEditing({ ...editing, current_pipeline_id: e.target.value || null, current_stage_id: null })}>
                <option value="">Any pipeline / stage</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
              </select>
            </Field>
            <Field label="Only if currently in stage (optional)">
              <select className="ipc-input" value={editing.current_stage_id || ""} onChange={(e) => setEditing({ ...editing, current_stage_id: e.target.value || null })} disabled={!editing.current_pipeline_id}>
                <option value="">Any stage</option>
                {editCurrentStages.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active === false ? " (inactive)" : ""}</option>)}
              </select>
            </Field>
            <Field label="Destination CRM pipeline">
              <select className="ipc-input" value={editing.destination_pipeline_id || ""} onChange={(e) => setEditing({ ...editing, destination_pipeline_id: e.target.value, destination_stage_id: "" })}>
                <option value="">— Select pipeline —</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
              </select>
            </Field>
            <Field label="Destination CRM stage">
              <select className="ipc-input" value={editing.destination_stage_id || ""} onChange={(e) => setEditing({ ...editing, destination_stage_id: e.target.value })} disabled={!editing.destination_pipeline_id}>
                <option value="">— Select stage —</option>
                {editDestStages.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active === false ? " (inactive)" : ""}</option>)}
              </select>
            </Field>
            <Field label="Also update Paid Pipeline stage?">
              <select className="ipc-input" value={editing.also_update_paid_pipeline_stage ? "yes" : "no"} onChange={(e) => setEditing({ ...editing, also_update_paid_pipeline_stage: e.target.value === "yes" })}>
                <option value="no">No (default)</option>
                <option value="yes">Yes</option>
              </select>
            </Field>
            {editing.also_update_paid_pipeline_stage && (
              <Field label="Destination Paid Pipeline stage label">
                <input className="ipc-input" value={editing.destination_paid_pipeline_stage || ""} onChange={(e) => setEditing({ ...editing, destination_paid_pipeline_stage: e.target.value })} placeholder="e.g. Code of Conduct Sent" />
              </Field>
            )}
          </div>
          <div className="flex items-center gap-4 text-[12.5px] flex-wrap">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!editing.allow_repeat} onChange={(e) => setEditing({ ...editing, allow_repeat: e.target.checked })} /> Allow repeat movement on resend</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.is_active !== false} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Rule active</label>
          </div>
          {editing.destination_stage_id && (
            <div className="text-[11.5px] text-muted-foreground">
              Summary: When Code of Conduct email is sent, move lead to <span className="font-medium">{stages.find(s => s.id === editing.destination_stage_id)?.name || "—"}</span>
              {` in ${pipelines.find(p => p.id === editing.destination_pipeline_id)?.name || "—"}.`}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(null)} className="ipc-btn ipc-btn-ghost" disabled={saving}>Cancel</button>
            <button onClick={save} className="ipc-btn ipc-btn-black" disabled={saving}>{saving ? "Saving…" : "Save rule"}</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-line rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-[12.5px] text-muted-foreground">Loading…</div>
        ) : rules.length === 0 && !editing ? (
          <div className="p-6 text-center text-[12.5px] text-muted-foreground">No post-send rules yet.</div>
        ) : rules.length > 0 ? (
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Rule</th><th className="text-left p-3">Source</th><th className="text-left p-3">Template</th><th className="text-left p-3">Current condition</th><th className="text-left p-3">Move to</th><th className="text-left p-3">Repeat</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const destPipe = pipelines.find((p) => p.id === r.destination_pipeline_id);
                const destStage = stages.find((s) => s.id === r.destination_stage_id);
                const curPipe = pipelines.find((p) => p.id === (r.current_pipeline_id || ""));
                const curStage = stages.find((s) => s.id === (r.current_stage_id || ""));
                const tpl = templates.find((t) => t.id === (r.template_id || ""));
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3">{r.source_type === "both" ? "Both" : r.source_type === "crm" ? "Calling CRM" : "Paid Pipeline (CRM)"}</td>
                    <td className="p-3">{tpl ? `${tpl.name} v${tpl.version}` : "Any"}</td>
                    <td className="p-3">{curStage ? `${curPipe?.name || ""} → ${curStage.name}` : curPipe ? curPipe.name : "Any"}</td>
                    <td className="p-3">{destPipe?.name || "—"} → <span className="font-medium">{destStage?.name || "—"}</span></td>
                    <td className="p-3">{r.allow_repeat ? "Yes" : "No"}</td>
                    <td className="p-3">
                      <button onClick={() => toggleActive(r)} className={`text-[11px] px-2 py-0.5 rounded border ${r.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>{r.is_active ? "Active" : "Inactive"}</button>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(r)} className="text-[11.5px] underline mr-3">Edit</button>
                      <button onClick={() => remove(r)} className="text-[11.5px] text-rose-600">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
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
