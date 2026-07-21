// Presentation-only helpers for Code of Conduct status. Reuses the
// existing `paid_pipeline_leads.code_of_conduct_status` value produced by the
// existing CodeOfConductPanel flow — does NOT infer signed from CRM stage.

export type CoCPresentation =
  | "not_linked"
  | "not_sent"
  | "sent"
  | "link_opened"
  | "signed"
  | "failed"
  | "resign_required";

export function resolveCocPresentation(
  status: string | null | undefined,
  hasCrmLink: boolean,
): CoCPresentation {
  if (!hasCrmLink) return "not_linked";
  const s = (status || "").toLowerCase().trim();
  if (!s || s === "not_sent" || s === "pending" || s === "—") return "not_sent";
  if (s === "signed" || s === "completed" || s === "complete") return "signed";
  if (s === "failed" || s === "bounced" || s === "error") return "failed";
  if (s === "resign_required" || s === "re_sign" || s === "re-sign" || s === "resignature") return "resign_required";
  if (s === "opened" || s === "viewed" || s === "link_opened") return "link_opened";
  if (s === "sent" || s === "delivered") return "sent";
  // Unknown -> treat as sent (safer than "not sent" if backend reports free-form)
  return "sent";
}

const CHIP_STYLES: Record<CoCPresentation, string> = {
  not_linked: "bg-slate-100 text-slate-600 border-slate-200",
  not_sent: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-50 text-blue-800 border-blue-200",
  link_opened: "bg-indigo-50 text-indigo-800 border-indigo-200",
  signed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  failed: "bg-red-50 text-red-800 border-red-200",
  resign_required: "bg-amber-50 text-amber-900 border-amber-200",
};

const CHIP_LABELS: Record<CoCPresentation, string> = {
  not_linked: "Not Linked",
  not_sent: "Not Sent",
  sent: "Sent",
  link_opened: "Link Opened",
  signed: "Signed",
  failed: "Failed",
  resign_required: "Re-sign Required",
};

export function CoCStatusChip({ status, hasCrmLink }: { status: string | null | undefined; hasCrmLink: boolean }) {
  const p = resolveCocPresentation(status, hasCrmLink);
  return (
    <span className={`inline-block text-[10.5px] px-2 py-0.5 rounded-full border ${CHIP_STYLES[p]}`}>
      {CHIP_LABELS[p]}
    </span>
  );
}

export function cocActionLabel(status: string | null | undefined, hasCrmLink: boolean): string {
  const p = resolveCocPresentation(status, hasCrmLink);
  switch (p) {
    case "not_linked": return "CRM not linked";
    case "signed": return "View CoC";
    case "failed": return "Retry CoC";
    case "resign_required": return "Request Re-sign";
    case "link_opened":
    case "sent": return "Open CoC";
    case "not_sent":
    default: return "Send CoC";
  }
}
