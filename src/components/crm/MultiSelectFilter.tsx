import { useMemo, useState, type ReactNode } from "react";
import { Search, X, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
  color?: string;
}

interface Props {
  label: string;
  icon?: ReactNode;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
  showCounts?: boolean;
  allowSelectAll?: boolean;
  allowClear?: boolean;
  placeholder?: string;
  buttonClassName?: string;
  panelWidth?: number;
}

export default function MultiSelectFilter({
  label,
  icon,
  options,
  selectedValues,
  onChange,
  searchable = true,
  showCounts = true,
  allowSelectAll = true,
  allowClear = true,
  placeholder,
  buttonClassName,
  panelWidth = 280,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filteredOptions = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term));
  }, [options, q]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const selectedCount = selectedValues.length;

  const buttonLabel = selectedCount === 0
    ? (placeholder || `All ${label.toLowerCase()}`)
    : selectedCount === 1
      ? (options.find((o) => o.value === selectedValues[0])?.label || selectedValues[0])
      : `${selectedCount} ${label.toLowerCase()} selected`;

  const toggle = (val: string) => {
    if (selectedSet.has(val)) onChange(selectedValues.filter((v) => v !== val));
    else onChange([...selectedValues, val]);
  };

  const selectAllVisible = () => {
    const merged = new Set(selectedValues);
    filteredOptions.forEach((o) => merged.add(o.value));
    onChange(Array.from(merged));
  };

  const clearAll = () => onChange([]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={buttonClassName || "ipc-input !h-9 !text-xs flex items-center gap-1.5 min-w-[140px] justify-between bg-white"}
          title={`Filter by ${label.toLowerCase()}`}
        >
          <span className="flex items-center gap-1.5 truncate">
            {icon}
            <span className="truncate">{buttonLabel}</span>
            {selectedCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-black text-white text-[9px] font-medium">
                {selectedCount}
              </span>
            )}
          </span>
          <span className="text-[9px] text-muted-foreground">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        style={{ width: panelWidth }}
        className="z-[1100] p-0 bg-white border border-line rounded-md shadow-lg overflow-hidden"
      >
        {searchable && (
          <div className="p-2 border-b border-line flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="flex-1 text-xs outline-none bg-transparent"
            />
            {q && (
              <button onClick={() => setQ("")} className="text-muted-foreground hover:text-black" aria-label="Clear search">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
        {(allowSelectAll || allowClear) && (
          <div className="px-2 py-1.5 border-b border-line flex items-center justify-between text-[10px]">
            {allowSelectAll ? (
              <button onClick={selectAllVisible} className="text-[#2563EB] hover:underline">
                Select {q ? "filtered" : "all"}
              </button>
            ) : <span />}
            {allowClear && selectedCount > 0 ? (
              <button onClick={clearAll} className="text-muted-foreground hover:text-black">
                Clear ({selectedCount})
              </button>
            ) : <span className="text-muted-foreground">{filteredOptions.length} option{filteredOptions.length === 1 ? "" : "s"}</span>}
          </div>
        )}
        <div className="max-h-[300px] overflow-y-auto">
          {filteredOptions.length === 0 && (
            <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">No matches</div>
          )}
          {filteredOptions.map((o) => {
            const selected = selectedSet.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-off ${selected ? "bg-off" : ""}`}
              >
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${selected ? "bg-black border-black" : "border-line bg-white"}`}>
                  {selected && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                {o.color && (
                  <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: o.color }} />
                )}
                <span className="truncate flex-1">{o.label}</span>
                {showCounts && typeof o.count === "number" && (
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{o.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Canonical grade vocabulary + normalization shared with Calling CRM filters.
export const CANONICAL_GRADES: { value: string; label: string }[] = [
  { value: "super-hot", label: "★ Super Hot" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
  { value: "true-absentee", label: "True Absentee" },
  { value: "non-attendee", label: "No Show" },
  { value: "very-cold", label: "Very Cold" },
];

export function normalizeGradeValue(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).toLowerCase().trim().replace(/_/g, "-").replace(/\s+/g, "-");
  if (s === "true-absent" || s === "absentee" || s === "true-absentees") return "true-absentee";
  if (s === "superhot") return "super-hot";
  return s;
}

export function gradeLabel(value: string): string {
  const found = CANONICAL_GRADES.find((g) => g.value === value);
  if (found) return found.label;
  // Title-case fallback for unknown grades surfaced from data.
  return value.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
