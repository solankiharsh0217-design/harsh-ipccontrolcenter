import { useState } from "react";
import { ChevronDown, ChevronRight, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  paidPipelineId: string;
  visibleCount: number;
  activeCardsCount: number;
  hiddenByFilters: number;
  hiddenByArchive: number;
}

interface Snapshot {
  ppActive: number;
  ppLinked: number;
  ppUnlinked: number;
  crmActive: number;
  crmArchived: number;
  crmDeleted: number;
  crmConverted: number;
  extraOnboarding: number;
  loadedAt: string;
}

export default function CountHealthPanel(props: Props) {
  const { paidPipelineId, visibleCount, activeCardsCount, hiddenByFilters, hiddenByArchive } = props;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const ppQ = (filter: (q: any) => any) => filter(
        (supabase as any).from("paid_pipeline_leads").select("id", { count: "exact", head: true })
      );
      const crmQ = (filter: (q: any) => any) => filter(
        (supabase as any).from("leads").select("id", { count: "exact", head: true })
      );
      const [a, b, c, d, e, f, g] = await Promise.all([
        ppQ((q) => q.is("deleted_at", null).is("archived_at", null).neq("is_deleted", true)),
        ppQ((q) => q.not("crm_lead_id", "is", null)),
        ppQ((q) => q.is("crm_lead_id", null)),
        crmQ((q) => q.eq("pipeline_id", paidPipelineId).is("archived_at", null).is("deleted_at", null)),
        crmQ((q) => q.eq("pipeline_id", paidPipelineId).not("archived_at", "is", null)),
        crmQ((q) => q.eq("pipeline_id", paidPipelineId).not("deleted_at", "is", null)),
        crmQ((q) => q.eq("pipeline_id", paidPipelineId).eq("conversion_status", "converted")),
      ]);
      const ppActive = a.count || 0;
      const crmActive = d.count || 0;
      setSnap({
        ppActive,
        ppLinked: b.count || 0,
        ppUnlinked: c.count || 0,
        crmActive,
        crmArchived: e.count || 0,
        crmDeleted: f.count || 0,
        crmConverted: g.count || 0,
        extraOnboarding: Math.max(0, crmActive - ppActive),
        loadedAt: new Date().toLocaleTimeString(),
      });
    } catch (ex: any) {
      setErr(ex?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-2 rounded-md border border-dashed border-muted bg-muted/20 text-[11px]">
      <button
        type="button"
        onClick={() => { const next = !open; setOpen(next); if (next && !snap && !loading) load(); }}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Activity className="w-3 h-3" />
        <span className="font-medium">Count Health</span>
        <span className="ml-1 opacity-70">(admin)</span>
        {!open && <span className="ml-auto opacity-70">visible {visibleCount} / active {activeCardsCount}</span>}
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 space-y-1">
          <div className="flex justify-between"><span>Currently visible cards</span><span className="font-medium text-foreground">{visibleCount}</span></div>
          <div className="flex justify-between"><span>Paid Onboarding CRM active cards (loaded)</span><span className="font-medium text-foreground">{activeCardsCount}</span></div>
          <div className="flex justify-between"><span>Hidden by active filters</span><span>{hiddenByFilters}</span></div>
          <div className="flex justify-between"><span>Hidden by archive/delete</span><span>{hiddenByArchive}</span></div>
          <div className="my-1 border-t border-muted" />
          {loading && <div className="text-muted-foreground">Loading DB truth…</div>}
          {err && <div className="text-red-600">{err}</div>}
          {snap && (
            <>
              <div className="flex justify-between"><span>Paid Pipeline active buyers (DB)</span><span className="font-medium text-foreground">{snap.ppActive}</span></div>
              <div className="flex justify-between"><span>Paid Pipeline linked to CRM</span><span>{snap.ppLinked}</span></div>
              <div className="flex justify-between"><span>Paid Pipeline unlinked buyers</span><span className={snap.ppUnlinked > 0 ? "text-amber-700 font-medium" : ""}>{snap.ppUnlinked}</span></div>
              <div className="flex justify-between"><span>Paid Onboarding active leads (DB)</span><span className="font-medium text-foreground">{snap.crmActive}</span></div>
              <div className="flex justify-between"><span>Archived / removed leads</span><span>{snap.crmArchived + snap.crmDeleted}</span></div>
              <div className="flex justify-between"><span>Total historical leads</span><span className="font-medium text-foreground">{snap.crmActive + snap.crmArchived + snap.crmDeleted}</span></div>
              <div className="flex justify-between opacity-70"><span>↳ archived</span><span>{snap.crmArchived}</span></div>
              <div className="flex justify-between opacity-70"><span>↳ soft-deleted</span><span>{snap.crmDeleted}</span></div>
              <div className="flex justify-between"><span>Of which conversion_status = converted</span><span>{snap.crmConverted}</span></div>
              <div className="flex justify-between"><span>Extra onboarding cards vs paid buyers</span><span className={snap.extraOnboarding > 0 ? "text-amber-700" : ""}>{snap.extraOnboarding}</span></div>
              {snap.crmActive !== activeCardsCount && (
                <div className="mt-1 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-amber-800">
                  Loaded {activeCardsCount} of {snap.crmActive} CRM cards — refresh to reload.
                </div>
              )}
              <div className="text-right opacity-60">snapshot at {snap.loadedAt}</div>
            </>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={load} className="text-[10px] underline underline-offset-2 hover:text-foreground" disabled={loading}>Refresh</button>
          </div>
        </div>
      )}
    </div>
  );
}
