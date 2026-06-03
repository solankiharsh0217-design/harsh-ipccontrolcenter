import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Task, dueLabel } from "@/lib/tasks";

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-[#DC2626]", medium: "bg-[#CA8A04]", low: "bg-[#888]",
};

export default function MyTasksWidget() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("tasks").select("*")
        .eq("is_archived", false).neq("status", "done").eq("assigned_to", user.id)
        .order("due_date", { ascending: true, nullsFirst: false }).limit(3);
      setTasks((data ?? []) as Task[]);
    })();
  }, [user]);

  return (
    <div className="mb-9">
      <div className="flex items-center justify-between mb-3">
        <span className="block uppercase font-sans text-[9px] tracking-[0.15em] text-muted-foreground">My Tasks</span>
        <button onClick={() => nav("/tasks")} className="text-[11px] text-muted-foreground hover:text-gold">View all →</button>
      </div>
      {tasks.length === 0 ? (
        <div className="text-[12px] text-muted-foreground px-1">No tasks assigned to you yet</div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const due = dueLabel(t.due_date);
            const dueColor = due.tone === "overdue" ? "text-[#DC2626]" : due.tone === "today" ? "text-[#CA8A04]" : "text-muted-foreground";
            return (
              <button key={t.id} onClick={() => nav(`/tasks?open=${t.id}`)}
                className="w-full flex items-center gap-3 border border-line rounded-[9px] px-[14px] py-2.5 hover:bg-off transition-colors text-left">
                <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority]}`} />
                <span className="font-serif text-[14px] flex-1 truncate">{t.title}</span>
                <span className={`text-[11px] flex-shrink-0 ${dueColor}`}>{due.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
