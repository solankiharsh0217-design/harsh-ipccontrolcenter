import { memo } from "react";
import { inr, fmtDate } from "@/lib/paidPipeline";
import { getPaymentStatus } from "@/lib/paidPaymentStatus";
import { pickTagColor, type Tag } from "@/lib/leadTags";
import ServicePackageChip from "@/components/ServicePackageChip";

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
  onUpdateFinance?: () => void;
  actionsSlot?: React.ReactNode;
  financeSlot?: React.ReactNode;
  stageSlot?: React.ReactNode;
  prioritySlot?: React.ReactNode;
};

function CompactPaidRow({
  lead, webinarBatchName, ownerName, tags = [],
  selected, onToggleSelect, onOpen, onAddPayment, onSetFollowUp, onUpdateFinance,
  actionsSlot, financeSlot, stageSlot,
}: CompactPaidRowProps) {
  const status = getPaymentStatus(lead);
  const today = new Date().toISOString().slice(0, 10);
  const fu = lead.next_follow_up_date || lead.follow_up_date;
  const fuOverdue = !!(fu && fu < today);
  const fuToday = fu === today;
  const fuColor = fuToday ? "#CA8A04" : fuOverdue ? "#DC2626" : (fu ? "#2563EB" : "#9CA3AF");
  const fuLabel = !fu ? "No follow-up" : fuToday ? `Due today` : fuOverdue ? `Overdue · ${fmtDate(fu)}` : `FU · ${fmtDate(fu)}`;
  const isFullyPaid = status.key === "fully_paid";

  const program = lead.product_name_snapshot || "—";
  const batchName = lead.paid_batch_name || webinarBatchName || lead.onboarding_batch_name || lead.source_webinar || null;
  const firstTag = tags[0];

  return (
    <div
      className={`group relative grid grid-cols-[18px_minmax(160px,1.2fr)_minmax(170px,1.3fr)_minmax(135px,0.9fr)_148px_minmax(140px,0.95fr)_minmax(135px,0.9fr)_160px] gap-2 items-center px-2.5 py-1.5 border border-line ${status.rowBorder} ${status.rowTint} hover:shadow-sm transition-all`}
      style={{ borderRadius: 6 }}
    >
      {/* select */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select buyer"
        className="justify-self-center"
      />

      {/* Buyer */}
      <div className="min-w-0 cursor-pointer leading-tight" onClick={onOpen}>
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[12.5px] font-medium truncate">{lead.name || "—"}</span>
          {lead.sent_to_crm && (
            <span className="text-[9px] px-1 py-0 rounded bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0] shrink-0">CRM</span>
          )}
          {isFullyPaid && (
            <span className="text-[10px] leading-none text-[#16A34A] shrink-0" title="Fully Paid">✓</span>
          )}
          {firstTag && (
            <span
              className="inline-flex items-center px-1 py-0 rounded-full text-[9px] font-medium border shrink-0 max-w-[70px] truncate"
              title={firstTag.name}
              style={{
                background: (firstTag.color || pickTagColor(firstTag.name)) + "1A",
                color: firstTag.color || pickTagColor(firstTag.name),
                borderColor: (firstTag.color || pickTagColor(firstTag.name)) + "55",
              }}
            >{firstTag.name}</span>
          )}
          {tags.length > 1 && <span className="text-[9px] text-muted-foreground shrink-0">+{tags.length - 1}</span>}
        </div>
        <div className="text-[10.5px] text-muted-foreground truncate">
          {lead.phone || "—"}{lead.email ? ` · ${lead.email}` : ""}
        </div>
      </div>

      {/* Program / Batch */}
      <div className="min-w-0 cursor-pointer leading-tight" onClick={onOpen}>
        <div className="text-[12px] font-medium truncate" title={program}>{program}</div>
        {batchName && (
          <div className="mt-0.5 min-w-0 flex">
            <span
              className="inline-block max-w-full truncate text-[10px] px-1.5 py-0 rounded border border-line bg-white text-muted-foreground"
              title={batchName}
            >
              {batchName}
            </span>
          </div>
        )}
        {(lead.service_package_snapshot?.name || lead.service_package?.name) && (
          <div className="mt-0.5"><ServicePackageChip snapshot={lead.service_package_snapshot} fallbackName={lead.service_package?.name} /></div>
        )}
      </div>

      {/* Money: Deal / Token / Coll / Bal — tight 2-col grid */}
      <div className="min-w-0 text-[11px] leading-tight grid grid-cols-2 gap-x-2 gap-y-0">
        <span className="text-muted-foreground text-[10px]">Deal</span>
        <span className="font-medium tabular-nums text-right">{inr(lead.deal_value_including_gst || 0)}</span>
        <span className="text-muted-foreground text-[10px]">Tok</span>
        <span className="tabular-nums text-right">{inr(lead.token_amount_collected || 0)}</span>
        <span className="text-muted-foreground text-[10px]">Coll</span>
        <span className="tabular-nums text-right">{inr(lead.total_collected || 0)}</span>
        <span className="text-muted-foreground text-[10px]">Bal</span>
        <span className={`tabular-nums text-right ${isFullyPaid ? "text-[#16A34A] font-medium" : "text-[#CA8A04] font-medium"}`}>
          {isFullyPaid ? "₹0" : inr(lead.balance_pending || 0)}
        </span>
      </div>

      {/* Stage column (dropdown lives here; no overflow-hidden ancestor) */}
      <div className="min-w-0 flex flex-col gap-1 leading-tight">
        <span className={`inline-flex items-center gap-1 self-start text-[10px] font-medium px-1.5 py-0 rounded-full border ${status.chipBg} ${status.chipText} ${status.chipBorder}`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
          {status.label}
        </span>
        {stageSlot}
      </div>

      {/* Finance */}
      <div className="min-w-0 flex flex-col gap-0.5 leading-tight">
        {financeSlot}
        {onUpdateFinance && (
          <button
            onClick={onUpdateFinance}
            className="self-start text-[10px] px-1.5 h-5 rounded border border-line bg-white hover:bg-off text-muted-foreground"
            title="Update Finance"
          >Finance</button>
        )}
      </div>

      {/* Follow-up */}
      <div className="min-w-0 flex flex-col gap-0.5 leading-tight">
        <div className="text-[11px] truncate" style={{ color: fuColor }} title={fu || ""}>
          {fuLabel}
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={onSetFollowUp}
            className="text-[10px] px-1.5 h-5 rounded border border-line bg-white hover:bg-off text-muted-foreground shrink-0"
            title="Set follow-up"
          >Follow-up</button>
          <span className="text-[10px] text-muted-foreground truncate" title={ownerName || ""}>
            {ownerName ? `· ${ownerName}` : ""}
          </span>
        </div>
      </div>

      {/* Right actions: Open · ₹ · ⋯ */}
      <div className="flex items-center gap-1 justify-end">
        <button
          onClick={onOpen}
          className="text-[10.5px] px-1.5 h-6 rounded border border-line hover:bg-white"
          title="Open lead"
        >Open</button>
        <button
          onClick={onAddPayment}
          className="text-[11px] px-1.5 h-6 rounded border border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7]"
          title="Record Payment"
        >₹</button>
        <div className="flex items-center">{actionsSlot}</div>
      </div>
    </div>
  );
}

export default memo(CompactPaidRow);
