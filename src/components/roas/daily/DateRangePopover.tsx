import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  from: string; // yyyy-mm-dd
  to: string;   // yyyy-mm-dd
  onChange: (from: string, to: string) => void;
  label?: string;
}

const fmtIso = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : "");
const fmtNice = (d?: Date) => (d ? format(d, "d MMM yyyy") : "");

export default function DateRangePopover({ from, to, onChange, label = "Date range" }: Props) {
  const [open, setOpen] = useState(false);
  const range: DateRange | undefined =
    from || to
      ? { from: from ? parseISO(from) : undefined, to: to ? parseISO(to) : undefined }
      : undefined;

  const display = range?.from
    ? range.to
      ? `${fmtNice(range.from)} – ${fmtNice(range.to)}`
      : `${fmtNice(range.from)} – …`
    : "All dates";

  const setPreset = (days: number) => {
    const t = new Date();
    const f = new Date();
    f.setDate(t.getDate() - (days - 1));
    onChange(fmtIso(f), fmtIso(t));
  };

  return (
    <div>
      <label className="fl-sm">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="fi-sm flex items-center justify-between gap-2 w-full text-left"
            style={{ cursor: "pointer" }}
          >
            <span className="flex items-center gap-2 truncate">
              <CalendarIcon className="w-3.5 h-3.5 opacity-70" />
              <span className="truncate">{display}</span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0 bg-white border border-line shadow-lg" sideOffset={6}>
          <div className="flex">
            <div className="flex flex-col border-r border-line py-3 px-2 gap-1 min-w-[140px] bg-[#FAF9F6]">
              <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Quick ranges</div>
              {[
                { l: "Today", d: 1 },
                { l: "Last 7 days", d: 7 },
                { l: "Last 14 days", d: 14 },
                { l: "Last 30 days", d: 30 },
                { l: "Last 90 days", d: 90 },
              ].map((p) => (
                <button
                  key={p.l}
                  type="button"
                  onClick={() => { setPreset(p.d); }}
                  className="text-left text-xs px-2 py-1.5 rounded-md hover:bg-white"
                >
                  {p.l}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onChange("", "")}
                className="text-left text-xs px-2 py-1.5 rounded-md hover:bg-white text-muted-foreground"
              >
                Clear
              </button>
            </div>
            <div>
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={range}
                onSelect={(r) => onChange(fmtIso(r?.from), fmtIso(r?.to))}
                defaultMonth={range?.from || new Date()}
                initialFocus
              />
              <div className="flex justify-end gap-2 px-3 pb-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs px-3 py-1.5 rounded-md bg-black text-white hover:opacity-90"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
