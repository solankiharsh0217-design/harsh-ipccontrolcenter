import { useEffect, useState } from "react";
import { PageHead, SectionLabel, LoadingState } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, X, ShieldAlert } from "lucide-react";
import { MODULES, type ModuleKey } from "@/lib/modules";
import {
  listAccessTemplates, createAccessTemplate, updateAccessTemplate, deleteAccessTemplate,
  type AccessTemplate,
} from "@/lib/accessTemplates";

const GROUPS = Array.from(new Set(MODULES.map((m) => m.group)));

export default function AccessTemplatesAdmin() {
  const { isAdmin, user } = useAuth();
  const [items, setItems] = useState<AccessTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AccessTemplate | "new" | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await listAccessTemplates({ includeInactive: true });
      setItems(list);
    } catch (e: any) { toast.error(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="max-w-[1060px]">
      <PageHead title="Access Templates" sub="Reusable module access presets to onboard team members quickly." />
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Templates</SectionLabel>
        <button onClick={() => setEditing("new")}
          className="h-9 px-3 rounded-md bg-black text-white hover:bg-[#222] font-sans text-[12px] flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New template
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-line bg-white p-8 flex items-center gap-2 text-muted-foreground text-[13px]">
          <LoadingState />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center font-sans text-[13px] text-muted-foreground">
          No templates yet. Click "New template" to create one.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((t) => (
            <div key={t.id} className={`rounded-xl border ${t.grants_admin ? "border-amber-300 bg-amber-50/30" : "border-line bg-white"} p-4 flex flex-col`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-serif text-[17px] font-medium text-black">{t.name}</div>
                <div className="flex items-center gap-1">
                  {!t.is_active && <span className="font-sans text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700">Archived</span>}
                  {t.grants_admin && <span className="font-sans text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />Admin</span>}
                </div>
              </div>
              {t.description && <div className="font-sans text-[12px] text-muted-foreground mb-2 leading-relaxed">{t.description}</div>}
              <div className="font-sans text-[11px] text-muted-foreground mb-3">{t.module_keys.length} module{t.module_keys.length === 1 ? "" : "s"}</div>
              <div className="flex items-center gap-2 mt-auto">
                <button onClick={() => setEditing(t)} className="h-8 px-3 rounded-md border border-line bg-white hover:bg-off font-sans text-[11px]">Edit</button>
                <button onClick={async () => { if (confirm(`Delete template "${t.name}"?`)) { try { await deleteAccessTemplate(t.id, t.name); toast.success("Template deleted"); load(); } catch (e: any) { toast.error(e?.message); } } }}
                  className="h-8 px-2 rounded-md border border-red-300 text-red-700 bg-white hover:bg-red-50 font-sans text-[11px] flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditor
          template={editing === "new" ? null : editing}
          actorId={user?.id ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function TemplateEditor({ template, actorId, onClose, onSaved }: {
  template: AccessTemplate | null;
  actorId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [desc, setDesc] = useState(template?.description ?? "");
  const [grantsAdmin, setGrantsAdmin] = useState(template?.grants_admin ?? false);
  const [isActive, setIsActive] = useState(template?.is_active ?? true);
  const [mods, setMods] = useState<Set<string>>(new Set(template?.module_keys ?? []));
  const [saving, setSaving] = useState(false);

  const toggle = (k: string) => setMods((prev) => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  const save = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      if (template) {
        await updateAccessTemplate(template.id, {
          name: name.trim(), description: desc.trim() || null,
          module_keys: [...mods], grants_admin: grantsAdmin, is_active: isActive,
        });
        toast.success("Template updated");
      } else {
        await createAccessTemplate({
          name: name.trim(), description: desc.trim() || null,
          module_keys: [...mods], grants_admin: grantsAdmin, created_by: actorId,
        });
        toast.success("Template created");
      }
      onSaved();
    } catch (e: any) { toast.error(e?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/50 flex items-center justify-center p-6" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-[720px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-line sticky top-0 bg-white z-10">
          <div className="font-serif text-[19px] font-medium">{template ? "Edit template" : "New template"}</div>
          <button onClick={onClose} disabled={saving}><X className="w-4 h-4 text-muted-foreground hover:text-black" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="font-sans text-[11px] text-muted-foreground block mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full h-10 rounded-md border border-line px-3 font-sans text-[13px]" placeholder="e.g. Media Buyer / Operations" />
          </div>
          <div>
            <label className="font-sans text-[11px] text-muted-foreground block mb-1">Description</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
              className="w-full rounded-md border border-line px-3 py-2 font-sans text-[13px]" />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 font-sans text-[12px]">
              <input type="checkbox" checked={grantsAdmin} onChange={(e) => setGrantsAdmin(e.target.checked)} />
              <span className={grantsAdmin ? "text-amber-900 font-medium" : "text-black"}>Grants Admin role</span>
            </label>
            <label className="flex items-center gap-2 font-sans text-[12px]">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
          <div>
            <div className="font-sans text-[11px] text-muted-foreground mb-2">Modules ({mods.size})</div>
            <div className="space-y-3">
              {GROUPS.map((g) => (
                <div key={g}>
                  <div className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{g}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MODULES.filter((m) => m.group === g).map((m) => (
                      <label key={m.key} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer text-[12px] font-sans ${mods.has(m.key) ? "border-black bg-off" : "border-line bg-white"}`}>
                        <input type="checkbox" checked={mods.has(m.key)} onChange={() => toggle(m.key)} />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} disabled={saving} className="h-9 px-3 rounded-md border border-line bg-white font-sans text-[12px]">Cancel</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 rounded-md bg-black text-white font-sans text-[12px] flex items-center gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
