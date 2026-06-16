import { useState } from "react";
import { Calendar as CalendarIcon, X as XIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}

const fmtIso = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : "");
const fmtNice = (d?: Date) => (d ? format(d, "d MMM yyyy") : "");

export default function PaymentDateRangeFilter({ dateFrom, dateTo, onChange, label = "Webinar Date" }: Props) {
  const [open, setOpen] = useState(false);

  const range: DateRange | undefined =
    dateFrom || dateTo
      ? { from: dateFrom ? parseISO(dateFrom) : undefined, to: dateTo ? parseISO(dateTo) : undefined }
      : undefined;

  const display = range?.from
    ? range.to ? `${fmtNice(range.from)} → ${fmtNice(range.to)}` : `${fmtNice(range.from)} → …`
    : label;

  const setPreset = (days: number) => {
    const t = new Date();
    const f = new Date();
    f.setDate(t.getDate() - (days - 1));
    onChange(fmtIso(f), fmtIso(t));
  };

  const setThisMonth = () => {
    const t = new Date();
    const f = new Date(t.getFullYear(), t.getMonth(), 1);
    onChange(fmtIso(f), fmtIso(t));
  };

  const hasRange = !!(dateFrom || dateTo);

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-line bg-white h-9 w-full min-w-0">
      <span className="px-2 text-[10.5px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 px-2 h-7 rounded-md hover:bg-off text-[11.5px] flex-1 min-w-0"
            title="Pick webinar date range"
          >
            <CalendarIcon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
            <span className="truncate">{display}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-auto p-0 bg-white border border-line shadow-lg z-[1100]"
        >
          <div className="flex">
            <div className="flex flex-col border-r border-line py-3 px-2 gap-1 min-w-[140px] bg-[#FAF9F6]">
              <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Quick ranges</div>
              <button type="button" onClick={() => setPreset(1)} className="text-left text-xs px-2 py-1.5 rounded-md hover:bg-white">Today</button>
              <button type="button" onClick={() => setPreset(7)} className="text-left text-xs px-2 py-1.5 rounded-md hover:bg-white">Last 7 days</button>
              <button type="button" onClick={() => setPreset(30)} className="text-left text-xs px-2 py-1.5 rounded-md hover:bg-white">Last 30 days</button>
              <button type="button" onClick={setThisMonth} className="text-left text-xs px-2 py-1.5 rounded-md hover:bg-white">This month</button>
              <button type="button" onClick={() => onChange("", "")} className="text-left text-xs px-2 py-1.5 rounded-md hover:bg-white text-muted-foreground">Clear</button>
            </div>
            <div>
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={range}
                onSelect={(r) => onChange(fmtIso(r?.from), fmtIso(r?.to))}
                defaultMonth={range?.from || new Date()}
                initialFocus
                className="p-3 pointer-events-auto"
              />
              <div className="flex justify-end gap-2 px-3 pb-3">
                <button type="button" onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded-md bg-black text-white hover:opacity-90">Apply</button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {hasRange && (
        <button onClick={() => onChange("", "")} className="text-muted-foreground hover:text-black px-1" title="Clear" type="button">
          <XIcon className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
