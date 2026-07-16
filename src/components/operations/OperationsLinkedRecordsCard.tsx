// Compact "Linked Records" card for the Operations Lead Drawer.
// Resolves minimal CRM + Paid Pipeline sibling records via existing IDs on
// the operations_lead row. Falls back to a secure RPC when direct table
// access is blocked by RLS (e.g. media buyers viewing an assigned lead).

import { useEffect, useState } from "react";
import { ExternalLink, Link2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface Props {
  operationsLeadId: string;
  operationsLeadName?: string | null;
  operationsStatusLabel?: string | null;
  crmLeadId: string | null;
  paidPipelineLeadId: string | null;
}

interface CrmMini {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  stage_name?: string | null; pipeline_name?: string | null;
}
interface PaidMini {
  id: string; name: string | null; email: string | null; phone: string | null;
  pipeline_stage: string | null;
  deal_value_including_gst?: number | null;
  deal_value?: number | null;
  total_collected?: number | null;
  collected_amount?: number | null;
  balance?: number | null;
  balance_amount?: number | null;
  token_amount_collected?: number | null;
  finance_status?: string | null;
  fully_paid?: boolean | null;
  payment_status?: "fully_paid" | "partial" | "token_only" | "pending" | null;
}

type LoadState = "idle" | "loading" | "linked" | "missing" | "restricted" | "not_found";
type ReasonCode =
  | "missing_id"
  | "module_missing"
  | "not_assigned"
  | "not_assigned_to_operations_lead"
  | "not_found"
  | null;

function StatusPill({ state }: { state: LoadState }) {
  const map: Record<LoadState, { label: string; cls: string }> = {
    idle:       { label: "—",                cls: "bg-slate-100 text-slate-600 border-slate-200" },
    loading:    { label: "Loading…",         cls: "bg-slate-100 text-slate-600 border-slate-200" },
    linked:     { label: "Linked",           cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    missing:    { label: "Not linked",       cls: "bg-slate-50 text-slate-600 border-slate-200" },
    restricted: { label: "Access restricted",cls: "bg-amber-50 text-amber-800 border-amber-200" },
    not_found:  { label: "Record missing",   cls: "bg-red-50 text-red-700 border-red-200" },
  };
  const m = map[state];
  return <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>;
}

function restrictedMessage(kind: "crm" | "paid", reason: ReasonCode): string {
  if (reason === "module_missing") {
    return kind === "crm"
      ? "Access restricted — Calling CRM access is not enabled for you."
      : "Access restricted — Paid Pipeline access is not enabled for you.";
  }
  if (reason === "not_assigned_to_operations_lead" || reason === "not_assigned") {
    return "Access restricted — this Operations record is not assigned to you.";
  }
  return "Access restricted.";
}

function paidStatusLabel(s?: string | null) {
  if (s === "fully_paid") return "Fully paid";
  if (s === "partial") return "Partial payment · balance pending";
  if (s === "token_only") return "Token paid only";
  if (s === "pending") return "Payment pending";
  return null;
}

export default function OperationsLinkedRecordsCard({
  operationsLeadId, operationsLeadName, operationsStatusLabel,
  crmLeadId, paidPipelineLeadId,
}: Props) {
  const { isAdmin } = useAuth();
  const [crm, setCrm] = useState<CrmMini | null>(null);
  const [paid, setPaid] = useState<PaidMini | null>(null);
  const [crmState, setCrmState] = useState<LoadState>(crmLeadId ? "loading" : "missing");
  const [paidState, setPaidState] = useState<LoadState>(paidPipelineLeadId ? "loading" : "missing");
  const [crmReason, setCrmReason] = useState<ReasonCode>(crmLeadId ? null : "missing_id");
  const [paidReason, setPaidReason] = useState<ReasonCode>(paidPipelineLeadId ? null : "missing_id");
  const [diag, setDiag] = useState<{
    allowed_by?: string | null;
    operations_assignment_match?: boolean;
    has_calling_crm_module?: boolean;
    has_paid_pipeline_module?: boolean;
    assigned_media_buyer_id?: string | null;
    assigned_media_buyer_name?: string | null;
  }>({});

  useEffect(() => {
    let cancelled = false;
    const sb: any = supabase;

    async function loadDirect() {
      let crmLoaded = false;
      let paidLoaded = false;

      if (crmLeadId) {
        const { data } = await sb.from("leads")
          .select("id, full_name, email, phone, pipeline_id, stage_id")
          .eq("id", crmLeadId).maybeSingle();
        if (!cancelled && data) {
          let stage_name: string | null = null, pipeline_name: string | null = null;
          if (data.stage_id) {
            const { data: s } = await sb.from("stages").select("name").eq("id", data.stage_id).maybeSingle();
            stage_name = s?.name || null;
          }
          if (data.pipeline_id) {
            const { data: p } = await sb.from("pipelines").select("name").eq("id", data.pipeline_id).maybeSingle();
            pipeline_name = p?.name || null;
          }
          if (!cancelled) {
            setCrm({ id: data.id, full_name: data.full_name, email: data.email, phone: data.phone, stage_name, pipeline_name });
            setCrmState("linked");
            crmLoaded = true;
          }
        }
      }

      if (paidPipelineLeadId) {
        const { data } = await sb.from("paid_pipeline_leads")
          .select("id, name, email, phone, pipeline_stage, finance_status, deal_value_including_gst, token_amount_collected, total_collected, balance_pending")
          .eq("id", paidPipelineLeadId).maybeSingle();
        if (!cancelled && data) {
          const bal = Number(data.balance_pending ?? 0);
          const col = Number(data.total_collected ?? 0);
          const tok = Number(data.token_amount_collected ?? 0);
          const payment_status: PaidMini["payment_status"] =
            bal <= 0 && col > 0 ? "fully_paid"
              : col > 0 && bal > 0 ? "partial"
              : tok > 0 ? "token_only"
              : "pending";
          setPaid({ ...(data as any), balance: bal, balance_amount: bal, deal_value: data.deal_value_including_gst, collected_amount: col, fully_paid: payment_status === "fully_paid", payment_status });
          setPaidState("linked");
          paidLoaded = true;
        }
      }

      return { crmLoaded, paidLoaded };
    }

    async function loadViaRpc() {
      const { data, error } = await sb.rpc("get_operations_linked_record_summary", { _ops_lead_id: operationsLeadId });
      if (cancelled) return;
      if (error || !data) {
        if (crmLeadId) { setCrmState("restricted"); setCrmReason("not_assigned"); }
        if (paidPipelineLeadId) { setPaidState("restricted"); setPaidReason("not_assigned"); }
        return;
      }
      const d = data as any;
      setDiag({
        allowed_by: d.allowed_by ?? null,
        operations_assignment_match: !!d.operations_assignment_match,
        has_calling_crm_module: !!d.has_calling_crm_module,
        has_paid_pipeline_module: !!d.has_paid_pipeline_module,
        assigned_media_buyer_id: d.assigned_media_buyer_id ?? null,
        assigned_media_buyer_name: d.assigned_media_buyer_name ?? null,
      });
      // RPC returned top-level error (unauthenticated / forbidden / not_found)
      if (d.error) {
        if (crmLeadId) { setCrmState("restricted"); setCrmReason("not_assigned_to_operations_lead"); }
        if (paidPipelineLeadId) { setPaidState("restricted"); setPaidReason("not_assigned_to_operations_lead"); }
        return;
      }
      // New structured shape
      if (d.crm && typeof d.crm === "object" && "status" in d.crm) {
        const c = d.crm as { status: string; reason_code: ReasonCode; data: CrmMini | null };
        setCrmReason(c.reason_code ?? null);
        if (c.status === "linked" && c.data) { setCrm(c.data); setCrmState("linked"); }
        else if (c.status === "access_restricted") setCrmState("restricted");
        else if (c.status === "not_found") setCrmState("not_found");
        else setCrmState("missing");
      } else if (d.crm_legacy || d.crm) {
        // Legacy shape (data object directly)
        const legacy = (d.crm_legacy ?? d.crm) as CrmMini | null;
        if (legacy) { setCrm(legacy); setCrmState("linked"); }
        else if (crmLeadId) { setCrmState("restricted"); setCrmReason("not_assigned"); }
      }
      if (d.paid && typeof d.paid === "object" && "status" in d.paid) {
        const p = d.paid as { status: string; reason_code: ReasonCode; data: PaidMini | null };
        setPaidReason(p.reason_code ?? null);
        if (p.status === "linked" && p.data) { setPaid(p.data); setPaidState("linked"); }
        else if (p.status === "access_restricted") setPaidState("restricted");
        else if (p.status === "not_found") setPaidState("not_found");
        else setPaidState("missing");
      } else if (d.paid_legacy || d.paid) {
        const legacy = (d.paid_legacy ?? d.paid) as PaidMini | null;
        if (legacy) { setPaid(legacy); setPaidState("linked"); }
        else if (paidPipelineLeadId) { setPaidState("restricted"); setPaidReason("not_assigned"); }
      }
    }

    (async () => {
      if (!crmLeadId) setCrmState("missing");
      if (!paidPipelineLeadId) setPaidState("missing");
      const { crmLoaded, paidLoaded } = await loadDirect();
      const needCrm = !!crmLeadId && !crmLoaded;
      const needPaid = !!paidPipelineLeadId && !paidLoaded;
      if (needCrm || needPaid) await loadViaRpc();
    })();

    return () => { cancelled = true; };
  }, [crmLeadId, paidPipelineLeadId, operationsLeadId]);

  const openCrm = () => crmLeadId && window.open(`/crm?lead=${crmLeadId}`, "_blank");
  const openPaid = () => paidPipelineLeadId && window.open(`/paid-pipeline?lead=${paidPipelineLeadId}`, "_blank");

  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">Linked Records</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Operations (self) */}
        <div className="rounded-md border border-indigo-200 bg-indigo-50/40 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground/80">Operations</span>
            <span className="text-[9px] px-1 py-0.5 rounded bg-black text-white">This record</span>
          </div>
          <div className="text-[12.5px] font-medium truncate mt-0.5">{operationsLeadName || "(no name)"}</div>
          <div className="text-[11px] text-muted-foreground truncate">{operationsStatusLabel || "Operations CRM"}</div>
        </div>

        {/* Calling CRM */}
        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground/80">Calling CRM</span>
            <StatusPill state={crmState} />
          </div>
          {crmState === "linked" && crm ? (
            <>
              <div className="text-[12.5px] font-medium truncate mt-0.5">{crm.full_name || "(no name)"}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {(crm.pipeline_name || "—")}{crm.stage_name ? ` · ${crm.stage_name}` : ""}
              </div>
              <button onClick={openCrm} className="mt-1.5 self-start inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-line bg-white hover:bg-off">
                <ExternalLink className="w-3 h-3" /> Open CRM Lead
              </button>
            </>
          ) : crmState === "missing" ? (
            <div className="text-[11px] text-muted-foreground mt-1">Not linked.</div>
          ) : crmState === "not_found" ? (
            <div className="text-[11px] text-red-700 mt-1">Linked record not found.</div>
          ) : crmState === "restricted" ? (
            <div className="text-[11px] text-amber-800 mt-1 flex items-start gap-1">
              <Lock className="w-3 h-3 mt-0.5" /> {restrictedMessage("crm", crmReason)}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mt-1">Loading…</div>
          )}
        </div>

        {/* Paid Pipeline */}
        <div className="rounded-md border border-amber-200 bg-amber-50/40 px-2.5 py-2 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground/80">Paid Pipeline</span>
            <StatusPill state={paidState} />
          </div>
          {paidState === "linked" && paid ? (
            <>
              <div className="text-[12.5px] font-medium truncate mt-0.5">{paid.name || "(no name)"}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {paid.pipeline_stage || "—"}
                {(paid.deal_value ?? paid.deal_value_including_gst) != null
                  ? ` · Deal ₹${Math.round(Number(paid.deal_value ?? paid.deal_value_including_gst)).toLocaleString("en-IN")}`
                  : ""}
              </div>
              <div className="text-[10.5px] mt-0.5">
                <span className={
                  paid.payment_status === "fully_paid" ? "text-emerald-700 font-medium"
                    : paid.payment_status === "partial" ? "text-amber-800 font-medium"
                    : paid.payment_status === "token_only" ? "text-blue-700 font-medium"
                    : "text-red-700 font-medium"
                }>
                  {paidStatusLabel(paid.payment_status) || "Payment status —"}
                </span>
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-0.5">
                Collected ₹{Math.round(Number(paid.collected_amount ?? paid.total_collected ?? 0)).toLocaleString("en-IN")}
                {" · "}
                Balance ₹{Math.round(Number(paid.balance_amount ?? paid.balance ?? 0)).toLocaleString("en-IN")}
                {paid.finance_status ? ` · Finance: ${paid.finance_status}` : ""}
              </div>
              {(isAdmin || diag.has_paid_pipeline_module) && (
                <button onClick={openPaid} className="mt-1.5 self-start inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-line bg-white hover:bg-off">
                  <ExternalLink className="w-3 h-3" /> {isAdmin ? "Open Paid Record" : "View in Paid Pipeline"}
                </button>
              )}
            </>
          ) : paidState === "missing" ? (
            <div className="text-[11px] text-muted-foreground mt-1">Not linked.</div>
          ) : paidState === "not_found" ? (
            <div className="text-[11px] text-red-700 mt-1">Linked record not found.</div>
          ) : paidState === "restricted" ? (
            <div className="text-[11px] text-amber-800 mt-1 flex items-start gap-1">
              <Lock className="w-3 h-3 mt-0.5" /> {restrictedMessage("paid", paidReason)}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mt-1">Loading…</div>
          )}
        </div>
      </div>

      {isAdmin && (
        <details className="mt-2 text-[10.5px] text-muted-foreground">
          <summary className="cursor-pointer italic">Admin diagnostic</summary>
          <div className="mt-1 space-y-0.5">
            <div>operations_lead_id: {operationsLeadId}</div>
            <div>crm_lead_id: {crmLeadId || "—"}</div>
            <div>paid_pipeline_lead_id: {paidPipelineLeadId || "—"}</div>
            <div>assigned_media_buyer_id: {diag.assigned_media_buyer_id || "—"}</div>
            <div>assigned_media_buyer_name: {diag.assigned_media_buyer_name || "—"}</div>
            <div>operations_assignment_match: {diag.operations_assignment_match ? "yes" : "no"}</div>
            <div>allowed_by: {diag.allowed_by || "—"}</div>
            <div>has Calling CRM module: {diag.has_calling_crm_module ? "yes" : "no"}</div>
            <div>has Paid Pipeline module: {diag.has_paid_pipeline_module ? "yes" : "no"}</div>
            <div>Calling CRM: state={crmState}{crmReason ? ` · reason=${crmReason}` : ""}</div>
            <div>Paid Pipeline: state={paidState}{paidReason ? ` · reason=${paidReason}` : ""}</div>
          </div>
        </details>
      )}
    </div>
  );
}
