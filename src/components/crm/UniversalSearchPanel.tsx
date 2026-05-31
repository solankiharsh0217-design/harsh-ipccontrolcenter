// Universal Lead Search panel rendered below the Calling CRM search input.
// Read-only. Respects existing RLS for non-admin users.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, ArrowRight, Wrench, Copy, ChevronDown, ChevronRight, Search as SearchIcon, X } from "lucide-react";
import { runUniversalSearch, type UniversalSearchGroup, type UniversalSearchResult, type UniversalSearchOutput } from "@/lib/universalSearch";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/auditLog";

interface Props {
  query: string;
  currentPipelineId: string | null;
  pipelineNameLookup: Record<string, string>;
  stageNameLookup: Record<string, string>;
  agentNameLookup: Record<string, string>;
  onOpenCrmDrawer: (leadId: string) => void;
  onJumpToCrmCard: (lead: UniversalSearchResult) => void;
  onClose?: () => void;
}

function copy(text: string | null | undefined, label: string) {
  if (!text) return;
  navigator.clipboard?.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Copy failed"),
  );
}

function ChipsRow({ r }: { r: UniversalSearchResult }) {
  const chips: { label: string; cls: string }[] = [];
  if (r.paidLinked && r.recordType !== "paid_pipeline_buyer") chips.push({ label: "Paid Linked", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" });
  if (r.isConverted) chips.push({ label: "Converted", cls: "bg-violet-50 text-violet-700 border-violet-200" });
  if (r.isArchived) chips.push({ label: "Archived", cls: "bg-amber-50 text-amber-700 border-amber-200" });
  if (r.isHiddenFromSales) chips.push({ label: "Hidden from Sales", cls: "bg-slate-100 text-slate-700 border-slate-200" });
  if (r.cocStatus && r.cocStatus !== "none") chips.push({ label: `CoC ${r.cocStatus}`, cls: "bg-blue-50 text-blue-700 border-blue-200" });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map((c, i) => (
        <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${c.cls}`}>{c.label}</span>
      ))}
    </div>
  );
}

function TypeChip({ r }: { r: UniversalSearchResult }) {
  const map: Record<UniversalSearchResult["recordType"], { label: string; cls: string }> = {
    crm_lead_sales:           { label: "Sales CRM Lead",          cls: "bg-white text-foreground border-line" },
    crm_lead_paid_onboarding: { label: "Paid Onboarding CRM",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    paid_pipeline_buyer:      { label: "Paid Pipeline Buyer",     cls: "bg-gold-pale text-foreground border-gold/40" },
    operations_lead:          { label: "Operations CRM Lead",     cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  };
  const m = map[r.recordType];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>;
}

function ResultCard({
  r, onOpenCrmDrawer, onJumpToCrmCard, isAdmin,
}: {
  r: UniversalSearchResult;
  onOpenCrmDrawer: (id: string) => void;
  onJumpToCrmCard: (r: UniversalSearchResult) => void;
  isAdmin: boolean;
}) {
  const navigate = useNavigate();

  const log = (action: string) => {
    logActivity({
      module_key: "calling_crm",
      action_type: action,
      entity_type: r.recordType,
      entity_id: r.id,
      entity_label: r.name,
      summary: `${action} from universal search`,
      metadata: { record_type: r.recordType, opened_record_id: r.id },
    }).catch(() => {});
  };

  const openCrm = () => {
    log("universal_search_result_opened");
    onOpenCrmDrawer(r.id);
  };
  const jumpCrm = () => {
    log("universal_search_jump_to_card");
    onJumpToCrmCard(r);
  };
  const openPaid = () => {
    log("universal_search_paid_buyer_opened");
    navigate(`/paid-pipeline?lead=${r.id}`);
  };
  const openPaidLinked = () => {
    if (r.paidPipelineLeadId) {
      log("universal_search_paid_buyer_opened");
      navigate(`/paid-pipeline?lead=${r.paidPipelineLeadId}`);
    }
  };
  const openPaidOnboarding = () => {
    if (r.crmLeadId) {
      log("universal_search_result_opened");
      navigate(`/crm?lead=${r.crmLeadId}`);
    }
  };
  const openOps = () => {
    log("universal_search_result_opened");
    navigate(`/operations-crm?lead=${r.id}`);
  };
  const repairLink = () => {
    log("universal_search_repair_link_clicked");
    navigate(`/paid-pipeline?lead=${r.id}&repair=1`);
  };

  return (
    <div className="rounded-md border border-line bg-white p-2.5 hover:border-gold/60 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-[13px] truncate">{r.name}</span>
            <TypeChip r={r} />
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {[r.email, r.phone].filter(Boolean).join(" · ")}
          </div>
          <div className="text-[11px] text-foreground/80 mt-0.5 truncate">
            <span className="text-muted-foreground">in </span>
            <span className="font-medium">{r.pipelineName || "—"}</span>
            {r.stageName && <> <span className="text-muted-foreground">/</span> <span>{r.stageName}</span></>}
            {r.ownerName && <span className="text-muted-foreground"> · owner {r.ownerName}</span>}
            {r.batch && <span className="text-muted-foreground"> · {r.batch}</span>}
          </div>
          <ChipsRow r={r} />
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {(r.recordType === "crm_lead_sales" || r.recordType === "crm_lead_paid_onboarding") && (
          <>
            <button onClick={openCrm} className="ipc-btn ipc-btn-black !h-7 !text-[11px]"><ArrowRight className="w-3 h-3" /> Open Drawer</button>
            <button onClick={jumpCrm} className="ipc-btn ipc-btn-ghost !h-7 !text-[11px]" title="Switch pipeline and scroll to card">Jump to Card</button>
            {r.paidPipelineLeadId && (
              <button onClick={openPaidLinked} className="ipc-btn ipc-btn-ghost !h-7 !text-[11px]"><ExternalLink className="w-3 h-3" /> Open Paid Buyer</button>
            )}
          </>
        )}
        {r.recordType === "paid_pipeline_buyer" && (
          <>
            <button onClick={openPaid} className="ipc-btn ipc-btn-black !h-7 !text-[11px]"><ArrowRight className="w-3 h-3" /> Open Paid Buyer</button>
            {r.crmLeadId
              ? <button onClick={openPaidOnboarding} className="ipc-btn ipc-btn-ghost !h-7 !text-[11px]"><ExternalLink className="w-3 h-3" /> Open Paid Onboarding</button>
              : isAdmin && <button onClick={repairLink} className="ipc-btn ipc-btn-ghost !h-7 !text-[11px] !text-amber-700 !border-amber-200"><Wrench className="w-3 h-3" /> Repair CRM Link</button>}
          </>
        )}
        {r.recordType === "operations_lead" && (
          <>
            <button onClick={openOps} className="ipc-btn ipc-btn-black !h-7 !text-[11px]"><ArrowRight className="w-3 h-3" /> Open Operations Lead</button>
            {r.crmLeadId && <button onClick={() => navigate(`/crm?lead=${r.crmLeadId}`)} className="ipc-btn ipc-btn-ghost !h-7 !text-[11px]"><ExternalLink className="w-3 h-3" /> Open CRM</button>}
          </>
        )}
        <button onClick={() => copy(r.phone, "Phone")} disabled={!r.phone} className="ipc-btn ipc-btn-ghost !h-7 !text-[11px] disabled:opacity-40"><Copy className="w-3 h-3" /> Phone</button>
        <button onClick={() => copy(r.email, "Email")} disabled={!r.email} className="ipc-btn ipc-btn-ghost !h-7 !text-[11px] disabled:opacity-40"><Copy className="w-3 h-3" /> Email</button>
      </div>
    </div>
  );
}

export default function UniversalSearchPanel({
  query, currentPipelineId, pipelineNameLookup, stageNameLookup, agentNameLookup,
  onOpenCrmDrawer, onJumpToCrmCard, onClose,
}: Props) {
  const { isAdmin } = useAuth();
  const [scope, setScope] = useState<"current" | "all">(isAdmin ? "all" : "current");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UniversalSearchOutput | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [showDebug, setShowDebug] = useState(false);

  const trimmed = query.trim();
  const tooShort = useMemo(() => {
    if (!trimmed) return true;
    if (/^\d+$/.test(trimmed)) return trimmed.length < 5;
    return trimmed.length < 3;
  }, [trimmed]);

  useEffect(() => {
    if (tooShort) { setResult(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await runUniversalSearch({
          query: trimmed,
          includeArchived, includeHidden,
          scope, currentPipelineId,
          isAdmin,
          pipelineNameLookup, stageNameLookup, agentNameLookup,
        });
        if (!cancelled) {
          setResult(r);
          // auto-expand groups with ≤5 results
          const og: Record<string, boolean> = {};
          r.groups.forEach((g) => { og[g.key] = g.results.length <= 5; });
          setOpenGroups(og);
        }
      } catch (e: any) {
        if (!cancelled) toast.error(`Search failed: ${e?.message || e}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [trimmed, scope, includeArchived, includeHidden, isAdmin, currentPipelineId]);

  if (tooShort) return null;

  const total = (result?.groups || []).reduce((s, g) => s + g.results.length, 0);
  const looksLikeContact = /@|\d{5,}/.test(trimmed);

  return (
    <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-line bg-white shadow-lg max-h-[70vh] overflow-y-auto">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-off sticky top-0">
        <div className="flex items-center gap-2 text-[12px]">
          <SearchIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium">Found across Control Center</span>
          {loading && <span className="text-muted-foreground">searching…</span>}
          {!loading && result && <span className="text-muted-foreground">{total} result{total === 1 ? "" : "s"}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-line bg-white">
            <button onClick={() => setScope("current")} className={`px-2 py-0.5 rounded text-[10px] ${scope === "current" ? "bg-black text-white" : "text-muted-foreground"}`}>Current view</button>
            <button onClick={() => setScope("all")} className={`px-2 py-0.5 rounded text-[10px] ${scope === "all" ? "bg-black text-white" : "text-muted-foreground"}`}>All pipelines</button>
          </div>
          {isAdmin && (
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input type="checkbox" className="accent-black" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} /> Archived
            </label>
          )}
          {isAdmin && (
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input type="checkbox" className="accent-black" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} /> Hidden
            </label>
          )}
          {onClose && <button onClick={onClose} className="text-muted-foreground hover:text-black p-1" title="Close"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </div>

      <div className="p-2 space-y-2">
        {!loading && result && result.groups.length === 0 && (
          <div className="p-4 text-center">
            <div className="text-[13px] font-medium">No lead found across accessible pipelines.</div>
            {looksLikeContact && (
              <div className="text-[11px] text-muted-foreground mt-1">
                Checked Sales CRM, Paid Onboarding, Operations CRM, and Paid Pipeline.
              </div>
            )}
            {isAdmin && !includeArchived && (
              <button onClick={() => setIncludeArchived(true)} className="ipc-btn ipc-btn-ghost !h-7 !text-[11px] mt-2">Search archived</button>
            )}
          </div>
        )}

        {result?.groups.map((g: UniversalSearchGroup) => {
          const open = openGroups[g.key] ?? true;
          return (
            <div key={g.key} className="rounded-lg border border-line">
              <button
                onClick={() => setOpenGroups((p) => ({ ...p, [g.key]: !open }))}
                className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-off"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider">
                  {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {g.title}
                  <span className="text-muted-foreground normal-case tracking-normal">({g.results.length})</span>
                </div>
              </button>
              {open && (
                <div className="p-2 space-y-2 border-t border-line bg-off/40">
                  {g.results.map((r) => (
                    <ResultCard key={`${g.key}-${r.id}`} r={r} onOpenCrmDrawer={onOpenCrmDrawer} onJumpToCrmCard={onJumpToCrmCard} isAdmin={isAdmin} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isAdmin && result && (
          <div className="rounded-lg border border-dashed border-line">
            <button onClick={() => setShowDebug((v) => !v)} className="w-full text-left px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-off flex items-center gap-1">
              {showDebug ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Search Debug
            </button>
            {showDebug && (
              <pre className="px-2.5 py-2 text-[10px] bg-off overflow-x-auto whitespace-pre-wrap">{JSON.stringify(result.debug, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
