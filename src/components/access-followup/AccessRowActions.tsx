import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Phone, Copy } from "lucide-react";
import { cocActionLabel } from "@/lib/cocStatus";

interface Props {
  phone: string | null;
  crmLeadId: string | null;
  cocStatus: string | null;
  onUpdate: () => void;
  fullWidthPrimary?: boolean; // mobile
}

export default function AccessRowActions({ phone, crmLeadId, cocStatus, onUpdate, fullWidthPrimary }: Props) {
  const cocLabel = cocActionLabel(cocStatus, !!crmLeadId);
  const cocDisabled = !crmLeadId;
  const crmHref = crmLeadId ? `/crm?lead=${crmLeadId}&focus=code-of-conduct` : "#";

  const copyPhone = () => {
    if (!phone) { toast.error("No phone number"); return; }
    navigator.clipboard?.writeText(phone);
    toast.success(`Copied ${phone}`);
  };

  // Mobile: allow wrapping / full-width primary. Desktop (default): single-line compact toolbar.
  const wrapCls = fullWidthPrimary
    ? "flex flex-wrap items-center gap-1.5 w-full"
    : "flex flex-nowrap items-center gap-1 justify-end";

  const btnBase = "inline-flex items-center justify-center h-8 rounded-md border border-border bg-background hover:bg-muted whitespace-nowrap";

  return (
    <div className={wrapCls}>
      {phone ? (
        <>
          <a
            href={`tel:${phone}`}
            className={`${btnBase} px-2 text-[11.5px] font-medium`}
            title={`Call ${phone}`}
            aria-label="Call member"
          >
            <Phone className="w-3.5 h-3.5" />
            {fullWidthPrimary && <span className="ml-1">Call</span>}
          </a>
          <button
            onClick={copyPhone}
            className={`${btnBase} px-2`}
            title="Copy phone number"
            aria-label="Copy phone"
          >
            <Copy className="w-3.5 h-3.5" />
            {fullWidthPrimary && <span className="ml-1 text-[11.5px]">Copy</span>}
          </button>
        </>
      ) : (
        <span className="text-[11px] text-muted-foreground italic px-1 whitespace-nowrap">No phone</span>
      )}
      {cocDisabled ? (
        <span
          className="inline-flex items-center h-8 px-2 rounded-md border border-dashed border-slate-300 text-slate-500 bg-slate-50 text-[11.5px] whitespace-nowrap"
          title="No CRM lead linked"
        >
          Not linked
        </span>
      ) : (
        <Link
          to={crmHref}
          className="inline-flex items-center h-8 px-2.5 rounded-md border border-amber-400/70 bg-amber-50 text-amber-900 hover:bg-amber-100 font-medium text-[11.5px] whitespace-nowrap"
          title="Open CRM drawer and Code of Conduct panel"
        >
          {cocLabel}
        </Link>
      )}
      <button
        onClick={onUpdate}
        title="Update Access Follow-up"
        className={`inline-flex items-center justify-center h-8 px-3 rounded-md bg-foreground text-background hover:opacity-90 font-semibold shadow-sm text-[11.5px] whitespace-nowrap ${fullWidthPrimary ? "flex-1 min-w-[140px]" : ""}`}
      >
        {fullWidthPrimary ? "Update Follow-up" : "Update"}
      </button>
    </div>
  );
}
