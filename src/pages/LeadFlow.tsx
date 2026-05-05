import { useEffect, useState } from "react";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, LabelList } from "recharts";
import { formatDateShort, inr } from "@/lib/format";

interface Entry { id: string; entry_date: string; ad_spend: number; leads: number; }

export default function LeadFlow() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const today = new Date().toISOString().slice(0,10);
  const [date, setDate] = useState(today);
  const [spend, setSpend] = useState("");
  const [leads, setLeads] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("lead_entries").select("*").order("entry_date", { ascending: true });
    setEntries((data ?? []) as Entry[]);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!date || !spend || !leads) return toast.error("Fill all three fields.");
    setBusy(true);
    const { error } = await supabase.from("lead_entries").insert({
      user_id: user!.id, entry_date: date, ad_spend: Number(spend), leads: Number(leads),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSpend(""); setLeads("");
    load();
  };

  const chartData = entries.map(e => ({
    label: new Date(e.entry_date+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"}),
    leads: e.leads,
  }));

  return (
    <div className="max-w-[860px]">
      <PageHead title="Daily Lead Flow" sub="Log daily performance. Track ad spend and leads over time." back />

      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end mb-7">
        <div><label className="form-label">Date</label>
          <input className="ipc-input" type="date" value={date} onChange={(e)=>setDate(e.target.value)} /></div>
        <div><label className="form-label">Ad spend (₹)</label>
          <input className="ipc-input" type="number" value={spend} onChange={(e)=>setSpend(e.target.value)} placeholder="e.g. 12000" /></div>
        <div><label className="form-label">Leads</label>
          <input className="ipc-input" type="number" value={leads} onChange={(e)=>setLeads(e.target.value)} placeholder="e.g. 42" /></div>
        <button disabled={busy} onClick={add} className="ipc-btn ipc-btn-black">Log entry</button>
      </div>

      <div className="bg-off rounded-xl p-6 mb-6 min-h-[240px] flex items-center justify-center">
        {entries.length < 2 ? (
          <div className="text-center font-sans text-[13px] text-muted-foreground">
            {entries.length === 0 ? "No data yet — log your first entry above." : "Add at least 2 entries to see the trend graph."}
            <span className="block text-[11px] mt-1 text-[hsl(var(--muted-light))]">
              {entries.length === 0 ? "Entries will appear as a trend graph here." : "Each entry will appear as a point on the chart."}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="rgba(0,0,0,0.04)" />
              <XAxis dataKey="label" tick={{ fontFamily: "Jost", fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontFamily: "Jost", fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontFamily: "Jost", fontSize: 12, border: "1px solid #E8E5DE", borderRadius: 8 }} />
              <Line type="monotone" dataKey="leads" stroke="#C8A84B" strokeWidth={2}
                dot={{ fill:"#C8A84B", stroke:"#fff", strokeWidth:2, r:5 }}
                activeDot={{ r:6 }}
                fill="rgba(200,168,75,0.08)">
                <LabelList dataKey="leads" position="top" style={{ fontFamily: "Jost", fontSize: 11, fill: "#888" }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-sans text-[13px]">
            <thead>
              <tr>
                {["Date","Ad Spend (₹)","Leads","Cost / Lead","Performance"].map(h => (
                  <th key={h} className="text-left text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground py-2.5 px-3.5 border-b border-line">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map(e => {
                const cpl = e.leads > 0 ? inr(Number(e.ad_spend)/e.leads) : "—";
                const ratio = e.leads > 0 && Number(e.ad_spend) > 0 ? e.leads / (Number(e.ad_spend)/1000) : 0;
                const cls = ratio>=4 ? "text-success font-medium" : ratio>=2 ? "text-warn font-medium" : "text-danger font-medium";
                const txt = ratio>=4 ? "Strong" : ratio>=2 ? "Average" : "Low";
                return (
                  <tr key={e.id} className="hover:bg-off transition-colors">
                    <td className="py-3 px-3.5 border-b border-line text-black">{formatDateShort(e.entry_date)}</td>
                    <td className="py-3 px-3.5 border-b border-line text-black">₹{Number(e.ad_spend).toLocaleString("en-IN")}</td>
                    <td className="py-3 px-3.5 border-b border-line text-black">{e.leads}</td>
                    <td className="py-3 px-3.5 border-b border-line text-black">{cpl}</td>
                    <td className={`py-3 px-3.5 border-b border-line ${cls}`}>{txt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
