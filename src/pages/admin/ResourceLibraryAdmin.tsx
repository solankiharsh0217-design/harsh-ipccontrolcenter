import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHead, SectionLabel, EmptyState } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import {
  RESOURCE_TYPES,
  VISIBILITY_OPTIONS,
  archiveResource,
  createResource,
  inferTypeFromFile,
  listCategories,
  listResources,
  unarchiveResource,
  updateResource,
  uploadResourceFile,
  type ResourceCategory,
  type ResourceItem,
  type ResourceType,
  type Visibility,
} from "@/lib/resourceLibrary";

const inputCls =
  "h-9 w-full border border-line rounded-md px-2.5 text-[12.5px] focus:outline-none focus:border-gold font-sans bg-white";
const labelCls = "block text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1 font-sans";

export default function ResourceLibraryAdmin() {
  const { isAdmin, loading } = useAuth();
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [cats, setCats] = useState<ResourceCategory[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("");
  const [fType, setFType] = useState("");
  const [fVis, setFVis] = useState("");
  const [editing, setEditing] = useState<ResourceItem | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const [it, c] = await Promise.all([listResources({ adminView: true, includeArchived: showArchived }), listCategories()]);
      setItems(it);
      setCats(c);
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  useEffect(() => { load(); }, [showArchived]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => {
      if (fCat && i.category !== fCat) return false;
      if (fType && i.resource_type !== fType) return false;
      if (fVis && i.visibility !== fVis) return false;
      if (t) {
        const hay = `${i.title} ${i.description ?? ""} ${(i.tags ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [items, q, fCat, fType, fVis]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/admin-center" replace />;

  return (
    <div className="max-w-[1200px]">
      <PageHead title="IPC Resource Library" sub="Upload, organize, and share team resources — files, templates, links, and assets." />

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input placeholder="Search resources…" value={q} onChange={(e) => setQ(e.target.value)} className={inputCls + " max-w-[260px]"} />
        <select className={inputCls + " max-w-[180px]"} value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select className={inputCls + " max-w-[160px]"} value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">All types</option>
          {RESOURCE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select className={inputCls + " max-w-[160px]"} value={fVis} onChange={(e) => setFVis(e.target.value)}>
          <option value="">All visibility</option>
          {VISIBILITY_OPTIONS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <div className="ml-auto">
          <button onClick={() => setCreating(true)} className="h-9 px-4 bg-black text-white text-[12.5px] rounded-md">+ Add Resource</button>
        </div>
      </div>

      <SectionLabel>Resources ({filtered.length})</SectionLabel>

      <div className="border border-line rounded-md bg-white divide-y divide-line">
        {filtered.length === 0 && <EmptyState title="No resources match." />}
        {filtered.map((it) => (
          <div key={it.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-medium text-[13px] text-black truncate">{it.title}</div>
                <span className="text-[9.5px] uppercase bg-off px-1.5 py-0.5 rounded text-muted-foreground border border-line">{it.resource_type}</span>
                <span className="text-[9.5px] uppercase bg-off px-1.5 py-0.5 rounded text-muted-foreground border border-line">{it.visibility}</span>
                {!it.is_published && <span className="text-[9.5px] uppercase bg-yellow-50 border border-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">Hidden</span>}
                {it.archived_at && <span className="text-[9.5px] uppercase bg-off px-1.5 py-0.5 rounded text-muted-foreground">Archived</span>}
                {it.category && <span className="text-[11px] text-muted-foreground">· {it.category}</span>}
              </div>
              {it.description && <div className="text-[11.5px] text-muted-foreground mt-0.5 truncate">{it.description}</div>}
              {(it.tags?.length ?? 0) > 0 && (
                <div className="text-[10.5px] text-muted-foreground mt-0.5">Tags: {it.tags.join(", ")}</div>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setEditing(it)} className="h-8 px-3 border border-line text-[11.5px] rounded-md">Edit</button>
              <button
                onClick={async () => {
                  await updateResource(it.id, { is_published: !it.is_published });
                  toast.success(it.is_published ? "Hidden" : "Published");
                  load();
                }}
                className="h-8 px-3 border border-line text-[11.5px] rounded-md"
              >
                {it.is_published ? "Hide" : "Publish"}
              </button>
              {it.archived_at ? (
                <button onClick={async () => { await unarchiveResource(it.id); toast.success("Restored"); load(); }} className="h-8 px-3 border border-line text-[11.5px] rounded-md">Restore</button>
              ) : (
                <button onClick={async () => { await archiveResource(it.id); toast.success("Archived"); load(); }} className="h-8 px-3 border border-line text-[11.5px] rounded-md text-muted-foreground">Archive</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <ResourceEditModal
          item={editing}
          cats={cats}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function ResourceEditModal({ item, cats, onClose, onSaved }: { item: ResourceItem | null; cats: ResourceCategory[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [tags, setTags] = useState((item?.tags ?? []).join(", "));
  const [resourceType, setResourceType] = useState<ResourceType>((item?.resource_type as ResourceType) ?? "external_link");
  const [resourceUrl, setResourceUrl] = useState(item?.resource_url ?? "");
  const [visibility, setVisibility] = useState<Visibility>((item?.visibility as Visibility) ?? "all_team");
  const [allowedRoles, setAllowedRoles] = useState((item?.allowed_role_keys ?? []).join(", "));
  const [allowedModules, setAllowedModules] = useState((item?.allowed_module_keys ?? []).join(", "));
  const [isPublished, setIsPublished] = useState(item?.is_published ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const typeMeta = RESOURCE_TYPES.find((t) => t.key === resourceType);
  const isLink = !!typeMeta?.linkOnly;

  const save = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    if (isLink && !resourceUrl.trim() && !item?.resource_url) { toast.error("URL required"); return; }
    if (!isLink && !file && !item?.storage_path && !resourceUrl.trim()) { toast.error("Upload a file or provide a URL"); return; }

    setBusy(true);
    try {
      let uploaded = null as null | { path: string; size: number; mime: string; name: string };
      if (file) {
        if (file.size > 50 * 1024 * 1024) throw new Error("File too large (max 50 MB)");
        uploaded = await uploadResourceFile(file);
      }

      const payload: Partial<ResourceItem> = {
        title: title.trim(),
        description: description.trim() || null,
        category: category || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        resource_type: resourceType,
        resource_url: resourceUrl.trim() || null,
        visibility,
        allowed_role_keys: visibility === "custom" ? allowedRoles.split(",").map((s) => s.trim()).filter(Boolean) : [],
        allowed_module_keys: visibility === "custom" ? allowedModules.split(",").map((s) => s.trim()).filter(Boolean) : [],
        is_published: isPublished,
      };
      if (uploaded) {
        payload.storage_path = uploaded.path;
        payload.file_name = uploaded.name;
        payload.file_size = uploaded.size;
        payload.mime_type = uploaded.mime;
        if (!payload.resource_type || payload.resource_type === "external_link") payload.resource_type = inferTypeFromFile(file!);
      }

      if (item) await updateResource(item.id, payload);
      else await createResource(payload);
      toast.success(item ? "Updated" : "Created");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[620px] max-h-[92vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-serif text-[18px]">{item ? "Edit resource" : "Add resource"}</div>
        <div>
          <label className={labelCls}>Title *</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={inputCls + " !h-auto py-2"} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">—</option>
              {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Resource type</label>
            <select className={inputCls} value={resourceType} onChange={(e) => setResourceType(e.target.value as ResourceType)}>
              {RESOURCE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Tags (comma-separated)</label>
          <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>

        {isLink ? (
          <div>
            <label className={labelCls}>External URL *</label>
            <input className={inputCls} value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} placeholder="https://…" />
          </div>
        ) : (
          <>
            <div>
              <label className={labelCls}>Upload file {item?.storage_path && "(leave blank to keep current)"}</label>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[12px]" />
              {item?.file_name && <div className="text-[11px] text-muted-foreground mt-1">Current: {item.file_name}</div>}
            </div>
            <div>
              <label className={labelCls}>…or paste URL instead</label>
              <input className={inputCls} value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} placeholder="https://…" />
            </div>
          </>
        )}

        <div>
          <label className={labelCls}>Visibility</label>
          <select className={inputCls} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            {VISIBILITY_OPTIONS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </div>
        {visibility === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Allowed roles (comma-separated)</label>
              <input className={inputCls} value={allowedRoles} onChange={(e) => setAllowedRoles(e.target.value)} placeholder="Sales, Operations" />
            </div>
            <div>
              <label className={labelCls}>Allowed module keys</label>
              <input className={inputCls} value={allowedModules} onChange={(e) => setAllowedModules(e.target.value)} placeholder="crm, operations_crm" />
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          Published (visible to team)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-9 px-4 border border-line rounded-md text-[12.5px]">Cancel</button>
          <button onClick={save} disabled={busy} className="h-9 px-4 bg-black text-white rounded-md text-[12.5px] disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
