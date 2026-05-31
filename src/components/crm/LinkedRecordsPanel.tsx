// Compact "Linked Records" panel shown near the top of the Lead Drawer.
// Resolves all sibling records (source unpaid, paid onboarding, paid buyer,
// operations) for a given lead via resolveLinkBundle and renders one card
// per sibling with Open / Jump actions.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Wrench, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { resolveLinkBundle, type LinkBundle, type SiblingRef } from "@/lib/leadLinks";
import { ensurePaidPipelineCrmLead } from "@/lib/paidCrmMirror";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/auditLog";

interface Props {
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  email?: string | null;
  phone?: string | null;
  onChanged?: () => void;
}

const kindMeta: Record<SiblingRef["kind"], { label: string; cls: string }> = {
  source_unpaid_crm:    { label: "Source Sales Lead",    cls: "border-slate-200 bg-white" },
  paid_onboarding_crm:  { label: "Paid Onboarding Lead", cls: "border-emerald-200 bg-emerald-50/40" },
  paid_pipeline_buyer:  { label: "Paid Pipeline Buyer",  cls: "border-amber-200 bg-amber-50/40" },
  operations_lead:      { label: "Operations Lead",      cls: "border-indigo-200 bg-indigo-50/40" },
};

function hrefFor(s: SiblingRef): string {
  switch (s.kind) {
    case "paid_pipeline_buyer": return `/paid-pipeline?lead=${s.id}`;
    case "operations_lead":     return `/operations-crm?lead=${s.id}`;
    default:                    return `/crm?lead=${s.id}`;
  }
}

function SiblingCard({ s, currentId }: { s: SiblingRef; currentId: string | null }) {
  const m = kindMeta[s.kind];
  const isSelf = currentId && s.id === currentId;
  return (
    <div className={`rounded-md border ${m.cls} px-2.5 py-2 flex items-center justify-between gap-2`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground/80">{m.label}</span>
          {isSelf && <span className="text-[9px] px-1 py-0.5 rounded bg-black text-white">This record</span>}
          {s.archived && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">Archived</span>}
        </div>
        <div className="text-[12.5px] font-medium truncate">{s.name || "(no name)"}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {s.pipelineName || "—"}{s.stageName ? ` · ${s.stageName}` : ""}
        </div>
      </div>
      {!isSelf && (
        <Link to={hrefFor(s)} className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-line bg-white hover:bg-off">
          <ExternalLink className="w-3 h-3" /> Open
        </Link>
      )}
    </div>
  );
}

export default function LinkedRecordsPanel({ crmLeadId, paidPipelineLeadId, email, phone, onChanged }: Props) {
  const { isAdmin } = useAuth();
  const [bundle, setBundle] = useState<LinkBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const b = await resolveLinkBundle({ crmLeadId, paidPipelineLeadId, email, phone });
      setBundle(b);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [crmLeadId, paidPipelineLeadId, email, phone]);

  const repair = async () => {
    if (!bundle) return;
    const buyer = bundle.paid_pipeline_buyer[0];
    if (!buyer) {
      toast.error("No paid buyer found to repair.");
      return;
    }
    setRepairing(true);
    try {
      const res = await ensurePaidPipelineCrmLead(buyer.id);
      if (!res.ok) { toast.error(res.message || "Repair failed"); return; }
      toast.success(res.message || "Linked Paid Onboarding CRM lead repaired.");
      logActivity({
        module_key: "calling_crm",
        action_type: "paid_onboarding_visibility_repaired",
        entity_type: "paid_pipeline_lead", entity_id: buyer.id,
        metadata: { action: res.action, crm_lead_id: res.crmLeadId, source_unpaid_lead_id: res.sourceUnpaidLeadId },
        summary: `Repaired Paid Onboarding link for ${buyer.name || "buyer"}.`,
      }).catch(() => {});
      await load();
      onChanged?.();
    } finally {
      setRepairing(false);
    }
  };

  const total = bundle ? bundle.source_unpaid_crm.length + bundle.paid_onboarding_crm.length + bundle.paid_pipeline_buyer.length + bundle.operations_lead.length : 0;
  const showRepair = bundle && (bundle.missing.paid_onboarding_crm || bundle.missing.crm_link_repair_needed);

  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">🔗 Linked Records</div>
        <button onClick={load} disabled={loading} className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      {loading && !bundle && <div className="text-[11px] text-muted-foreground">Looking up linked records…</div>}
      {bundle && total === 0 && <div className="text-[11px] text-muted-foreground">No linked records found for this identity.</div>}
      {bundle && (
        <div className="space-y-1.5">
          {bundle.source_unpaid_crm.map((s) => <SiblingCard key={`u-${s.id}`} s={s} currentId={crmLeadId || null} />)}
          {bundle.paid_onboarding_crm.map((s) => <SiblingCard key={`p-${s.id}`} s={s} currentId={crmLeadId || null} />)}
          {bundle.paid_pipeline_buyer.map((s) => <SiblingCard key={`b-${s.id}`} s={s} currentId={paidPipelineLeadId || null} />)}
          {bundle.operations_lead.map((s) => <SiblingCard key={`o-${s.id}`} s={s} currentId={null} />)}
        </div>
      )}
      {showRepair && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 flex items-center justify-between gap-2">
          <div className="flex items-start gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-900">
              {bundle?.missing.paid_onboarding_crm
                ? "Paid Onboarding CRM card missing for this buyer."
                : "crm_lead_id may point to the source unpaid lead instead of Paid Onboarding."}
            </div>
          </div>
          {(isAdmin || true) && (
            <button onClick={repair} disabled={repairing} className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-black text-white disabled:opacity-50">
              <Wrench className="w-3 h-3" /> {repairing ? "Repairing…" : "Create / Repair"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
