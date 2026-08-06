import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Clock, User, ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { logActivity } from "@/lib/auditLog";
import { inr } from "@/lib/format";

interface Props {
  leadId: string;
  onClose: () => void;
}

type ConvRow = {
  id: string;
  conversion_type: string;
  paid_pipeline_lead_id: string | null;
  destination_crm_lead_id: string | null;
  program_name: string | null;
  deal_value: number | null;
  token_amount: number | null;
  assigned_owner_id: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  metadata_json: any;
};



export default function ConversionHistoryDrawer({ leadId, onClose }: Props) {
  const [rows, setRows] = useState<ConvRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("crm_lead_conversions")
        .select("*")
        .eq("source_lead_id", leadId)
        .order("created_at", { ascending: false });
      const list = (data || []) as ConvRow[];
      setRows(list);
      const ids = Array.from(new Set(list.flatMap((r) => [r.created_by, r.assigned_owner_id]).filter(Boolean))) as string[];
      if (ids.length > 0) {
        const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const map: Record<string, string> = {};
        (p || []).forEach((x: any) => { map[x.id] = x.full_name; });
        setNames(map);
      }
      setLoading(false);
      logActivity({ module_key: "crm", action_type: "crm_conversion_history_viewed", entity_type: "lead", entity_id: leadId, summary: "Viewed conversion history." }).catch(() => {});
    })();
  }, [leadId]);

  return (
    <div className="fixed inset-0 z-[110] bg-black/40" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-[480px] bg-white shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <div>
            <div className="font-serif text-[16px]">Conversion History</div>
            <div className="text-[11px] text-muted-foreground">All conversion events for this lead</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded hover:bg-off flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!loading && rows.length === 0 && <div className="text-sm text-muted-foreground">No conversion events recorded.</div>}
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-line p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${r.conversion_type === "linked_existing_paid" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {r.conversion_type === "linked_existing_paid" ? "Linked existing" : "Created new"}
                </span>
                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] ${r.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{r.status}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Clock className="w-3 h-3" /> {new Date(r.created_at).toLocaleString()}
                {r.created_by && (<><User className="w-3 h-3 ml-2" /> {names[r.created_by] || r.created_by.slice(0, 8)}</>)}
              </div>
              {(r.program_name || r.deal_value) && (
                <div className="text-[12px]">
                  {r.program_name && <span>{r.program_name}</span>}
                  {r.deal_value ? <span className="ml-2 font-medium">{inr(r.deal_value)}</span> : null}
                  {r.token_amount ? <span className="ml-1 text-muted-foreground">· token {inr(r.token_amount)}</span> : null}
                </div>
              )}
              {r.assigned_owner_id && (
                <div className="text-[11.5px] text-muted-foreground">Owner: {names[r.assigned_owner_id] || "—"}</div>
              )}
              {r.paid_pipeline_lead_id && (
                <Link to={`/paid-pipeline?lead=${r.paid_pipeline_lead_id}`} className="inline-flex items-center gap-1 text-[11.5px] text-blue-700 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Open paid buyer <ArrowRight className="w-3 h-3" />
                </Link>
              )}
              {r.metadata_json && Object.keys(r.metadata_json).length > 0 && (
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer">Details</summary>
                  <pre className="mt-1 text-[10px] bg-off rounded p-2 overflow-x-auto">{JSON.stringify(r.metadata_json, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
