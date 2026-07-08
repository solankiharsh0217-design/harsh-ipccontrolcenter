import { useEffect, useMemo, useState } from "react";
import { X as XIcon, ClipboardCopy, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { listCommunicationTemplates, interpolateTemplate, type CommunicationTemplate } from "@/lib/operationsTemplates";
import { logActivity } from "@/lib/auditLog";

export type CommChannel = "email" | "whatsapp" | "call" | "note";

const CHANNEL_LABELS: Record<CommChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  call: "Call note",
  note: "Internal note",
};

export default function CommTemplatePickerModal({
  lead, onClose, onLogged,
}: {
  lead: {
    id?: string | null;
    name: string;
    email: string | null;
    phone?: string | null;
    brand_name?: string | null;
    program_name?: string | null;
    product_name: string | null;
    assigned_media_buyer_name?: string | null;
    crm_lead_id?: string | null;
    paid_pipeline_lead_id?: string | null;
  };
  onClose: () => void;
  onLogged?: () => void;
}) {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [channel, setChannel] = useState<CommChannel>("whatsapp");
  const [editableBody, setEditableBody] = useState<string>("");
  const [editableSubject, setEditableSubject] = useState<string>("");
  const [logging, setLogging] = useState(false);
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

  // Auto-pick channel from template type
  useEffect(() => {
    if (!selected) return;
    if (selected.template_type === "email") setChannel("email");
    else setChannel((c) => c);
  }, [selected]);

  const vars = useMemo(() => ({
    client_name: lead.name,
    member_name: lead.name,
    brand_name: lead.brand_name ?? "",
    program_name: lead.program_name ?? lead.product_name ?? "",
    package_name: lead.program_name ?? lead.product_name ?? "",
    owner_name: lead.assigned_media_buyer_name ?? profile?.full_name ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    form_link: overrides.form_link,
    call_link: overrides.call_link,
    support_email: overrides.support_email,
  }), [lead, profile?.full_name, overrides]);

  const interpolatedSubject = selected?.subject ? interpolateTemplate(selected.subject, vars) : "";
  const interpolatedBody = selected ? interpolateTemplate(selected.body, vars) : "";

  // Reset the editable content whenever the template or variables change
  useEffect(() => {
    setEditableSubject(interpolatedSubject);
    setEditableBody(interpolatedBody);
  }, [interpolatedSubject, interpolatedBody]);

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); return true; }
    catch { toast.error("Copy failed"); return false; }
  };

  const logCommunication = async (eventType: "communication_logged" | "communication_copied") => {
    if (!lead.id) { toast.error("Cannot log — no operations lead"); return false; }
    if (!profile?.id) { toast.error("Not signed in"); return false; }
    if (!editableBody.trim()) { toast.error("Message body is empty"); return false; }
    setLogging(true);
    try {
      const payload: any = {
        operations_lead_id: lead.id,
        event_type: eventType,
        event_date: new Date().toISOString().slice(0, 10),
        channel,
        template_id: selected?.id ?? null,
        template_title: selected?.name ?? null,
        subject_snapshot: editableSubject || null,
        message_snapshot: editableBody,
        note: `${CHANNEL_LABELS[channel]}${selected?.name ? ` · ${selected.name}` : ""}`,
        created_by: profile.id,
      };
      const { error } = await supabase.from("operations_service_events" as any).insert(payload);
      if (error) throw error;

      await logActivity({
        module_key: "operations_crm",
        module_label: "Operations CRM",
        action_type: eventType,
        action_label: eventType === "communication_logged" ? "Communication logged" : "Communication copied",
        entity_type: "operations_lead",
        entity_id: lead.id,
        entity_label: lead.name,
        new_values: {
          channel,
          template_id: selected?.id ?? null,
          template_title: selected?.name ?? null,
          subject: editableSubject || null,
        },
        metadata: {
          crm_lead_id: lead.crm_lead_id ?? null,
          paid_pipeline_lead_id: lead.paid_pipeline_lead_id ?? null,
        },
        summary: `${eventType === "communication_logged" ? "Logged" : "Copied"} ${CHANNEL_LABELS[channel]} communication for ${lead.name}${selected?.name ? ` using template “${selected.name}”` : ""}.`,
      });

      toast.success(eventType === "communication_logged" ? "Communication logged" : "Copy logged");
      onLogged?.();
      return true;
    } catch (e: any) {
      toast.error(e.message || "Log failed");
      return false;
    } finally {
      setLogging(false);
    }
  };

  const canLog = !!lead.id && !!profile?.id;
  const fullText = editableSubject ? `${editableSubject}\n\n${editableBody}` : editableBody;

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div className="font-serif text-lg">Send / Log Communication</div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-off flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Template</label>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="ipc-input !h-9 !text-xs w-full">
                {templates.length === 0 && <option value="">— No templates yet —</option>}
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.template_type}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Channel</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value as CommChannel)} className="ipc-input !h-9 !text-xs w-full">
                <option value="whatsapp">WhatsApp (copy + log)</option>
                <option value="email">Email (copy + log)</option>
                <option value="call">Call note</option>
                <option value="note">Internal note</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input label="Form link" v={overrides.form_link} set={(x) => setOverrides({ ...overrides, form_link: x })} />
            <Input label="Call link" v={overrides.call_link} set={(x) => setOverrides({ ...overrides, call_link: x })} />
            <Input label="Support email" v={overrides.support_email} set={(x) => setOverrides({ ...overrides, support_email: x })} />
          </div>

          {selected && (
            <>
              {(channel === "email" || editableSubject) && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">Subject</label>
                    <button onClick={() => copy(editableSubject, "Subject")} className="text-[10px] underline">Copy</button>
                  </div>
                  <input
                    value={editableSubject}
                    onChange={(e) => setEditableSubject(e.target.value)}
                    className="ipc-input !h-8 !text-xs w-full"
                  />
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">Message (editable)</label>
                  <button onClick={() => copy(editableBody, "Message")} className="text-[10px] underline">Copy</button>
                </div>
                <textarea
                  value={editableBody}
                  onChange={(e) => setEditableBody(e.target.value)}
                  rows={8}
                  className="ipc-input !text-xs w-full font-sans whitespace-pre-wrap"
                />
              </div>
            </>
          )}

          {!canLog && (
            <div className="text-[10px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded px-2 py-1.5">
              Logging is unavailable — open from an operations lead to log communications.
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-line flex flex-wrap justify-end gap-2 bg-off/30">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost !text-xs">Close</button>
          {selected && (
            <>
              <button
                onClick={() => copy(fullText, "Message")}
                className="ipc-btn ipc-btn-ghost !text-xs"
              >
                <ClipboardCopy className="w-3.5 h-3.5" /> Copy
              </button>
              {canLog && (
                <>
                  <button
                    disabled={logging}
                    onClick={() => logCommunication("communication_logged")}
                    className="ipc-btn ipc-btn-ghost !text-xs"
                  >
                    <Save className="w-3.5 h-3.5" /> Log only
                  </button>
                  <button
                    disabled={logging}
                    onClick={async () => {
                      const ok = await copy(fullText, "Message");
                      if (ok) await logCommunication("communication_copied");
                    }}
                    className="ipc-btn ipc-btn-black !text-xs"
                  >
                    <ClipboardCopy className="w-3.5 h-3.5" /> Copy + Log
                  </button>
                </>
              )}
            </>
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
