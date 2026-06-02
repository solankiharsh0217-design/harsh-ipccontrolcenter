import { useEffect, useMemo, useState } from "react";
import { X as XIcon, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { listCommunicationTemplates, interpolateTemplate, type CommunicationTemplate } from "@/lib/operationsTemplates";

export default function CommTemplatePickerModal({
  lead, onClose,
}: {
  lead: { name: string; email: string | null; brand_name?: string | null; program_name?: string | null; product_name: string | null; assigned_media_buyer_name?: string | null };
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [overrides, setOverrides] = useState<Record<string, string>>({
    form_link: "", call_link: "", support_email: "",
  });

  useEffect(() => {
    listCommunicationTemplates(true).then((ts) => {
      setTemplates(ts);
      if (ts.length) setSelectedId(ts[0].id);
    }).catch((e) => toast.error(e.message || "Failed to load"));
  }, []);

  const selected = templates.find((t) => t.id === selectedId);

  const vars = useMemo(() => ({
    client_name: lead.name,
    brand_name: lead.brand_name ?? "",
    program_name: lead.program_name ?? lead.product_name ?? "",
    owner_name: lead.assigned_media_buyer_name ?? profile?.full_name ?? "",
    form_link: overrides.form_link,
    call_link: overrides.call_link,
    support_email: overrides.support_email,
  }), [lead, profile?.full_name, overrides]);

  const subject = selected?.subject ? interpolateTemplate(selected.subject, vars) : "";
  const body = selected ? interpolateTemplate(selected.body, vars) : "";

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div className="font-serif text-lg">Send Client Instructions</div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-off flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Template</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="ipc-input !h-9 !text-xs w-full">
              {templates.length === 0 && <option value="">— No templates yet —</option>}
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.template_type}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input label="Form link" v={overrides.form_link} set={(x) => setOverrides({ ...overrides, form_link: x })} />
            <Input label="Call link" v={overrides.call_link} set={(x) => setOverrides({ ...overrides, call_link: x })} />
            <Input label="Support email" v={overrides.support_email} set={(x) => setOverrides({ ...overrides, support_email: x })} />
          </div>

          {selected && (
            <>
              {subject && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">Subject</label>
                    <button onClick={() => copy(subject, "Subject")} className="text-[10px] underline">Copy</button>
                  </div>
                  <div className="text-xs border border-line rounded p-2 bg-off/40">{subject}</div>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">Body</label>
                  <button onClick={() => copy(body, "Message")} className="text-[10px] underline">Copy</button>
                </div>
                <pre className="text-xs border border-line rounded p-2 bg-off/40 whitespace-pre-wrap font-sans max-h-56 overflow-y-auto">{body}</pre>
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-3 border-t border-line flex justify-end gap-2 bg-off/30">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost !text-xs">Close</button>
          {selected && (
            <button onClick={() => copy(subject ? `${subject}\n\n${body}` : body, "Message")} className="ipc-btn ipc-btn-black !text-xs">
              <ClipboardCopy className="w-3.5 h-3.5" /> Copy all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Input({ label, v, set }: { label: string; v: string; set: (s: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      <input value={v} onChange={(e) => set(e.target.value)} className="ipc-input !h-8 !text-xs w-full" />
    </div>
  );
}
