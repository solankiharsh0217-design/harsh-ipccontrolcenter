import { memo } from "react";
import { inr, fmtDate } from "@/lib/paidPipeline";
import { getPaymentStatus } from "@/lib/paidPaymentStatus";
import { pickTagColor, type Tag } from "@/lib/leadTags";

type Lead = any;

export type CompactPaidRowProps = {
  lead: Lead;
  webinarBatchName?: string | null;
  ownerName?: string | null;
  tags?: Tag[];
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onAddPayment: () => void;
  onSetFollowUp: () => void;
  actionsSlot?: React.ReactNode;
  financeSlot?: React.ReactNode;
  stageSlot?: React.ReactNode;
  prioritySlot?: React.ReactNode;
};

function CompactPaidRow({
  lead, webinarBatchName, ownerName, tags = [],
  selected, onToggleSelect, onOpen, onAddPayment, onSetFollowUp,
  actionsSlot, financeSlot, stageSlot, prioritySlot,
}: CompactPaidRowProps) {
  const status = getPaymentStatus(lead);
  const today = new Date().toISOString().slice(0, 10);
  const fu = lead.next_follow_up_date || lead.follow_up_date;
  const fuColor = fu === today ? "#CA8A04" : (fu && fu < today) ? "#DC2626" : (fu && fu > today) ? "#2563EB" : "#9CA3AF";
  const isFullyPaid = status.key === "fully_paid";

  const program = lead.product_name_snapshot || "—";
  const batchName = lead.paid_batch_name || webinarBatchName || lead.onboarding_batch_name || lead.source_webinar || null;

  return (
    <div
      className={`group grid grid-cols-[20px_minmax(180px,1.4fr)_minmax(160px,1.4fr)_minmax(190px,1.3fr)_minmax(140px,1fr)_140px_44px] gap-3 items-center px-3 py-2 border border-line ${status.rowBorder} ${status.rowTint} hover:shadow-sm transition-all`}
      style={{ borderRadius: 8 }}
    >
      {/* select */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select buyer"
      />

      {/* Buyer */}
      <div className="min-w-0 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium truncate">{lead.name || "—"}</span>
          {lead.sent_to_crm && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0] shrink-0">CRM</span>
          )}
          {isFullyPaid && (
            <span className="text-[10px] leading-none text-[#16A34A] shrink-0" title="Fully Paid">✓</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {lead.phone || "—"}{lead.email ? ` · ${lead.email}` : ""}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {tags.slice(0, 2).map((tg) => {
              const tc = tg.color || pickTagColor(tg.name);
              return (
                <span key={tg.id} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border" style={{ background: tc + "1A", color: tc, borderColor: tc + "55" }}>{tg.name}</span>
              );
            })}
            {tags.length > 2 && <span className="text-[9px] text-muted-foreground">+{tags.length - 2}</span>}
          </div>
        )}
      </div>

      {/* Program / Batch */}
      <div className="min-w-0 cursor-pointer" onClick={onOpen}>
        <div className="text-[12.5px] font-medium truncate" title={program}>{program}</div>
        {batchName && (
          <div className="mt-0.5">
            <span
              className="inline-block max-w-full truncate align-bottom text-[10.5px] px-1.5 py-0.5 rounded border border-line bg-white text-muted-foreground"
              title={batchName}
              style={{ maxWidth: "100%" }}
            >
              {batchName}
            </span>
          </div>
        )}
      </div>

      {/* Money */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 text-[12px]">
          <span className="text-muted-foreground text-[10.5px] w-12">Deal</span>
          <span className="font-medium">{inr(lead.deal_value_including_gst || 0)}</span>
        </div>
        <div className="flex items-baseline gap-2 text-[12px]">
          <span className="text-muted-foreground text-[10.5px] w-12">Collected</span>
          <span>{inr(lead.total_collected || 0)}</span>
        </div>
        <div className="flex items-baseline gap-2 text-[12px]">
          <span className="text-muted-foreground text-[10.5px] w-12">Balance</span>
          <span className={isFullyPaid ? "text-[#16A34A] font-medium" : "text-[#CA8A04] font-medium"}>
            {isFullyPaid ? "₹0" : inr(lead.balance_pending || 0)}
          </span>
        </div>
      </div>

      {/* Status: payment chip + stage + finance */}
      <div className="min-w-0 flex flex-col gap-1">
        <span className={`inline-flex items-center gap-1 self-start text-[10.5px] font-medium px-1.5 py-0.5 rounded-full border ${status.chipBg} ${status.chipText} ${status.chipBorder}`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
          {status.label}
        </span>
        {stageSlot && <div className="text-[11px]">{stageSlot}</div>}
        {financeSlot && <div className="text-[11px]">{financeSlot}</div>}
      </div>

      {/* Follow-up + priority + owner */}
      <div className="min-w-0 text-[11.5px]">
        <div style={{ color: fuColor }} className="truncate">
          {fu ? `FU · ${fmtDate(fu)}` : "No follow-up"}
        </div>
        {prioritySlot && <div className="mt-0.5">{prioritySlot}</div>}
        <div className="text-muted-foreground truncate mt-0.5" title={ownerName || ""}>
          {ownerName || "— Unassigned —"}
        </div>
      </div>

      {/* Quick visible actions */}
      <div className="flex items-center gap-1 justify-end">
        <button
          onClick={onOpen}
          className="text-[11px] px-2 h-7 rounded border border-line hover:bg-white"
          title="Open lead"
        >Open</button>
        <button
          onClick={onAddPayment}
          className="text-[11px] px-2 h-7 rounded border border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7]"
          title="Record Payment"
        >₹</button>
      </div>

      {/* More actions menu (passed in to reuse existing component) */}
      <div className="flex items-center justify-end">{actionsSlot}</div>
    </div>
  );
}

export default memo(CompactPaidRow);
