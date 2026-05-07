import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { inr, num, pct, rel } from "@/lib/roas/format";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { AlertTriangle, IndianRupee, TrendingUp, Users, ShoppingBag, Activity } from "lucide-react";

type Mode = "net" | "gross";
const sb: any = supabase;

export default function RoasDashboard() {
  const [mode, setMode] = useState<Mode>("net");
  const [cycleId, setCycleId] = useState<string>("all");

  const { data: buyers = [] } = useQuery({ queryKey: ["roas_mb"], queryFn: async () => (await sb.from("roas_media_buyers").select("*").order("name")).data || [] });
  const { data: webinars = [] } = useQuery({
    queryKey: ["roas_webinars-cycles"],
    queryFn: async () => (await sb.from("roas_webinars").select("id, webinar_name, webinar_start_date, webinar_end_date").order("webinar_end_date", { ascending: false })).data || [],
  });

  const cycle = useMemo(() => {
    if (cycleId === "all") return null;
    const idx = webinars.findIndex((w: any) => w.id === cycleId);
    if (idx === -1) return null;
    const w = webinars[idx];
    const prev = webinars[idx + 1];
    const end = w.webinar_end_date ? new Date(w.webinar_end_date + "T23:59:59.999Z") : null;
    const start = prev?.webinar_end_date ? new Date(new Date(prev.webinar_end_date + "T00:00:00Z").getTime() + 86400000) : null;
    return { id: w.id, name: w.webinar_name, start, end };
  }, [cycleId, webinars]);

  const inCycle = (iso: string | null | undefined) => {
    if (!cycle) return true;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (cycle.start && t < cycle.start.getTime()) return false;
    if (cycle.end && t > cycle.end.getTime()) return false;
    return true;
  };

  const { data: leadsRaw = [] } = useQuery({ queryKey: ["roas_leads-all"], queryFn: async () => (await sb.from("roas_leads").select("id, media_buyer_id, clean_phone, clean_email, created_at_from_sheet, duplicate_status").limit(10000)).data || [] });
  const { data: enrollmentsRaw = [] } = useQuery({ queryKey: ["roas_enrollments-all"], queryFn: async () => (await sb.from("roas_enrollments").select("id, attributed_media_buyer_id, attribution_status, payment_status, payment_date, amount_paid, net_revenue, total_invoice_value, program_price, attributed_webinar_id, cycle_attribution_flag").limit(10000)).data || [] });
  const { data: spendsRaw = [] } = useQuery({ queryKey: ["roas_ad_spends-all"], queryFn: async () => (await sb.from("roas_ad_spends").select("*").limit(10000)).data || [] });
  const { data: sources = [] } = useQuery({ queryKey: ["roas_sources-all"], queryFn: async () => (await sb.from("roas_data_sources").select("*").order("source_name")).data || [] });

  const leads = useMemo(() => (cycle ? leadsRaw.filter((l: any) => inCycle(l.created_at_from_sheet)) : leadsRaw), [leadsRaw, cycle]);
  const enrollments = useMemo(() => (cycle ? enrollmentsRaw.filter((e: any) => e.attributed_webinar_id === cycle.id || inCycle(e.payment_date)) : enrollmentsRaw), [enrollmentsRaw, cycle]);
  const spends = useMemo(() => (cycle ? spendsRaw.filter((s: any) => inCycle(s.spend_date ? s.spend_date + "T12:00:00Z" : null)) : spendsRaw), [spendsRaw, cycle]);

  const isPaid = (s: string | null | undefined) => !!s && ["paid", "success", "completed", "captured", "successful"].includes(s.toLowerCase().trim());

  const totals = useMemo(() => {
    const totalSpend = spends.reduce((s: number, x: any) => s + Number(x.spend_amount || 0), 0);
    const totalLeads = leads.length;
    const uniqueLeadsSet = new Set<string>();
    leads.forEach((l: any) => { const key = l.clean_phone || l.clean_email; if (key) uniqueLeadsSet.add(key); });
    const successful = enrollments.filter((e: any) => isPaid(e.payment_status));
    const totalEnrollments = successful.length;
    const netRevenue = successful.reduce((s: number, x: any) => s + Number(x.net_revenue || 0), 0);
    const grossRevenue = successful.reduce((s: number, x: any) => s + Number(x.total_invoice_value || 0), 0);
    const attributedRevenue = successful.filter((e: any) => e.attributed_media_buyer_id).reduce((s: number, x: any) => s + Number((mode === "net" ? x.net_revenue : x.total_invoice_value) || 0), 0);
    const revenue = mode === "net" ? netRevenue : grossRevenue;
    const roas = totalSpend > 0 ? revenue / totalSpend : 0;
    const cpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const cps = totalEnrollments > 0 ? totalSpend / totalEnrollments : 0;
    const conv = uniqueLeadsSet.size > 0 ? (totalEnrollments / uniqueLeadsSet.size) * 100 : 0;
    const manualReview = enrollments.filter((e: any) => ["Manual Review", "Duplicate Conflict"].includes(e.attribution_status)).length;
    const dupConflicts = enrollments.filter((e: any) => e.attribution_status === "Duplicate Conflict").length;
    const unattributed = successful.filter((e: any) => !e.attributed_media_buyer_id).length;
    return { totalSpend, totalLeads, uniqueLeads: uniqueLeadsSet.size, totalEnrollments, attributedRevenue, netRevenue, grossRevenue, revenue, roas, cpl, cps, conv, manualReview, dupConflicts, unattributed };
  }, [spends, leads, enrollments, mode]);

  const perBuyer = useMemo(() => {
    return buyers.map((b: any) => {
      const bLeads = leads.filter((l: any) => l.media_buyer_id === b.id);
      const uniq = new Set<string>();
      bLeads.forEach((l: any) => { const k = l.clean_phone || l.clean_email; if (k) uniq.add(k); });
      const dup = bLeads.filter((l: any) => l.duplicate_status && l.duplicate_status !== "unique").length;
      const bSpend = spends.filter((s: any) => s.media_buyer_id === b.id).reduce((s: number, x: any) => s + Number(x.spend_amount || 0), 0);
      const bSales = enrollments.filter((e: any) => e.attributed_media_buyer_id === b.id && isPaid(e.payment_status));
      const refunded = enrollments.filter((e: any) => e.attributed_media_buyer_id === b.id && !isPaid(e.payment_status)).length;
      const bNet = bSales.reduce((s: number, x: any) => s + Number(x.net_revenue || 0), 0);
      const bGross = bSales.reduce((s: number, x: any) => s + Number(x.total_invoice_value || 0), 0);
      const rev = mode === "net" ? bNet : bGross;
      const review = enrollments.filter((e: any) => e.attributed_media_buyer_id === b.id && ["Manual Review", "Duplicate Conflict"].includes(e.attribution_status)).length;
      return { ...b, leads: bLeads.length, unique: uniq.size, duplicates: dup, spend: bSpend, sales: bSales.length, refunded, net: bNet, gross: bGross, revenue: rev, roas: bSpend > 0 ? rev / bSpend : 0, cpl: bLeads.length > 0 ? bSpend / bLeads.length : 0, cps: bSales.length > 0 ? bSpend / bSales.length : 0, conv: uniq.size > 0 ? (bSales.length / uniq.size) * 100 : 0, review };
    });
  }, [buyers, leads, enrollments, spends, mode]);

  const leadsByDay = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    leads.forEach((l: any) => {
      if (!l.created_at_from_sheet) return;
      const d = new Date(l.created_at_from_sheet).toISOString().slice(0, 10);
      const buyer = buyers.find((b: any) => b.id === l.media_buyer_id);
      const key = buyer?.name || "Unknown";
      const r = map.get(d) || { date: d };
      r[key] = (r[key] || 0) + 1;
      map.set(d, r);
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }, [leads, buyers]);

  const compareData = perBuyer.map((b: any) => ({ name: b.name, Spend: b.spend, Revenue: b.revenue, ROAS: Number(b.roas.toFixed(2)) }));

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ROAS Dashboard</h1>
          <p className="text-sm text-muted-foreground">Performance & attribution by media buyer</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={cycleId} onValueChange={setCycleId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="All cycles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cycles</SelectItem>
              {webinars.map((w: any) => (
                <SelectItem key={w.id} value={w.id}>{w.webinar_name} {w.webinar_end_date ? `· ${w.webinar_end_date}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList><TabsTrigger value="net">Net Revenue</TabsTrigger><TabsTrigger value="gross">Gross Revenue</TabsTrigger></TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Stat icon={<IndianRupee className="w-4 h-4" />} label="Total Spend" value={inr(totals.totalSpend, { compact: true })} />
        <Stat icon={<Users className="w-4 h-4" />} label="Total Leads" value={num(totals.totalLeads)} />
        <Stat icon={<Users className="w-4 h-4" />} label="Unique Leads" value={num(totals.uniqueLeads)} />
        <Stat icon={<ShoppingBag className="w-4 h-4" />} label="Enrollments" value={num(totals.totalEnrollments)} />
        <Stat icon={<TrendingUp className="w-4 h-4" />} label={mode === "net" ? "Net Revenue" : "Gross Revenue"} value={inr(totals.revenue, { compact: true })} />
        <Stat icon={<Activity className="w-4 h-4" />} label="Overall ROAS" value={`${totals.roas.toFixed(2)}x`} />
        <Stat icon={<IndianRupee className="w-4 h-4" />} label="CPL / CPS" value={`${inr(totals.cpl, { compact: true })} / ${inr(totals.cps, { compact: true })}`} />
        <Stat icon={<TrendingUp className="w-4 h-4" />} label="Conversion" value={pct(totals.conv)} />
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Manual Review" value={num(totals.manualReview)} />
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Duplicate Conflicts" value={num(totals.dupConflicts)} />
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Unattributed Sales" value={num(totals.unattributed)} />
        <Stat icon={<TrendingUp className="w-4 h-4" />} label="Attributed Revenue" value={inr(totals.attributedRevenue, { compact: true })} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {perBuyer.map((b: any) => (
          <Card key={b.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{b.name}</CardTitle>
                <Badge variant="outline">{b.roas.toFixed(2)}x ROAS</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <Mini label="Spend" value={inr(b.spend, { compact: true })} />
                <Mini label="Leads" value={num(b.leads)} />
                <Mini label="Unique" value={num(b.unique)} />
                <Mini label="Sales" value={num(b.sales)} />
                <Mini label="Net Revenue" value={inr(b.net, { compact: true })} />
                <Mini label="Gross Revenue" value={inr(b.gross, { compact: true })} />
                <Mini label="CPL" value={inr(b.cpl, { compact: true })} />
                <Mini label="Cost / Sale" value={inr(b.cps, { compact: true })} />
                <Mini label="Conversion" value={pct(b.conv)} />
                <Mini label="Duplicates" value={num(b.duplicates)} />
                <Mini label="Refunded" value={num(b.refunded)} />
                <Mini label="Manual Review" value={num(b.review)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Leads by day</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={leadsByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {buyers.map((b: any, i: number) => (
                  <Line key={b.id} type="monotone" dataKey={b.name} stroke={i === 0 ? "hsl(var(--primary))" : "#16a34a"} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Spend vs Revenue ({mode})</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => inr(Number(v))} />
                <Legend />
                <Bar dataKey="Spend" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Data Health</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {sources.length === 0 && <div className="text-sm text-muted-foreground">No data sources configured yet. Add them in Setup → Data Sources.</div>}
          {sources.map((s: any) => {
            const stale = s.last_synced_at && Date.now() - new Date(s.last_synced_at).getTime() > 30 * 60 * 1000;
            const failed = s.last_sync_status === "error";
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 justify-between border-b pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-sm">{s.source_name}</span>
                  <Badge variant="outline" className="text-[10px]">{s.source_type === "lead_sheet" ? "Lead" : "Enrollment"}</Badge>
                  {failed && <Badge variant="destructive">Sync failed</Badge>}
                  {stale && !failed && <Badge variant="secondary">Stale ({rel(s.last_synced_at)})</Badge>}
                  {!stale && !failed && s.last_synced_at && <Badge variant="secondary">{rel(s.last_synced_at)}</Badge>}
                  {!s.last_synced_at && <Badge variant="outline">Never synced</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Fetched {num(s.last_rows_fetched)} · Imported {num(s.last_rows_imported)} · Skipped {num(s.last_duplicates_skipped)}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">{icon}<span className="truncate">{label}</span></div>
        <div className="text-lg font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}
