import { useEffect, useState } from "react";
import { X as XIcon, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getChecklistItems, getTemplateFields,
  type ProcessTemplate, type ChecklistItem, type TemplateField, type FieldType,
} from "@/lib/operationsTemplates";

const FIELD_TYPES: FieldType[] = ["text", "number", "date", "dropdown", "checkbox", "link", "textarea"];

export default function ProcessTemplateEditor({
  template, onClose, onSaved,
}: { template: ProcessTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [desc, setDesc] = useState(template?.description ?? "");
  const [active, setActive] = useState(template?.is_active ?? true);
  const [duration, setDuration] = useState<number>(template?.default_service_duration_days ?? 30);
  const [ownerRule, setOwnerRule] = useState<"unassigned" | "single" | "round_robin">(template?.default_owner_rule ?? "unassigned");

  const [items, setItems] = useState<Partial<ChecklistItem>[]>([]);
  const [fields, setFields] = useState<Partial<TemplateField>[]>([]);

  useEffect(() => {
    if (template) {
      Promise.all([getChecklistItems(template.id), getTemplateFields(template.id)])
        .then(([ci, fl]) => { setItems(ci); setFields(fl); })
        .catch(() => {});
    }
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    try {
      let tplId = template?.id;
      if (!tplId) {
        const { data, error } = await supabase.from("operations_process_templates" as any).insert({
          name: name.trim(), description: desc.trim() || null, is_active: active,
          default_service_duration_days: duration, default_owner_rule: ownerRule,
        } as any).select("id").single();
        if (error) throw error;
        tplId = (data as any).id;
      } else {
        const { error } = await supabase.from("operations_process_templates" as any).update({
          name: name.trim(), description: desc.trim() || null, is_active: active,
          default_service_duration_days: duration, default_owner_rule: ownerRule,
        }).eq("id", tplId);
        if (error) throw error;
      }
      // Replace checklist (simplest correct approach for V1)
      await supabase.from("operations_template_checklist_items" as any).delete().eq("template_id", tplId);
      if (items.length) {
        const ins = items.filter((i) => (i.label ?? "").trim()).map((i, idx) => ({
          template_id: tplId, label: (i.label ?? "").trim(),
          is_required: i.is_required ?? true, sort_order: idx, is_active: true, note: i.note ?? null,
        }));
        if (ins.length) {
          const { error } = await supabase.from("operations_template_checklist_items" as any).insert(ins as any);
          if (error) throw error;
        }
      }
      // Replace fields
      await supabase.from("operations_template_fields" as any).delete().eq("template_id", tplId);
      if (fields.length) {
        const ins = fields.filter((f) => (f.label ?? "").trim() && (f.field_key ?? "").trim()).map((f, idx) => ({
          template_id: tplId,
          field_key: (f.field_key ?? "").trim(),
          label: (f.label ?? "").trim(),
          field_type: f.field_type ?? "text",
          options: f.options ?? null,
          is_required: f.is_required ?? false,
          sort_order: idx, is_active: true,
        }));
        if (ins.length) {
          const { error } = await supabase.from("operations_template_fields" as any).insert(ins as any);
          if (error) throw error;
        }
      }
      toast.success("Template saved");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  };

  const remove = async () => {
    if (!template) return;
    if (!confirm(`Delete template "${template.name}"? This will not delete leads, but their template link will be cleared.`)) return;
    const { error } = await supabase.from("operations_process_templates" as any).delete().eq("id", template.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div className="font-serif text-lg">{template ? "Edit" : "New"} Process Template</div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-off flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label>Name *</Label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="ipc-input !h-9 !text-xs w-full" />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="ipc-input !text-xs w-full" />
            </div>
            <div>
              <Label>Default duration (days)</Label>
              <input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="ipc-input !h-9 !text-xs w-full" />
            </div>
            <div>
              <Label>Default owner rule</Label>
              <select value={ownerRule} onChange={(e) => setOwnerRule(e.target.value as any)} className="ipc-input !h-9 !text-xs w-full">
                <option value="unassigned">Unassigned</option>
                <option value="single">Single owner</option>
                <option value="round_robin">Round robin</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs col-span-2">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
            </label>
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Readiness checklist</div>
              <button onClick={() => setItems([...items, { label: "", is_required: true }])} className="text-[11px] underline"><Plus className="w-3 h-3 inline" /> add item</button>
            </div>
            <div className="space-y-1.5">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 border border-line rounded p-2">
                  <GripVertical className="w-3 h-3 text-muted-foreground" />
                  <input value={it.label ?? ""} onChange={(e) => { const c = [...items]; c[i] = { ...c[i], label: e.target.value }; setItems(c); }}
                    placeholder="Checklist item label" className="ipc-input !h-8 !text-xs flex-1" />
                  <label className="text-[10px] flex items-center gap-1">
                    <input type="checkbox" checked={!!it.is_required} onChange={(e) => { const c = [...items]; c[i] = { ...c[i], is_required: e.target.checked }; setItems(c); }} />
                    required
                  </label>
                  <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-[#991B1B]"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              {items.length === 0 && <div className="text-[11px] text-muted-foreground italic">No checklist items yet.</div>}
            </div>
          </div>

          {/* Fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Custom fields</div>
              <button onClick={() => setFields([...fields, { field_key: "", label: "", field_type: "text" }])} className="text-[11px] underline"><Plus className="w-3 h-3 inline" /> add field</button>
            </div>
            <div className="space-y-1.5">
              {fields.map((f, i) => (
                <div key={i} className="grid grid-cols-12 gap-1 items-center border border-line rounded p-2">
                  <input value={f.label ?? ""} onChange={(e) => { const c = [...fields]; c[i] = { ...c[i], label: e.target.value }; setFields(c); }} placeholder="Label" className="ipc-input !h-8 !text-xs col-span-4" />
                  <input value={f.field_key ?? ""} onChange={(e) => { const c = [...fields]; c[i] = { ...c[i], field_key: e.target.value.toLowerCase().replace(/\s+/g,"_") }; setFields(c); }} placeholder="key" className="ipc-input !h-8 !text-xs col-span-3" />
                  <select value={f.field_type ?? "text"} onChange={(e) => { const c = [...fields]; c[i] = { ...c[i], field_type: e.target.value as FieldType }; setFields(c); }} className="ipc-input !h-8 !text-xs col-span-3">
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <label className="text-[10px] flex items-center gap-1 col-span-1">
                    <input type="checkbox" checked={!!f.is_required} onChange={(e) => { const c = [...fields]; c[i] = { ...c[i], is_required: e.target.checked }; setFields(c); }} /> req
                  </label>
                  <button onClick={() => setFields(fields.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-[#991B1B] col-span-1 justify-self-end"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              {fields.length === 0 && <div className="text-[11px] text-muted-foreground italic">No custom fields.</div>}
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-line flex justify-between gap-2 bg-off/30">
          {template ? (
            <button onClick={remove} className="ipc-btn ipc-btn-ghost !text-xs text-[#991B1B]"><Trash2 className="w-3 h-3" /> Delete</button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="ipc-btn ipc-btn-ghost !text-xs">Cancel</button>
            <button onClick={save} className="ipc-btn ipc-btn-black !text-xs">Save template</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{children}</label>;
}
