import { Package } from "lucide-react";

type Snapshot = { name?: string | null; code?: string | null } | null | undefined;

export function getServicePackageName(
  snapshot: Snapshot,
  fallback?: string | null,
): string | null {
  const n = snapshot?.name?.trim();
  if (n) return n;
  const f = (fallback || "").trim();
  return f || null;
}

export default function ServicePackageChip({
  snapshot,
  fallbackName,
  compact = true,
  className = "",
}: {
  snapshot?: Snapshot;
  fallbackName?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const name = getServicePackageName(snapshot, fallbackName);
  if (!name) return null;
  return (
    <span
      title={`Service Package: ${name}`}
      className={
        "inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 text-[10px] font-medium text-foreground px-1.5 py-0.5 max-w-full truncate " +
        (compact ? "" : "text-[11px] px-2 py-1 ") +
        className
      }
    >
      <Package className="w-2.5 h-2.5 flex-shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
