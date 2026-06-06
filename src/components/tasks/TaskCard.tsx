import { useState } from "react";
import { Task, TaskStatus, PRIORITY_PILL, dueLabel, STATUSES } from "@/lib/tasks";

export default function TaskCard({
  task, onOpen, onQuickStatus, onDragStart,
}: {
  task: Task;
  onOpen: (t: Task) => void;
  onQuickStatus: (t: Task, s: TaskStatus) => void;
  onDragStart: (t: Task) => void;
}) {
  const [hover, setHover] = useState(false);
  const due = dueLabel(task.due_date);
  const dueColor = due.tone === "overdue" ? "text-[#DC2626]" : due.tone === "today" ? "text-[#CA8A04]" : "text-muted-foreground";
  const isDone = task.status === "done";
  const showCreator = task.created_by && task.created_by !== task.assigned_to;
  const quick: { s: TaskStatus; label: string }[] = [
    { s: "inprogress", label: "→ Progress" },
    { s: "review", label: "→ Review" },
    { s: "blocked", label: "→ Blocked" },
    { s: "done", label: "✓ Done" },
  ];

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
      <div className={`font-serif text-[15px] font-medium leading-snug ${isDone ? "line-through" : ""}`}>{task.title}</div>
      <div className="flex items-center justify-between mt-2">
        <span className={`inline-flex items-center gap-1 px-2 h-[20px] text-[10px] rounded-full border ${PRIORITY_PILL[task.priority]}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{task.priority}
        </span>
        <span className={`text-[11px] ${dueColor}`}>{due.label}</span>
      </div>
      <div className="mt-2">
        <span className="inline-block px-2 h-[18px] text-[9px] rounded-full bg-off text-muted-foreground border border-line leading-[18px]">{task.tag}</span>
      </div>
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
          {quick.filter(q => q.s !== task.status).map((q) => {
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
