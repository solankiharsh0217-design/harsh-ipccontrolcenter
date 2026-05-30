import { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Action { label: string; onClick: () => void; destructive?: boolean; disabled?: boolean }

interface Props {
  title: string;
  summary: ReactNode;
  chips?: Array<{ label: string; tone?: "default" | "violet" | "blue" | "emerald" | "slate" }>;
  active: boolean;
  onToggleActive: () => void;
  lastRun?: string | null;
  actions: Action[];
}

const toneClass = (tone?: string) => {
  switch (tone) {
    case "violet": return "bg-violet-50 text-violet-700 border-violet-200";
    case "blue": return "bg-blue-50 text-blue-700 border-blue-200";
    case "emerald": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "slate": return "bg-slate-100 text-slate-600 border-slate-200";
    default: return "bg-slate-50 text-slate-700 border-line";
  }
};

export default function RuleCard({ title, summary, chips, active, onToggleActive, lastRun, actions }: Props) {
  return (
    <div className="bg-white border border-line rounded-xl p-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <div className="text-[13px] font-semibold truncate">{title}</div>
          {chips?.map((c, i) => (
            <span key={i} className={`text-[10.5px] px-2 py-0.5 rounded-full border ${toneClass(c.tone)}`}>{c.label}</span>
          ))}
        </div>
        <div className="text-[12px] text-muted-foreground leading-relaxed">{summary}</div>
        {lastRun && <div className="text-[10.5px] text-muted-foreground mt-2">Last run: {lastRun}</div>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleActive}
          className={`text-[11px] px-2 py-0.5 rounded border ${active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}
        >
          {active ? "Active" : "Inactive"}
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-1.5 rounded hover:bg-slate-100" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-1 w-44 bg-white border-line">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={a.onClick}
                disabled={a.disabled}
                className={`block w-full text-left text-[12px] px-2 py-1.5 rounded hover:bg-slate-50 disabled:opacity-50 ${a.destructive ? "text-rose-600" : ""}`}
              >
                {a.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
