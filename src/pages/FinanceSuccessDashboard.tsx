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
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Link, useSearchParams } from "react-router-dom";

type CrmLead = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  webinar_date: string | null;
  webinar_name: string | null;
  webinar_source: string | null;
  created_at: string;
  paid_pipeline_lead_id: string | null;
};

type PaidLead = {
  id: string;
  crm_lead_id: string | null;
  email: string | null;
  phone: string | null;
  source_report_date: string | null;
  source_webinar: string | null;
  paid_batch_name: string | null;
  finance_status: string | null;
  total_collected: number | null;
  balance_pending: number | null;
  token_amount_collected: number | null;
  code_of_conduct_status: string | null;
};

type Payment = {
  paid_pipeline_lead_id: string;
  amount: number;
  is_token: boolean;
  payment_type: string | null;
  payment_category: string | null;
  payment_date: string;
};

type Pipeline = { id: string; name: string; type: string };
type Stage = { id: string; name: string; pipeline_id: string; position: number };

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const normPhone = (s: string | null | undefined) => (s ?? "").replace(/\D+/g, "").slice(-10);

const SUCCESS_STAGE_KEYWORDS = [
  "code of conduct",
  "coc sign",
  "signed",
  "access given",
  "access",
  "whatsapp",
  "group joined",
  "joined",
  "access and whatsapp",
  "active member",
  "finance approved",
];
const normalizeStageName = (name: string) =>
  name.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();

export default function FinanceSuccessDashboard() {
  const { isAdmin, hasModule } = useAuth();
  const hasAccess = isAdmin
    || hasModule("paid_pipeline")
    || hasModule("paid-pipeline")
    || hasModule("calling_crm")
    || hasModule("crm");
  const [searchParams] = useSearchParams();
  const urlPipelineId = searchParams.get("pipelineId");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");

  // Paid CRM pipelines
  const { data: paidPipelines = [] } = useQuery({
    queryKey: ["fsd-paid-pipelines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("id,name,type")
        .eq("type", "paid")
        .order("position");
      if (error) throw error;
      return (data ?? []) as Pipeline[];
    },
  });

  // Default to URL pipelineId if valid paid pipeline; else first paid pipeline (Paid — Onboarding)
  useEffect(() => {
    if (selectedPipelineId || paidPipelines.length === 0) return;
    const fromUrl = urlPipelineId && paidPipelines.find((p) => p.id === urlPipelineId);
    if (fromUrl) { setSelectedPipelineId(fromUrl.id); return; }
    const preferred = paidPipelines.find((p) => /onboarding/i.test(p.name)) ?? paidPipelines[0];
    setSelectedPipelineId(preferred.id);
  }, [paidPipelines, selectedPipelineId, urlPipelineId]);

  // Stages for the selected pipeline
  const { data: pipelineStages = [] } = useQuery({
    queryKey: ["fsd-pipeline-stages", selectedPipelineId],
    enabled: !!selectedPipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stages")
        .select("id,name,pipeline_id,position")
        .eq("pipeline_id", selectedPipelineId)
        .order("position");
      if (error) throw error;
      return (data ?? []) as Stage[];
    },
  });

  // CRM leads for the selected paid pipeline (source of truth)
  const { data: crmLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["fsd-crm-leads", selectedPipelineId],
    enabled: !!selectedPipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,full_name,email,phone,pipeline_id,stage_id,webinar_date,webinar_name,webinar_source,created_at,paid_pipeline_lead_id")
        .eq("pipeline_id", selectedPipelineId)
        .is("archived_at", null)
        .is("deleted_at", null)
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as CrmLead[];
    },
  });

  // Linked paid pipeline leads (by paid_pipeline_lead_id OR crm_lead_id OR email/phone)
  const { data: paidLeads = [] } = useQuery({
    queryKey: ["fsd-paid-leads", crmLeads.map((l) => l.id).join(",")],
    enabled: crmLeads.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(crmLeads.map((l) => l.paid_pipeline_lead_id).filter(Boolean) as string[]));
      const crmIds = crmLeads.map((l) => l.id);
      const out: PaidLead[] = [];
      const select = "id,crm_lead_id,email,phone,source_report_date,source_webinar,paid_batch_name,finance_status,total_collected,balance_pending,token_amount_collected,code_of_conduct_status";

      const chunk = <T,>(arr: T[], n: number) => {
        const r: T[][] = [];
        for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n));
        return r;
      };

      if (ids.length > 0) {
        for (const c of chunk(ids, 500)) {
          const { data, error } = await supabase
            .from("paid_pipeline_leads")
            .select(select)
            .in("id", c)
            .eq("is_deleted", false);
          if (error) throw error;
          out.push(...((data ?? []) as PaidLead[]));
        }
      }
      for (const c of chunk(crmIds, 500)) {
        const { data, error } = await supabase
          .from("paid_pipeline_leads")
          .select(select)
          .in("crm_lead_id", c)
          .eq("is_deleted", false);
        if (error) throw error;
        out.push(...((data ?? []) as PaidLead[]));
      }
      // dedupe by id
      const seen = new Map<string, PaidLead>();
      for (const p of out) seen.set(p.id, p);
      return Array.from(seen.values());
    },
  });

  // Payments for linked paid leads (for token amount)
  const { data: payments = [] } = useQuery({
    queryKey: ["fsd-payments", paidLeads.map((p) => p.id).join(",")],
    enabled: paidLeads.length > 0,
    queryFn: async () => {
      const ids = paidLeads.map((p) => p.id);
      const out: Payment[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const slice = ids.slice(i, i + 500);
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

  // Persisted success stage selection
  const [successStageIds, setSuccessStageIds] = useState<string[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("company_settings")
          .select("id,finance_success_stage_ids" as any)
          .eq("workspace", "default")
          .maybeSingle();
        if (!error && data) {
          const arr = ((data as any).finance_success_stage_ids ?? []) as string[];
          setSuccessStageIds(arr);
        }
      } else {
        const { data, error } = await supabase.rpc("get_finance_success_stage_ids" as any);
        if (!error && Array.isArray(data)) setSuccessStageIds(data as string[]);
      }
      setSettingsLoaded(true);
    })();
  }, [isAdmin]);

  // Auto-seed from selected pipeline stages if empty
  useEffect(() => {
    if (!settingsLoaded || successStageIds.length > 0 || pipelineStages.length === 0) return;
    const defaults = pipelineStages
      .filter((s) => {
        const n = normalizeStageName(s.name);
        return SUCCESS_STAGE_KEYWORDS.some((k) => n.includes(k));
      })
      .map((s) => s.id);
    if (defaults.length > 0) setSuccessStageIds(defaults);
  }, [settingsLoaded, pipelineStages, successStageIds.length]);

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

  // Build enrichment
  const enriched = useMemo(() => {
    const stageById = new Map(pipelineStages.map((s) => [s.id, s]));
    const successSet = new Set(successStageIds);

    // Build paid-lead lookup maps
    const paidById = new Map(paidLeads.map((p) => [p.id, p]));
    const paidByCrm = new Map<string, PaidLead>();
    const paidByEmail = new Map<string, PaidLead>();
    const paidByPhone = new Map<string, PaidLead>();
    for (const p of paidLeads) {
      if (p.crm_lead_id) paidByCrm.set(p.crm_lead_id, p);
      const e = norm(p.email);
      if (e) paidByEmail.set(e, p);
      const ph = normPhone(p.phone);
      if (ph) paidByPhone.set(ph, p);
    }

    const paymentsByLead = new Map<string, Payment[]>();
    for (const p of payments) {
      const arr = paymentsByLead.get(p.paid_pipeline_lead_id) ?? [];
      arr.push(p);
      paymentsByLead.set(p.paid_pipeline_lead_id, arr);
    }

    return crmLeads.map((l) => {
      // Resolve paid record
      let paid: PaidLead | undefined;
      if (l.paid_pipeline_lead_id) paid = paidById.get(l.paid_pipeline_lead_id);
      if (!paid) paid = paidByCrm.get(l.id);
      if (!paid) {
        const e = norm(l.email);
        if (e) paid = paidByEmail.get(e);
      }
      if (!paid) {
        const ph = normPhone(l.phone);
        if (ph) paid = paidByPhone.get(ph);
      }

      // Webinar date: CRM first, then paid fallbacks
      let webinarDate: string | null = l.webinar_date ?? null;
      let dateSource: "crm" | "paid" | "created_at" = "crm";
      if (!webinarDate && paid?.source_report_date) {
        webinarDate = paid.source_report_date;
        dateSource = "paid";
      }
      if (!webinarDate) {
        webinarDate = l.created_at.slice(0, 10);
        dateSource = "created_at";
      }

      // Token amount
      let tokenAmount = 0;
      if (paid) {
        const ps = paymentsByLead.get(paid.id) ?? [];
        const tokenPayments = ps.filter(
          (p) => p.is_token || /token/i.test(p.payment_type ?? "") || /token/i.test(p.payment_category ?? ""),
        );
        tokenAmount = tokenPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
        if (tokenAmount === 0 && Number(paid.token_amount_collected || 0) > 0) tokenAmount = Number(paid.token_amount_collected);
        if (tokenAmount === 0 && ps.length > 0) {
          const sorted = [...ps].sort((a, b) => a.payment_date.localeCompare(b.payment_date));
          tokenAmount = Number(sorted[0].amount || 0);
        }
      }
      const tokenRecorded = tokenAmount > 0;

      const currentStage = l.stage_id ? stageById.get(l.stage_id)?.name ?? "—" : "—";
      const reachedSuccess = l.stage_id ? successSet.has(l.stage_id) : false;
      const batchLabel = l.webinar_name || l.webinar_source || paid?.paid_batch_name || paid?.source_webinar || "—";

      return {
        id: l.id,
        name: l.full_name,
        email: l.email,
        phone: l.phone,
        webinarDate: webinarDate!,
        dateSource,
        currentStage,
        reachedSuccess,
        batchLabel,
        tokenAmount,
        tokenRecorded,
        totalCollected: Number(paid?.total_collected || 0),
        balancePending: Number(paid?.balance_pending || 0),
        financeStatus: paid?.finance_status ?? null,
        cocStatus: paid?.code_of_conduct_status ?? null,
        paidLeadId: paid?.id ?? null,
        hasPaidLink: !!paid,
      };
    });
  }, [crmLeads, paidLeads, payments, pipelineStages, successStageIds]);

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

  const summary = useMemo(() => {
    const total = filtered.length;
    const tokenCollected = filtered.reduce((s, l) => s + l.tokenAmount, 0);
    const tokenRecordedCount = filtered.filter((l) => l.tokenRecorded).length;
    const reached = filtered.filter((l) => l.reachedSuccess).length;
    const balancePending = filtered.reduce((s, l) => s + l.balancePending, 0);
    const financePending = filtered.filter((l) => !l.financeStatus || /pending|submitted|requested/i.test(l.financeStatus)).length;
    const missingPaidLink = filtered.filter((l) => !l.hasPaidLink).length;
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
      missingPaidLink,
    };
  }, [filtered]);

  const byWebinar = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const l of filtered) {
      const arr = map.get(l.webinarDate) ?? [];
      arr.push(l);
      map.set(l.webinarDate, arr);
    }
    return Array.from(map.entries())
      .map(([date, items]) => {
        const total = items.length;
        const tokenCollected = items.reduce((s, l) => s + l.tokenAmount, 0);
        const tokenRecordedCount = items.filter((l) => l.tokenRecorded).length;
        const reached = items.filter((l) => l.reachedSuccess).length;
        const balancePending = items.reduce((s, l) => s + l.balancePending, 0);
        const financePending = items.filter((l) => !l.financeStatus || /pending|submitted|requested/i.test(l.financeStatus)).length;
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

  // Validate saved success stages against selected pipeline
  const invalidSuccessStages = useMemo(() => {
    if (pipelineStages.length === 0) return [] as string[];
    const valid = new Set(pipelineStages.map((s) => s.id));
    return successStageIds.filter((id) => !valid.has(id));
  }, [successStageIds, pipelineStages]);

  return (
    <div className="max-w-[1200px]">
      <PageHead
        title="Finance Success Dashboard"
        sub="Webinar-wise success rate of CRM Paid Onboarding leads reaching the configured success stage. Read-only."
      />

      {!hasAccess && (
        <div className="border border-line rounded-xl bg-white px-6 py-10 text-center">
          <div className="font-serif text-xl mb-2">You do not have access to Finance Success Dashboard.</div>
          <div className="font-sans text-sm text-muted-foreground">Please contact an admin to request access.</div>
        </div>
      )}

      {hasAccess && (<>


      {/* Pipeline selector */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-[260px]">
          <label className="block text-[11px] text-muted-foreground mb-1">Paid Onboarding Pipeline</label>
          <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
            <SelectTrigger><SelectValue placeholder="Select pipeline…" /></SelectTrigger>
            <SelectContent>
              {paidPipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
              {pipelineStages
                .filter((s) => !successStageIds.includes(s.id))
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {successStageIds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          <span className="text-muted-foreground">Success stages:</span>
          {successStageIds.map((id) => {
            const s = pipelineStages.find((x) => x.id === id);
            const invalid = !s;
            return (
              <span
                key={id}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${invalid ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
              >
                {s?.name ?? "(not in selected pipeline)"}
                {isAdmin && (
                  <button
                    onClick={() => saveSuccessStages(successStageIds.filter((x) => x !== id))}
                    className="opacity-60 hover:opacity-100"
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
      {invalidSuccessStages.length > 0 && (
        <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          ⚠ {invalidSuccessStages.length} saved success stage(s) do not belong to the selected pipeline. Please reselect.
        </div>
      )}

      {/* Count reconciliation strip (admin) */}
      {isAdmin && (
        <Card className="mb-5">
          <CardContent className="p-3 grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
            {[
              { label: "CRM pipeline active leads", value: crmLeads.length },
              { label: "Dashboard denominator", value: summary.total },
              { label: "Linked paid records", value: summary.total - summary.missingPaidLink },
              { label: "Missing paid record/link", value: summary.missingPaidLink },
              { label: "Reached success stage", value: summary.reached },
              { label: "Not yet successful", value: summary.stuck },
            ].map((c) => (
              <div key={c.label}>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</div>
                <div className="text-base font-semibold">{c.value}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <SectionLabel>Summary</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
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
          ⚠ {summary.tokenMissing} lead(s) have no recorded token amount. They are still counted.
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

      <SectionLabel>Where Are Members Stuck?</SectionLabel>
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

      <Dialog open={!!drilldownDate} onOpenChange={(o) => !o && setDrilldownDate(null)}>
        <DialogContent className="w-[95vw] sm:max-w-[1200px] max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Leads — Webinar {drilldownDate}</DialogTitle>
          </DialogHeader>

          {/* Mobile: card layout */}
          <div className="md:hidden space-y-3">
            {drilldownLeads.map((l) => (
              <div key={l.id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{l.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{l.phone ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{l.email ?? "—"}</div>
                  </div>
                  {l.reachedSuccess ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">Successful</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Not yet</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-xs">{l.currentStage || "—"}</Badge>
                  {l.financeStatus && <Badge variant="outline" className="text-xs">{l.financeStatus}</Badge>}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <div>{l.webinarDate} · <span className="truncate">{l.batchLabel}</span></div>
                  <div className="mt-1">
                    Token: {l.tokenRecorded ? `₹${fmtINR(l.tokenAmount)}` : <span className="text-amber-700">Not recorded</span>}
                    {" · "}Collected: ₹{fmtINR(l.totalCollected)}
                    {" · "}Balance: ₹{fmtINR(l.balancePending)}
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Link to={`/crm?lead=${l.id}`}>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs">CRM</Button>
                  </Link>
                  {l.paidLeadId && (
                    <Link to={`/paid-pipeline?lead=${l.paidLeadId}`}>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs">Paid</Button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {drilldownLeads.length === 0 && (
              <div className="text-center text-muted-foreground py-6 text-sm">No leads.</div>
            )}
          </div>

          {/* Desktop/tablet: compact table with sticky Member + Status columns */}
          <div className="hidden md:block relative w-full overflow-x-auto">
            <table className="w-full caption-bottom text-sm border-collapse">
              <thead className="[&_tr]:border-b">
                <tr className="border-b">
                  <th className="sticky left-0 z-20 bg-background h-10 px-3 text-left align-middle font-medium text-muted-foreground min-w-[220px] shadow-[1px_0_0_0_hsl(var(--border))]">Member</th>
                  <th className="sticky left-[220px] z-20 bg-background h-10 px-3 text-left align-middle font-medium text-muted-foreground shadow-[1px_0_0_0_hsl(var(--border))]">Status</th>
                  <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground">CRM Stage</th>
                  <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground">Open</th>
                  <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground">Batch / Webinar</th>
                  <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground">Token</th>
                  <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground">Collected</th>
                  <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground">Balance</th>
                  <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground">Finance</th>
                </tr>
              </thead>
              <tbody>
                {drilldownLeads.map((l) => (
                  <tr key={l.id} className="border-b hover:bg-muted/40">
                    <td className="sticky left-0 z-10 bg-background p-3 align-top min-w-[220px] shadow-[1px_0_0_0_hsl(var(--border))]">
                      <div className="font-semibold leading-tight">{l.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.phone ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{l.email ?? "—"}</div>
                    </td>
                    <td className="sticky left-[220px] z-10 bg-background p-3 align-top shadow-[1px_0_0_0_hsl(var(--border))]">
                      {l.reachedSuccess ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">Successful</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Not yet</Badge>
                      )}
                    </td>
                    <td className="p-3 align-top max-w-[200px]">
                      <Badge variant="outline" className="text-xs whitespace-normal text-left">{l.currentStage || "—"}</Badge>
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <div className="flex gap-1.5">
                        <Link to={`/crm?lead=${l.id}`}>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs">CRM</Button>
                        </Link>
                        {l.paidLeadId && (
                          <Link to={`/paid-pipeline?lead=${l.paidLeadId}`}>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs">Paid</Button>
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="p-3 align-top text-xs">
                      <div>{l.webinarDate}</div>
                      <div className="text-muted-foreground truncate max-w-[160px]">{l.batchLabel}</div>
                    </td>
                    <td className="p-3 align-top text-right whitespace-nowrap">
                      {l.tokenRecorded ? `₹${fmtINR(l.tokenAmount)}` : <span className="text-amber-700 text-xs">Not recorded</span>}
                    </td>
                    <td className="p-3 align-top text-right whitespace-nowrap">₹{fmtINR(l.totalCollected)}</td>
                    <td className="p-3 align-top text-right whitespace-nowrap">₹{fmtINR(l.balancePending)}</td>
                    <td className="p-3 align-top text-xs max-w-[140px] truncate">{l.financeStatus ?? "—"}</td>
                  </tr>
                ))}
                {drilldownLeads.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted-foreground py-6">No leads.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
