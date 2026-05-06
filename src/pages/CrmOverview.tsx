import { useEffect, useState } from "react";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";

export default function CrmOverview() {
  const { isAdmin, profile } = useAuth();
  const [stats, setStats] = useState({ total: 0, superHot: 0, hot: 0, warm: 0, won: 0, wonValue: 0, todayFu: 0 });
  const [agents, setAgents] = useState<any[]>([]);
  const [todayFu, setTodayFu] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: leads } = await supabase.from("leads").select("*");
      const { data: wonStages } = await supabase.from("stages").select("id").eq("is_won", true);
      const wonIds = new Set((wonStages || []).map((s: any) => s.id));
      const all = leads || [];
      const won = all.filter((l: any) => wonIds.has(l.stage_id));
      setStats({
        total: all.length,
        superHot: all.filter((l: any) => l.is_super_hot).length,
        hot: all.filter((l: any) => l.grade === "hot").length,
        warm: all.filter((l: any) => l.grade === "warm").length,
        won: won.length,
        wonValue: won.reduce((s: number, l: any) => s + Number(l.deal_value || 0), 0),
        todayFu: 0,
      });
      const { data: fu } = await supabase.from("follow_up_reminders").select("*, leads(full_name)").eq("reminder_date", today);
      setTodayFu(fu || []);
      setStats((s) => ({ ...s, todayFu: (fu || []).length }));

      // agent leaderboard
      const { data: profs } = await supabase.from("profiles").select("id, full_name, role").eq("status","active");
      const board = (profs || []).filter((p: any) => /BDE|Sales|Agent/i.test(p.role || "")).map((p: any) => {
        const mine = all.filter((l: any) => l.assigned_agent_id === p.id);
        const myWon = mine.filter((l: any) => wonIds.has(l.stage_id));
        return { ...p, leads: mine.length, won: myWon.length, conv: mine.length ? Math.round((myWon.length / mine.length) * 100) : 0 };
      });
      setAgents(board);
    })();
  }, []);

  if (!isAdmin) {
    return (
      <div>
        <PageHead title="My Dashboard" sub={`Hello ${profile?.full_name || ""}`} />
        <div className="text-sm text-muted-foreground">Switch to <Link to="/crm" className="underline">Calling CRM</Link> to work your assigned leads.</div>
      </div>
    );
  }

  return (
    <div>
      <PageHead title="CRM Overview" sub="Admin dashboard" />
      <div className="grid grid-cols-6 gap-3 mb-6">
        {[
          { k: "Total Leads", v: stats.total },
          { k: "Super Hot", v: stats.superHot },
          { k: "Hot", v: stats.hot },
          { k: "Warm", v: stats.warm },
          { k: "Closed Won", v: stats.won, sub: `₹${stats.wonValue.toLocaleString("en-IN")}` },
          { k: "Follow-ups today", v: stats.todayFu },
        ].map((s) => (
          <div key={s.k} className="p-4 rounded-xl border border-line">
            <div className="uppercase-label">{s.k}</div>
            <div className="font-serif text-3xl mt-1">{s.v}</div>
            {s.sub && <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border border-line">
          <div className="section-divider">Agent leaderboard</div>
          {agents.length === 0 && <div className="text-xs text-muted-foreground">No agents.</div>}
          {agents.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2 border-b border-line last:border-0">
              <div className="font-sans text-sm">{a.full_name}</div>
              <div className="flex gap-4 text-xs text-muted-foreground"><span>{a.leads} leads</span><span>{a.won} won</span><span className="text-black font-medium">{a.conv}%</span></div>
            </div>
          ))}
        </div>
        <div className="p-5 rounded-xl border border-line">
          <div className="section-divider">Today's follow-ups</div>
          {todayFu.length === 0 && <div className="text-xs text-muted-foreground">Nothing scheduled today.</div>}
          {todayFu.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2 border-b border-line last:border-0">
              <div className="font-sans text-sm">{r.leads?.full_name || "Unknown"}</div>
              <div className="text-xs text-muted-foreground">{r.reminder_time?.slice(0,5)} · {r.channel}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
