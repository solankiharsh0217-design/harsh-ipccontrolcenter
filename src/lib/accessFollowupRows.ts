import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AccessVerification, fetchVerificationsForPaidLeads, computeOverall, OverallStatus,
} from "@/lib/accessVerification";

export type AccessRow = {
  paidLeadId: string;
  crmLeadId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  batch: string | null;
  batchKey: string;
  batchLabel: string;
  webinarDate: string | null;
  cocStatus: string | null;
  cocSentAt: string | null;
  cocSignedAt: string | null;
  cocSent: boolean;
  cocSigned: boolean;
  groupJoined: boolean;
  groupJoinedAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerKey: string;
  crmStage: string | null;
  verification: AccessVerification | null;
  overall: OverallStatus;
};

export type PaidLeadInput = {
  id: string; crm_lead_id: string | null; email: string | null; phone: string | null;
  paid_batch_name: string | null; source_report_date: string | null; source_webinar: string | null;
  code_of_conduct_status: string | null;
};
export type CrmLeadInput = {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  assigned_agent_id: string | null; webinar_date: string | null; webinar_name: string | null;
  stage_name?: string | null; code_of_conduct_status?: string | null;
};

export type CocRequestLite = {
  id: string;
  crm_lead_id: string | null;
  paid_pipeline_lead_id: string | null;
  status: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
};

const SENT_STATUSES = new Set(["sent", "viewed", "opened", "link_opened", "delivered", "signed", "re_signed", "completed", "expired"]);
const SIGNED_STATUSES = new Set(["signed", "re_signed", "completed", "complete"]);

export function cocIsSent(status: string | null | undefined, sentAt?: string | null): boolean {
  if (sentAt) return true;
  const s = (status || "").toLowerCase().trim();
  return SENT_STATUSES.has(s);
}
export function cocIsSigned(status: string | null | undefined, signedAt?: string | null): boolean {
  if (signedAt) return true;
  const s = (status || "").toLowerCase().trim();
  return SIGNED_STATUSES.has(s);
}

/** Most recent Code of Conduct request per member, keyed by BOTH crm_lead_id and paid_pipeline_lead_id. */
export async function fetchCocRequests(crmIds: string[], paidIds: string[]): Promise<Map<string, CocRequestLite>> {
  const map = new Map<string, CocRequestLite>();
  if (crmIds.length === 0 && paidIds.length === 0) return map;
  const cols = "id,crm_lead_id,paid_pipeline_lead_id,status,sent_at,signed_at,created_at";
  const chunks: Promise<any>[] = [];
  const chunk = <T,>(a: T[], n: number) => {
    const out: T[][] = [];
    for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
    return out;
  };
  for (const ids of chunk(crmIds, 200)) {
    chunks.push((supabase as any).from("code_of_conduct_requests").select(cols).in("crm_lead_id", ids));
  }
  for (const ids of chunk(paidIds, 200)) {
    chunks.push((supabase as any).from("code_of_conduct_requests").select(cols).in("paid_pipeline_lead_id", ids));
  }
  const results = await Promise.all(chunks);
  const all: CocRequestLite[] = [];
  for (const r of results) for (const row of (r?.data || [])) all.push(row as CocRequestLite);

  const put = (key: string | null, row: CocRequestLite) => {
    if (!key) return;
    const cur = map.get(key);
    if (!cur || new Date(row.created_at).getTime() > new Date(cur.created_at).getTime()) map.set(key, row);
  };
  for (const row of all) {
    put(row.crm_lead_id, row);
    put(row.paid_pipeline_lead_id, row);
  }
  return map;
}

export function useAccessFollowupRows(
  paidLeads: PaidLeadInput[],
  crmLeads: CrmLeadInput[],
  owners: Array<{ id: string; full_name: string | null }>,
) {
  const paidIds = useMemo(() => paidLeads.map((p) => p.id), [paidLeads]);
  const crmIds = useMemo(
    () => Array.from(new Set(paidLeads.map((p) => p.crm_lead_id).filter(Boolean) as string[])),
    [paidLeads],
  );

  const { data: verifications = new Map<string, AccessVerification>() } = useQuery({
    queryKey: ["access-verifications", paidIds.join(",")],
    enabled: paidIds.length > 0,
    queryFn: () => fetchVerificationsForPaidLeads(paidIds),
  });

  const { data: cocRequests = new Map<string, CocRequestLite>() } = useQuery({
    queryKey: ["access-coc-requests", crmIds.length, paidIds.length, crmIds.join(",").slice(0, 400)],
    enabled: paidIds.length > 0,
    queryFn: () => fetchCocRequests(crmIds, paidIds),
  });

  const crmById = useMemo(() => new Map(crmLeads.map((l) => [l.id, l])), [crmLeads]);
  const ownerById = useMemo(() => new Map(owners.map((o) => [o.id, o])), [owners]);

  const allRows: AccessRow[] = useMemo(() => {
    return paidLeads.map((p) => {
      const crm = p.crm_lead_id ? crmById.get(p.crm_lead_id) : undefined;
      const v = (verifications as Map<string, AccessVerification>).get(p.id) || null;
      const owner = crm?.assigned_agent_id ? ownerById.get(crm.assigned_agent_id) : undefined;
      const batchName = p.paid_batch_name || p.source_webinar || crm?.webinar_name || null;
      const webDate = p.source_report_date || crm?.webinar_date || null;
      const batchKey = (batchName || "__none__") + "|" + (webDate || "");
      const batchLabel = batchName ? (webDate ? `${batchName} — ${webDate}` : batchName) : "No batch";

      const req =
        (cocRequests as Map<string, CocRequestLite>).get(p.id) ||
        (p.crm_lead_id ? (cocRequests as Map<string, CocRequestLite>).get(p.crm_lead_id) : undefined) ||
        null;

      // Priority: linked CoC request → paid pipeline status → CRM lead status
      const cocStatus = req?.status || p.code_of_conduct_status || crm?.code_of_conduct_status || null;
      const cocSentAt = req?.sent_at || null;
      const cocSignedAt = req?.signed_at || null;

      const groupJoined = v?.whatsapp_group_status === "joined_verified";

      return {
        paidLeadId: p.id,
        crmLeadId: p.crm_lead_id,
        name: crm?.full_name || p.email || "Unnamed",
        email: p.email || crm?.email || null,
        phone: p.phone || crm?.phone || null,
        batch: batchName,
        batchKey,
        batchLabel,
        webinarDate: webDate,
        cocStatus,
        cocSentAt,
        cocSignedAt,
        cocSent: cocIsSent(cocStatus, cocSentAt),
        cocSigned: cocIsSigned(cocStatus, cocSignedAt),
        groupJoined,
        groupJoinedAt: groupJoined ? v?.whatsapp_verified_at || null : null,
        ownerId: crm?.assigned_agent_id || null,
        ownerName: owner?.full_name || null,
        ownerKey: owner?.full_name || "__unassigned__",
        crmStage: (crm as any)?.stage_name || null,
        verification: v,
        overall: computeOverall(v),
      } as AccessRow;
    });
  }, [paidLeads, crmById, verifications, ownerById, cocRequests]);

  return { allRows };
}

export type Segment = "all" | "coc_sent" | "awaiting_signature" | "signed_group_pending" | "fully_complete";

export function matchesSegment(r: AccessRow, seg: Segment): boolean {
  switch (seg) {
    case "coc_sent": return r.cocSent;
    case "awaiting_signature": return r.cocSent && !r.cocSigned;
    case "signed_group_pending": return r.cocSigned && !r.groupJoined;
    case "fully_complete": return r.cocSigned && r.groupJoined;
    default: return true;
  }
}

/** Action-first ordering: awaiting signature, then signed-not-joined, then complete. */
export function sortByUrgency(a: AccessRow, b: AccessRow): number {
  const rank = (r: AccessRow) => {
    if (r.cocSent && !r.cocSigned) return 0;
    if (r.cocSigned && !r.groupJoined) return 1;
    if (r.cocSigned && r.groupJoined) return 3;
    return 2;
  };
  const d = rank(a) - rank(b);
  if (d !== 0) return d;
  return a.name.localeCompare(b.name);
}
