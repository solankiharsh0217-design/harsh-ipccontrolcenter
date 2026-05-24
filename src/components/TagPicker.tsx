import { useEffect, useState, useRef } from "react";
import {
  listAllTags, createTag, getAssignmentsFor, assignTag, unassignTag, pickTagColor,
  deactivateTag, deleteTagIfUnused, getTagUsageCount,
  type Tag,
} from "@/lib/leadTags";
import { logActivity } from "@/lib/auditLog";
import { X, Plus, Trash2, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface Props {
  crmLeadId?: string | null;
  paidLeadId?: string | null;
  leadName?: string;
  compact?: boolean;
  onChange?: () => void;
}

export default function TagPicker({ crmLeadId, paidLeadId, leadName, compact, onChange }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const [tags, assigns] = await Promise.all([
      listAllTags(),
      getAssignmentsFor({ crmLeadId, paidLeadId }),
    ]);
    setAllTags(tags);
    setAssigned(new Set(assigns.map((a) => a.tag_id)));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [crmLeadId, paidLeadId]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = async (tag: Tag) => {
    if (busy) return;
    setBusy(true);
    try {
      if (assigned.has(tag.id)) {
        await unassignTag(tag.id, { crmLeadId, paidLeadId });
        setAssigned((s) => { const n = new Set(s); n.delete(tag.id); return n; });
        logActivity({
          module_key: paidLeadId ? "paid_pipeline" : "calling_crm",
          action_type: "tag_removed", action_label: "Tag removed",
          entity_type: paidLeadId ? "paid_pipeline_lead" : "crm_lead",
          entity_id: (paidLeadId || crmLeadId) as string,
          entity_label: leadName,
          summary: `Tag "${tag.name}" removed from ${leadName || "lead"}.`,
        });
      } else {
        await assignTag(tag.id, { crmLeadId, paidLeadId });
        setAssigned((s) => new Set(s).add(tag.id));
        logActivity({
          module_key: paidLeadId ? "paid_pipeline" : "calling_crm",
          action_type: "tag_added", action_label: "Tag added",
          entity_type: paidLeadId ? "paid_pipeline_lead" : "crm_lead",
          entity_id: (paidLeadId || crmLeadId) as string,
          entity_label: leadName,
          summary: `Tag "${tag.name}" added to ${leadName || "lead"}.`,
        });
      }
      onChange?.();
    } finally { setBusy(false); }
  };

  const quickCreate = async () => {
    const name = query.trim();
    if (!name) return;
    const exists = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (exists) { await toggle(exists); setQuery(""); return; }
    setBusy(true);
    try {
      const t = await createTag(name);
      if (t) {
        setAllTags((arr) => [...arr.filter((x) => x.id !== t.id), t].sort((a, b) => a.name.localeCompare(b.name)));
        await assignTag(t.id, { crmLeadId, paidLeadId });
        setAssigned((s) => new Set(s).add(t.id));
        logActivity({
          module_key: paidLeadId ? "paid_pipeline" : "calling_crm",
          action_type: "tag_created", action_label: "Tag created",
          entity_type: "tag", entity_id: t.id, entity_label: t.name,
          summary: `New tag "${t.name}" created and applied.`,
        });
        setQuery("");
        onChange?.();
      }
    } finally { setBusy(false); }
  };

  const handleManageDelete = async (tag: Tag, e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const usage = await getTagUsageCount(tag.id);
      if (usage === 0) {
        if (!confirm(`Delete tag "${tag.name}"? It isn't used on any leads.`)) return;
        const ok = await deleteTagIfUnused(tag.id);
        if (ok) {
          setAllTags((arr) => arr.filter((x) => x.id !== tag.id));
          setAssigned((s) => { const n = new Set(s); n.delete(tag.id); return n; });
          toast.success(`Deleted tag "${tag.name}"`);
          logActivity({
            module_key: paidLeadId ? "paid_pipeline" : "calling_crm",
            action_type: "tag_deleted", action_label: "Tag deleted",
            entity_type: "tag", entity_id: tag.id, entity_label: tag.name,
            severity: "warning",
            summary: `Tag "${tag.name}" deleted (unused).`,
          });
          onChange?.();
        }
      } else {
        if (!confirm(`This tag is used on ${usage} lead${usage === 1 ? "" : "s"}. Deactivate it instead? (Existing assignments stay intact, but it will be hidden from filters and dropdowns.)`)) return;
        await deactivateTag(tag.id);
        setAllTags((arr) => arr.filter((x) => x.id !== tag.id));
        toast.success(`Deactivated tag "${tag.name}"`);
        logActivity({
          module_key: paidLeadId ? "paid_pipeline" : "calling_crm",
          action_type: "tag_deactivated", action_label: "Tag deactivated",
          entity_type: "tag", entity_id: tag.id, entity_label: tag.name,
          severity: "warning",
          summary: `Tag "${tag.name}" deactivated (used on ${usage} lead${usage === 1 ? "" : "s"}).`,
        });
        onChange?.();
      }
    } finally { setBusy(false); }
  };

  const assignedTags = allTags.filter((t) => assigned.has(t.id));
  const filtered = allTags.filter((t) =>
    !query.trim() || t.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        {assignedTags.length === 0 && (
          <span className="text-[12px] text-muted-foreground italic">
            No tags yet. Add tags to segment this lead.
          </span>
        )}
        {assignedTags.map((t) => {
          const c = t.color || pickTagColor(t.name);
          return (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border"
              style={{ background: c + "1A", color: c, borderColor: c + "55" }}
            >
              {t.name}
              <button
                onClick={() => toggle(t)}
                className="opacity-60 hover:opacity-100 -mr-0.5"
                title="Remove tag"
                aria-label={`Remove ${t.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium border border-dashed border-line text-foreground hover:bg-off hover:border-foreground/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Tag
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-2 w-[320px] bg-white border border-line rounded-md shadow-lg p-2">
          <input
            autoFocus
            className="qsi-input !h-8 !text-[12px] mb-2"
            placeholder="Search or create a tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); quickCreate(); } }}
          />
          <div className="max-h-[260px] overflow-y-auto">
            {filtered.length === 0 && !query.trim() && (
              <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">No tags available</div>
            )}
            {filtered.map((t) => {
              const sel = assigned.has(t.id);
              const c = t.color || pickTagColor(t.name);
              return (
                <div
                  key={t.id}
                  className={"group w-full flex items-center justify-between gap-2 px-2 py-1.5 text-[12px] hover:bg-off rounded " + (sel ? "bg-off" : "")}
                >
                  <button onClick={() => toggle(t)} className="flex-1 inline-flex items-center gap-2 text-left">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
                    <span className="truncate">{t.name}</span>
                  </button>
                  <div className="flex items-center gap-1">
                    {sel && <span className="text-[10px] text-muted-foreground">✓</span>}
                    <button
                      onClick={(e) => handleManageDelete(t, e)}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-[#DC2626] p-0.5"
                      title="Delete or deactivate tag"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
            {query.trim() && !filtered.some((t) => t.name.toLowerCase() === query.trim().toLowerCase()) && (
              <button onClick={quickCreate} className="w-full text-left px-2 py-1.5 text-[12px] text-blue-600 hover:bg-off rounded">
                + Create new tag "{query.trim()}"
              </button>
            )}
          </div>
          <div className="border-t border-line mt-2 pt-2 px-1 text-[10px] text-muted-foreground flex items-center gap-1">
            <EyeOff className="w-3 h-3" /> Used tags get deactivated, unused get deleted.
          </div>
        </div>
      )}
    </div>
  );
}
