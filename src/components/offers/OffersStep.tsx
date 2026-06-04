import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DURATION_UNITS,
  createOfferItem,
  createPreset,
  getPresetItems,
  listOfferItems,
  listPresets,
  type DraftOffer,
  type OfferItem,
  type OfferPreset,
} from "@/lib/offers";

type Props = {
  value: DraftOffer[];
  onChange: (next: DraftOffer[]) => void;
  presetId: string | null;
  onPresetChange: (id: string | null) => void;
  saveAsPreset: boolean;
  onSaveAsPresetChange: (v: boolean) => void;
  newPresetName: string;
  onNewPresetNameChange: (v: string) => void;
};

const inputCls =
  "h-8 w-full border border-line rounded-md px-2 text-[12px] focus:outline-none focus:border-gold font-sans bg-white";
const labelCls = "block text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1 font-sans";

export default function OffersStep({
  value,
  onChange,
  presetId,
  onPresetChange,
  saveAsPreset,
  onSaveAsPresetChange,
  newPresetName,
  onNewPresetNameChange,
}: Props) {
  const [items, setItems] = useState<OfferItem[]>([]);
  const [presets, setPresets] = useState<OfferPreset[]>([]);
  const [addServiceId, setAddServiceId] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [creatingCustom, setCreatingCustom] = useState(false);

  const reload = async () => {
    const [it, ps] = await Promise.all([listOfferItems(false), listPresets(false)]);
    setItems(it);
    setPresets(ps);
  };

  useEffect(() => {
    reload();
  }, []);

  const applyPreset = async (id: string) => {
    onPresetChange(id || null);
    if (!id) return;
    try {
      const rows = await getPresetItems(id);
      const drafts: DraftOffer[] = rows.map((r) => {
        const oi = items.find((i) => i.id === r.offer_item_id);
        return {
          offer_item_id: r.offer_item_id,
          title: r.title || oi?.name || "Service",
          duration_value: r.duration_value ?? oi?.default_duration_value ?? null,
          duration_unit: r.duration_unit ?? oi?.default_duration_unit ?? null,
          quantity: r.quantity ?? oi?.default_quantity ?? null,
          notes: r.notes ?? null,
          source_preset_id: id,
        };
      });
      onChange(drafts);
    } catch (e: any) {
      toast.error(e.message || "Failed to load preset");
    }
  };

  const addFromCatalog = (id: string) => {
    if (!id) return;
    const oi = items.find((i) => i.id === id);
    if (!oi) return;
    if (value.some((v) => v.offer_item_id === id)) {
      toast.message("Already added");
      setAddServiceId("");
      return;
    }
    onChange([
      ...value,
      {
        offer_item_id: id,
        title: oi.name,
        duration_value: oi.default_duration_value ?? null,
        duration_unit: oi.default_duration_unit ?? null,
        quantity: oi.default_quantity ?? null,
        notes: null,
        source_preset_id: presetId,
      },
    ]);
    setAddServiceId("");
  };

  const addCustom = async () => {
    const name = customName.trim();
    if (!name) return;
    setCreatingCustom(true);
    try {
      const created = await createOfferItem({ name });
      setItems((xs) => [...xs, created]);
      onChange([
        ...value,
        {
          offer_item_id: created.id,
          title: created.name,
          duration_value: null,
          duration_unit: null,
          quantity: null,
          notes: null,
          source_preset_id: presetId,
        },
      ]);
      setCustomName("");
      toast.success("Service added to catalog");
    } catch (e: any) {
      toast.error(e.message || "Only admins can add to the catalog");
    } finally {
      setCreatingCustom(false);
    }
  };

  const updateAt = (i: number, patch: Partial<DraftOffer>) => {
    onChange(value.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  };
  const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const savePresetNow = async () => {
    const n = newPresetName.trim();
    if (!n) {
      toast.error("Preset name required");
      return;
    }
    try {
      const p = await createPreset(n, null, value);
      toast.success("Preset saved");
      setPresets((ps) => [...ps, p]);
      onPresetChange(p.id);
      onSaveAsPresetChange(false);
      onNewPresetNameChange("");
    } catch (e: any) {
      toast.error(e.message || "Failed to save preset");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Offer Preset</label>
        <div className="flex gap-2">
          <select
            className={inputCls}
            value={presetId || ""}
            onChange={(e) => applyPreset(e.target.value)}
          >
            <option value="">— None —</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Add service from catalog</label>
        <div className="flex gap-2">
          <select
            className={inputCls}
            value={addServiceId}
            onChange={(e) => addFromCatalog(e.target.value)}
          >
            <option value="">Select a service…</option>
            {items
              .filter((i) => !value.some((v) => v.offer_item_id === i.id))
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Or add a custom service</label>
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder="New service name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <button
            type="button"
            disabled={!customName.trim() || creatingCustom}
            onClick={addCustom}
            className="h-8 px-3 bg-black text-white text-[11.5px] rounded-md disabled:opacity-40 whitespace-nowrap"
          >
            Add
          </button>
        </div>
      </div>

      <div className="border border-line rounded-md">
        <div className="px-3 py-2 border-b border-line text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Selected services ({value.length})
        </div>
        {value.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-muted-foreground">
            No services selected. You can proceed without offers — a warning will be shown before import.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {value.map((o, i) => (
              <div key={i} className="p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    className={inputCls + " font-medium"}
                    value={o.title}
                    onChange={(e) => updateAt(i, { title: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="h-8 w-8 text-muted-foreground hover:text-red-600 text-[14px]"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    placeholder="Duration"
                    className={inputCls}
                    value={o.duration_value ?? ""}
                    onChange={(e) =>
                      updateAt(i, { duration_value: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                  <select
                    className={inputCls}
                    value={o.duration_unit || ""}
                    onChange={(e) => updateAt(i, { duration_unit: e.target.value || null })}
                  >
                    <option value="">Unit</option>
                    {DURATION_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Qty"
                    className={inputCls}
                    value={o.quantity ?? ""}
                    onChange={(e) =>
                      updateAt(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </div>
                <input
                  className={inputCls}
                  placeholder="Notes (optional)"
                  value={o.notes ?? ""}
                  onChange={(e) => updateAt(i, { notes: e.target.value || null })}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line pt-3">
        <label className="flex items-center gap-2 text-[12px] text-black cursor-pointer">
          <input
            type="checkbox"
            checked={saveAsPreset}
            onChange={(e) => onSaveAsPresetChange(e.target.checked)}
          />
          Save this selection as a new preset
        </label>
        {saveAsPreset && (
          <div className="flex gap-2 mt-2">
            <input
              className={inputCls}
              placeholder="Preset name (e.g. 3 June Diamond Sales Webinar)"
              value={newPresetName}
              onChange={(e) => onNewPresetNameChange(e.target.value)}
            />
            <button
              type="button"
              onClick={savePresetNow}
              disabled={!newPresetName.trim() || value.length === 0}
              className="h-8 px-3 bg-black text-white text-[11.5px] rounded-md disabled:opacity-40 whitespace-nowrap"
            >
              Save preset now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
