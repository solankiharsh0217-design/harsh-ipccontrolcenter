import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Save, RefreshCw, Trophy } from "lucide-react";
import {
  listDeliveriesForLead, syncDeliveriesForLead, updateDelivery, summarize,
  isOverdue, DELIVERY_STATUS_LABELS, DELIVERY_STATUS_COLORS,
  type OperationsOfferDelivery, type DeliveryStatus,
} from "@/lib/operationsDeliveries";
import { submitResult } from "@/lib/operationsRewards";

interface Props {
  operationsLeadId: string;
  crmLeadId: string | null;
  paidPipelineLeadId: string | null;
  actor: { id: string | null; name: string | null };
  buyers: { id: string; full_name: string }[];
}

const STATUS_OPTIONS: DeliveryStatus[] = ["pending", "in_progress", "delivered", "blocked", "cancelled"];

export default function DeliveryTrackingSection({ operationsLeadId, crmLeadId, paidPipelineLeadId, actor, buyers }: Props) {
  const [rows, setRows] = useState<OperationsOfferDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Partial<OperationsOfferDelivery>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rewardModal, setRewardModal] = useState<null | { row: OperationsOfferDelivery; title: string; description: string; proof_url: string; result_date: string; submitting: boolean }>(null);

  const load = async (doSync = false) => {
    setLoading(true);
    try {
      if (doSync) {
        await syncDeliveriesForLead({
          operationsLeadId,
          crmLeadId,
          paidPipelineLeadId,
          createdBy: actor.id,
        });
      }
      const rs = await listDeliveriesForLead(operationsLeadId);
      setRows(rs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationsLeadId]);

  const summary = useMemo(() => summarize(rows), [rows]);

  const getDraft = (r: OperationsOfferDelivery): Partial<OperationsOfferDelivery> => ({
    ...r,
    ...(drafts[r.id] ?? {}),
  });

  const setField = (id: string, k: keyof OperationsOfferDelivery, v: any) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [k]: v } }));
  };

  const save = async (r: OperationsOfferDelivery) => {
    const d = drafts[r.id];
    if (!d) return;
    if (d.delivery_status === "blocked" && !(d.notes ?? r.notes)) {
      toast.error("Please add a blocker reason in notes before marking Blocked.");
      return;
    }
    setSavingId(r.id);
    try {
      const updated = await updateDelivery(r, {
        delivery_status: d.delivery_status ?? r.delivery_status,
        assigned_to: d.assigned_to !== undefined ? d.assigned_to : r.assigned_to,
        due_date: d.due_date !== undefined ? d.due_date : r.due_date,
        proof_url: d.proof_url !== undefined ? d.proof_url : r.proof_url,
        notes: d.notes !== undefined ? d.notes : r.notes,
      }, actor);
      setRows((rs) => rs.map((x) => (x.id === r.id ? updated : x)));
      setDrafts((all) => {
        const c = { ...all };
        delete c[r.id];
        return c;
      });
      toast.success("Delivery updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update delivery");
    } finally {
      setSavingId(null);
    }
  };

  const dirty = (id: string) => Boolean(drafts[id]);

  if (loading) return <div className="text-[11px] text-muted-foreground">Loading delivery tracking…</div>;
  if (!rows.length) return null;

  return (
    <div className="border border-line rounded-md bg-white">
      <div className="px-3 py-2 border-b border-line flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Delivery Tracking</div>
          <div className="text-[12.5px] font-medium text-black mt-0.5">
            {summary.delivered} / {summary.total} delivered
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
          <span className={`px-1.5 py-0.5 rounded ${DELIVERY_STATUS_COLORS.pending}`}>Pending {summary.pending}</span>
          <span className={`px-1.5 py-0.5 rounded ${DELIVERY_STATUS_COLORS.in_progress}`}>In Progress {summary.in_progress}</span>
          <span className={`px-1.5 py-0.5 rounded ${DELIVERY_STATUS_COLORS.delivered}`}>Delivered {summary.delivered}</span>
          <span className={`px-1.5 py-0.5 rounded ${DELIVERY_STATUS_COLORS.blocked}`}>Blocked {summary.blocked}</span>
          {summary.overdue > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#991B1B]">Overdue {summary.overdue}</span>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            className="ml-1 inline-flex items-center gap-1 text-muted-foreground hover:text-black"
            title="Re-sync from Promised Offers"
          >
            <RefreshCw className="w-3 h-3" /> Sync
          </button>
        </div>
      </div>

      <div className="divide-y divide-line">
        {rows.map((r) => {
          const d = getDraft(r);
          const overdue = isOverdue({ due_date: d.due_date ?? null, delivery_status: (d.delivery_status ?? r.delivery_status) as DeliveryStatus });
          const status = (d.delivery_status ?? r.delivery_status) as DeliveryStatus;
          return (
            <div key={r.id} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-black truncate">{r.title}</div>
                  {r.description && (
                    <div className="text-[11px] text-muted-foreground truncate">{r.description}</div>
                  )}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${DELIVERY_STATUS_COLORS[status]}`}>
                  {DELIVERY_STATUS_LABELS[status]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Status</div>
                  <select
                    value={status}
                    onChange={(e) => setField(r.id, "delivery_status", e.target.value)}
                    className="w-full h-7 text-[12px] border border-line rounded px-1.5 bg-white"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Owner</div>
                  <select
                    value={(d.assigned_to ?? "") as string}
                    onChange={(e) => setField(r.id, "assigned_to", e.target.value || null)}
                    className="w-full h-7 text-[12px] border border-line rounded px-1.5 bg-white"
                  >
                    <option value="">Unassigned</option>
                    {buyers.map((b) => (
                      <option key={b.id} value={b.id}>{b.full_name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                    Due date {overdue && <span className="text-[#991B1B] normal-case tracking-normal">· Overdue</span>}
                  </div>
                  <input
                    type="date"
                    value={(d.due_date ?? "") as string}
                    onChange={(e) => setField(r.id, "due_date", e.target.value || null)}
                    className={`w-full h-7 text-[12px] border rounded px-1.5 bg-white ${overdue ? "border-[#991B1B]" : "border-line"}`}
                  />
                </label>
                <label className="block">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Proof URL</div>
                  <div className="flex items-center gap-1">
                    <input
                      type="url"
                      placeholder="https://…"
                      value={(d.proof_url ?? "") as string}
                      onChange={(e) => setField(r.id, "proof_url", e.target.value || null)}
                      className="flex-1 h-7 text-[12px] border border-line rounded px-1.5 bg-white"
                    />
                    {r.proof_url && (
                      <a
                        href={r.proof_url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open proof"
                        className="w-7 h-7 flex items-center justify-center border border-line rounded hover:bg-off"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </label>
              </div>

              <label className="block mt-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Notes</div>
                <textarea
                  rows={2}
                  value={(d.notes ?? "") as string}
                  onChange={(e) => setField(r.id, "notes", e.target.value || null)}
                  className="w-full text-[12px] border border-line rounded px-1.5 py-1 bg-white"
                  placeholder={status === "blocked" ? "Blocker reason (required)…" : "Notes…"}
                />
              </label>

              {r.delivered_at && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  Delivered at {new Date(r.delivered_at).toLocaleString()}
                </div>
              )}

              {dirty(r.id) && (
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    disabled={savingId === r.id}
                    onClick={() => save(r)}
                    className="ipc-btn ipc-btn-black !h-7 !text-[11px] inline-flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" /> {savingId === r.id ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
