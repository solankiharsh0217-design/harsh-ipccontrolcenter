import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { greeting, formatDateShort } from "@/lib/format";
import { PageHead, SectionLabel, Tag } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";

interface ModuleCard {
  to: string; tag: string; name: string; desc: string; featured?: boolean; icon: JSX.Element;
}

const MODULES: ModuleCard[] = [
  { to:"/roas", tag:"Media Buying", name:"ROAS Calculator", featured:true, desc:"Enter ad spend and revenue to instantly compute return on ad spend, cost per lead, and profit.",
    icon:<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="hsl(var(--gold))" strokeWidth={1.5}><path d="M2 8h3l2-5 2 10 2-5h3"/></svg> },
  { to:"/search", tag:"Student Data", name:"Student Search", desc:"Search any student by name. Pulls name, phone, and email live from your connected Google Sheet.",
    icon:<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#0a0a0a" strokeWidth={1.5}><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></svg> },
  { to:"/leadflow", tag:"Performance", name:"Daily Lead Flow", desc:"Log daily ad spend and leads. Auto-generates a trend graph to track performance over time.",
    icon:<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#0a0a0a" strokeWidth={1.5}><path d="M2 12l4-4 3 3 5-6"/></svg> },
];

export default function Dashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState({ leadsWeek: 0, spendWeek: 0, members: 0 });
  const [anns, setAnns] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 7);
      const { data: leads } = await supabase.from("lead_entries").select("ad_spend, leads").gte("entry_date", since.toISOString().slice(0,10));
      const leadsWeek = leads?.reduce((a,b)=>a + (b.leads||0), 0) ?? 0;
      const spendWeek = leads?.reduce((a,b)=>a + Number(b.ad_spend||0), 0) ?? 0;
      const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status","active");
      const { data: a } = await supabase.from("announcements").select("*").order("created_at",{ascending:false}).limit(2);
      setStats({ leadsWeek, spendWeek, members: count ?? 0 });
      setAnns(a ?? []);
    })();
  }, []);

  // Today's ROAS = approximate from latest entry
  const [todayRoas, setTodayRoas] = useState<string>("—");
  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0,10);
      const { data } = await supabase.from("lead_entries").select("ad_spend, leads").eq("entry_date", today);
      if (data && data.length) {
        const spend = data.reduce((a,b)=>a+Number(b.ad_spend||0),0);
        const leads = data.reduce((a,b)=>a+(b.leads||0),0);
        // proxy: leads * 1000 / spend as a directional metric
        if (spend > 0) setTodayRoas((leads/(spend/1000)).toFixed(1)+"×");
      }
    })();
  }, []);

  return (
    <div className="max-w-[1060px]">
      <PageHead title={greeting()} sub="Welcome to IPC Control Center — everything your team needs, in one place." />

      <div className="grid grid-cols-3 gap-3.5 mb-9">
        <div className="rounded-xl py-[22px] px-6 bg-gold-pale border border-gold-mid">
          <div className="uppercase-label mb-2.5">Today's ROAS</div>
          <div className="font-serif text-[40px] font-medium text-gold leading-none mb-1">{todayRoas}</div>
          <div className="font-sans text-[11px] text-muted-foreground">Live · today's lead-to-spend ratio</div>
        </div>
        <div className="rounded-xl py-[22px] px-6 bg-off">
          <div className="uppercase-label mb-2.5">Leads this week</div>
          <div className="font-serif text-[40px] font-medium text-black leading-none mb-1">{stats.leadsWeek}</div>
          <div className="font-sans text-[11px] text-muted-foreground">Ad spend ₹{stats.spendWeek.toLocaleString("en-IN")}</div>
        </div>
        <div className="rounded-xl py-[22px] px-6 bg-off">
          <div className="uppercase-label mb-2.5">Active team members</div>
          <div className="font-serif text-[40px] font-medium text-black leading-none mb-1">{stats.members}</div>
          <div className="font-sans text-[11px] text-muted-foreground">Approved logins</div>
        </div>
      </div>

      <SectionLabel>Core tools</SectionLabel>

      <div className="grid grid-cols-3 gap-3.5 mb-9">
        {MODULES.map(m => (
          <button key={m.to} onClick={() => nav(m.to)} className={`text-left rounded-xl pt-[26px] px-[22px] pb-5 cursor-pointer transition-all border group
            ${m.featured ? "border-gold bg-gold-pale hover:bg-[#F2EAD3]" : "border-line bg-white hover:bg-off hover:border-[#bbb]"}`}>
            <div className={`font-sans text-[9px] uppercase tracking-[0.14em] mb-3.5 ${m.featured ? "text-gold" : "text-muted-foreground"}`}>{m.tag}</div>
            <div className={`w-[38px] h-[38px] rounded-md border flex items-center justify-center mb-4
              ${m.featured ? "bg-white border-gold-mid" : "bg-off border-line"}`}>{m.icon}</div>
            <div className="font-serif text-xl font-medium text-black mb-2 leading-tight">{m.name}</div>
            <div className="font-sans text-xs font-light text-muted-foreground leading-[1.7] mb-[18px]">{m.desc}</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground">
                <span className="w-[5px] h-[5px] rounded-full bg-success" />Live
              </div>
              <div className={`w-[26px] h-[26px] border rounded-md flex items-center justify-center text-[13px] transition-colors
                ${m.featured ? "bg-black border-black text-white" : "border-line text-muted-foreground group-hover:bg-black group-hover:border-black group-hover:text-white"}`}>→</div>
            </div>
          </button>
        ))}
      </div>

      <SectionLabel>Announcements</SectionLabel>
      <div className="border border-line rounded-xl bg-white mb-3.5 overflow-hidden">
        <div className="px-[22px] py-[15px] border-b border-line flex items-center justify-between">
          <div className="font-sans text-[11px] font-medium text-black uppercase tracking-[0.1em]">Latest notices</div>
          <Link to="/announcements" className="font-sans text-[11px] text-muted-foreground hover:text-gold transition-colors">View all →</Link>
        </div>
        {anns.length === 0 && <div className="px-[22px] py-8 font-sans text-[13px] text-muted-foreground">No announcements yet.</div>}
        {anns.map(a => (
          <div key={a.id} className="px-[22px] py-4 border-b border-line last:border-b-0 hover:bg-off transition-colors">
            <div className="mb-2"><Tag type={a.tag_type}>{a.tag_type}</Tag></div>
            <div className="font-serif text-lg font-medium text-black mb-1.5">{a.title}</div>
            <div className="font-sans text-xs font-light text-muted-foreground leading-[1.65]">{a.body}</div>
            <div className="font-sans text-[10px] text-[hsl(var(--muted-light))] mt-1.5">{formatDateShort(a.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
