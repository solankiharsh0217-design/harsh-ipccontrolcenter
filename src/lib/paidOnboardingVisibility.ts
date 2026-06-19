// Single source of truth for which Calling CRM leads are visible in the
// Paid — Onboarding board.
//
// IMPORTANT: `conversion_status` (converted / linked_to_paid / not_converted)
// belongs to the **Unpaid Sales** conversion flow. It must NEVER hide cards
// from the Paid Onboarding delivery/onboarding board — those cards are the
// entire point of that pipeline.
//
// A Paid Onboarding card is visible unless it is:
//   - in a different pipeline
//   - soft-deleted   (deleted_at IS NOT NULL)
//   - archived       (archived_at IS NOT NULL) — unless `showArchived` is on
//
// Do NOT add filters here for hide_from_sales_workload, paid_pipeline_lead_id,
// or any conversion_status value. Those are Sales-Pipeline-only concerns.

import type { Lead } from "@/lib/crmTypes";

export interface PaidOnboardingVisibilityOpts {
  showArchived?: boolean;
}

export function getVisiblePaidOnboardingLeads(
  leads: Lead[],
  paidPipelineId: string,
  opts: PaidOnboardingVisibilityOpts = {}
): Lead[] {
  const { showArchived = false } = opts;
  return leads.filter((l: any) => {
    if (l.pipeline_id !== paidPipelineId) return false;
    if (l.deleted_at) return false;
    const isArchived = !!l.archived_at;
    return showArchived ? isArchived : !isArchived;
  });
}
