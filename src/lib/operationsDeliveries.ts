import { supabase } from "@/integrations/supabase/client";
import { listOffersForLead, formatOffer, type PaidLeadOfferItem } from "@/lib/offers";

export type DeliveryStatus = "pending" | "in_progress" | "delivered" | "blocked" | "cancelled";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  delivered: "Delivered",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

export const DELIVERY_STATUS_COLORS: Record<DeliveryStatus, string> = {
  pending: "bg-[#F3F4F6] text-[#374151]",
  in_progress: "bg-[#E0E7FF] text-[#3730A3]",
  delivered: "bg-[#DCFCE7] text-[#166534]",
  blocked: "bg-[#FEE2E2] text-[#991B1B]",
  cancelled: "bg-[#F3F4F6] text-[#6B7280]",
};

export interface OperationsOfferDelivery {
  id: string;
  operations_lead_id: string;
  crm_lead_id: string | null;
  paid_pipeline_lead_id: string | null;
  paid_lead_offer_item_id: string | null;
  offer_item_id: string | null;
  title: string;
  description: string | null;
  delivery_status: DeliveryStatus;
  assigned_to: string | null;
  due_date: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  proof_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliverySummary {
  total: number;
  pending: number;
  in_progress: number;
  delivered: number;
  blocked: number;
  cancelled: number;
  overdue: number;
}

export function isOverdue(row: Pick<OperationsOfferDelivery, "due_date" | "delivery_status">): boolean {
  if (!row.due_date) return false;
  if (row.delivery_status === "delivered" || row.delivery_status === "cancelled") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(row.due_date + "T00:00:00");
  return due < today;
}

export function summarize(rows: OperationsOfferDelivery[]): DeliverySummary {
  const s: DeliverySummary = {
    total: rows.length,
    pending: 0, in_progress: 0, delivered: 0, blocked: 0, cancelled: 0, overdue: 0,
  };
  for (const r of rows) {
    s[r.delivery_status]++;
    if (isOverdue(r)) s.overdue++;
  }
  return s;
}

export async function listDeliveriesForLead(operationsLeadId: string): Promise<OperationsOfferDelivery[]> {
  const { data, error } = await (supabase as any)
    .from("operations_offer_deliveries")
    .select("*")
    .eq("operations_lead_id", operationsLeadId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as OperationsOfferDelivery[];
}

/**
 * Idempotently create a delivery-tracking row for each promised offer on this operations lead.
 * - Never mutates the original promised offer records.
 * - Never overwrites an existing delivery row (status, notes, proof, assignee, due date all preserved).
 */
export async function syncDeliveriesForLead(opts: {
  operationsLeadId: string;
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  createdBy?: string | null;
}): Promise<{ created: number }> {
  const offers = await listOffersForLead({
    operationsLeadId: opts.operationsLeadId,
    crmLeadId: opts.crmLeadId ?? null,
    paidPipelineLeadId: opts.paidPipelineLeadId ?? null,
  });
  if (!offers.length) return { created: 0 };

  const existing = await listDeliveriesForLead(opts.operationsLeadId);
  const linkedIds = new Set(existing.map((d) => d.paid_lead_offer_item_id).filter(Boolean) as string[]);
  const rowsToInsert = offers
    .filter((o: PaidLeadOfferItem) => !linkedIds.has(o.id))
    .map((o: PaidLeadOfferItem) => ({
      operations_lead_id: opts.operationsLeadId,
      crm_lead_id: opts.crmLeadId ?? null,
      paid_pipeline_lead_id: opts.paidPipelineLeadId ?? null,
      paid_lead_offer_item_id: o.id,
      offer_item_id: o.offer_item_id,
      title: o.title,
      description: [formatOffer(o), o.notes].filter(Boolean).join(" · ") || null,
      delivery_status: "pending" as DeliveryStatus,
      created_by: opts.createdBy ?? null,
    }));
  if (!rowsToInsert.length) return { created: 0 };
  const { error } = await (supabase as any)
    .from("operations_offer_deliveries")
    .insert(rowsToInsert);
  if (error) {
    // Fallback: per-row insert, ignore duplicates
    let created = 0;
    for (const r of rowsToInsert) {
      const { error: e } = await (supabase as any).from("operations_offer_deliveries").insert(r);
      if (!e) created++;
    }
    return { created };
  }
  return { created: rowsToInsert.length };
}

type UpdatePatch = Partial<Pick<
  OperationsOfferDelivery,
  "delivery_status" | "assigned_to" | "due_date" | "proof_url" | "notes" | "title" | "description"
>>;

export async function updateDelivery(
  row: OperationsOfferDelivery,
  patch: UpdatePatch,
  actor: { id: string | null; name: string | null },
): Promise<OperationsOfferDelivery> {
  const nextStatus = patch.delivery_status ?? row.delivery_status;
  const statusChanged = patch.delivery_status && patch.delivery_status !== row.delivery_status;

  const dbPatch: Record<string, any> = { ...patch };

  if (statusChanged) {
    if (nextStatus === "delivered") {
      dbPatch.delivered_at = new Date().toISOString();
      dbPatch.delivered_by = actor.id;
    }
    // Do NOT auto-clear delivered_at if moving away from delivered — preserve history.
  }

  const { data, error } = await (supabase as any)
    .from("operations_offer_deliveries")
    .update(dbPatch)
    .eq("id", row.id)
    .select("*")
    .single();
  if (error) throw error;

  const updated = data as OperationsOfferDelivery;

  // Log activity events for meaningful changes (status, due date, assignee) — one bundle per save.
  try {
    const events: any[] = [];
    const base = {
      operations_lead_id: row.operations_lead_id,
      created_by: actor.id,
    };

    if (statusChanged) {
      const eventType =
        nextStatus === "delivered" ? "delivery_marked_delivered"
        : nextStatus === "blocked" ? "delivery_blocked"
        : "delivery_status_changed";
      events.push({
        ...base,
        event_type: eventType,
        note: `${row.title}: ${DELIVERY_STATUS_LABELS[row.delivery_status]} → ${DELIVERY_STATUS_LABELS[nextStatus]}`,
        reason: patch.notes ?? null,
      });
    }
    if (patch.due_date !== undefined && patch.due_date !== row.due_date) {
      events.push({
        ...base,
        event_type: "delivery_due_date_updated",
        note: `${row.title}: due date ${row.due_date ?? "—"} → ${patch.due_date ?? "—"}`,
      });
    }
    if (patch.assigned_to !== undefined && patch.assigned_to !== row.assigned_to) {
      events.push({
        ...base,
        event_type: "delivery_assignee_updated",
        note: `${row.title}: owner reassigned`,
      });
    }
    if (events.length) {
      await (supabase as any).from("operations_service_events").insert(events);
    }
  } catch {
    /* best-effort */
  }

  return updated;
}

/**
 * Kanban summary: fetch delivery counts for many operations leads in a single query.
 */
export async function fetchDeliverySummaries(
  leadIds: string[],
): Promise<Map<string, DeliverySummary>> {
  const map = new Map<string, DeliverySummary>();
  if (!leadIds.length) return map;
  const { data, error } = await (supabase as any)
    .from("operations_offer_deliveries")
    .select("operations_lead_id, delivery_status, due_date")
    .in("operations_lead_id", leadIds);
  if (error || !data) return map;
  for (const id of leadIds) {
    map.set(id, { total: 0, pending: 0, in_progress: 0, delivered: 0, blocked: 0, cancelled: 0, overdue: 0 });
  }
  for (const r of data as Array<Pick<OperationsOfferDelivery, "operations_lead_id" | "delivery_status" | "due_date">>) {
    const s = map.get(r.operations_lead_id);
    if (!s) continue;
    s.total++;
    s[r.delivery_status as DeliveryStatus]++;
    if (isOverdue(r as any)) s.overdue++;
  }
  return map;
}
