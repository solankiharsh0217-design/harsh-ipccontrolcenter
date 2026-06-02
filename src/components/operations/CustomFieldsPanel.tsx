import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  getTemplateFields, getCustomValues, setCustomValue,
  type TemplateField, type CustomValue,
} from "@/lib/operationsTemplates";

export default function CustomFieldsPanel({
  leadId, templateId,
}: { leadId: string; templateId: string | null }) {
  const { profile } = useAuth();
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [values, setValues] = useState<Map<string, CustomValue>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!templateId) { setFields([]); setValues(new Map()); setLoading(false); return; }
    setLoading(true);
    try {
      const [f, v] = await Promise.all([getTemplateFields(templateId), getCustomValues(leadId)]);
      setFields(f);
      setValues(new Map(v.map((x) => [x.field_id, x])));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [leadId, templateId]);

  const save = async (f: TemplateField, raw: any) => {
    try {
      await setCustomValue(leadId, f.id, f.field_type, raw, profile?.id ?? null);
      await load();
    } catch (e: any) { toast.error(e.message || "Failed"); }
  };

  if (!templateId) return null;
  if (loading) return <div className="text-[11px] text-muted-foreground">Loading fields…</div>;
  if (fields.length === 0) return <div className="text-[11px] text-muted-foreground">No custom fields for this template.</div>;

  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map((f) => {
        const v = values.get(f.id);
        const current =
          f.field_type === "number" ? (v?.value_number ?? "") :
          f.field_type === "date" ? (v?.value_date ?? "") :
          f.field_type === "checkbox" ? !!v?.value_bool :
          (v?.value_text ?? "");
        return (
          <div key={f.id} className={f.field_type === "textarea" ? "col-span-2" : ""}>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {f.label}{f.is_required && <span className="text-[#991B1B]"> *</span>}
            </label>
            {f.field_type === "textarea" ? (
              <textarea defaultValue={current as string} onBlur={(e) => save(f, e.target.value)}
                rows={2} className="ipc-input !text-xs w-full" />
            ) : f.field_type === "checkbox" ? (
              <input type="checkbox" checked={!!current} onChange={(e) => save(f, e.target.checked)} />
            ) : f.field_type === "dropdown" ? (
              <select defaultValue={current as string} onBlur={(e) => save(f, e.target.value)}
                onChange={(e) => save(f, e.target.value)} className="ipc-input !h-8 !text-xs w-full">
                <option value="">—</option>
                {(Array.isArray(f.options) ? f.options : []).map((o: any, i: number) => (
                  <option key={i} value={String(o)}>{String(o)}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : f.field_type === "link" ? "url" : "text"}
                defaultValue={current as string | number}
                onBlur={(e) => save(f, e.target.value)}
                className="ipc-input !h-8 !text-xs w-full"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
