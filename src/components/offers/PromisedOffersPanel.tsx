import { useEffect, useState } from "react";
import { listOffersForLead, type PaidLeadOfferItem, formatOffer } from "@/lib/offers";

type Props = {
  paidPipelineLeadId?: string | null;
  crmLeadId?: string | null;
  operationsLeadId?: string | null;
  title?: string;
};

export default function PromisedOffersPanel({ paidPipelineLeadId, crmLeadId, operationsLeadId, title }: Props) {
  const [items, setItems] = useState<PaidLeadOfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listOffersForLead({ paidPipelineLeadId, crmLeadId, operationsLeadId })
      .then((rs) => alive && setItems(rs))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [paidPipelineLeadId, crmLeadId, operationsLeadId]);

  const label = title || "Services / Offers Promised";
  if (loading) return null;
  if (items.length === 0) return null;

  const visible = expanded || items.length <= 3 ? items : items.slice(0, 3);

  return (
    <div className="border border-line rounded-md bg-white">
      <div className="px-3 py-2 border-b border-line flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground">{items.length}</div>
      </div>
      <div className="divide-y divide-line">
        {visible.map((o) => (
          <div key={o.id} className="px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[12.5px] font-medium text-black truncate">{o.title}</div>
              <div className="text-[11px] text-muted-foreground whitespace-nowrap">{formatOffer(o)}</div>
            </div>
            {o.notes && <div className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap">{o.notes}</div>}
            {o.source_context && (
              <div className="text-[10px] text-muted-foreground mt-1">
                {o.source_context} · {new Date(o.created_at).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}
      </div>
      {items.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-[11px] py-1.5 text-muted-foreground hover:bg-off border-t border-line"
        >
          {expanded ? "Show less" : `Show all (${items.length})`}
        </button>
      )}
    </div>
  );
}
