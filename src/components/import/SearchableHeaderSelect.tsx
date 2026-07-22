import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X, Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Searchable single-select for mapping a target field to one of the source columns
 * fetched from a CSV or Google Sheet. Native <select> is not filterable, which is
 * unusable when a sheet has 20+ columns.
 */
export default function SearchableHeaderSelect({ value, onChange, options, placeholder, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((h) => h.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="ipc-input w-full text-left flex items-center justify-between gap-2 disabled:opacity-60"
      >
        <span className={value ? "" : "text-muted-foreground"}>
          {value || placeholder || "— none —"}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {value && !disabled && (
            <X
              className="w-3.5 h-3.5 hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
            />
          )}
          <ChevronDown className="w-3.5 h-3.5" />
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-hidden bg-white border border-line rounded-md shadow-lg flex flex-col">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-line bg-off/40">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search columns…"
              className="flex-1 bg-transparent outline-none text-xs"
            />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-off ${!value ? "bg-off font-medium" : ""}`}
            >
              — none —
            </button>
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-muted-foreground">No columns match "{query}".</div>
            ) : filtered.map((h) => (
              <button
                key={h || "(blank)"}
                type="button"
                onClick={() => { onChange(h); setOpen(false); }}
                className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-off truncate ${value === h ? "bg-off font-medium" : ""}`}
                title={h}
              >
                {h || "(blank header)"}
              </button>
            ))}
          </div>
          <div className="px-2 py-1 border-t border-line bg-off/40 text-[10px] text-muted-foreground">
            {filtered.length} of {options.length} columns
          </div>
        </div>
      )}
    </div>
  );
}
