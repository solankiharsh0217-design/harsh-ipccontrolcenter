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
  if (!s || s === "not_sent" || s === "pending" || s === "draft" || s === "ready" || s === "ready_to_send" || s === "—") return "not_sent";
  if (s === "signed" || s === "completed" || s === "complete" || s === "re_signed" || s === "resigned") return "signed";
  if (s === "failed" || s === "bounced" || s === "error") return "failed";
  if (s === "resign_required" || s === "re_sign" || s === "re-sign" || s === "resignature" || s === "resign_pending") return "resign_required";
  if (s === "opened" || s === "viewed" || s === "link_opened") return "link_opened";
  if (s === "sent" || s === "delivered") return "sent";
  // Unknown / free-form: treat as sent (any non-empty custom status implies the
  // initial email pipeline has moved beyond "not sent").
  return "sent";
}

/**
 * Access Follow-up eligibility predicate.
 *
 * True only when the initial Code of Conduct email has been successfully sent
 * at least once. Members whose CoC is still awaiting the FIRST send (or where
 * the initial delivery failed with no successful send on record) are NOT the
 * Access Follow-up team's responsibility.
 */
export function hasSuccessfulCocSend(
  status: string | null | undefined,
  hasCrmLink: boolean,
): boolean {
  const p = resolveCocPresentation(status, hasCrmLink);
  // "failed" is treated as pre-initial-send failure here — the paid_pipeline_leads
  // status column reflects the most recent attempt, so we cannot distinguish
  // "failed initial" from "failed resend". Consistent with the initiator owning
  // pre-send failures, we exclude failed. Successful sends move status to
  // sent/opened/signed/resign_required, all of which are eligible.
  return p === "sent" || p === "link_opened" || p === "signed" || p === "resign_required";
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
  not_sent: "Awaiting Initial Send",
  sent: "Sent · Awaiting signature",
  link_opened: "Link Opened · Awaiting signature",
  signed: "Signed",
  failed: "Delivery issue",
  resign_required: "Re-sign Required",
};

export function CoCStatusChip({ status, hasCrmLink }: { status: string | null | undefined; hasCrmLink: boolean }) {
  const p = resolveCocPresentation(status, hasCrmLink);
  return (
    <span className={`inline-block text-[10.5px] px-2 py-0.5 rounded-full border ${CHIP_STYLES[p]}`} title={CHIP_LABELS[p]}>
      {CHIP_LABELS[p]}
    </span>
  );
}

/**
 * Action label for the CoC button shown inside Access Follow-up rows.
 * Never returns "Send CoC" — first-send is the initiator's responsibility.
 */
export function cocActionLabel(status: string | null | undefined, hasCrmLink: boolean): string {
  const p = resolveCocPresentation(status, hasCrmLink);
  switch (p) {
    case "not_linked": return "CRM not linked";
    case "signed": return "View CoC";
    case "failed": return "Retry";
    case "resign_required": return "Resend Re-sign";
    case "link_opened":
    case "sent": return "Resend";
    case "not_sent":
    default: return "Open CRM";
  }
}

export function cocActionTooltip(status: string | null | undefined, hasCrmLink: boolean): string {
  const p = resolveCocPresentation(status, hasCrmLink);
  switch (p) {
    case "not_linked": return "No CRM lead linked";
    case "signed": return "Open CRM and view signed Code of Conduct";
    case "failed": return "Open CRM and retry Code of Conduct delivery";
    case "resign_required": return "Open CRM and resend the re-signature link";
    case "link_opened":
    case "sent": return "Open CRM and resend Code of Conduct";
    case "not_sent":
    default: return "Open CRM (initial Code of Conduct not yet sent)";
  }
}
