import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface IpcComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Optional right-aligned slot (e.g. kebab menu) rendered next to the item */
  rightSlot?: React.ReactNode;
}

interface Props {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: IpcComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  allowClear?: boolean;
  /** When typed text doesn't match any option, render a "create" row. */
  onCreate?: (typedValue: string) => void | Promise<void>;
  createLabel?: (typedValue: string) => string;
  /** Optional header (e.g. "Show archived" toggle) */
  headerSlot?: React.ReactNode;
  className?: string;
  buttonClassName?: string;
}

export function IpcCombobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyText = "No results",
  disabled,
  allowClear,
  onCreate,
  createLabel,
  headerSlot,
  className,
  buttonClassName,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = options.find((o) => o.value === value);
  const norm = (s: string) => s.toLowerCase().trim();
  const q = norm(query);
  const filtered = q
    ? options.filter((o) => norm(o.label).includes(q) || norm(o.description || "").includes(q))
    : options;
  const exactMatch = options.some((o) => norm(o.label) === q);
  const canCreate = !!onCreate && q.length > 0 && !exactMatch;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "ipc-input flex items-center justify-between text-left w-full",
            disabled && "opacity-50 cursor-not-allowed",
            buttonClassName,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 flex-shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0 w-[--radix-popover-trigger-width] min-w-[260px] bg-white border-line", className)}
        align="start"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        {headerSlot}
        <div className="max-h-64 overflow-auto py-1">
          {allowClear && value && (
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-slate-50"
            >
              Clear selection
            </button>
          )}
          {filtered.length === 0 && !canCreate && (
            <div className="px-3 py-4 text-[12px] text-muted-foreground text-center">{emptyText}</div>
          )}
          {filtered.map((o) => {
            const isSel = o.value === value;
            return (
              <div
                key={o.value}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer",
                  o.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50",
                  isSel && "bg-slate-50",
                )}
                onClick={() => {
                  if (o.disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <Check className={cn("h-3.5 w-3.5 flex-shrink-0", isSel ? "opacity-100 text-emerald-600" : "opacity-0")} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{o.label}</div>
                  {o.description && <div className="text-[11px] text-muted-foreground truncate">{o.description}</div>}
                </div>
                {o.rightSlot && (
                  <div onClick={(e) => e.stopPropagation()}>{o.rightSlot}</div>
                )}
              </div>
            );
          })}
          {canCreate && (
            <button
              type="button"
              onClick={async () => {
                await onCreate!(query.trim());
                setQuery("");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-[12.5px] text-emerald-700 hover:bg-emerald-50 border-t border-line"
            >
              + {createLabel ? createLabel(query.trim()) : `Create "${query.trim()}"`}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
