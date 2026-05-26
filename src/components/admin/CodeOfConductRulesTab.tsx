import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { evaluateStageTrigger } from "@/lib/codeOfConductRules";

interface Pipeline { id: string; name: string; type: string }
interface Stage { id: string; name: string; pipeline_id: string; is_active?: boolean; position: number }
interface Template { id: string; name: string; version: string }
interface Tag { id: string; name: string; color: string | null }

interface Rule {
  id: string;
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

const SIGNED_TAG_NAME = "Code of Conduct Signed";
const normPhone = (v?: string | null) => (v || "").replace(/\D/g, "");

export default function CodeOfConductRulesTab() {
  const { profile, isAdmin } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: p }, { data: s }, { data: t }, { data: tg }] = await Promise.all([
      (supabase as any).from("code_of_conduct_rules").select("*").order("created_at", { ascending: false }),
      supabase.from("pipelines").select("id,name,type").order("position", { ascending: true }),
      supabase.from("stages").select("id,name,pipeline_id,is_active,position").order("position", { ascending: true }),
      (supabase as any).from("code_of_conduct_templates").select("id,name,version").eq("is_active", true).order("created_at", { ascending: false }),
      supabase.from("tags").select("id,name,color").eq("is_deleted", false).eq("is_active", true).order("name"),
    ]);
    setRules((r || []) as Rule[]);
    setPipelines((p || []) as Pipeline[]);
    setStages((s || []) as Stage[]);
    setTemplates((t || []) as Template[]);
    setTags((tg || []) as Tag[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const ensureSignedTag = async (): Promise<string | null> => {
    const existing = tags.find((tg) => tg.name.toLowerCase() === SIGNED_TAG_NAME.toLowerCase());
    if (existing) return existing.id;
    const { data, error } = await supabase.from("tags").insert({
      name: SIGNED_TAG_NAME, color: "#16A34A", module_scope: "all", created_by: profile?.id || null,
    } as any).select("id,name,color").maybeSingle();
    if (error) { toast.error(`Could not create tag: ${error.message}`); return null; }
    if (data) setTags((prev) => [...prev, data as Tag]);
    return data?.id || null;
  };

  const startNew = () => {
    setEditing({
      name: "",
      source: "crm",
      pipeline_id: "",
      stage_id: "",
      template_id: templates[0]?.id || "",
      mode: "suggest_only",
      link_expiry_days: 7,
      tag_id_after_signed: null,
      stage_id_after_signed: null,
      notify_admin: true,
      notify_owner: true,
      is_active: true,
    });
  };

  const saveRule = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error("Rule name is required"); return; }
    if (!editing.pipeline_id) { toast.error("Pipeline is required"); return; }
    if (!editing.stage_id) { toast.error("Stage is required"); return; }
    if (!editing.template_id) { toast.error("Template is required"); return; }
    setSaving(true);
    try {
      // Auto-create signed tag if user wants it but didn't pick one
      let tagId = editing.tag_id_after_signed;
      if (tagId === "__create_signed__") tagId = await ensureSignedTag();

      const payload: any = {
        name: editing.name.trim(),
        source: editing.source,
        pipeline_id: editing.pipeline_id,
        stage_id: editing.stage_id,
        template_id: editing.template_id,
        mode: editing.mode,
        link_expiry_days: editing.link_expiry_days || 7,
        tag_id_after_signed: tagId || null,
        stage_id_after_signed: editing.stage_id_after_signed || null,
        notify_admin: !!editing.notify_admin,
        notify_owner: !!editing.notify_owner,
        is_active: editing.is_active !== false,
      };

      let savedId = (editing as any).id;
      if (savedId) {
        const { error } = await (supabase as any).from("code_of_conduct_rules").update(payload).eq("id", savedId);
        if (error) throw error;
        toast.success("Rule updated");
      } else {
        payload.created_by = profile?.id || null;
        const { data, error } = await (supabase as any).from("code_of_conduct_rules").insert(payload).select("id").maybeSingle();
        if (error) throw error;
        savedId = data?.id;
        toast.success("Rule created");
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not save rule");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rule: Rule) => {
    const { error } = await (supabase as any).from("code_of_conduct_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    if (error) { toast.error(error.message); return; }
    await load();
  };

  const deleteRule = async (rule: Rule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    const { error } = await (supabase as any).from("code_of_conduct_rules").delete().eq("id", rule.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Rule deleted");
    await load();
  };

  /** Apply rule to leads already in the trigger stage. Dry-run preview, then confirm. */
  const runBackfill = async (rule: Rule) => {
    try {
      // 1) Find candidate leads in the trigger CRM stage, then attach paid links by id/email/phone.
      let candidates: Array<{
        crm_lead_id: string; paid_pipeline_lead_id: string | null; link_status: "proper" | "email_phone" | "none";
        name: string; email: string | null; phone: string | null;
      }> = [];
      const { data: crmLeads, error: crmErr } = await supabase
        .from("leads")
        .select("id, full_name, email, phone, paid_pipeline_lead_id")
        .eq("stage_id", rule.stage_id)
        .eq("pipeline_id", rule.pipeline_id)
        .is("archived_at", null)
        .is("deleted_at", null);
      if (crmErr) throw crmErr;
      const crmIds = (crmLeads || []).map((l: any) => l.id);
      const emails = Array.from(new Set((crmLeads || []).map((l: any) => (l.email || "").toLowerCase()).filter(Boolean)));
      const { data: paidRows, error: paidErr } = rule.source === "paid_pipeline"
        ? await supabase.from("paid_pipeline_leads").select("id, name, email, phone, crm_lead_id").is("archived_at", null)
        : { data: [] as any[], error: null } as any;
      if (paidErr) throw paidErr;
      const paidByCrm = new Map((paidRows || []).filter((p: any) => p.crm_lead_id).map((p: any) => [p.crm_lead_id, p]));
      const paidByEmail = new Map((paidRows || []).filter((p: any) => p.email).map((p: any) => [String(p.email).toLowerCase(), p]));
      const paidByPhone = new Map((paidRows || []).filter((p: any) => normPhone(p.phone)).map((p: any) => [normPhone(p.phone), p]));
      candidates = (crmLeads || []).map((l: any) => {
        if (rule.source === "crm") return { crm_lead_id: l.id, paid_pipeline_lead_id: l.paid_pipeline_lead_id || null, link_status: l.paid_pipeline_lead_id ? "proper" : "none", name: l.full_name || "Member", email: l.email || null, phone: l.phone || null };
        let p: any = paidByCrm.get(l.id);
        let link_status: "proper" | "email_phone" | "none" = p ? "proper" : "none";
        if (!p && l.email) { p = paidByEmail.get(String(l.email).toLowerCase()); if (p) link_status = "email_phone"; }
        if (!p && normPhone(l.phone)) { p = paidByPhone.get(normPhone(l.phone)); if (p) link_status = "email_phone"; }
        return { crm_lead_id: l.id, paid_pipeline_lead_id: p?.id || null, link_status, name: p?.name || l.full_name || "Member", email: p?.email || l.email || null, phone: p?.phone || l.phone || null };
      });

      // 2) Classify against existing requests
      const ids = candidates.map((c) => rule.source === "crm" ? c.crm_lead_id : c.paid_pipeline_lead_id!).filter(Boolean);
      const { data: existing } = ids.length > 0
        ? await (supabase as any).from("code_of_conduct_requests")
            .select("id,status,crm_lead_id,paid_pipeline_lead_id,template_id")
            .eq("template_id", rule.template_id)
            .or(rule.source === "crm" ? `crm_lead_id.in.(${ids.join(",")})` : `paid_pipeline_lead_id.in.(${ids.join(",")})`)
        : { data: [] as any[] };
      const existingByLead = new Map<string, any[]>();
      for (const r of (existing || []) as any[]) {
        const k = rule.source === "crm" ? r.crm_lead_id : r.paid_pipeline_lead_id;
        if (!k) continue;
        existingByLead.set(k, [...(existingByLead.get(k) || []), r]);
      }

      let willSend = 0, alreadySent = 0, alreadySigned = 0, missingEmail = 0, alreadyActive = 0, properLinks = 0, repairedLinks = 0, missingLinks = 0;
      const queue: typeof candidates = [];
      for (const c of candidates) {
        if (c.link_status === "proper") properLinks++;
        else if (c.link_status === "email_phone") repairedLinks++;
        else missingLinks++;
        const k = (rule.source === "crm" ? c.crm_lead_id : c.paid_pipeline_lead_id) as string;
        if (rule.source === "paid_pipeline" && !c.paid_pipeline_lead_id) continue;
        const reqs = existingByLead.get(k) || [];
        if (reqs.some((r) => r.status === "signed")) { alreadySigned++; continue; }
        if (reqs.some((r) => ["sent", "viewed", "ready_to_send"].includes(r.status))) { alreadySent++; continue; }
        if (reqs.some((r) => ["draft"].includes(r.status))) { alreadyActive++; continue; }
        if (rule.mode === "auto_send" && (!c.email || !c.email.includes("@"))) { missingEmail++; continue; }
        willSend++; queue.push(c);
      }

      const summary =
        `Rule: ${rule.name}\n` +
        `Mode: ${rule.mode}\n\n` +
        `Candidates in trigger stage: ${candidates.length}\n` +
        `• Proper CRM/Paid links: ${properLinks}\n` +
        `• Missing link but matched by email/phone: ${repairedLinks}\n` +
        `• Missing paid link: ${missingLinks}\n` +
        `• Already signed: ${alreadySigned}\n` +
        `• Already sent/viewed/active: ${alreadySent + alreadyActive}\n` +
        `• Missing email (auto-send): ${missingEmail}\n` +
        `• Will ${rule.mode === "auto_send" ? "auto-send" : "mark required"}: ${willSend}\n\n` +
        `Proceed?`;
      if (queue.length === 0) { toast.message("Nothing to do", { description: summary }); return; }
      if (!confirm(summary)) return;

      // 3) Process (throttled, max 25 per batch to avoid email storms)
      const batch = queue.slice(0, 25);
      let sent = 0, failed = 0;
      for (const c of batch) {
        try {
          if (rule.source === "paid_pipeline" && c.link_status === "email_phone" && c.paid_pipeline_lead_id) {
            await supabase.from("paid_pipeline_leads").update({ crm_lead_id: c.crm_lead_id } as any).eq("id", c.paid_pipeline_lead_id);
            await supabase.from("leads").update({ paid_pipeline_lead_id: c.paid_pipeline_lead_id } as any).eq("id", c.crm_lead_id);
          }
          const res = await evaluateStageTrigger({
            source: rule.source,
            pipelineId: rule.pipeline_id,
            stageId: rule.stage_id,
            crmLeadId: c.crm_lead_id || null,
            paidPipelineLeadId: c.paid_pipeline_lead_id || null,
            memberName: c.name, memberEmail: c.email, memberPhone: c.phone,
          });
          if (res.action === "auto_sent" || res.action === "suggested") sent++;
          else if (res.action === "auto_send_failed") failed++;
        } catch { failed++; }
        await new Promise((r) => setTimeout(r, 250));
      }
      toast.success(`Backfill complete`, {
        description: `Processed ${batch.length}/${queue.length}. ${rule.mode === "auto_send" ? "Sent" : "Marked"}: ${sent} · Failed: ${failed}${queue.length > 25 ? ` · ${queue.length - 25} queued for next batch (re-run to continue)` : ""}`,
      });
    } catch (e: any) {
      toast.error(e?.message || "Backfill failed");
    }
  };

  if (!isAdmin) return <div className="text-[12.5px] text-muted-foreground">Admin only.</div>;
  if (loading) return <div className="text-[12.5px] text-muted-foreground">Loading…</div>;

  const editPipelineStages = editing?.pipeline_id ? stages.filter((s) => s.pipeline_id === editing.pipeline_id) : [];
  const editTargetStages = editing?.pipeline_id ? stages.filter((s) => s.pipeline_id === editing.pipeline_id) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold">Stage Trigger Rules</div>
          <div className="text-[11.5px] text-muted-foreground">When a lead reaches the trigger stage, suggest or auto-send the Code of Conduct email.</div>
        </div>
        {!editing && (
          <button onClick={startNew} disabled={templates.length === 0} className="ipc-btn ipc-btn-black disabled:opacity-50" title={templates.length === 0 ? "Create a template first" : undefined}>+ Add rule</button>
        )}
      </div>

      {templates.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 text-[12px]">
          You must create an active Code of Conduct template before adding rules. Open the Template tab.
        </div>
      )}

      {editing && (
        <div className="bg-white border border-line rounded-xl p-5 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Rule name">
              <input className="ipc-input" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Diamond — Token Collected" />
            </Field>
            <Field label="Source">
              <select className="ipc-input" value={editing.source} onChange={(e) => setEditing({ ...editing, source: e.target.value as any, pipeline_id: "", stage_id: "", stage_id_after_signed: null })}>
                <option value="crm">Calling CRM stage</option>
                <option value="paid_pipeline">Paid Pipeline (linked CRM stage)</option>
              </select>
            </Field>
            <Field label="Pipeline">
              <select className="ipc-input" value={editing.pipeline_id || ""} onChange={(e) => setEditing({ ...editing, pipeline_id: e.target.value, stage_id: "", stage_id_after_signed: null })}>
                <option value="">— Select pipeline —</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
              </select>
            </Field>
            <Field label="Trigger stage">
              <select className="ipc-input" value={editing.stage_id || ""} onChange={(e) => setEditing({ ...editing, stage_id: e.target.value })} disabled={!editing.pipeline_id}>
                <option value="">— Select stage —</option>
                {editPipelineStages.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active === false ? " (inactive)" : ""}</option>)}
              </select>
            </Field>
            <Field label="Template">
              <select className="ipc-input" value={editing.template_id || ""} onChange={(e) => setEditing({ ...editing, template_id: e.target.value })}>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} v{t.version}</option>)}
              </select>
            </Field>
            <Field label="Mode">
              <select className="ipc-input" value={editing.mode} onChange={(e) => setEditing({ ...editing, mode: e.target.value as any })}>
                <option value="suggest_only">Suggest only — agent must click Send</option>
                <option value="auto_send">Auto-send — email goes out automatically (once)</option>
              </select>
            </Field>
            <Field label="Link expiry (days)">
              <input type="number" min={1} max={60} className="ipc-input" value={editing.link_expiry_days || 7} onChange={(e) => setEditing({ ...editing, link_expiry_days: Number(e.target.value) || 7 })} />
            </Field>
            <Field label="Apply tag after signed">
              <select className="ipc-input" value={editing.tag_id_after_signed || ""} onChange={(e) => setEditing({ ...editing, tag_id_after_signed: e.target.value || null })}>
                <option value="">— No tag —</option>
                <option value="__create_signed__">+ Create & use "Code of Conduct Signed"</option>
                {tags.map((tg) => <option key={tg.id} value={tg.id}>{tg.name}</option>)}
              </select>
            </Field>
            <Field label="Move to stage after signed (optional)">
              <select className="ipc-input" value={editing.stage_id_after_signed || ""} onChange={(e) => setEditing({ ...editing, stage_id_after_signed: e.target.value || null })} disabled={!editing.pipeline_id}>
                <option value="">— No move —</option>
                {editTargetStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex items-center gap-4 text-[12.5px] flex-wrap">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!editing.notify_admin} onChange={(e) => setEditing({ ...editing, notify_admin: e.target.checked })} /> Notify admin on signed</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!editing.notify_owner} onChange={(e) => setEditing({ ...editing, notify_owner: e.target.checked })} /> Notify assigned owner on signed</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.is_active !== false} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Rule active</label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(null)} className="ipc-btn ipc-btn-ghost" disabled={saving}>Cancel</button>
            <button onClick={saveRule} className="ipc-btn ipc-btn-black" disabled={saving}>{saving ? "Saving…" : "Save rule"}</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-line rounded-xl overflow-hidden">
        {rules.length === 0 && !editing && (
          <div className="p-6 text-center text-[12.5px] text-muted-foreground">No rules yet. Click "Add rule" to create one.</div>
        )}
        {rules.length > 0 && (
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Rule</th><th className="text-left p-3">Source</th><th className="text-left p-3">Trigger</th><th className="text-left p-3">Template</th><th className="text-left p-3">Mode</th><th className="text-left p-3">After signed</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const pipe = pipelines.find((p) => p.id === r.pipeline_id);
                const stage = stages.find((s) => s.id === r.stage_id);
                const tpl = templates.find((t) => t.id === r.template_id);
                const moveStage = stages.find((s) => s.id === (r.stage_id_after_signed || ""));
                const tag = tags.find((t) => t.id === (r.tag_id_after_signed || ""));
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3">{r.source === "crm" ? "Calling CRM" : "Paid Pipeline (CRM)"}</td>
                    <td className="p-3">{pipe?.name || "—"} → <span className="font-medium">{stage?.name || "—"}</span></td>
                    <td className="p-3">{tpl ? `${tpl.name} v${tpl.version}` : "—"}</td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10.5px] border ${r.mode === "auto_send" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{r.mode === "auto_send" ? "Auto-send" : "Suggest"}</span>
                    </td>
                    <td className="p-3 text-[11.5px] text-muted-foreground">
                      {tag && <div>Tag: {tag.name}</div>}
                      {moveStage && <div>→ {moveStage.name}</div>}
                      {!tag && !moveStage && <span>—</span>}
                    </td>
                    <td className="p-3">
                      <button onClick={() => toggleActive(r)} className={`text-[11px] px-2 py-0.5 rounded border ${r.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>{r.is_active ? "Active" : "Inactive"}</button>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button onClick={() => runBackfill(r)} disabled={!r.is_active} className="text-[11.5px] underline mr-3 disabled:opacity-40" title="Apply this rule to leads already in the trigger stage">Run on existing</button>
                      <button onClick={() => setEditing(r)} className="text-[11.5px] underline mr-3">Edit</button>
                      <button onClick={() => deleteRule(r)} className="text-[11.5px] text-rose-600">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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
