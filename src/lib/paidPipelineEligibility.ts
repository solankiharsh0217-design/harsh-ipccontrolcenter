// Paid Pipeline eligibility gate.
//
// A member belongs in the Paid Pipeline only once their finance process is
// complete. The operational proof of that in this business is that a Code of
// Conduct has been successfully SENT to them (the CoC is only ever sent after
// finance is done).
//
// The CoC status resolution reuses the exact same source of truth as Access
// Follow-up (`src/lib/accessFollowupRows.ts` → `fetchCocRequests`): the most
// recent linked `code_of_conduct_requests` row (matched on either
// `crm_lead_id` or `paid_pipeline_lead_id`), falling back to
// `paid_pipeline_leads.code_of_conduct_status` and then the CRM lead status.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCocRequests, type CocRequestLite } from "@/lib/accessFollowupRows";
import { hasSuccessfulCocSend } from "@/lib/cocStatus";

export type PaidCocInfo = {
  status: string | null;
  sentAt: string | null;
  signedAt: string | null;
  hasCrmLink: boolean;
  eligible: boolean;
};

type MinimalPaidLead = {
  id: string;
  crm_lead_id?: string | null;
  code_of_conduct_status?: string | null;
};

const chunk = <T,>(a: T[], n: number) => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

/** Fallback CRM-side CoC status for paid leads whose pipeline column is empty. */
async function fetchCrmCocStatuses(crmIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (crmIds.length === 0) return map;
  const results = await Promise.all(
    chunk(crmIds, 200).map((ids) =>
      (supabase as any).from("leads").select("id, code_of_conduct_status").in("id", ids),
    ),
  );
  for (const r of results) for (const row of r?.data || []) map.set(row.id, row.code_of_conduct_status ?? null);
  return map;
}

/**
 * Resolves Code of Conduct state for a set of paid pipeline leads and derives
 * Paid Pipeline eligibility from it. Returns a map keyed by paid lead id.
 */
export function usePaidPipelineCoc(leads: MinimalPaidLead[]) {
  const paidIds = useMemo(() => leads.map((l) => l.id), [leads]);
  const crmIds = useMemo(
    () => Array.from(new Set(leads.map((l) => l.crm_lead_id).filter(Boolean) as string[])),
    [leads],
  );
  const key = paidIds.length + ":" + paidIds.slice(0, 400).join(",").slice(0, 2000);

  const { data: cocRequests = new Map<string, CocRequestLite>(), isLoading: loadingReq } = useQuery({
    queryKey: ["paid-pipeline-coc-requests", key],
    enabled: paidIds.length > 0,
    queryFn: () => fetchCocRequests(crmIds, paidIds),
  });

  const { data: crmStatuses = new Map<string, string | null>(), isLoading: loadingCrm } = useQuery({
    queryKey: ["paid-pipeline-crm-coc", crmIds.length, crmIds.slice(0, 400).join(",").slice(0, 2000)],
    enabled: crmIds.length > 0,
    queryFn: () => fetchCrmCocStatuses(crmIds),
  });

  const cocByLeadId = useMemo(() => {
    const reqs = cocRequests as Map<string, CocRequestLite>;
    const crm = crmStatuses as Map<string, string | null>;
    const m = new Map<string, PaidCocInfo>();
    for (const l of leads) {
      const req = reqs.get(l.id) || (l.crm_lead_id ? reqs.get(l.crm_lead_id) : undefined) || null;
      const status = req?.status || l.code_of_conduct_status || (l.crm_lead_id ? crm.get(l.crm_lead_id) ?? null : null) || null;
      // A linked request is itself proof the member is CRM-linked for CoC purposes.
      const hasCrmLink = !!l.crm_lead_id || !!req;
      m.set(l.id, {
        status,
        sentAt: req?.sent_at || null,
        signedAt: req?.signed_at || null,
        hasCrmLink,
        eligible: !!req?.sent_at || hasSuccessfulCocSend(status, hasCrmLink),
      });
    }
    return m;
  }, [leads, cocRequests, crmStatuses]);

  return { cocByLeadId, cocLoading: loadingReq || loadingCrm };
}
