import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHead, SectionLabel, LoadingState } from "@/components/ui-bits";
import {
  RESOURCE_TYPES,
  listCategories,
  listResources,
  signedUrl,
  type ResourceCategory,
  type ResourceItem,
} from "@/lib/resourceLibrary";

const inputCls =
  "h-9 w-full border border-line rounded-md px-2.5 text-[12.5px] focus:outline-none focus:border-gold font-sans bg-white";

export default function ResourceLibrary() {
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [cats, setCats] = useState<ResourceCategory[]>([]);
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("");
  const [fType, setFType] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [it, c] = await Promise.all([listResources(), listCategories()]);
        setItems(it);
        setCats(c);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => {
      if (fCat && i.category !== fCat) return false;
      if (fType && i.resource_type !== fType) return false;
      if (t) {
        const hay = `${i.title} ${i.description ?? ""} ${(i.tags ?? []).join(" ")} ${i.category ?? ""}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [items, q, fCat, fType]);

  const recent = useMemo(() => [...items].slice(0, 6), [items]);

  const openResource = async (r: ResourceItem) => {
    try {
      if (r.storage_path) {
        const url = await signedUrl(r.storage_path);
        window.open(url, "_blank", "noopener,noreferrer");
      } else if (r.resource_url) {
        window.open(r.resource_url, "_blank", "noopener,noreferrer");
      } else {
        toast.error("No file or link");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to open");
    }
  };

  return (
    <div className="max-w-[1200px]">
      <PageHead title="IPC Resource Library" sub="Search team resources — files, templates, links, and assets." />

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className={inputCls + " max-w-[280px]"} />
        <select className={inputCls + " max-w-[200px]"} value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select className={inputCls + " max-w-[180px]"} value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">All types</option>
          {RESOURCE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFCat("")}
          className={`h-8 px-3 rounded-full border text-[11.5px] ${fCat === "" ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground"}`}
        >
          All
        </button>
        {cats.map((c) => (
          <button
            key={c.id}
            onClick={() => setFCat(c.name)}
            className={`h-8 px-3 rounded-full border text-[11.5px] ${fCat === c.name ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground hover:text-black"}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {!q && !fCat && !fType && recent.length > 0 && (
        <>
          <SectionLabel>Recent</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {recent.map((r) => <ResourceCard key={r.id} r={r} onOpen={openResource} />)}
          </div>
        </>
      )}

      <SectionLabel>All resources ({filtered.length})</SectionLabel>
      {loading ? (
        <div className="p-4"><LoadingState /></div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-line rounded-md p-8 text-center">
          <div className="font-serif text-[16px] mb-1">No resources found</div>
          <div className="text-[12px] text-muted-foreground">Try adjusting search or filters.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r) => <ResourceCard key={r.id} r={r} onOpen={openResource} />)}
        </div>
      )}
    </div>
  );
}

function ResourceCard({ r, onOpen }: { r: ResourceItem; onOpen: (r: ResourceItem) => void }) {
  const isFile = !!r.storage_path;
  const btnLabel = isFile ? (r.mime_type?.startsWith("image/") || r.mime_type === "application/pdf" ? "Preview" : "Download") : "Open";
  return (
    <div className="rounded-xl border border-line bg-white p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9.5px] uppercase bg-off px-1.5 py-0.5 rounded text-muted-foreground border border-line">{r.resource_type}</span>
        {r.category && <span className="text-[10.5px] text-muted-foreground">{r.category}</span>}
      </div>
      <div className="font-serif text-[15px] font-medium text-black leading-snug mb-1">{r.title}</div>
      {r.description && <div className="text-[11.5px] text-muted-foreground leading-relaxed mb-2 line-clamp-3">{r.description}</div>}
      {(r.tags?.length ?? 0) > 0 && (
        <div className="text-[10.5px] text-muted-foreground mb-3">{r.tags.map((t) => `#${t}`).join(" ")}</div>
      )}
      <div className="mt-auto pt-2">
        <button
          onClick={() => onOpen(r)}
          className="h-8 px-3 bg-black text-white text-[11.5px] rounded-md hover:bg-[#222]"
        >
          {btnLabel} →
        </button>
      </div>
    </div>
  );
}
