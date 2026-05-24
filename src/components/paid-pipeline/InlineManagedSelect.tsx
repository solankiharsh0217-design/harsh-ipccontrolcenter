import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { logActivity } from "@/lib/auditLog";

type Opt = { id: string; label: string; color?: string | null };

export default function InlineManagedSelect({
  settingType,
  value,
  onChange,
  placeholder = "—",
  width = 140,
  colorize = false,
  refreshKey,
  onListChanged,
}: {
  settingType: "pipeline_stage" | "lead_priority";
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
  colorize?: boolean;
  refreshKey?: number;
  onListChanged?: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Opt[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from("paid_pipeline_settings")
      .select("id, label, value")
      .eq("setting_type", settingType)
      .eq("is_active", true)
      .eq("is_deleted", false)
      .order("sort_order");
    const list = ((data as any[]) || []).map((r) => {
      let color: string | null = null;
      try { const v = r.value ? JSON.parse(r.value) : null; color = v?.color || null; } catch {}
      return { id: r.id, label: r.label, color };
    });
    setOpts(list);
  };
  useEffect(() => { load(); }, [settingType, refreshKey]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setAdding(false); setNewLabel("");
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const addNew = async () => {
    const trimmed = newLabel.trim();
    if (!trimmed) { toast.error("Name required"); return; }
    if (opts.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Already exists"); return;
    }
    const valueObj = newColor ? { color: newColor } : {};
    const { error } = await supabase.from("paid_pipeline_settings").insert({
      setting_type: settingType,
      label: trimmed,
      value: JSON.stringify(valueObj),
      sort_order: (opts.length + 1) * 10,
      is_active: true,
      created_by: user?.id || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Added");
    logActivity({
      module_key: "paid_pipeline", module_label: "Paid Pipeline",
      action_type: settingType === "pipeline_stage" ? "stage_created" : "lead_priority_created",
      action_label: settingType === "pipeline_stage" ? "Stage created" : "Priority created",
      summary: `${trimmed} added`,
    });
    setNewLabel(""); setNewColor(""); setAdding(false);
    onChange(trimmed);
    await load();
    onListChanged?.();
  };

  const deactivate = async (o: Opt) => {
    if (!confirm(`Deactivate "${o.label}"? Existing leads keep this value; it just won't appear in new dropdowns.`)) return;
    const { error } = await supabase.from("paid_pipeline_settings")
      .update({ is_active: false } as any).eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deactivated");
    logActivity({
      module_key: "paid_pipeline", module_label: "Paid Pipeline",
      action_type: settingType === "pipeline_stage" ? "stage_deactivated" : "lead_priority_deactivated",
      action_label: settingType === "pipeline_stage" ? "Stage deactivated" : "Priority deactivated",
      summary: `${o.label} deactivated`, severity: "warning",
    });
    await load();
    onListChanged?.();
  };

  const current = opts.find((o) => o.label === value);
  const currentColor = colorize ? (current?.color || undefined) : undefined;

  return (
    <div ref={ref} className="relative inline-block" style={{ width }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-7 border border-line rounded px-2 text-[11px] text-left bg-white truncate flex items-center justify-between gap-1 hover:bg-off"
        style={{ color: currentColor }}
        title={value || placeholder}
      >
        <span className="truncate">{value || placeholder}</span>
        <span className="text-[8px] text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-8 bg-white border border-line rounded-md shadow-lg min-w-full w-[220px] max-h-[320px] overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className="w-full text-left px-2.5 py-1.5 text-[11.5px] hover:bg-off text-muted-foreground"
          >— Clear —</button>
          {opts.map((o) => (
            <div key={o.id} className="flex items-center group hover:bg-off">
              <button
                type="button"
                onClick={() => { onChange(o.label); setOpen(false); }}
                className="flex-1 text-left px-2.5 py-1.5 text-[11.5px] truncate"
                style={{ color: colorize ? o.color || undefined : undefined }}
              >
                {colorize && o.color && (
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: o.color }} />
                )}
                {o.label}
              </button>
              <button
                type="button"
                title="Deactivate"
                onClick={(e) => { e.stopPropagation(); deactivate(o); }}
                className="opacity-0 group-hover:opacity-100 px-2 text-[10px] text-muted-foreground hover:text-[#DC2626]"
              >✕</button>
            </div>
          ))}
          <div className="border-t border-line">
            {!adding ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="w-full text-left px-2.5 py-1.5 text-[11.5px] text-[#2563EB] hover:bg-off"
              >+ Add new {settingType === "pipeline_stage" ? "stage" : "priority"}</button>
            ) : (
              <div className="p-2 space-y-1.5">
                <input
                  autoFocus
                  className="w-full h-7 px-2 text-[11.5px] border border-line rounded"
                  placeholder="Name"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addNew(); if (e.key === "Escape") { setAdding(false); setNewLabel(""); } }}
                />
                {colorize && (
                  <input
                    className="w-full h-7 px-2 text-[11.5px] border border-line rounded"
                    placeholder="Color hex e.g. #DC2626"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                  />
                )}
                <div className="flex gap-1">
                  <button type="button" onClick={addNew} className="flex-1 h-7 text-[11px] bg-black text-white rounded">Save</button>
                  <button type="button" onClick={() => { setAdding(false); setNewLabel(""); }} className="flex-1 h-7 text-[11px] border border-line rounded">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
