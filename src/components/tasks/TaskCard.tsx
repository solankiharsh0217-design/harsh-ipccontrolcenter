import { useState } from "react";
import { ExternalLink, Upload, CheckCircle2, Check, Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Task, TaskStatus, TaskSubmission, PRIORITY_PILL, dueLabel, STATUSES, extractUrls, timeAgo } from "@/lib/tasks";

function hostLabel(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "link"; }
}

export default function TaskCard({
  task, onOpen, onQuickStatus, onDragStart, submission, canSubmit, onSubmit,
}: {
  task: Task;
  onOpen: (t: Task) => void;
  onQuickStatus: (t: Task, s: TaskStatus) => void;
  onDragStart: (t: Task) => void;
  submission?: TaskSubmission | null;
  canSubmit?: boolean;
  onSubmit?: (t: Task) => void;
}) {
  const [hover, setHover] = useState(false);
  const due = dueLabel(task.due_date);
  const dueColor = due.tone === "overdue" ? "text-[#DC2626]" : due.tone === "today" ? "text-[#CA8A04]" : "text-muted-foreground";
  const isDone = task.status === "done";
  const showCreator = task.created_by && task.created_by !== task.assigned_to;
  const urls = extractUrls(task.note);
  const firstUrl = urls[0];
  const extraCount = Math.max(0, urls.length - 1);
  const quick: { s: TaskStatus; label: string }[] = [
    { s: "inprogress", label: "→ Progress" },
    { s: "review", label: "→ Review" },
    { s: "blocked", label: "→ Blocked" },
    { s: "done", label: "✓ Done" },
  ];

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(task); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(task)}
      className={`group border rounded-[10px] px-[14px] py-[13px] cursor-grab transition-colors ${
        isDone
          ? "bg-[#F0FDF4] border-[#BBF7D0] hover:bg-[#E7FBEC] hover:border-[#86EFAC]"
          : "bg-white border-line hover:bg-off hover:border-[#BBB]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`font-serif text-[15px] font-medium leading-snug flex-1 ${isDone ? "line-through" : ""}`}>{task.title}</div>
        <div className="flex items-center gap-1 flex-shrink-0" onClick={stop}>
          <button
            type="button"
            title="Copy title"
            onClick={async (e) => {
              e.stopPropagation();
              try { await navigator.clipboard.writeText(task.title); toast.success("Title copied"); }
              catch { toast.error("Copy failed"); }
            }}
            className="w-6 h-6 rounded-md border border-line bg-white hover:bg-off inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            type="button"
            title={isDone ? "Mark as to-do" : "Mark as done"}
            onClick={(e) => { e.stopPropagation(); onQuickStatus(task, isDone ? "todo" : "done"); }}
            className={`w-6 h-6 rounded-md border inline-flex items-center justify-center transition-colors ${
              isDone
                ? "bg-[#16A34A] border-[#16A34A] text-white hover:bg-[#15803D]"
                : "bg-white border-line text-muted-foreground hover:bg-[#F0FDF4] hover:border-[#86EFAC] hover:text-[#16A34A]"
            }`}
          >
            {isDone ? <RotateCcw className="w-3 h-3" /> : <Check className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className={`inline-flex items-center gap-1 px-2 h-[20px] text-[10px] rounded-full border ${PRIORITY_PILL[task.priority]}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{task.priority}
        </span>
        <span className={`text-[11px] ${dueColor}`}>{due.label}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className="inline-block px-2 h-[18px] text-[9px] rounded-full bg-off text-muted-foreground border border-line leading-[18px]">{task.tag}</span>
        {firstUrl && (
          <>
            <a href={firstUrl} target="_blank" rel="noopener noreferrer" onClick={stop}
              className="inline-flex items-center gap-1 h-[18px] px-1.5 text-[9px] rounded-full bg-white text-[#2563EB] border border-[#BFDBFE] hover:bg-[#EFF6FF]">
              <ExternalLink className="w-2.5 h-2.5" /> Open {hostLabel(firstUrl)}
            </a>
            {extraCount > 0 && <span className="text-[9px] text-muted-foreground">+{extraCount} link{extraCount===1?"":"s"}</span>}
          </>
        )}
        {submission && (
          <>
            <span className="inline-flex items-center gap-1 h-[18px] px-1.5 text-[9px] rounded-full bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
              <CheckCircle2 className="w-2.5 h-2.5" /> Submitted
            </span>
            <a href={submission.submission_url} target="_blank" rel="noopener noreferrer" onClick={stop}
              className="inline-flex items-center gap-1 h-[18px] px-1.5 text-[9px] rounded-full bg-white text-[#16A34A] border border-[#BBF7D0] hover:bg-[#F0FDF4]">
              <ExternalLink className="w-2.5 h-2.5" /> Open submission
            </a>
          </>
        )}
      </div>
      {submission && (
        <div className="mt-1 text-[9px] text-muted-foreground truncate">
          by {submission.submitted_by_name ?? "—"} · {timeAgo(submission.created_at)}
        </div>
      )}
      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-line">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center font-serif text-[9px] text-gold flex-shrink-0">
            {task.assigned_initials ?? "—"}
          </div>
          <span className="text-[10.5px] text-muted-foreground truncate">{task.assigned_name ?? "Unassigned"}</span>
        </div>
        {showCreator && <span className="text-[10px] text-muted-foreground flex-shrink-0">by {(task.created_by_name ?? "—").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}</span>}
      </div>
      {hover && !isDone && (
        <div className="flex gap-1 mt-2.5 pt-2 border-t border-line animate-in fade-in duration-150">
          {canSubmit && onSubmit && (
            <button onClick={(e) => { e.stopPropagation(); onSubmit(task); }}
              className="flex-1 h-6 text-[9px] rounded-[6px] border bg-black text-white border-black hover:bg-[#222] inline-flex items-center justify-center gap-1">
              <Upload className="w-2.5 h-2.5" /> Submit
            </button>
          )}
          {quick.filter(q => q.s !== task.status).slice(0, canSubmit ? 3 : 4).map((q) => {
            const s = STATUSES.find(x => x.key === q.s)!;
            return (
              <button key={q.s} onClick={(e) => { e.stopPropagation(); onQuickStatus(task, q.s); }}
                className={`flex-1 h-6 text-[9px] rounded-[6px] border ${s.pillClass}`}>{q.label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
