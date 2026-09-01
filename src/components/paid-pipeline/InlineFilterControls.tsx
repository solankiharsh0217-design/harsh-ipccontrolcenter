import { useState, type ReactNode } from "react";
import { Calendar as CalendarIcon, Check, Settings2, X as XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { FILTER_LABELS, type PinnedFilterKey } from "./pinnedFilters";

/** Shared shell for a compact inline (pinned) filter control. */
export function InlineFilterShell({
  label,
  valueLabel,
  active,
  onClear,
  children,
  panelClassName,
}: {
  label: string;
  valueLabel: string;
  active: boolean;
  onClear?: () => void;
  children: ReactNode;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`inline-flex items-center gap-1 h-[34px] border bg-white ${active ? "border-gold bg-gold-pale" : "border-line"}`}
      style={{ borderRadius: 8, paddingLeft: 12, paddingRight: active && onClear ? 6 : 12 }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center gap-1.5 text-[12px] max-w-[230px] h-full">
            <span className="text-muted-foreground whitespace-nowrap">{label}:</span>
            <span className="truncate font-medium">{valueLabel}</span>
            <span className="text-[9px] text-muted-foreground">▾</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className={panelClassName || "w-auto p-0 bg-white border border-line z-[1300]"}
          style={{ borderRadius: 8 }}
        >
          <div onClick={() => { /* keep open for multi selects */ }}>{children}</div>
        </PopoverContent>
      </Popover>
      {active && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-muted-foreground hover:text-black px-1 leading-none"
          aria-label={`Clear ${label}`}
        >
          <XIcon className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function OptionRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 hover:bg-off ${selected ? "bg-off" : ""}`}
    >
      <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
        {selected && <Check className="w-3 h-3" />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Single-value inline filter (value "all" = inactive). */
export function InlineSelectFilter({
  label,
  allLabel,
  value,
  onChange,
  options,
}: {
  label: string;
  allLabel: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  const active = value !== "all";
  const current = active ? options.find((o) => o.v === value)?.l || value : "All";
  return (
    <InlineFilterShell label={label} valueLabel={current} active={active} onClear={() => onChange("all")}>
      <div className="min-w-[200px] max-h-[320px] overflow-y-auto py-1">
        <OptionRow label={allLabel} selected={!active} onClick={() => onChange("all")} />
        {options.map((o) => (
          <OptionRow key={o.v} label={o.l} selected={value === o.v} onClick={() => onChange(o.v)} />
        ))}
      </div>
    </InlineFilterShell>
  );
}

/** Multi-value inline filter. */
export function InlineMultiFilter({
  label,
  selectedValues,
  onChange,
  options,
}: {
  label: string;
  selectedValues: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string }[];
}) {
  const active = selectedValues.length > 0;
  const valueLabel = !active
    ? "All"
    : selectedValues.length === 1
      ? options.find((o) => o.value === selectedValues[0])?.label || selectedValues[0]
      : `${selectedValues.length} selected`;
  const toggle = (v: string) =>
    onChange(selectedValues.includes(v) ? selectedValues.filter((x) => x !== v) : [...selectedValues, v]);
  return (
    <InlineFilterShell label={label} valueLabel={valueLabel} active={active} onClear={() => onChange([])}>
      <div className="min-w-[220px] max-h-[320px] overflow-y-auto py-1">
        {options.length === 0 && <div className="px-3 py-3 text-[11px] text-muted-foreground">No options</div>}
        {options.map((o) => (
          <OptionRow
            key={o.value}
            label={o.label}
            selected={selectedValues.includes(o.value)}
            onClick={() => toggle(o.value)}
          />
        ))}
      </div>
    </InlineFilterShell>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const nice = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** Compact inline date-range control with quick-select shortcuts. */
export function InlineDateRangeFilter({
  from,
  to,
  onChange,
  label = "Webinar date",
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = !!(from || to);
  const valueLabel = !active
    ? "All time"
    : from && to
      ? `${nice(from)} – ${nice(to)}`
      : from
        ? `${nice(from)} – …`
        : `… – ${nice(to)}`;

  const now = new Date();
  const apply = (f: string, t: string) => { onChange(f, t); setOpen(false); };
  const presets: { l: string; run: () => void }[] = [
    { l: "This month", run: () => apply(iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))) },
    { l: "Last month", run: () => apply(iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))) },
    { l: "Last 3 months", run: () => apply(iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))) },
    { l: "This year", run: () => apply(iso(new Date(now.getFullYear(), 0, 1)), iso(new Date(now.getFullYear(), 11, 31))) },
    { l: "All time", run: () => apply("", "") },
  ];

  return (
    <div
      className={`inline-flex items-center gap-1 h-[34px] border bg-white ${active ? "border-gold bg-gold-pale" : "border-line"}`}
      style={{ borderRadius: 8, paddingLeft: 12, paddingRight: active ? 6 : 12 }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center gap-1.5 text-[12px] h-full max-w-[280px]">
            <CalendarIcon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
            <span className="text-muted-foreground whitespace-nowrap">{label}:</span>
            <span className="truncate font-medium">{valueLabel}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-auto p-3 bg-white border border-line z-[1300]"
          style={{ borderRadius: 8 }}
        >
          <div className="flex flex-wrap gap-1.5 mb-3 max-w-[300px]">
            {presets.map((p) => (
              <button
                key={p.l}
                type="button"
                onClick={p.run}
                className="text-[11px] px-2.5 py-1 rounded-full border border-line bg-off hover:bg-gold-pale hover:border-gold"
              >
                {p.l}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => onChange(e.target.value, to)}
                className="h-9 border border-line px-2 text-[12px] text-foreground"
                style={{ borderRadius: 8 }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => onChange(from, e.target.value)}
                className="h-9 border border-line px-2 text-[12px] text-foreground"
                style={{ borderRadius: 8 }}
              />
            </label>
          </div>
        </PopoverContent>
      </Popover>
      {active && (
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="text-muted-foreground hover:text-black px-1 leading-none"
          aria-label="Clear date range"
        >
          <XIcon className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/** Gear popover to choose which filters are pinned to the front of the page. */
export function CustomizeFilterBar({
  pinned,
  onToggle,
  onReset,
}: {
  pinned: PinnedFilterKey[];
  onToggle: (k: PinnedFilterKey) => void;
  onReset: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-[34px] w-[34px] inline-flex items-center justify-center border border-line bg-white hover:bg-off"
          style={{ borderRadius: 8 }}
          title="Customize filter bar"
          aria-label="Customize filter bar"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[280px] p-0 bg-white border border-line z-[1300]"
        style={{ borderRadius: 8 }}
      >
        <div className="px-3 py-2 border-b border-line font-serif text-[15px]">Customize filter bar</div>
        <div className="max-h-[320px] overflow-y-auto py-1">
          {FILTER_LABELS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px] hover:bg-off cursor-pointer">
              <span>{f.label}</span>
              <Switch checked={pinned.includes(f.key)} onCheckedChange={() => onToggle(f.key)} />
            </label>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-line">
          <button type="button" onClick={onReset} className="text-[11.5px] text-muted-foreground hover:text-black underline">
            Reset to default
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
