import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  loadEmailVariants, renderPreview, validateVariant, conditionLabel,
  type CocEmailVariant,
} from "@/lib/cocCompletionTiming";

const ORDER = ["completed_within_1_day", "completed_after_1_day"];

const PREVIEW_VARS: Record<string, string> = {
  member_name: "Aarav Sharma",
  program_name: "IPC Diamond Membership",
  signing_link: "https://ipccontrolcenter.lovable.app/code-of-conduct-guide/<secure-link>",
  expiry_days: "7",
  expiry_date: new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
  company_name: "India Photographers' Club",
  support_email: "support@indiaphotographersclub.com",
  completion_time: "Same day",
  completion_condition: "Completed Within 1 Day",
};

const VARIABLES = Object.keys(PREVIEW_VARS);

export default function CodeOfConductEmailVariantsTab() {
  const [rows, setRows] = useState<CocEmailVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const v = await loadEmailVariants();
      setRows(v.sort((a, b) => ORDER.indexOf(a.condition_key) - ORDER.indexOf(b.condition_key)));
    } catch (e: any) {
      toast.error("Could not load email templates", { description: e?.message });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const patch = (id: string, p: Partial<CocEmailVariant>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const save = async (row: CocEmailVariant) => {
    const issue = validateVariant({ ...row, is_active: true });
    if (issue) { toast.error(issue.message); return; }
    setSavingKey(row.id);
    try {
      const { error } = await (supabase as any)
        .from("code_of_conduct_email_variants")
        .update({
          subject: row.subject.trim(),
          html_body: row.html_body,
          text_body: row.text_body,
          is_active: row.is_active,
          version: (row.version || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(`${row.condition_name} saved`, { description: "Already-sent requests keep their original email snapshot." });
      await load();
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message });
    } finally { setSavingKey(null); }
  };

  if (loading) return <div className="text-[12.5px] text-muted-foreground">Loading templates…</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-slate-50 p-3 text-[11.5px] text-slate-600">
        The first Code of Conduct email is chosen by completion time: <b>Same day or 1 day</b> uses “Completed Within 1 Day”,
        <b> 2 days or more</b> uses “Completed After 1 Day”. Both templates must contain <code>{"{{signing_link}}"}</code>.
        Editing a template never changes emails already sent.
      </div>

      {rows.length === 0 && (
        <div className="text-[12.5px] text-rose-700">No email variants found. Contact support — the default templates are missing.</div>
      )}

      {rows.map((row) => {
        const issue = validateVariant({ ...row, is_active: true });
        return (
          <div key={row.id} className="rounded-xl border border-line bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[14px] font-semibold">{row.condition_name || conditionLabel(row.condition_key)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {row.condition_key} · v{row.version}{row.updated_at ? ` · updated ${new Date(row.updated_at).toLocaleString()}` : ""}
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-[12px]">
                <input type="checkbox" checked={row.is_active} onChange={(e) => patch(row.id, { is_active: e.target.checked })} />
                Active
              </label>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Subject</label>
              <input value={row.subject || ""} onChange={(e) => patch(row.id, { subject: e.target.value })}
                className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-[12.5px]" />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Email body</label>
              <textarea value={row.html_body || ""} onChange={(e) => patch(row.id, { html_body: e.target.value })} rows={10}
                className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-[12.5px] font-mono" />
              <div className="text-[11px] text-muted-foreground mt-1">
                Variables: {VARIABLES.map((v) => `{{${v}}}`).join(" · ")}
              </div>
            </div>

            {issue && <div className="text-[11.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{issue.message}</div>}

            {previewKey === row.id && (
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-slate-200 bg-slate-50 text-[11.5px]">
                  <span className="text-slate-500">Subject: </span>
                  <span className="font-medium">{renderPreview(row.subject || "", PREVIEW_VARS)}</span>
                </div>
                <pre className="p-2.5 text-[11.5px] whitespace-pre-wrap font-sans text-slate-700 max-h-72 overflow-y-auto">
                  {renderPreview(row.html_body || "", PREVIEW_VARS)}
                </pre>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setPreviewKey(previewKey === row.id ? null : row.id)} className="ipc-btn ipc-btn-ghost">
                {previewKey === row.id ? "Hide Preview" : "Preview"}
              </button>
              <button onClick={() => void save(row)} disabled={savingKey === row.id || !!issue} className="ipc-btn ipc-btn-black disabled:opacity-50">
                {savingKey === row.id ? "Saving…" : "Save Template"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
