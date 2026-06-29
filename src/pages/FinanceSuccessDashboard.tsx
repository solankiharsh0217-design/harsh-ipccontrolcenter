import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

type PaidLead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  webinar_batch_id: string | null;
  source_webinar_batch_id: string | null;
  source_report_date: string | null;
  source_webinar: string | null;
  paid_batch_name: string | null;
  onboarding_batch_name: string | null;
  created_at: string;
  crm_stage_id: string | null;
  crm_pipeline_id: string | null;
  pipeline_stage: string | null;
  finance_status: string | null;
  finance_partner: string | null;
  code_of_conduct_status: string | null;
  total_collected: number | null;
  balance_pending: number | null;
  token_amount_collected: number | null;
  assigned_sales_executive: string | null;
};

type Payment = {
  paid_pipeline_lead_id: string;
  amount: number;
  is_token: boolean;
  payment_type: string | null;
  payment_category: string | null;
  payment_date: string;
};

type WebinarBatch = { id: string; webinar_date: string | null; webinar_name: string; batch_name: string };
type Stage = { id: string; name: string; pipeline_id: string; position: number };

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

const SUCCESS_STAGE_KEYWORDS = ["code of conduct", "coc sign", "signed", "access given", "active member", "finance approved"];

export default function FinanceSuccessDashboard() {
  const { isAdmin } = useAuth();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null);

  // Load paid pipeline leads (active)
  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["fsd-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paid_pipeline_leads")
        .select("id,name,email,phone,webinar_batch_id,source_webinar_batch_id,source_report_date,source_webinar,paid_batch_name,onboarding_batch_name,created_at,crm_stage_id,crm_pipeline_id,pipeline_stage,finance_status,finance_partner,code_of_conduct_status,total_collected,balance_pending,token_amount_collected,assigned_sales_executive")
        .eq("is_deleted", false)
        .is("archived_at", null)
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as PaidLead[];
    },
  });

  const leadIds = useMemo(() => leads.map((l) => l.id), [leads]);
  const batchIds = useMemo(
    () => Array.from(new Set(leads.flatMap((l) => [l.webinar_batch_id, l.source_webinar_batch_id]).filter(Boolean) as string[])),
    [leads],
  );

  const { data: payments = [] } = useQuery({
    queryKey: ["fsd-payments", leadIds.length],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const out: Payment[] = [];
      const chunk = 500;
      for (let i = 0; i < leadIds.length; i += chunk) {
        const slice = leadIds.slice(i, i + chunk);
        const { data, error } = await supabase
          .from("paid_pipeline_payments")
          .select("paid_pipeline_lead_id,amount,is_token,payment_type,payment_category,payment_date")
          .in("paid_pipeline_lead_id", slice)
          .eq("is_deleted", false);
        if (error) throw error;
        out.push(...((data ?? []) as Payment[]));
      }
      return out;
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["fsd-batches", batchIds.length],
    enabled: batchIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webinar_batches")
        .select("id,webinar_date,webinar_name,batch_name")
        .in("id", batchIds);
      if (error) throw error;
      return (data ?? []) as WebinarBatch[];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["fsd-stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stages")
        .select("id,name,pipeline_id,position")
        .order("position");
      if (error) throw error;
      return (data ?? []) as Stage[];
    },
  });

  // Determine paid pipeline + its stages
  const { data: paidPipelineStages = [] } = useQuery({
    queryKey: ["fsd-paid-stages"],
    queryFn: async () => {
      const { data: pipes, error: pErr } = await supabase.from("pipelines").select("id,type,name").eq("type", "paid");
      if (pErr) throw pErr;
      const ids = (pipes ?? []).map((p: any) => p.id);
      if (ids.length === 0) return [] as Stage[];
      const { data, error } = await supabase
        .from("stages")
        .select("id,name,pipeline_id,position")
        .in("pipeline_id", ids)
        .order("position");
      if (error) throw error;
      return (data ?? []) as Stage[];
    },
  });

  // Persisted success stage selection (company_settings.finance_success_stage_ids)
  const [successStageIds, setSuccessStageIds] = useState<string[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("id,finance_success_stage_ids" as any)
        .eq("workspace", "default")
        .maybeSingle();
      if (!error && data) {
        const arr = ((data as any).finance_success_stage_ids ?? []) as string[];
        setSuccessStageIds(arr);
      }
      setSettingsLoaded(true);
    })();
  }, []);

  // Auto-seed default success stages from paid pipeline if none configured yet
  useEffect(() => {
    if (!settingsLoaded || successStageIds.length > 0 || paidPipelineStages.length === 0) return;
    const defaults = paidPipelineStages
      .filter((s) => SUCCESS_STAGE_KEYWORDS.some((k) => s.name.toLowerCase().includes(k)))
      .map((s) => s.id);
    if (defaults.length > 0) setSuccessStageIds(defaults);
  }, [settingsLoaded, paidPipelineStages, successStageIds.length]);

  const saveSuccessStages = async (ids: string[]) => {
    setSuccessStageIds(ids);
    if (!isAdmin) return;
    const { error } = await supabase
      .from("company_settings")
      .update({ finance_success_stage_ids: ids } as any)
      .eq("workspace", "default");
    if (error) toast({ title: "Could not save success stages", description: error.message, variant: "destructive" });
    else toast({ title: "Success stages saved" });
  };

  // Build per-lead enriched info
  const enriched = useMemo(() => {
    const batchById = new Map(batches.map((b) => [b.id, b]));
    const paymentsByLead = new Map<string, Payment[]>();
    for (const p of payments) {
      const arr = paymentsByLead.get(p.paid_pipeline_lead_id) ?? [];
      arr.push(p);
      paymentsByLead.set(p.paid_pipeline_lead_id, arr);
    }
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const successSet = new Set(successStageIds);

    return leads.map((l) => {
      const bId = l.webinar_batch_id || l.source_webinar_batch_id;
      const batch = bId ? batchById.get(bId) : undefined;
      let webinarDate: string | null = batch?.webinar_date ?? null;
      let dateSource: "batch" | "source_report_date" | "created_at" = "batch";
      if (!webinarDate && l.source_report_date) {
        webinarDate = l.source_report_date;
        dateSource = "source_report_date";
      }
      if (!webinarDate) {
        webinarDate = l.created_at.slice(0, 10);
        dateSource = "created_at";
      }
      const ps = paymentsByLead.get(l.id) ?? [];
      const tokenPayments = ps.filter(
        (p) => p.is_token || /token/i.test(p.payment_type ?? "") || /token/i.test(p.payment_category ?? ""),
      );
      let tokenAmount = tokenPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
      if (tokenAmount === 0 && Number(l.token_amount_collected || 0) > 0) tokenAmount = Number(l.token_amount_collected);
      if (tokenAmount === 0 && ps.length > 0) {
        const sorted = [...ps].sort((a, b) => a.payment_date.localeCompare(b.payment_date));
        tokenAmount = Number(sorted[0].amount || 0);
      }
      const tokenRecorded = tokenAmount > 0;
      const currentStage = l.crm_stage_id ? stageById.get(l.crm_stage_id)?.name ?? l.pipeline_stage : l.pipeline_stage;
      const reachedSuccess = l.crm_stage_id ? successSet.has(l.crm_stage_id) : false;
      const batchLabel = batch?.batch_name || batch?.webinar_name || l.paid_batch_name || l.source_webinar || l.onboarding_batch_name || "—";
      return {
        ...l,
        webinarDate,
        dateSource,
        tokenAmount,
        tokenRecorded,
        currentStage: currentStage || "—",
        reachedSuccess,
        batchLabel,
      };
    });
  }, [leads, payments, batches, stages, successStageIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((l) => {
      if (fromDate && l.webinarDate < fromDate) return false;
      if (toDate && l.webinarDate > toDate) return false;
      if (q) {
        const hay = `${l.name ?? ""} ${l.email ?? ""} ${l.phone ?? ""} ${l.batchLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, fromDate, toDate, search]);

  // Summary
  const summary = useMemo(() => {
    const total = filtered.length;
    const tokenCollected = filtered.reduce((s, l) => s + l.tokenAmount, 0);
    const tokenRecordedCount = filtered.filter((l) => l.tokenRecorded).length;
    const reached = filtered.filter((l) => l.reachedSuccess).length;
    const balancePending = filtered.reduce((s, l) => s + Number(l.balance_pending || 0), 0);
    const financePending = filtered.filter((l) => !l.finance_status || /pending|submitted|requested/i.test(l.finance_status)).length;
    return {
      total,
      tokenCollected,
      avgToken: tokenRecordedCount > 0 ? tokenCollected / tokenRecordedCount : 0,
      reached,
      successRate: total > 0 ? (reached / total) * 100 : 0,
      stuck: total - reached,
      balancePending,
      financePending,
      tokenMissing: total - tokenRecordedCount,
    };
  }, [filtered]);

  // Webinar-grouped rows
  const byWebinar = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const l of filtered) {
      const key = l.webinarDate;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([date, items]) => {
        const total = items.length;
        const tokenCollected = items.reduce((s, l) => s + l.tokenAmount, 0);
        const tokenRecordedCount = items.filter((l) => l.tokenRecorded).length;
        const reached = items.filter((l) => l.reachedSuccess).length;
        const balancePending = items.reduce((s, l) => s + Number(l.balance_pending || 0), 0);
        const financePending = items.filter((l) => !l.finance_status || /pending|submitted|requested/i.test(l.finance_status)).length;
        const stuckByStage = new Map<string, number>();
        for (const l of items) {
          if (l.reachedSuccess) continue;
          stuckByStage.set(l.currentStage, (stuckByStage.get(l.currentStage) ?? 0) + 1);
        }
        const biggestStuck = Array.from(stuckByStage.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
        const label = items[0]?.batchLabel ?? "—";
        return {
          date,
          label,
          total,
          tokenCollected,
          avgToken: tokenRecordedCount > 0 ? tokenCollected / tokenRecordedCount : 0,
          reached,
          successRate: total > 0 ? (reached / total) * 100 : 0,
          stuck: total - reached,
          balancePending,
          financePending,
          biggestStuck,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  // Stuck-stage analysis (across filtered)
  const stuckAnalysis = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of filtered) {
      if (l.reachedSuccess) continue;
      map.set(l.currentStage, (map.get(l.currentStage) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const drilldownLeads = useMemo(
    () => (drilldownDate ? filtered.filter((l) => l.webinarDate === drilldownDate) : []),
    [filtered, drilldownDate],
  );

  const successColor = (pct: number) =>
    pct >= 80 ? "text-emerald-700 bg-emerald-50" : pct >= 50 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";

  return (
    <div className="max-w-[1200px]">
      <PageHead title="Finance Success Dashboard" sub="Webinar-wise success rate of token-paid members reaching the Code of Conduct / finance success stage. Read-only." />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Webinar date from</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[160px]" />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">To</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[160px]" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[11px] text-muted-foreground mb-1">Search name / email / phone / batch</label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
        </div>
        <div className="min-w-[240px]">
          <label className="block text-[11px] text-muted-foreground mb-1">Add success stage</label>
          <Select
            value=""
            onValueChange={(v) => {
              if (!v) return;
              if (!successStageIds.includes(v)) saveSuccessStages([...successStageIds, v]);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Add a success stage…" /></SelectTrigger>
            <SelectContent>
              {paidPipelineStages
                .filter((s) => !successStageIds.includes(s.id))
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {successStageIds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5 text-xs">
          <span className="text-muted-foreground">Success stages:</span>
          {successStageIds.map((id) => {
            const s = paidPipelineStages.find((x) => x.id === id);
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                {s?.name ?? "(deleted)"}
                {isAdmin && (
                  <button
                    onClick={() => saveSuccessStages(successStageIds.filter((x) => x !== id))}
                    className="text-emerald-900/60 hover:text-emerald-900"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Summary cards */}
      <SectionLabel>Summary</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
        {[
          { label: "Total Token-Paid Leads", value: String(summary.total) },
          { label: "Total Token Collected", value: `₹${fmtINR(summary.tokenCollected)}` },
          { label: "Average Token", value: `₹${fmtINR(summary.avgToken)}` },
          { label: "Reached Success Stage", value: String(summary.reached) },
          { label: "Success Rate", value: `${summary.successRate.toFixed(1)}%` },
          { label: "Not Yet Successful", value: String(summary.stuck) },
          { label: "Balance Pending", value: `₹${fmtINR(summary.balancePending)}` },
          { label: "Finance Pending", value: String(summary.financePending) },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="text-[11px] text-muted-foreground mb-1">{c.label}</div>
              <div className="text-xl font-semibold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {summary.tokenMissing > 0 && (
        <div className="mb-5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          ⚠ {summary.tokenMissing} lead(s) have no recorded token amount. They are still counted as token-paid.
        </div>
      )}

      {/* Webinar table */}
      <SectionLabel>By Webinar Date</SectionLabel>
      <Card className="mb-7">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Webinar Date</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Token-Paid</TableHead>
                <TableHead className="text-right">Token Collected</TableHead>
                <TableHead className="text-right">Avg Token</TableHead>
                <TableHead className="text-right">Reached</TableHead>
                <TableHead className="text-right">Success %</TableHead>
                <TableHead className="text-right">Stuck</TableHead>
                <TableHead className="text-right">Balance Pending</TableHead>
                <TableHead className="text-right">Finance Pending</TableHead>
                <TableHead>Biggest Stuck Stage</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leadsLoading ? (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              ) : byWebinar.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">No data.</TableCell></TableRow>
              ) : (
                byWebinar.map((r) => (
                  <TableRow key={r.date}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.label}</TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell className="text-right">₹{fmtINR(r.tokenCollected)}</TableCell>
                    <TableCell className="text-right">₹{fmtINR(r.avgToken)}</TableCell>
                    <TableCell className="text-right">{r.reached}</TableCell>
                    <TableCell className="text-right">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${successColor(r.successRate)}`}>
                        {r.successRate.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{r.stuck}</TableCell>
                    <TableCell className="text-right">₹{fmtINR(r.balancePending)}</TableCell>
                    <TableCell className="text-right">{r.financePending}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{r.biggestStuck}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setDrilldownDate(r.date)}>View Leads</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Stuck-stage analysis */}
      <SectionLabel>Where Are Token-Paid Members Stuck?</SectionLabel>
      <Card className="mb-10">
        <CardHeader><CardTitle className="text-base">Stuck by current stage</CardTitle></CardHeader>
        <CardContent>
          {stuckAnalysis.length === 0 ? (
            <div className="text-sm text-muted-foreground">No stuck members in the current filter.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {stuckAnalysis.map(([stage, count]) => (
                <div key={stage} className="border rounded-md p-3 bg-white">
                  <div className="text-[11px] text-muted-foreground truncate">{stage}</div>
                  <div className="text-lg font-semibold">{count}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drilldown */}
      <Dialog open={!!drilldownDate} onOpenChange={(o) => !o && setDrilldownDate(null)}>
        <DialogContent className="max-w-[1100px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Leads — Webinar {drilldownDate}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Token</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Current Stage</TableHead>
                <TableHead>Finance</TableHead>
                <TableHead>CoC</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drilldownLeads.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.name ?? "—"}</TableCell>
                  <TableCell>{l.phone ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{l.email ?? "—"}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{l.batchLabel}</TableCell>
                  <TableCell className="text-right">{l.tokenRecorded ? `₹${fmtINR(l.tokenAmount)}` : <span className="text-amber-700">Not recorded</span>}</TableCell>
                  <TableCell className="text-right">₹{fmtINR(Number(l.total_collected || 0))}</TableCell>
                  <TableCell className="text-right">₹{fmtINR(Number(l.balance_pending || 0))}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{l.currentStage}</TableCell>
                  <TableCell className="max-w-[120px] truncate">{l.finance_status ?? "—"}</TableCell>
                  <TableCell className="max-w-[120px] truncate">{l.code_of_conduct_status ?? "—"}</TableCell>
                  <TableCell>
                    {l.reachedSuccess ? (
                      <span className="text-emerald-700">Successful</span>
                    ) : (
                      <span className="text-amber-700">Not yet</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
