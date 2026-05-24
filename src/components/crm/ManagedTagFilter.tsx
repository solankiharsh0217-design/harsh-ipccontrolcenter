import { useEffect, useMemo, useRef, useState } from "react";
import { Tag as TagIcon, X, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { listAllTags, createTag, deleteTagIfUnused, deactivateTag, pickTagColor, type Tag } from "@/lib/leadTags";
import { logActivity } from "@/lib/auditLog";

export default function ManagedTagFilter({
  value,
  onChange,
  tags,
  onChanged,
}: {
  value: string; // tag id or "all"
  onChange: (v: string) => void;
  tags: Tag[];
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(term));
  }, [tags, q]);

  const exactMatch = useMemo(() => {
    const term = q.trim().toLowerCase();
    return !!term && tags.some((t) => t.name.toLowerCase() === term);
  }, [tags, q]);

  const current = tags.find((t) => t.id === value);
  const label = value === "all" ? "All tags" : current?.name || "All tags";

  const handleCreate = async () => {
    const name = q.trim();
    if (!name) return;
    const t = await createTag(name, { module_scope: "all" });
    if (!t) { toast.error("Could not create tag"); return; }
    toast.success(`Tag “${t.name}” created`);
    logActivity({ module_key: "calling_crm", action_type: "tag_created", entity_type: "tag", entity_id: t.id, entity_label: t.name, summary: `Tag “${t.name}” created` });
    setQ("");
    await onChanged();
    onChange(t.id);
    setOpen(false);
  };

  const handleDelete = async (t: Tag) => {
    const ok = await deleteTagIfUnused(t.id);
    if (ok) {
      toast.success(`Tag “${t.name}” deleted`);
      logActivity({ module_key: "calling_crm", action_type: "tag_deleted", entity_type: "tag", entity_id: t.id, entity_label: t.name, summary: `Tag “${t.name}” deleted`, severity: "warning" });
    } else {
      if (!confirm(`“${t.name}” is used on existing leads. Deactivate it instead?`)) return;
      await deactivateTag(t.id);
      toast.success(`Tag “${t.name}” deactivated`);
      logActivity({ module_key: "calling_crm", action_type: "tag_deactivated", entity_type: "tag", entity_id: t.id, entity_label: t.name, summary: `Tag “${t.name}” deactivated`, severity: "warning" });
    }
    if (value === t.id) onChange("all");
    await onChanged();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ipc-input !h-10 !text-xs flex items-center gap-1.5 min-w-[160px] justify-between bg-white"
        title="Filter & manage tags"
      >
        <span className="flex items-center gap-1.5 truncate"><TagIcon className="w-3.5 h-3.5" /> {label}</span>
        <span className="text-[9px] text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 right-0 mt-1 w-[280px] bg-white border border-line rounded-md shadow-lg overflow-hidden">
          <div className="p-2 border-b border-line flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tags…"
              className="flex-1 text-xs outline-none bg-transparent"
              onKeyDown={(e) => { if (e.key === "Enter" && q.trim() && !exactMatch) handleCreate(); }}
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange("all"); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-off ${value === "all" ? "bg-off font-medium" : ""}`}
            >All tags</button>
            {filtered.map((t) => {
              const c = t.color || pickTagColor(t.name);
              const selected = value === t.id;
              return (
                <div key={t.id} className={`group flex items-center hover:bg-off ${selected ? "bg-off" : ""}`}>
                  <button
                    type="button"
                    onClick={() => { onChange(t.id); setOpen(false); }}
                    className="flex-1 text-left px-3 py-1.5 text-xs truncate flex items-center gap-2"
                  >
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: c }} />
                    <span className="truncate">{t.name}</span>
                  </button>
                  <button
                    type="button"
                    title="Delete or deactivate"
                    onClick={(e) => { e.stopPropagation(); handleDelete(t); }}
                    className="opacity-0 group-hover:opacity-100 px-2 text-muted-foreground hover:text-[#DC2626]"
                  ><X className="w-3 h-3" /></button>
                </div>
              );
            })}
            {filtered.length === 0 && !q && (
              <div className="px-3 py-3 text-[11px] text-muted-foreground text-center">No tags yet</div>
            )}
          </div>
          {q.trim() && !exactMatch && (
            <button
              type="button"
              onClick={handleCreate}
              className="w-full border-t border-line px-3 py-2 text-xs text-left text-[#2563EB] hover:bg-off flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Create “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
