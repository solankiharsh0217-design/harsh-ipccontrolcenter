// Compact "Linked Records" card for the Operations Lead Drawer.
// Read-only: resolves minimal CRM + Paid Pipeline sibling records via
// existing IDs already on the operations_lead row. Renders open buttons
// that deep-link into /crm and /paid-pipeline with a query param.

import { useEffect, useState } from "react";
import { ExternalLink, Link2, AlertTriangle } from "lucide-react";
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
  pipeline_id: string | null; stage_id: string | null;
  stage_name?: string | null; pipeline_name?: string | null;
}

interface PaidMini {
  id: string; name: string | null; email: string | null; phone: string | null;
  pipeline_stage: string | null;
  deal_value_including_gst: number | null;
  total_collected?: number | null;
  balance?: number | null;
}

type LoadState = "idle" | "loading" | "linked" | "missing" | "unavailable";

function StatusPill({ state }: { state: LoadState }) {
  const map: Record<LoadState, { label: string; cls: string }> = {
    idle:        { label: "—",           cls: "bg-slate-100 text-slate-600 border-slate-200" },
    loading:     { label: "Loading…",    cls: "bg-slate-100 text-slate-600 border-slate-200" },
    linked:      { label: "Linked",      cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    missing:     { label: "Not linked",  cls: "bg-slate-50 text-slate-600 border-slate-200" },
    unavailable: { label: "Unavailable", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  };
  const m = map[state];
  return <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>;
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
    async function loadCrm() {
      if (!crmLeadId) { setCrmState("missing"); setCrm(null); return; }
      setCrmState("loading");
      const { data, error } = await (supabase as any)
        .from("leads")
        .select("id, full_name, email, phone, pipeline_id, stage_id")
        .eq("id", crmLeadId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) { setCrmState("unavailable"); setCrm(null); return; }
      let stage_name: string | null = null, pipeline_name: string | null = null;
      if (data.stage_id) {
        const { data: s } = await (supabase as any).from("stages").select("name").eq("id", data.stage_id).maybeSingle();
        stage_name = s?.name || null;
      }
      if (data.pipeline_id) {
        const { data: p } = await (supabase as any).from("pipelines").select("name").eq("id", data.pipeline_id).maybeSingle();
        pipeline_name = p?.name || null;
      }
      if (cancelled) return;
      setCrm({ ...data, stage_name, pipeline_name });
      setCrmState("linked");
    }
    async function loadPaid() {
      if (!paidPipelineLeadId) { setPaidState("missing"); setPaid(null); return; }
      setPaidState("loading");
      const { data, error } = await (supabase as any)
        .from("paid_pipeline_leads")
        .select("id, name, email, phone, pipeline_stage, deal_value_including_gst, total_collected, balance")
        .eq("id", paidPipelineLeadId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) { setPaidState("unavailable"); setPaid(null); return; }
      setPaid(data as PaidMini);
      setPaidState("linked");
    }
    loadCrm(); loadPaid();
    return () => { cancelled = true; };
  }, [crmLeadId, paidPipelineLeadId]);

  const openCrm = () => crmLeadId && window.open(`/crm?lead=${crmLeadId}`, "_blank");
  const openPaid = () => paidPipelineLeadId && window.open(`/paid-pipeline?lead=${paidPipelineLeadId}`, "_blank");

  const anyMissing = (!crmLeadId || !paidPipelineLeadId) && isAdmin;

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
          ) : crmState === "unavailable" ? (
            <div className="text-[11px] text-amber-800 mt-1 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-0.5" /> Linked record unavailable or not accessible.
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
              <button onClick={openPaid} className="mt-1.5 self-start inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-line bg-white hover:bg-off">
                <ExternalLink className="w-3 h-3" /> Open Paid Record
              </button>
            </>
          ) : paidState === "missing" ? (
            <div className="text-[11px] text-muted-foreground mt-1">Paid Pipeline record not linked.</div>
          ) : paidState === "unavailable" ? (
            <div className="text-[11px] text-amber-800 mt-1 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-0.5" /> Linked record unavailable or not accessible.
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mt-1">Loading…</div>
          )}
        </div>
      </div>

      {anyMissing && (
        <div className="mt-2 text-[10.5px] text-muted-foreground italic">
          This operations record may have been created manually or imported without a source link.
        </div>
      )}
    </div>
  );
}
