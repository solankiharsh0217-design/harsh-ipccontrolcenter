import { useEffect, useState } from "react";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { initials, formatTime, formatDateShort } from "@/lib/format";

interface Member {
  id: string;
  full_name: string;
  role: string;
  last_login: string | null;
}

export default function Team() {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, role").eq("status","active").order("full_name");
      const { data: logs } = await supabase.from("attendance_logs").select("user_id, login_time").order("login_time", { ascending: false });
      const lastByUser = new Map<string, string>();
      logs?.forEach(l => { if (!lastByUser.has(l.user_id)) lastByUser.set(l.user_id, l.login_time); });
      setMembers((profiles ?? []).map(p => ({ ...p, last_login: lastByUser.get(p.id) ?? null })));
    })();
  }, []);

  return (
    <div className="max-w-[780px]">
      <PageHead title="Team Directory" sub="All active IPC team members and their roles." back />
      {members.length === 0 && <div className="font-sans text-sm text-muted-foreground">No active members yet.</div>}
      <div className="grid grid-cols-2 gap-3">
        {members.map((m, i) => {
          const alt = i % 2 === 1;
          const today = m.last_login && new Date(m.last_login).toDateString() === new Date().toDateString();
          return (
            <div key={m.id} className="border border-line rounded-xl py-5 px-[22px] flex items-center gap-3.5 hover:bg-off transition-colors">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-serif text-sm font-medium flex-shrink-0
                ${alt ? "bg-gold-pale border border-gold-mid text-gold-deep" : "bg-black text-gold"}`}>
                {initials(m.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[17px] font-medium text-black mb-0.5 truncate">{m.full_name}</div>
                <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{m.role}</div>
              </div>
              {m.last_login && (
                <div className="font-sans text-[10px] text-muted-foreground whitespace-nowrap text-right">
                  {today ? `Today ${formatTime(m.last_login)}` : formatDateShort(m.last_login)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
