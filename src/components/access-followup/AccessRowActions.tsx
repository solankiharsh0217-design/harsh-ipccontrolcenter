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

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${fullWidthPrimary ? "w-full" : ""}`}>
      {phone ? (
        <>
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1 text-[11.5px] px-2.5 py-1.5 rounded-md border border-border bg-background hover:bg-muted font-medium"
            title={`Call ${phone}`}
          >
            <Phone className="w-3 h-3" /> Call
          </a>
          <button
            onClick={copyPhone}
            className="inline-flex items-center gap-1 text-[11.5px] px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted"
            title="Copy phone number"
          >
            <Copy className="w-3 h-3" />
          </button>
        </>
      ) : (
        <span className="text-[11px] text-muted-foreground italic px-1">Phone not recorded</span>
      )}
      {cocDisabled ? (
        <span
          className="text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-slate-300 text-slate-500 bg-slate-50"
          title="No CRM lead linked"
        >
          CRM not linked
        </span>
      ) : (
        <Link
          to={crmHref}
          className="text-[11.5px] px-2.5 py-1.5 rounded-md border border-amber-400/70 bg-amber-50 text-amber-900 hover:bg-amber-100 font-medium"
          title="Open the linked CRM lead and its Code of Conduct panel"
        >
          Open CRM · {cocLabel}
        </Link>
      )}
      <button
        onClick={onUpdate}
        className={`text-[11.5px] px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 font-semibold shadow-sm ${fullWidthPrimary ? "flex-1 min-w-[140px] justify-center" : ""}`}
      >
        Update Follow-up
      </button>
    </div>
  );
}
