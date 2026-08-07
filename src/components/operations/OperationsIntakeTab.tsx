import { useEffect, useMemo, useState } from "react";
import { Plus, Upload, RefreshCw } from "lucide-react";
import { LoadingState } from "@/components/ui-bits";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import OperationsImportModal from "@/components/operations/OperationsImportModal";
import { listProcessTemplates, getChecklistItems, getChecklistState, computeReadiness, type ProcessTemplate } from "@/lib/operationsTemplates";

interface IntakeLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  brand_name: string | null;
  product_name: string | null;
  intake_source: string | null;
  process_template_id: string | null;
  assigned_media_buyer_name: string | null;
  created_at: string;
}

export default function OperationsIntakeTab({
  onOpenLead,
}: { onOpenLead: (id: string) => void }) {
  const [leads, setLeads] = useState<IntakeLead[]>([]);
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [readinessByLead, setReadinessByLead] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const ldRes = await (supabase.from("operations_leads" as any) as any)
        .select("id, name, email, phone, brand_name, product_name, intake_source, process_template_id, assigned_media_buyer_name, created_at")
        .eq("intake_status", "intake")
        .order("created_at", { ascending: false });
      const tplRes = await listProcessTemplates(true);
      const rows = (ldRes.data ?? []) as any as IntakeLead[];
      setLeads(rows);
      setTemplates(tplRes);

      // Compute readiness per row
      const map = new Map<string, number>();
      await Promise.all(rows.map(async (l) => {
        if (!l.process_template_id) { map.set(l.id, 0); return; }
        try {
          const [items, st] = await Promise.all([getChecklistItems(l.process_template_id), getChecklistState(l.id)]);
          map.set(l.id, computeReadiness(items, st).pct);
        } catch { map.set(l.id, 0); }
      }));
      setReadinessByLead(map);
    } catch (e: any) {
      toast.error(e.message || "Failed to load intake");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const tplName = useMemo(() => new Map(templates.map((t) => [t.id, t.name])), [templates]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">{leads.length}</span> client{leads.length === 1 ? "" : "s"} waiting to start
        </div>
        <div className="flex gap-1.5">
          <button onClick={load} className="ipc-btn ipc-btn-ghost !h-9 !text-xs"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={() => setImportOpen(true)} className="ipc-btn ipc-btn-ghost !h-9 !text-xs"><Upload className="w-3.5 h-3.5" /> Import</button>
          <button onClick={() => setImportOpen(true)} className="ipc-btn ipc-btn-black !h-9 !text-xs"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
      </div>

      {loading ? (
        <LoadingState block />
      ) : leads.length === 0 ? (
        <div className="border border-dashed border-line rounded-xl bg-off/40 py-12 px-6 text-center">
          <div className="font-serif text-lg text-black mb-1">Intake is empty</div>
          <div className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
            Import a CSV, paste a Google Sheet link, or add a client manually. They'll wait here until you complete their readiness checklist and start the process.
          </div>
          <button onClick={() => setImportOpen(true)} className="ipc-btn ipc-btn-black !h-9 !text-xs"><Upload className="w-3.5 h-3.5" /> Import clients</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {leads.map((l) => {
            const pct = readinessByLead.get(l.id) ?? 0;
            return (
              <div key={l.id} className="bg-white border border-line rounded-md p-3 hover:border-[#bbb] transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-serif text-sm text-black truncate">{l.name}</div>
                  {l.intake_source && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-off text-muted-foreground uppercase">{l.intake_source.replace("_", " ")}</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground truncate mt-0.5">{l.email || l.phone || "—"}</div>
                {(l.brand_name || l.product_name) && (
                  <div className="text-[10px] text-foreground/70 truncate mt-0.5">{[l.brand_name, l.product_name].filter(Boolean).join(" · ")}</div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1 truncate">
                  Template: {l.process_template_id ? (tplName.get(l.process_template_id) ?? "—") : <span className="italic">not assigned</span>}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-off rounded-full overflow-hidden">
                    <div className={`h-full ${pct === 100 ? "bg-[#16A34A]" : "bg-[#F59E0B]"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">{pct}%</div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-[10px] text-muted-foreground truncate">{l.assigned_media_buyer_name || "Unassigned"}</div>
                  <button onClick={() => onOpenLead(l.id)} className="text-[11px] underline text-black">Open</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {importOpen && (
        <OperationsImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />
      )}
    </div>
  );
}
