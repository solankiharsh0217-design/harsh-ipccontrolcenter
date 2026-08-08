import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, Pencil, Archive, Trash2, RotateCcw, Settings2, X as XIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/auditLog";
import { LoadingState, EmptyState } from "@/components/ui-bits";

export type WebinarPreset = {
  id: string;
  name: string;
  normalized_name: string | null;
  is_active: boolean;
  archived_at: string | null;
  usage_count: number;
  last_used_at: string | null;
};

const PLACEHOLDERS = ["untitled webinar", "new webinar", "test", "demo", "undefined", "null", "blank", ""];
const norm = (s: string) => s.trim().toLowerCase();
const isPlaceholder = (s: string) => PLACEHOLDERS.includes(norm(s));

export async function bumpWebinarUsage(id: string) {
  try {
    const { data } = await (supabase as any).from("webinars").select("usage_count").eq("id", id).maybeSingle();
    const next = ((data as any)?.usage_count || 0) + 1;
    await (supabase as any).from("webinars").update({
      usage_count: next, last_used_at: new Date().toISOString(),
    }).eq("id", id);
  } catch { /* ignore */ }
}

export default function WebinarPresetSelector({
  value, onChange, autoOpen = false, source = "lead_qualifier_send_to_crm",
}: {
  value: string;
  onChange: (name: string, preset?: WebinarPreset) => void;
  autoOpen?: boolean;
  source?: string;
}) {
  const { isAdmin, profile } = useAuth();
  const [presets, setPresets] = useState<WebinarPreset[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const popRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("webinars")
        .select("id, name, normalized_name, is_active, archived_at, usage_count, last_used_at")
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .order("name");
      if (error) throw error;
      setPresets((data || []) as WebinarPreset[]);
    } catch (e: any) {
      console.warn("[webinars] load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const active = useMemo(() => presets.filter(p => p.is_active), [presets]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter(p => (p.name || "").toLowerCase().includes(q));
  }, [active, query]);

  const exactMatch = useMemo(
    () => active.find(p => norm(p.name) === norm(query)),
    [active, query],
  );
  const canCreate = query.trim().length >= 2 && !exactMatch;

  const handleSelect = (p: WebinarPreset) => {
    onChange(p.name, p);
    setOpen(false);
    setQuery("");
    logActivity({
      module_key: "calling_crm", module_label: "Calling CRM",
      action_type: "webinar_preset_selected", action_label: "Webinar preset selected",
      entity_type: "webinar_preset", entity_id: p.id, entity_label: p.name,
      metadata: { preset_id: p.id, selected_title: p.name, source },
    });
  };

  const handleCreate = async (rawTitle: string) => {
    const title = rawTitle.trim();
    if (title.length < 2) { toast.error("Title must be at least 2 characters"); return; }
    if (isPlaceholder(title)) {
      const ok = window.confirm(`"${title}" looks like a placeholder name. Save it as a preset anyway?`);
      if (!ok) {
        // allow temporary use without saving
        onChange(title);
        setOpen(false); setQuery("");
        return;
      }
    }
    const normalized = norm(title);
    if (active.some(p => norm(p.name) === normalized)) {
      toast.info("That webinar already exists"); return;
    }
    try {
      const { data, error } = await (supabase as any).from("webinars").insert({
        name: title, normalized_name: normalized, created_by: profile?.id || null,
        last_used_at: new Date().toISOString(), usage_count: 1, is_active: true,
      }).select("id, name, normalized_name, is_active, archived_at, usage_count, last_used_at").maybeSingle();
      if (error) throw error;
      const p = data as WebinarPreset;
      setPresets(prev => [p, ...prev]);
      onChange(p.name, p);
      setOpen(false); setQuery("");
      toast.success("Webinar saved");
      logActivity({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "webinar_preset_created", action_label: "Webinar preset created",
        entity_type: "webinar_preset", entity_id: p.id, entity_label: p.name,
        metadata: { preset_id: p.id, new_title: p.name, source },
      });
    } catch (e: any) {
      toast.error(e?.message || "Could not save webinar");
    }
  };

  const rename = async (p: WebinarPreset, newName: string) => {
    const t = newName.trim();
    if (t.length < 2) { toast.error("Title must be at least 2 characters"); return; }
    const normalized = norm(t);
    if (active.some(x => x.id !== p.id && norm(x.name) === normalized)) {
      toast.error("Another active webinar already has this name"); return;
    }
    try {
      const { error } = await (supabase as any).from("webinars")
        .update({ name: t, normalized_name: normalized, updated_by: profile?.id || null })
        .eq("id", p.id);
      if (error) throw error;
      setPresets(prev => prev.map(x => x.id === p.id ? { ...x, name: t, normalized_name: normalized } : x));
      setRenamingId(null);
      toast.success("Renamed");
      logActivity({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "webinar_preset_renamed", action_label: "Webinar preset renamed",
        entity_type: "webinar_preset", entity_id: p.id, entity_label: t,
        old_values: { name: p.name }, new_values: { name: t },
        metadata: { preset_id: p.id, old_title: p.name, new_title: t, source },
      });
      if (value === p.name) onChange(t, { ...p, name: t });
    } catch (e: any) { toast.error(e?.message || "Rename failed"); }
  };

  const archive = async (p: WebinarPreset) => {
    try {
      const { error } = await (supabase as any).from("webinars")
        .update({ is_active: false, archived_at: new Date().toISOString(), updated_by: profile?.id || null })
        .eq("id", p.id);
      if (error) throw error;
      setPresets(prev => prev.map(x => x.id === p.id ? { ...x, is_active: false, archived_at: new Date().toISOString() } : x));
      toast.success("Archived");
      logActivity({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "webinar_preset_archived", action_label: "Webinar preset archived",
        entity_type: "webinar_preset", entity_id: p.id, entity_label: p.name,
        metadata: { preset_id: p.id, source }, severity: "warning",
      });
    } catch (e: any) { toast.error(e?.message || "Archive failed"); }
  };

  const restore = async (p: WebinarPreset) => {
    if (active.some(x => norm(x.name) === norm(p.name))) {
      toast.error("Another active webinar already has this name. Rename first."); return;
    }
    try {
      const { error } = await (supabase as any).from("webinars")
        .update({ is_active: true, archived_at: null, updated_by: profile?.id || null })
        .eq("id", p.id);
      if (error) throw error;
      setPresets(prev => prev.map(x => x.id === p.id ? { ...x, is_active: true, archived_at: null } : x));
      toast.success("Restored");
      logActivity({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "webinar_preset_restored", action_label: "Webinar preset restored",
        entity_type: "webinar_preset", entity_id: p.id, entity_label: p.name,
        metadata: { preset_id: p.id, source },
      });
    } catch (e: any) { toast.error(e?.message || "Restore failed"); }
  };

  const hardDelete = async (p: WebinarPreset) => {
    if (!window.confirm(`Delete "${p.name}" permanently? This cannot be undone.`)) return;
    try {
      const { error } = await (supabase as any).from("webinars").delete().eq("id", p.id);
      if (error) throw error;
      setPresets(prev => prev.filter(x => x.id !== p.id));
      toast.success("Deleted");
      logActivity({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "webinar_preset_deleted", action_label: "Webinar preset deleted",
        entity_type: "webinar_preset", entity_id: p.id, entity_label: p.name,
        metadata: { preset_id: p.id, source }, severity: "warning",
      });
    } catch (e: any) {
      toast.error(e?.message?.includes("violates") ? "Cannot delete — this name is still in use." : (e?.message || "Delete failed"));
    }
  };

  const selectedPreset = useMemo(() => active.find(p => p.name === value), [active, value]);

  return (
    <div className="relative" ref={popRef}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="ipc-input flex-1 flex items-center justify-between text-left"
        >
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {value || "Select or create a webinar…"}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="ipc-btn ipc-btn-ghost"
          title="Manage saved webinars"
        >
          <Settings2 className="w-3.5 h-3.5" /> Manage
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 z-[1100] bg-white border border-line rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-line">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && canCreate) { e.preventDefault(); handleCreate(query); } }}
              placeholder="Search or type a new webinar name…"
              className="flex-1 outline-none bg-transparent text-[13px]"
            />
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {loading && <div className="px-3 py-2"><LoadingState /></div>}
            {!loading && filtered.length === 0 && active.length === 0 && (
              <EmptyState title="No saved webinars yet." hint="Type a name to create one." />
            )}
            {!loading && filtered.length === 0 && active.length > 0 && !canCreate && (
              <EmptyState title="No matches." />
            )}
            {!loading && filtered.map(p => {
              const selected = p.name === value;
              const editing = renamingId === p.id;
              return (
                <div key={p.id} className={`group flex items-center gap-1 px-2 py-1.5 hover:bg-off ${selected ? "bg-gold-pale" : ""}`}>
                  {editing ? (
                    <>
                      <input
                        autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") rename(p, renameValue); if (e.key === "Escape") setRenamingId(null); }}
                        className="ipc-input !h-7 flex-1 text-[12px]"
                      />
                      <button onClick={() => rename(p, renameValue)} className="ipc-btn ipc-btn-black !h-7 text-[11px]">Save</button>
                      <button onClick={() => setRenamingId(null)} className="ipc-btn ipc-btn-ghost !h-7 text-[11px]">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSelect(p)}
                        className="flex-1 text-left flex items-center gap-2 px-1.5 py-0.5"
                      >
                        <Check className={`w-3.5 h-3.5 ${selected ? "text-foreground" : "text-transparent"}`} />
                        <div className="min-w-0">
                          <div className="text-[13px] truncate">{p.name}</div>
                          <div className="text-[10.5px] text-muted-foreground">
                            Used {p.usage_count}× {p.last_used_at ? `· last ${new Date(p.last_used_at).toLocaleDateString()}` : ""}
                          </div>
                        </div>
                      </button>
                      {isAdmin && (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                          <button title="Rename" onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }} className="p-1 rounded hover:bg-white"><Pencil className="w-3 h-3" /></button>
                          <button title="Archive" onClick={() => archive(p)} className="p-1 rounded hover:bg-white text-[#92400E]"><Archive className="w-3 h-3" /></button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {canCreate && (
              <button
                type="button"
                onClick={() => handleCreate(query)}
                className="w-full text-left px-3 py-2 border-t border-line hover:bg-off flex items-center gap-2 text-[12.5px]"
              >
                <Plus className="w-3.5 h-3.5" /> Create <span className="font-medium">"{query.trim()}"</span>
              </button>
            )}
          </div>
        </div>
      )}

      {selectedPreset && isPlaceholder(selectedPreset.name) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#B45309]">
          <AlertTriangle className="w-3 h-3" /> This looks like a placeholder name.
        </div>
      )}

      {manageOpen && (
        <ManageWebinarsModal
          presets={presets}
          isAdmin={!!isAdmin}
          onClose={() => setManageOpen(false)}
          onRename={rename}
          onArchive={archive}
          onRestore={restore}
          onDelete={hardDelete}
          onReload={load}
        />
      )}
    </div>
  );
}

function ManageWebinarsModal({
  presets, isAdmin, onClose, onRename, onArchive, onRestore, onDelete, onReload,
}: {
  presets: WebinarPreset[];
  isAdmin: boolean;
  onClose: () => void;
  onRename: (p: WebinarPreset, newName: string) => Promise<void>;
  onArchive: (p: WebinarPreset) => Promise<void>;
  onRestore: (p: WebinarPreset) => Promise<void>;
  onDelete: (p: WebinarPreset) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return presets
      .filter(p => (tab === "active" ? p.is_active : !p.is_active))
      .filter(p => !ql || p.name.toLowerCase().includes(ql));
  }, [presets, q, tab]);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-2xl p-5 max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-serif text-lg">Manage saved webinars</div>
            <div className="text-[11.5px] text-muted-foreground">Clean up duplicates, archive wrong names, rename for consistency.</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-off"><XIcon className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1 p-1 rounded-md border border-line">
            {(["active", "archived"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 rounded text-[11.5px] ${tab === t ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}>
                {t === "active" ? "Active" : "Archived"} ({presets.filter(p => (t === "active" ? p.is_active : !p.is_active)).length})
              </button>
            ))}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search webinars…" className="ipc-input !h-9 flex-1 text-[12.5px]" />
        </div>

        <div className="border border-line rounded-md divide-y divide-line">
          {list.length === 0 && <div className="p-4 text-[12px] text-muted-foreground">No webinars in this view.</div>}
          {list.map(p => {
            const editing = renamingId === p.id;
            return (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                {editing ? (
                  <>
                    <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} className="ipc-input !h-8 flex-1 text-[12.5px]" />
                    <button onClick={async () => { await onRename(p, renameValue); setRenamingId(null); }} className="ipc-btn ipc-btn-black !h-8 text-[11px]">Save</button>
                    <button onClick={() => setRenamingId(null)} className="ipc-btn ipc-btn-ghost !h-8 text-[11px]">Cancel</button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate">{p.name}</div>
                      <div className="text-[10.5px] text-muted-foreground">
                        Used {p.usage_count}× {p.last_used_at ? `· last ${new Date(p.last_used_at).toLocaleDateString()}` : ""}
                        {!p.is_active && p.archived_at ? ` · archived ${new Date(p.archived_at).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                    {isAdmin && tab === "active" && (
                      <>
                        <button onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }} className="ipc-btn ipc-btn-ghost !h-8 text-[11px]"><Pencil className="w-3 h-3" /> Rename</button>
                        <button onClick={() => onArchive(p)} className="ipc-btn ipc-btn-ghost !h-8 text-[11px] text-[#92400E]"><Archive className="w-3 h-3" /> Archive</button>
                      </>
                    )}
                    {isAdmin && tab === "archived" && (
                      <>
                        <button onClick={() => onRestore(p)} className="ipc-btn ipc-btn-ghost !h-8 text-[11px] text-[#15803D]"><RotateCcw className="w-3 h-3" /> Restore</button>
                        <button onClick={() => onDelete(p)} className="ipc-btn ipc-btn-ghost !h-8 text-[11px] text-[#DC2626]"><Trash2 className="w-3 h-3" /> Delete</button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="ipc-btn ipc-btn-ghost" onClick={onReload}>Reload</button>
          <button className="ipc-btn ipc-btn-black" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
