import { memo } from "react";
import { inr, fmtDate } from "@/lib/paidPipeline";
import { getPaymentStatus } from "@/lib/paidPaymentStatus";
import { pickTagColor, type Tag } from "@/lib/leadTags";
import ServicePackageChip from "@/components/ServicePackageChip";
import { CoCStatusChip } from "@/lib/cocStatus";

type Lead = any;

export type CompactPaidRowProps = {
  lead: Lead;
  webinarBatchName?: string | null;
  ownerName?: string | null;
  tags?: Tag[];
  selected: boolean;
  cocStatus?: string | null;
  cocHasCrmLink?: boolean;
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
  selected, cocStatus, cocHasCrmLink,
  onToggleSelect, onOpen, onAddPayment, onSetFollowUp, onUpdateFinance,
  actionsSlot, financeSlot, stageSlot,
}: CompactPaidRowProps) {
  const status = getPaymentStatus(lead);
  const today = new Date().toISOString().slice(0, 10);
  const fu = lead.next_follow_up_date || lead.follow_up_date;
  const fuOverdue = !!(fu && fu < today);
  const fuToday = fu === today;
  const fuColor = fuToday ? "#CA8A04" : fuOverdue ? "#DC2626" : (fu ? "#2563EB" : "#888888");
  const fuLabel = !fu ? "No follow-up" : fuToday ? "Due today" : fuOverdue ? `Overdue · ${fmtDate(fu)}` : `FU · ${fmtDate(fu)}`;

  const collected = Number(lead.total_collected || 0);
  const balance = Number(lead.balance_pending || 0);
  const isFullyPaid = status.key === "fully_paid" || balance <= 0;
  // green when zero, amber when partial, red when nothing collected
  const balanceColor = balance <= 0 ? "#16A34A" : collected > 0 ? "#CA8A04" : "#DC2626";

  const batchName = lead.paid_batch_name || webinarBatchName || lead.onboarding_batch_name || lead.source_webinar || null;
  const firstTag = tags[0];

  return (
    <div
      className="group relative grid grid-cols-[18px_minmax(0,35fr)_minmax(0,40fr)_minmax(0,25fr)] gap-4 items-start px-4 py-3.5 border border-line bg-white hover:bg-[#F7F6F3] transition-colors"
      style={{ borderRadius: 12 }}
    >
      {/* select */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select buyer"
        className="justify-self-center mt-1"
      />

      {/* Zone 1 — identity */}
      <div className="min-w-0 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-serif text-[15px] text-black truncate">{lead.name || "—"}</span>
          {lead.sent_to_crm && (
            <span className="text-[9px] px-1 py-0 rounded bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0] shrink-0">CRM</span>
          )}
          {firstTag && (
            <span
              className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-medium border shrink-0 max-w-[80px] truncate"
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
        <div className="text-[10.5px] text-muted-foreground truncate mt-0.5">{lead.phone || "—"}</div>
        <div className="text-[10.5px] text-muted-foreground truncate">{lead.email || ""}</div>
        {batchName && (
          <div className="mt-1.5 min-w-0 flex">
            <span
              className="inline-block max-w-full truncate text-[10px] px-2 py-0.5 rounded-full border border-line bg-off text-muted-foreground"
              title={batchName}
            >{batchName}</span>
          </div>
        )}
        {(lead.service_package_snapshot?.name || lead.service_package?.name) && (
          <div className="mt-1"><ServicePackageChip snapshot={lead.service_package_snapshot} fallbackName={lead.service_package?.name} /></div>
        )}
      </div>

      {/* Zone 2 — money at a glance */}
      <div className="min-w-0 text-right">
        <div className="text-[11px] text-muted-foreground">Deal {inr(lead.deal_value_including_gst || 0)}</div>
        <div className="mt-0.5 flex items-baseline justify-end gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Collected</span>
          <span className="font-serif text-[15px] tabular-nums text-black">{inr(collected)}</span>
        </div>
        <div className="flex items-baseline justify-end gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Balance</span>
          <span className="font-serif text-[15px] tabular-nums" style={{ color: balanceColor }}>
            {isFullyPaid ? "₹0" : inr(balance)}
          </span>
        </div>
        <div className="mt-1.5 flex justify-end">
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${status.chipBg} ${status.chipText} ${status.chipBorder}`}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
            {status.label}
          </span>
        </div>
      </div>

      {/* Zone 3 — stage, CoC, follow-up, actions */}
      <div className="min-w-0 flex flex-col gap-1.5">
        {stageSlot}
        <div><CoCStatusChip status={cocStatus} hasCrmLink={cocHasCrmLink !== false} /></div>
        {financeSlot}
        <div className="text-[10.5px] truncate" style={{ color: fuColor }} title={fu || ""}>
          {fuLabel}{ownerName ? ` · ${ownerName}` : ""}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={onOpen}
            className="text-[11px] px-2.5 h-7 rounded-lg border border-line bg-white hover:bg-off"
            style={{ borderRadius: 8 }}
            title="Open lead"
          >Open</button>
          <button
            onClick={onAddPayment}
            className="text-[11px] px-2.5 h-7 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7]"
            style={{ borderRadius: 8 }}
            title="Record Payment"
          >₹ Payment</button>
          <button
            onClick={onSetFollowUp}
            className="text-[11px] px-2.5 h-7 rounded-lg border border-line bg-white hover:bg-off text-muted-foreground"
            style={{ borderRadius: 8 }}
            title="Set follow-up"
          >Follow-up</button>
          {onUpdateFinance && (
            <button
              onClick={onUpdateFinance}
              className="text-[11px] px-2.5 h-7 rounded-lg border border-line bg-white hover:bg-off text-muted-foreground"
              style={{ borderRadius: 8 }}
              title="Update Finance"
            >Finance</button>
          )}
          <div className="flex items-center">{actionsSlot}</div>
        </div>
      </div>
    </div>
  );
}

export default memo(CompactPaidRow);
