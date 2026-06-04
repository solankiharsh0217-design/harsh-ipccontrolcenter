import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import {
  DURATION_UNITS,
  canDeleteOfferItem,
  createOfferItem,
  createPreset,
  deleteOfferItem,
  deletePreset,
  getPresetItems,
  listOfferItems,
  listPresets,
  updateOfferItem,
  updatePreset,
  type DraftOffer,
  type OfferItem,
  type OfferPreset,
} from "@/lib/offers";

const inputCls =
  "h-8 w-full border border-line rounded-md px-2 text-[12.5px] focus:outline-none focus:border-gold font-sans bg-white";
const labelCls = "block text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1 font-sans";

export default function OfferCatalog() {
  const { isAdmin, loading } = useAuth();
  const [tab, setTab] = useState<"services" | "presets">("services");

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/admin-center" replace />;

  return (
    <div className="max-w-[1060px]">
      <PageHead title="Offer / Service Catalog" sub="Manage the services your team can promise to paid buyers during import, plus reusable offer presets." />
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("services")}
          className={`h-9 px-4 text-[12.5px] rounded-md ${tab === "services" ? "bg-black text-white" : "border border-line text-black"}`}
        >
          Services
        </button>
        <button
          onClick={() => setTab("presets")}
          className={`h-9 px-4 text-[12.5px] rounded-md ${tab === "presets" ? "bg-black text-white" : "border border-line text-black"}`}
        >
          Presets
        </button>
      </div>
      {tab === "services" ? <ServicesTab /> : <PresetsTab />}
    </div>
  );
}

function ServicesTab() {
  const [items, setItems] = useState<OfferItem[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<OfferItem | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const xs = await listOfferItems(true);
      setItems(xs);
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const visible = items.filter((i) => (showArchived ? true : i.is_active));

  return (
    <>
      <SectionLabel>Services ({visible.length})</SectionLabel>
      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <button onClick={() => setCreating(true)} className="h-9 px-4 bg-black text-white text-[12.5px] rounded-md">
          + New service
        </button>
      </div>

      <div className="border border-line rounded-md bg-white divide-y divide-line">
        {visible.length === 0 && <div className="p-4 text-[12.5px] text-muted-foreground">No services yet.</div>}
        {visible.map((it) => (
          <div key={it.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="font-medium text-[13px] text-black truncate">{it.name}</div>
                {!it.is_active && <span className="text-[10px] uppercase bg-off px-1.5 py-0.5 rounded text-muted-foreground">Archived</span>}
                {it.category && <span className="text-[10px] text-muted-foreground">· {it.category}</span>}
              </div>
              {it.description && <div className="text-[11.5px] text-muted-foreground mt-0.5 truncate">{it.description}</div>}
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Default: {it.default_duration_value ?? "—"} {it.default_duration_unit || ""} {it.default_quantity != null ? `· qty ${it.default_quantity}` : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(it)} className="h-8 px-3 border border-line text-[11.5px] rounded-md">
                Edit
              </button>
              {it.is_active ? (
                <button
                  onClick={async () => {
                    await updateOfferItem(it.id, { is_active: false });
                    toast.success("Archived");
                    load();
                  }}
                  className="h-8 px-3 border border-line text-[11.5px] rounded-md text-muted-foreground"
                >
                  Archive
                </button>
              ) : (
                <button
                  onClick={async () => {
                    await updateOfferItem(it.id, { is_active: true });
                    toast.success("Reactivated");
                    load();
                  }}
                  className="h-8 px-3 border border-line text-[11.5px] rounded-md"
                >
                  Reactivate
                </button>
              )}
              <button
                onClick={async () => {
                  const ok = await canDeleteOfferItem(it.id);
                  if (!ok) {
                    toast.error("Cannot delete — service is in use. Archive instead.");
                    return;
                  }
                  if (!confirm(`Delete "${it.name}"? This cannot be undone.`)) return;
                  try {
                    await deleteOfferItem(it.id);
                    toast.success("Deleted");
                    load();
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}
                className="h-8 px-3 border border-red-200 text-red-600 text-[11.5px] rounded-md"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <ServiceEditModal
          item={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            load();
          }}
        />
      )}
    </>
  );
}

function ServiceEditModal({ item, onClose, onSaved }: { item: OfferItem | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [category, setCategory] = useState(item?.category || "");
  const [durVal, setDurVal] = useState<string>(item?.default_duration_value?.toString() || "");
  const [durUnit, setDurUnit] = useState(item?.default_duration_unit || "");
  const [qty, setQty] = useState<string>(item?.default_quantity?.toString() || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        default_duration_value: durVal === "" ? null : Number(durVal),
        default_duration_unit: durUnit || null,
        default_quantity: qty === "" ? null : Number(qty),
      };
      if (item) await updateOfferItem(item.id, payload as any);
      else await createOfferItem(payload as any);
      toast.success(item ? "Updated" : "Created");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[520px] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-serif text-[18px]">{item ? "Edit service" : "New service"}</div>
        <div>
          <label className={labelCls}>Name *</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Ad Support" />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea
            className={inputCls + " !h-auto py-2"}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Default duration</label>
            <input type="number" className={inputCls} value={durVal} onChange={(e) => setDurVal(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Unit</label>
            <select className={inputCls} value={durUnit} onChange={(e) => setDurUnit(e.target.value)}>
              <option value="">—</option>
              {DURATION_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Default qty</label>
            <input type="number" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-9 px-4 border border-line rounded-md text-[12.5px]">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="h-9 px-4 bg-black text-white rounded-md text-[12.5px] disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PresetsTab() {
  const [presets, setPresets] = useState<OfferPreset[]>([]);
  const [items, setItems] = useState<OfferItem[]>([]);
  const [editing, setEditing] = useState<{ preset: OfferPreset | null; items: DraftOffer[] } | null>(null);

  const load = async () => {
    const [ps, it] = await Promise.all([listPresets(true), listOfferItems(false)]);
    setPresets(ps);
    setItems(it);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <SectionLabel>Presets ({presets.length})</SectionLabel>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setEditing({ preset: null, items: [] })}
          className="h-9 px-4 bg-black text-white text-[12.5px] rounded-md"
        >
          + New preset
        </button>
      </div>

      <div className="border border-line rounded-md bg-white divide-y divide-line">
        {presets.length === 0 && <div className="p-4 text-[12.5px] text-muted-foreground">No presets yet.</div>}
        {presets.map((p) => (
          <div key={p.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[13px] text-black truncate">{p.name}</div>
              {p.description && <div className="text-[11.5px] text-muted-foreground truncate">{p.description}</div>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const rows = await getPresetItems(p.id);
                  setEditing({
                    preset: p,
                    items: rows.map((r) => ({
                      offer_item_id: r.offer_item_id,
                      title: r.title || items.find((i) => i.id === r.offer_item_id)?.name || "Service",
                      duration_value: r.duration_value,
                      duration_unit: r.duration_unit,
                      quantity: r.quantity,
                      notes: r.notes,
                    })),
                  });
                }}
                className="h-8 px-3 border border-line text-[11.5px] rounded-md"
              >
                Edit
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete preset "${p.name}"?`)) return;
                  await deletePreset(p.id);
                  toast.success("Deleted");
                  load();
                }}
                className="h-8 px-3 border border-red-200 text-red-600 text-[11.5px] rounded-md"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <PresetEditModal
          preset={editing.preset}
          initialItems={editing.items}
          allItems={items}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function PresetEditModal({
  preset,
  initialItems,
  allItems,
  onClose,
  onSaved,
}: {
  preset: OfferPreset | null;
  initialItems: DraftOffer[];
  allItems: OfferItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(preset?.name || "");
  const [description, setDescription] = useState(preset?.description || "");
  const [items, setItems] = useState<DraftOffer[]>(initialItems);
  const [addId, setAddId] = useState("");
  const [busy, setBusy] = useState(false);

  const add = (id: string) => {
    if (!id) return;
    const oi = allItems.find((i) => i.id === id);
    if (!oi || items.some((x) => x.offer_item_id === id)) return;
    setItems((xs) => [
      ...xs,
      {
        offer_item_id: id,
        title: oi.name,
        duration_value: oi.default_duration_value,
        duration_unit: oi.default_duration_unit,
        quantity: oi.default_quantity,
        notes: null,
      },
    ]);
    setAddId("");
  };

  const updateAt = (i: number, p: Partial<DraftOffer>) =>
    setItems((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  const removeAt = (i: number) => setItems((xs) => xs.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      if (preset) {
        await updatePreset(preset.id, { name: name.trim(), description: description.trim() || null }, items);
      } else {
        await createPreset(name.trim(), description.trim() || null, items);
      }
      toast.success("Saved");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[640px] max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-serif text-[18px]">{preset ? "Edit preset" : "New preset"}</div>
        <div>
          <label className={labelCls}>Name *</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Add service</label>
          <select className={inputCls} value={addId} onChange={(e) => add(e.target.value)}>
            <option value="">Select…</option>
            {allItems.filter((i) => !items.some((x) => x.offer_item_id === i.id)).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="border border-line rounded-md divide-y divide-line">
          {items.length === 0 && <div className="p-3 text-[12px] text-muted-foreground">No services in preset.</div>}
          {items.map((o, i) => (
            <div key={i} className="p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <input className={inputCls + " font-medium"} value={o.title} onChange={(e) => updateAt(i, { title: e.target.value })} />
                <button onClick={() => removeAt(i)} className="h-8 w-8 text-muted-foreground hover:text-red-600">×</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" placeholder="Duration" className={inputCls} value={o.duration_value ?? ""} onChange={(e) => updateAt(i, { duration_value: e.target.value === "" ? null : Number(e.target.value) })} />
                <select className={inputCls} value={o.duration_unit || ""} onChange={(e) => updateAt(i, { duration_unit: e.target.value || null })}>
                  <option value="">Unit</option>
                  {DURATION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="number" placeholder="Qty" className={inputCls} value={o.quantity ?? ""} onChange={(e) => updateAt(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <input className={inputCls} placeholder="Notes" value={o.notes ?? ""} onChange={(e) => updateAt(i, { notes: e.target.value || null })} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-9 px-4 border border-line rounded-md text-[12.5px]">Cancel</button>
          <button onClick={save} disabled={busy} className="h-9 px-4 bg-black text-white rounded-md text-[12.5px] disabled:opacity-40">{busy ? "Saving…" : "Save preset"}</button>
        </div>
      </div>
    </div>
  );
}
