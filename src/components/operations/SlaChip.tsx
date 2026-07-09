import { SLA_CLASSES, SLA_LABELS, type SlaStatus } from "@/lib/operationsSla";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function SlaChip({
  status,
  days,
  compact = false,
  className = "",
}: {
  status: SlaStatus;
  days: number;
  compact?: boolean;
  className?: string;
}) {
  const Icon = status === "overdue" ? AlertTriangle : status === "watch" ? Clock : CheckCircle2;
  const label = SLA_LABELS[status];
  const dayText = `${days}d`;
  return (
    <span
      title={`${label} · in this stage for ${days} day${days === 1 ? "" : "s"}`}
      className={`inline-flex items-center gap-1 rounded border ${SLA_CLASSES[status]} ${compact ? "text-[9px] px-1 py-0.5" : "text-[10px] px-1.5 py-0.5"} ${className}`}
    >
      <Icon className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
      <span className="font-medium">{label}</span>
      <span className="opacity-70">· {dayText}</span>
    </span>
  );
}
