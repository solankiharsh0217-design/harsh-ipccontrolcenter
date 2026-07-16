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
  deal_value_including_gst: number | null;
  total_collected?: number | null;
  balance?: number | null;
  payment_status?: "fully_paid" | "partial" | "pending" | null;
}

type LoadState = "idle" | "loading" | "linked" | "missing" | "restricted";

function StatusPill({ state }: { state: LoadState }) {
  const map: Record<LoadState, { label: string; cls: string }> = {
    idle:       { label: "—",                cls: "bg-slate-100 text-slate-600 border-slate-200" },
    loading:    { label: "Loading…",         cls: "bg-slate-100 text-slate-600 border-slate-200" },
    linked:     { label: "Linked",           cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    missing:    { label: "Not linked",       cls: "bg-slate-50 text-slate-600 border-slate-200" },
    restricted: { label: "Access restricted",cls: "bg-amber-50 text-amber-800 border-amber-200" },
  };
  const m = map[state];
  return <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>;
}

function paidStatusLabel(s?: string | null) {
  if (s === "fully_paid") return "Fully paid";
  if (s === "partial") return "Partial · balance pending";
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
          .select("id, name, email, phone, pipeline_stage, deal_value_including_gst, total_collected, balance")
          .eq("id", paidPipelineLeadId).maybeSingle();
        if (!cancelled && data) {
          const bal = Number(data.balance ?? 0);
          const col = Number(data.total_collected ?? 0);
          const payment_status: PaidMini["payment_status"] =
            bal <= 0 && col > 0 ? "fully_paid" : col > 0 ? "partial" : "pending";
          setPaid({ ...(data as any), payment_status });
          setPaidState("linked");
          paidLoaded = true;
        }
      }

      return { crmLoaded, paidLoaded };
    }

    async function loadViaRpc() {
      const { data, error } = await sb.rpc("get_operations_linked_record_summary", { _ops_lead_id: operationsLeadId });
      if (cancelled) return;
      if (error || !data || (data as any).error) {
        // Fall back to restricted / missing based on ID presence
        if (crmLeadId) setCrmState("restricted");
        if (paidPipelineLeadId) setPaidState("restricted");
        return;
      }
      const d = data as any;
      if (d.crm) {
        setCrm(d.crm as CrmMini);
        setCrmState("linked");
      } else if (crmLeadId) {
        setCrmState("restricted");
      }
      if (d.paid) {
        setPaid(d.paid as PaidMini);
        setPaidState("linked");
      } else if (paidPipelineLeadId) {
        setPaidState("restricted");
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
            <div className="text-[11px] text-muted-foreground mt-1">CRM lead not linked.</div>
          ) : crmState === "restricted" ? (
            <div className="text-[11px] text-amber-800 mt-1 flex items-start gap-1">
              <Lock className="w-3 h-3 mt-0.5" /> Access restricted. Ask an admin for Calling CRM access.
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
                {paid.deal_value_including_gst != null ? ` · ₹${Math.round(paid.deal_value_including_gst).toLocaleString("en-IN")}` : ""}
              </div>
              {(paid.payment_status || paid.balance != null) && (
                <div className="text-[10.5px] mt-0.5">
                  <span className={
                    paid.payment_status === "fully_paid"
                      ? "text-emerald-700"
                      : paid.payment_status === "partial"
                      ? "text-amber-800"
                      : "text-red-700"
                  }>
                    {paidStatusLabel(paid.payment_status) || "Payment status —"}
                  </span>
                  {paid.balance != null && paid.payment_status !== "fully_paid" && (
                    <span className="text-muted-foreground"> · Balance ₹{Math.round(Number(paid.balance)).toLocaleString("en-IN")}</span>
                  )}
                </div>
              )}
              <button onClick={openPaid} className="mt-1.5 self-start inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-line bg-white hover:bg-off">
                <ExternalLink className="w-3 h-3" /> Open Paid Record
              </button>
            </>
          ) : paidState === "missing" ? (
            <div className="text-[11px] text-muted-foreground mt-1">Paid Pipeline record not linked.</div>
          ) : paidState === "restricted" ? (
            <div className="text-[11px] text-amber-800 mt-1 flex items-start gap-1">
              <Lock className="w-3 h-3 mt-0.5" /> Access restricted. Ask an admin for Paid Pipeline access.
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mt-1">Loading…</div>
          )}
        </div>
      </div>

      {isAdmin && (!crmLeadId || !paidPipelineLeadId) && (
        <div className="mt-2 text-[10.5px] text-muted-foreground italic">
          Admin diagnostic: {crmLeadId ? "" : "CRM link missing. "}{paidPipelineLeadId ? "" : "Paid Pipeline link missing."}
        </div>
      )}
    </div>
  );
}
