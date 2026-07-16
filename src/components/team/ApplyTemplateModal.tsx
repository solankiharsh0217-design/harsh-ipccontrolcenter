import { useEffect, useMemo, useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { MODULES } from "@/lib/modules";
import {
  listAccessTemplates, previewApplyTemplate, applyAccessTemplate, removeAdminRole,
  type AccessTemplate, type ApplyPreview,
} from "@/lib/accessTemplates";

interface Props {
  memberId: string;
  memberName: string;
  actorId: string;
  onClose: () => void;
  onDone?: () => void;
  /** Called with new module keys + admin flag right after a successful apply, so the parent
   *  Manage Member modal can refresh its state and not overwrite the applied template on Save. */
  onApplied?: (result: { moduleKeys: string[]; isAdmin: boolean }) => void;
}

const moduleLabel = (key: string) => MODULES.find((m) => m.key === (key as any))?.label ?? key;

export default function ApplyTemplateModal({ memberId, memberName, actorId, onClose, onDone, onApplied }: Props) {
  const [templates, setTemplates] = useState<AccessTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [mode, setMode] = useState<"replace" | "additive">("replace");
  const [removeAdmin, setRemoveAdmin] = useState(false);
  const [preview, setPreview] = useState<ApplyPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => templates.find((t) => t.id === selectedId) ?? null, [templates, selectedId]);

  useEffect(() => {
    (async () => {
      try {
        const list = await listAccessTemplates();
        setTemplates(list);
      } catch (e: any) { toast.error(e?.message || "Failed to load templates"); }
    })();
  }, []);

  useEffect(() => {
    if (!selected) { setPreview(null); return; }
    setLoading(true);
    previewApplyTemplate({ memberId, template: selected, mode, removeAdmin })
      .then(setPreview)
      .catch((e) => toast.error(e?.message || "Preview failed"))
      .finally(() => setLoading(false));
  }, [selected, mode, removeAdmin, memberId]);

  const apply = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await applyAccessTemplate({ memberId, memberName, template: selected, mode, removeAdmin, actorId });
      toast.success(`Template "${selected.name}" applied to ${memberName}`);
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply template");
    } finally { setSaving(false); }
  };

  const dropAdminOnly = async () => {
    if (!confirm(`Remove Admin role from ${memberName}? Module access will be preserved.`)) return;
    setSaving(true);
    try {
      await removeAdminRole({ memberId, memberName, actorId });
      toast.success(`Admin role removed from ${memberName}`);
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove admin role");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-6" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-line sticky top-0 bg-white z-10">
          <div>
            <div className="font-serif text-[19px] font-medium text-black">Apply Access Template</div>
            <div className="font-sans text-[12px] text-muted-foreground mt-0.5">{memberName}</div>
          </div>
          <button onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-black"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="font-sans text-[11px] text-muted-foreground block mb-1.5">Template</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
              className="w-full h-10 rounded-md border border-line bg-white px-3 font-sans text-[13px]">
              <option value="">— Select a template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.grants_admin ? " · GRANTS ADMIN" : ""}</option>
              ))}
            </select>
            {selected?.description && (
              <div className="font-sans text-[11px] text-muted-foreground mt-1.5">{selected.description}</div>
            )}
          </div>

          {selected && (
            <>
              <div>
                <div className="font-sans text-[11px] text-muted-foreground mb-1.5">Apply mode</div>
                <div className="flex gap-2">
                  <label className={`flex-1 border rounded-md px-3 py-2 cursor-pointer text-[12px] font-sans ${mode === "replace" ? "border-black bg-off" : "border-line bg-white"}`}>
                    <input type="radio" className="mr-2" checked={mode === "replace"} onChange={() => setMode("replace")} />
                    Replace current access
                  </label>
                  <label className={`flex-1 border rounded-md px-3 py-2 cursor-pointer text-[12px] font-sans ${mode === "additive" ? "border-black bg-off" : "border-line bg-white"}`}>
                    <input type="radio" className="mr-2" checked={mode === "additive"} onChange={() => setMode("additive")} />
                    Add on top of existing
                  </label>
                </div>
              </div>

              {selected.grants_admin && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
                  <div className="font-sans text-[12px] text-amber-900">This template grants Admin access.</div>
                </div>
              )}

              {preview?.currentIsAdmin && !selected.grants_admin && (
                <label className="flex items-start gap-2 rounded-md border border-line bg-white px-3 py-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={removeAdmin} onChange={(e) => setRemoveAdmin(e.target.checked)} />
                  <span className="font-sans text-[12px] text-black">Also remove Admin role from this user</span>
                </label>
              )}

              <div className="rounded-lg border border-line bg-off/40 p-4">
                <div className="font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">Preview</div>
                {loading || !preview ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-[12px]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating…</div>
                ) : (
                  <div className="space-y-3 text-[12px] font-sans">
                    <div>
                      <div className="text-muted-foreground mb-1">Current modules ({preview.currentModules.length})</div>
                      <div className="text-black leading-relaxed">{preview.currentModules.length ? preview.currentModules.map(moduleLabel).join(", ") : <em className="text-muted-foreground">None</em>}</div>
                    </div>
                    {preview.addedModules.length > 0 && (
                      <div>
                        <div className="text-green-700 mb-1">+ Added ({preview.addedModules.length})</div>
                        <div className="text-black leading-relaxed">{preview.addedModules.map(moduleLabel).join(", ")}</div>
                      </div>
                    )}
                    {preview.removedModules.length > 0 && (
                      <div>
                        <div className="text-red-700 mb-1">− Removed ({preview.removedModules.length})</div>
                        <div className="text-black leading-relaxed">{preview.removedModules.map(moduleLabel).join(", ")}</div>
                      </div>
                    )}
                    {(preview.willGrantAdmin || preview.willRemoveAdmin) && (
                      <div className={`rounded px-2 py-1.5 ${preview.willGrantAdmin ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900"}`}>
                        {preview.willGrantAdmin ? "Admin role will be GRANTED" : "Admin role will be REMOVED"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-line flex items-center justify-between gap-2 sticky bottom-0 bg-white">
          <div>
            {preview?.currentIsAdmin && (
              <button onClick={dropAdminOnly} disabled={saving}
                className="h-9 px-3 rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-50 font-sans text-[12px] disabled:opacity-50">
                Remove Admin role only
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="h-9 px-3 rounded-md border border-line bg-white font-sans text-[12px] disabled:opacity-50">Cancel</button>
            <button onClick={apply} disabled={!selected || saving || loading}
              className="h-9 px-4 rounded-md bg-black text-white hover:bg-[#222] font-sans text-[12px] disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Apply template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
