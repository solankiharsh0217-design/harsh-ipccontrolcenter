import { useState } from "react";
import { X as XIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CommunicationTemplate, CommTemplateType } from "@/lib/operationsTemplates";

const TYPES: CommTemplateType[] = ["email", "form_link", "call_link", "instruction"];
const VARS = ["client_name", "brand_name", "program_name", "form_link", "call_link", "support_email", "owner_name"];

export default function CommunicationTemplateEditor({
  template, onClose, onSaved,
}: { template: CommunicationTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [type, setType] = useState<CommTemplateType>(template?.template_type ?? "email");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [active, setActive] = useState(template?.is_active ?? true);

  const save = async () => {
    if (!name.trim() || !body.trim()) { toast.error("Name and body required"); return; }
    try {
      if (template) {
        const { error } = await supabase.from("operations_communication_templates" as any).update({
          name: name.trim(), template_type: type, subject: subject.trim() || null,
          body, is_active: active,
        }).eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("operations_communication_templates" as any).insert({
          name: name.trim(), template_type: type, subject: subject.trim() || null,
          body, is_active: active,
        } as any);
        if (error) throw error;
      }
      toast.success("Template saved");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  };

  const remove = async () => {
    if (!template) return;
    if (!confirm(`Delete "${template.name}"?`)) return;
    const { error } = await supabase.from("operations_communication_templates" as any).delete().eq("id", template.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div className="font-serif text-lg">{template ? "Edit" : "New"} Communication Template</div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-off flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label>Name *</Label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="ipc-input !h-9 !text-xs w-full" />
            </div>
            <div>
              <Label>Type</Label>
              <select value={type} onChange={(e) => setType(e.target.value as CommTemplateType)} className="ipc-input !h-9 !text-xs w-full">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
            </label>
            {type === "email" && (
              <div className="col-span-2">
                <Label>Subject</Label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className="ipc-input !h-9 !text-xs w-full" />
              </div>
            )}
            <div className="col-span-2">
              <Label>Body *</Label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="ipc-input !text-xs w-full font-mono" />
              <div className="text-[10px] text-muted-foreground mt-1">
                Variables: {VARS.map((v) => <code key={v} className="mr-1 px-1 bg-off rounded">{`{{${v}}}`}</code>)}
              </div>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-line flex justify-between gap-2 bg-off/30">
          {template ? (
            <button onClick={remove} className="ipc-btn ipc-btn-ghost !text-xs text-[#991B1B]"><Trash2 className="w-3 h-3" /> Delete</button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="ipc-btn ipc-btn-ghost !text-xs">Cancel</button>
            <button onClick={save} className="ipc-btn ipc-btn-black !text-xs">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{children}</label>;
}
