import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { inr, fmtDate, downloadCsv } from "@/lib/paidPipeline";

type PaidBatch = {
  id: string;
  batch_name: string;
  business_unit: string | null;
  source_webinar_name: string | null;
  source_webinar_date: string | null;
  product_name_snapshot: string | null;
  description: string | null;
  batch_status: string;
  created_at: string;
};

type LeadAgg = {
  paid_batch_id: string;
  total: number;
  token: number;
  collected: number;
  deal: number;
  balance: number;
  toBeRealized: number;
  finalSales: number;
  dropped: number;
  financePending: number;
  hotPending: number;
  followUpsDue: number;
};

export default function PaidBatchesView({
  onOpenBatch, onBulkSend,
}: {
  onOpenBatch: (batchId: string, batchName: string) => void;
  onBulkSend: (leadIds: string[]) => void;
}) {
  const [batches, setBatches] = useState<PaidBatch[]>([]);
  const [aggMap, setAggMap] = useState<Record<string, LeadAgg>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = async () => {
    const { data: b } = await (supabase as any)
      .from("paid_pipeline_batches")
      .select("*")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });
    setBatches((b as any[]) || []);

    const { data: l } = await supabase
      .from("paid_pipeline_leads")
      .select("id, paid_batch_id, deal_value_including_gst, token_amount_collected, total_collected, balance_pending, revenue_to_be_realized, is_final_sale, is_dropped, finance_required, finance_status, lead_temperature, next_follow_up_date, follow_up_date")
      .eq("is_deleted", false);
    const td = new Date().toISOString().slice(0, 10);
    const map: Record<string, LeadAgg> = {};
    for (const row of (l as any[]) || []) {
      const k = (row as any).paid_batch_id as string | null;
      if (!k) continue;
      const a = map[k] || { paid_batch_id: k, total: 0, token: 0, collected: 0, deal: 0, balance: 0, toBeRealized: 0, finalSales: 0, dropped: 0, financePending: 0, hotPending: 0, followUpsDue: 0 };
      a.total++;
      a.deal += Number(row.deal_value_including_gst || 0);
      a.token += Number(row.token_amount_collected || 0);
      a.collected += Number(row.total_collected || 0);
      a.balance += Number(row.balance_pending || 0);
      a.toBeRealized += row.is_dropped ? 0 : Number(row.balance_pending || 0);
      if (row.is_final_sale) a.finalSales++;
      if (row.is_dropped) a.dropped++;
      if (row.finance_required && !["Disbursed","Rejected","Dropped"].includes(row.finance_status || "")) a.financePending++;
      if (["Hot","Urgent"].includes(row.lead_temperature || "") && Number(row.balance_pending || 0) > 0) a.hotPending++;
      const fu = row.next_follow_up_date || row.follow_up_date;
      if (fu && fu <= td) a.followUpsDue++;
      map[k] = a;
    }
    setAggMap(map);
  };
  useEffect(() => { load(); }, []);

  const archive = async (id: string) => {
    if (!confirm("Archive this paid batch? Leads remain intact.")) return;
    await (supabase as any).from("paid_pipeline_batches").update({ batch_status: "Archived" }).eq("id", id);
    toast.success("Archived");
    load();
  };

  const exportBatchCsv = async (b: PaidBatch) => {
    const { data: rows } = await supabase
      .from("paid_pipeline_leads")
      .select("name, email, phone, deal_value_including_gst, token_amount_collected, total_collected, balance_pending, pipeline_stage, lead_temperature, finance_partner, finance_status, next_follow_up_date")
      .eq("paid_batch_id", b.id as any)
      .eq("is_deleted", false);
    const csv: any[] = [["Name","Email","Phone","Deal","Token","Collected","Balance","Stage","Lead Priority","Finance Partner","Finance Status","Follow-Up"]];
    for (const r of (rows as any[]) || []) {
      csv.push([r.name, r.email, r.phone, r.deal_value_including_gst, r.token_amount_collected, r.total_collected, r.balance_pending, r.pipeline_stage, r.lead_temperature, r.finance_partner, r.finance_status, r.next_follow_up_date]);
    }
    downloadCsv(`paid-batch-${b.batch_name}-${Date.now()}.csv`, csv);
  };

  const sendBatchToCrm = async (b: PaidBatch) => {
    const { data: ids } = await supabase
      .from("paid_pipeline_leads")
      .select("id")
      .eq("paid_batch_id", b.id as any)
      .eq("is_deleted", false);
    const list = ((ids as any[]) || []).map(r => r.id);
    if (list.length === 0) { toast.error("No leads in this batch"); return; }
    onBulkSend(list);
  };

  const saveRename = async (id: string) => {
    if (!renameValue.trim()) return;
    await (supabase as any).from("paid_pipeline_batches").update({ batch_name: renameValue.trim() }).eq("id", id);
    await supabase.from("paid_pipeline_leads").update({ paid_batch_name: renameValue.trim() } as any).eq("paid_batch_id", id as any);
    setRenamingId(null);
    toast.success("Renamed");
    load();
  };

  if (batches.length === 0) {
    return (
      <div className="text-[13px] text-muted-foreground border border-dashed border-line rounded-lg p-10 text-center">
        No paid pipeline batches yet. Click <strong>+ New Paid Batch</strong> in the top action bar to create one.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {batches.map(b => {
        const a = aggMap[b.id] || { total: 0, token: 0, collected: 0, deal: 0, balance: 0, toBeRealized: 0, finalSales: 0, dropped: 0, financePending: 0, hotPending: 0 } as any;
        const isRenaming = renamingId === b.id;
        return (
          <div key={b.id} className="border border-line rounded-xl bg-white p-4 hover:shadow-md hover:border-gold transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {isRenaming ? (
                  <div className="flex gap-1">
                    <input className="qsi-input !h-8" value={renameValue} onChange={e => setRenameValue(e.target.value)} />
                    <button onClick={() => saveRename(b.id)} className="ipc-btn ipc-btn-black !h-8">Save</button>
                  </div>
                ) : (
                  <div className="font-serif text-[18px] truncate cursor-pointer" onClick={() => onOpenBatch(b.id, b.batch_name)}>{b.batch_name}</div>
                )}
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {b.product_name_snapshot || "—"} {b.business_unit ? `· ${b.business_unit}` : ""}
                </div>
                <div className="text-[10.5px] text-muted-foreground mt-0.5">
                  Source: {b.source_webinar_name || "—"} {b.source_webinar_date ? `· ${fmtDate(b.source_webinar_date)}` : ""}
                </div>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-line">{b.batch_status}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-[11.5px]">
              <Stat label="Leads" value={String(a.total)} />
              <Stat label="Deal value" value={inr(a.deal)} />
              <Stat label="Token" value={inr(a.token)} />
              <Stat label="Collected" value={inr(a.collected)} />
              <Stat label="Balance" value={inr(a.balance)} accent="gold" />
              <Stat label="To be realized" value={inr(a.toBeRealized)} />
              <Stat label="Final sales" value={String(a.finalSales)} />
              <Stat label="Dropped" value={String(a.dropped)} />
              <Stat label="Finance pending" value={String(a.financePending)} />
              <Stat label="Hot/Urgent pending" value={String(a.hotPending)} accent="red" />
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-line">
              <button onClick={() => onOpenBatch(b.id, b.batch_name)} className="ipc-btn ipc-btn-black !h-8">Open</button>
              <button onClick={() => { setRenamingId(b.id); setRenameValue(b.batch_name); }} className="ipc-btn ipc-btn-ghost !h-8">Rename</button>
              <button onClick={() => exportBatchCsv(b)} className="ipc-btn ipc-btn-ghost !h-8">Export</button>
              <button onClick={() => sendBatchToCrm(b)} className="ipc-btn ipc-btn-ghost !h-8">Send to CRM</button>
              {b.batch_status !== "Archived" && (
                <button onClick={() => archive(b.id)} className="ipc-btn ipc-btn-ghost !h-8 text-[#DC2626]">Archive</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "gold"|"red" }) {
  const bg = accent === "gold" ? "bg-gold-pale" : accent === "red" ? "bg-[#FEE2E2]" : "bg-off";
  return (
    <div className={"rounded-md px-2 py-1.5 " + bg}>
      <div className="text-[9.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
