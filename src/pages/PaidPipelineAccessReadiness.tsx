import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { LoadingState, EmptyState } from "@/components/ui-bits";
import { toast } from "sonner";
import { inr, FINAL_STAGES, DROP_STAGES } from "@/lib/paidPipeline";
import { createNotification, notifyAdmins } from "@/lib/notifications";

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  paid_batch_name: string | null;
  pipeline_stage: string | null;
  deal_value_including_gst: number;
  token_amount_collected: number;
  total_collected: number;
  balance_pending: number;
  revenue_recognition_rule: string | null;
  finance_status: string | null;
  finance_required: boolean | null;
  follow_up_status: string | null;
  code_of_conduct_status: string | null;
  code_of_conduct_request_id: string | null;
  code_of_conduct_signed_at: string | null;
  is_refunded: boolean;
  is_dropped: boolean;
  assigned_sales_executive: string | null;
  crm_lead_id: string | null;
  access_status: string;
  access_given_at: string | null;
  access_given_by: string | null;
  access_channel: string | null;
  access_note: string | null;
  access_blocker_reason: string | null;
  signed_pdf_url?: string | null;
};

type AccessStatus = "not_ready" | "ready" | "given" | "blocked" | "review";

const STATUS_LABEL: Record<AccessStatus, string> = {
  not_ready: "Not Ready",
  ready: "Ready for Access",
  given: "Access Given",
  blocked: "Blocked",
  review: "Needs Review",
};

const STATUS_CHIP: Record<AccessStatus, string> = {
  not_ready: "bg-gray-100 text-gray-700",
  ready: "bg-emerald-100 text-emerald-800",
  given: "bg-blue-100 text-blue-800",
  blocked: "bg-red-100 text-red-700",
  review: "bg-amber-100 text-amber-800",
};

function computeReadiness(r: Row): { status: AccessStatus; blocker: string | null } {
  if (r.access_status === "given") return { status: "given", blocker: null };
  if (r.access_status === "blocked") return { status: "blocked", blocker: r.access_blocker_reason || "Manually blocked" };
  if (r.access_status === "review") return { status: "review", blocker: r.access_blocker_reason || "Manual review required" };

  if (r.is_refunded) return { status: "blocked", blocker: "Cancelled / refunded" };
  if (r.is_dropped || DROP_STAGES.includes(r.pipeline_stage || "")) return { status: "blocked", blocker: "Cancelled / refunded" };
  if (!r.email || !r.email.trim()) return { status: "not_ready", blocker: "Email missing" };
  if (!r.phone || !r.phone.trim()) return { status: "not_ready", blocker: "Phone missing" };

  const cocStatus = r.code_of_conduct_status || "";
  if (!cocStatus || cocStatus === "not_sent" || cocStatus === "cancelled") {
    return { status: "not_ready", blocker: "Code of Conduct not sent" };
  }
  if (cocStatus !== "signed") {
    return { status: "not_ready", blocker: "Code of Conduct sent but not signed" };
  }
  if (!r.signed_pdf_url) {
    return { status: "not_ready", blocker: "Signed PDF missing" };
  }

  // Payment / finance condition
  const deal = Number(r.deal_value_including_gst || 0);
  const total = Number(r.total_collected || 0);
  const token = Number(r.token_amount_collected || 0);
  const isFinanceOk = ["Approved", "Disbursed"].includes(r.finance_status || "");
  const isFinal = (deal > 0 && total >= deal) || isFinanceOk || FINAL_STAGES.includes(r.pipeline_stage || "");
  const rule = r.revenue_recognition_rule || "Realized Revenue Only";
  let paymentOk = false;
  switch (rule) {
    case "Token Collected Only": paymentOk = token > 0; break;
    case "Full Deal Value": paymentOk = isFinal; break;
    case "Finance Approved Amount": paymentOk = isFinanceOk; break;
    default: paymentOk = total > 0 || token > 0 || isFinanceOk; break;
  }
  if (!paymentOk) {
    if (r.finance_required && !isFinanceOk) return { status: "not_ready", blocker: "Finance pending" };
    return { status: "not_ready", blocker: "No token/payment collected" };
  }

  return { status: "ready", blocker: null };
}

const Chip = ({ kind, children }: { kind: AccessStatus; children: React.ReactNode }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CHIP[kind]}`}>{children}</span>
);

type FilterKey = "all" | "ready" | "given" | "code_not_signed" | "payment_pending" | "finance_pending" | "blocked";

export default function PaidPipelineAccessReadiness() {
  const { user, isAdmin, profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<{ kind: "grant" | "block" | "note"; row: Row } | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("paid_pipeline_leads")
      .select("id,name,email,phone,paid_batch_name,pipeline_stage,deal_value_including_gst,token_amount_collected,total_collected,balance_pending,revenue_recognition_rule,finance_status,finance_required,follow_up_status,code_of_conduct_status,code_of_conduct_request_id,code_of_conduct_signed_at,is_refunded,is_dropped,assigned_sales_executive,crm_lead_id,access_status,access_given_at,access_given_by,access_channel,access_note,access_blocker_reason")
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      toast.error("Failed to load access readiness");
      setLoading(false);
      return;
    }
    const list = (data || []) as Row[];

    // Fetch signed_pdf_url for the requests
    const reqIds = Array.from(new Set(list.map((r) => r.code_of_conduct_request_id).filter(Boolean))) as string[];
    if (reqIds.length) {
      const { data: reqs } = await (supabase as any)
        .from("code_of_conduct_requests")
        .select("id, signed_pdf_url")
        .in("id", reqIds);
      const m = new Map<string, string | null>((reqs || []).map((r: any) => [r.id, r.signed_pdf_url]));
      list.forEach((r) => { r.signed_pdf_url = r.code_of_conduct_request_id ? m.get(r.code_of_conduct_request_id) || null : null; });
    }

    // Owners lookup
    const ownerIds = Array.from(new Set(list.map((r) => r.assigned_sales_executive).filter(Boolean))) as string[];
    if (ownerIds.length) {
      const { data: profs } = await (supabase as any).from("profiles").select("id, full_name").in("id", ownerIds);
      const m: Record<string, string> = {};
      (profs || []).forEach((p: any) => { m[p.id] = p.full_name || ""; });
      setOwners(m);
    }

    setRows(list);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const enriched = useMemo(() =>
    rows.map((r) => {
      const computed = computeReadiness(r);
      return { ...r, computedStatus: computed.status, computedBlocker: computed.blocker };
    })
  , [rows]);

  const stages = useMemo(() => Array.from(new Set(rows.map((r) => r.pipeline_stage).filter(Boolean))) as string[], [rows]);
  const batches = useMemo(() => Array.from(new Set(rows.map((r) => r.paid_batch_name).filter(Boolean))) as string[], [rows]);
  const ownerOptions = useMemo(() => Object.entries(owners), [owners]);

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (batchFilter !== "all" && r.paid_batch_name !== batchFilter) return false;
      if (ownerFilter !== "all" && r.assigned_sales_executive !== ownerFilter) return false;
      if (stageFilter !== "all" && r.pipeline_stage !== stageFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hit = [r.name, r.email, r.phone].some((v) => (v || "").toLowerCase().includes(q));
        if (!hit) return false;
      }
      switch (filter) {
        case "ready": return r.computedStatus === "ready";
        case "given": return r.computedStatus === "given";
        case "blocked": return r.computedStatus === "blocked" || r.computedStatus === "review";
        case "code_not_signed": return (r.code_of_conduct_status || "") !== "signed";
        case "payment_pending": return (r.computedBlocker || "").toLowerCase().includes("payment") || (r.computedBlocker || "").toLowerCase().includes("token");
        case "finance_pending": return (r.computedBlocker || "").toLowerCase().includes("finance");
        default: return true;
      }
    });
  }, [enriched, filter, batchFilter, ownerFilter, stageFilter, search]);

  const counts = useMemo(() => {
    const c = {
      total: enriched.length,
      ready: 0, given: 0, code_signed_pending: 0, code_not_signed: 0,
      payment_pending: 0, finance_pending: 0, blocked: 0,
    };
    for (const r of enriched) {
      if (r.computedStatus === "ready") c.ready++;
      if (r.computedStatus === "given") c.given++;
      if (r.computedStatus === "blocked" || r.computedStatus === "review") c.blocked++;
      if ((r.code_of_conduct_status || "") !== "signed") c.code_not_signed++;
      if (r.code_of_conduct_status === "signed" && r.computedStatus !== "given") c.code_signed_pending++;
      const b = (r.computedBlocker || "").toLowerCase();
      if (b.includes("payment") || b.includes("token")) c.payment_pending++;
      if (b.includes("finance")) c.finance_pending++;
    }
    return c;
  }, [enriched]);

  const cards = [
    { k: "all" as FilterKey, label: "Total paid members", v: counts.total },
    { k: "ready" as FilterKey, label: "Ready for access", v: counts.ready },
    { k: "all" as FilterKey, label: "Code signed, access pending", v: counts.code_signed_pending },
    { k: "code_not_signed" as FilterKey, label: "Code not signed", v: counts.code_not_signed },
    { k: "payment_pending" as FilterKey, label: "Payment/token pending", v: counts.payment_pending },
    { k: "finance_pending" as FilterKey, label: "Finance pending", v: counts.finance_pending },
    { k: "given" as FilterKey, label: "Access already given", v: counts.given },
    { k: "blocked" as FilterKey, label: "Blocked / needs review", v: counts.blocked },
  ];

  return (
    <div className="px-8 py-6 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl text-black">Access Readiness</h1>
          <p className="font-sans text-sm text-muted-foreground mt-1">Who is ready for the Diamond WhatsApp group / program access — and who is blocked.</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 text-xs font-sans border border-line rounded hover:bg-off">Refresh</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {cards.map((c, i) => (
          <button key={i} onClick={() => setFilter(c.k)} className={`text-left p-4 rounded-lg border ${filter === c.k && c.k !== "all" ? "border-black bg-off" : "border-line bg-white"} hover:border-black transition`}>
            <div className="font-sans text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="font-serif text-2xl text-black mt-1">{c.v}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / email / phone"
          className="px-3 py-1.5 text-sm border border-line rounded font-sans w-64" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} className="px-2 py-1.5 text-sm border border-line rounded font-sans">
          <option value="all">All statuses</option>
          <option value="ready">Ready for Access</option>
          <option value="given">Access Given</option>
          <option value="code_not_signed">Code Not Signed</option>
          <option value="payment_pending">Payment Pending</option>
          <option value="finance_pending">Finance Pending</option>
          <option value="blocked">Blocked / Review</option>
        </select>
        <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-line rounded font-sans">
          <option value="all">All batches</option>
          {batches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-line rounded font-sans">
          <option value="all">All stages</option>
          {stages.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {isAdmin && (
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-line rounded font-sans">
            <option value="all">All owners</option>
            {ownerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <LoadingState block />
      ) : filtered.length === 0 ? (
        <EmptyState title="No members match these filters." bordered />
      ) : (
        <div className="overflow-x-auto border border-line rounded-lg bg-white">
          <table className="w-full text-sm font-sans">
            <thead className="bg-off text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Member</th>
                <th className="text-left px-3 py-2">Batch</th>
                <th className="text-right px-3 py-2">Deal</th>
                <th className="text-right px-3 py-2">Token / Total</th>
                <th className="text-left px-3 py-2">CoC</th>
                <th className="text-left px-3 py-2">CRM Stage</th>
                <th className="text-left px-3 py-2">Finance</th>
                <th className="text-left px-3 py-2">Access</th>
                <th className="text-left px-3 py-2">Blocker</th>
                <th className="text-left px-3 py-2">Owner</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-black">{r.name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.email || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.phone || "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.paid_batch_name || "—"}</td>
                  <td className="px-3 py-2 text-right text-xs">{inr(r.deal_value_including_gst)}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    <div>{inr(r.token_amount_collected)}</div>
                    <div className="text-muted-foreground">{inr(r.total_collected)}</div>
                    {r.balance_pending > 0 && <div className="text-red-600">Bal {inr(r.balance_pending)}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="capitalize">{(r.code_of_conduct_status || "not sent").replace(/_/g, " ")}</div>
                    {r.signed_pdf_url ? (
                      <a href={r.signed_pdf_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">View PDF</a>
                    ) : r.code_of_conduct_request_id ? (
                      <span className="text-amber-600">PDF pending</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.pipeline_stage || "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.finance_status || (r.finance_required ? "Pending" : "—")}</td>
                  <td className="px-3 py-2"><Chip kind={r.computedStatus}>{STATUS_LABEL[r.computedStatus]}</Chip></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.computedBlocker || (r.computedStatus === "given" ? "—" : "")}</td>
                  <td className="px-3 py-2 text-xs">{r.assigned_sales_executive ? (owners[r.assigned_sales_executive] || "—") : "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end gap-1">
                      {r.computedStatus !== "given" && (
                        <button onClick={() => setModal({ kind: "grant", row: r })}
                          disabled={r.computedStatus !== "ready" && !isAdmin}
                          title={r.computedStatus !== "ready" ? "Only admin can override blocked members" : ""}
                          className="px-2 py-1 text-[11px] bg-black text-white rounded disabled:opacity-40">
                          Mark Access Given
                        </button>
                      )}
                      {r.computedStatus !== "given" && r.computedStatus !== "blocked" && (
                        <button onClick={() => setModal({ kind: "block", row: r })}
                          className="px-2 py-1 text-[11px] border border-line rounded">Mark Blocked</button>
                      )}
                      <button onClick={() => setModal({ kind: "note", row: r })} className="px-2 py-1 text-[11px] border border-line rounded">Add Note</button>
                      <Link to={`/paid-pipeline?lead=${r.id}`} className="px-2 py-1 text-[11px] border border-line rounded">Open Paid</Link>
                      {r.crm_lead_id && (
                        <Link to={`/crm?lead=${r.crm_lead_id}`} className="px-2 py-1 text-[11px] border border-line rounded">Open CRM</Link>
                      )}
                      <button onClick={() => {
                        const msg = `Hi ${r.name || "Member"}, welcome to the Diamond Membership group. Please introduce yourself.`;
                        navigator.clipboard.writeText(msg);
                        toast.success("WhatsApp message copied");
                      }} className="px-2 py-1 text-[11px] border border-line rounded">Copy WA msg</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ActionModal
          kind={modal.kind}
          row={modal.row}
          onClose={() => setModal(null)}
          onDone={async () => { setModal(null); await load(); }}
          performerName={profile?.full_name || ""}
          performerId={user?.id || ""}
        />
      )}
    </div>
  );
}

function ActionModal({ kind, row, onClose, onDone, performerName, performerId }: {
  kind: "grant" | "block" | "note";
  row: Row;
  onClose: () => void;
  onDone: () => void;
  performerName: string;
  performerId: string;
}) {
  const [channel, setChannel] = useState("WhatsApp");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const title = kind === "grant" ? "Mark Access Given" : kind === "block" ? "Mark Blocked" : "Add Note";

  const submit = async () => {
    if (kind === "block" && !reason.trim()) { toast.error("Reason required"); return; }
    setBusy(true);
    try {
      const previous = row.access_status;
      let update: any = {};
      let action = "";
      if (kind === "grant") {
        update = {
          access_status: "given",
          access_given_at: new Date().toISOString(),
          access_given_by: performerId,
          access_channel: channel,
          access_note: note || null,
          access_blocker_reason: null,
        };
        action = "access_granted";
      } else if (kind === "block") {
        update = {
          access_status: "blocked",
          access_blocker_reason: reason,
          access_blocked_at: new Date().toISOString(),
          access_blocked_by: performerId,
        };
        action = "access_blocked";
      } else {
        update = { access_note: note };
        action = "note_added";
      }

      const { error } = await (supabase as any).from("paid_pipeline_leads").update(update).eq("id", row.id);
      if (error) throw error;

      await (supabase as any).from("access_readiness_logs").insert({
        paid_pipeline_lead_id: row.id,
        action,
        previous_status: previous,
        new_status: update.access_status || previous,
        channel: update.access_channel || null,
        note: note || null,
        blocker_reason: kind === "block" ? reason : null,
        performed_by: performerId,
        performed_by_name: performerName,
      });

      // Notifications
      if (kind === "grant") {
        if (row.assigned_sales_executive && row.assigned_sales_executive !== performerId) {
          await createNotification({
            recipient_user_id: row.assigned_sales_executive,
            module_key: "paid_pipeline",
            notification_type: "access_granted",
            title: `${row.name || "Member"} granted Diamond access`,
            message: `Channel: ${channel}. Granted by ${performerName || "Admin"}.`,
            entity_type: "paid_pipeline_lead",
            entity_id: row.id,
            entity_label: row.name || undefined,
            action_url: `/paid-pipeline?lead=${row.id}`,
            action_label: "Open lead",
            triggered_by_user_id: performerId,
            triggered_by_name: performerName,
          });
        }
        await notifyAdmins({
          module_key: "paid_pipeline",
          notification_type: "access_granted",
          title: `${row.name || "Member"} marked Access Given`,
          message: `Channel: ${channel}.`,
          entity_type: "paid_pipeline_lead",
          entity_id: row.id,
          entity_label: row.name || undefined,
          action_url: `/paid-pipeline/access-readiness`,
          action_label: "Open readiness",
          triggered_by_user_id: performerId,
          triggered_by_name: performerName,
        });
      } else if (kind === "block") {
        if (row.assigned_sales_executive && row.assigned_sales_executive !== performerId) {
          await createNotification({
            recipient_user_id: row.assigned_sales_executive,
            module_key: "paid_pipeline",
            notification_type: "access_blocked",
            title: `${row.name || "Member"} access blocked`,
            message: reason,
            entity_type: "paid_pipeline_lead",
            entity_id: row.id,
            entity_label: row.name || undefined,
            action_url: `/paid-pipeline?lead=${row.id}`,
            action_label: "Open lead",
            triggered_by_user_id: performerId,
            triggered_by_name: performerName,
          });
        }
      }

      toast.success(title + " saved");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-serif text-xl mb-1">{title}</div>
        <div className="font-sans text-xs text-muted-foreground mb-4">{row.name || "Member"} · {row.email || "—"}</div>

        {kind === "grant" && (
          <>
            <label className="block text-xs font-sans text-muted-foreground mb-1">Access channel</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-line rounded mb-3">
              <option>WhatsApp</option><option>LMS</option><option>Manual</option><option>Other</option>
            </select>
            <label className="block text-xs font-sans text-muted-foreground mb-1">Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full px-2 py-1.5 text-sm border border-line rounded" />
          </>
        )}
        {kind === "block" && (
          <>
            <label className="block text-xs font-sans text-muted-foreground mb-1">Blocker reason *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full px-2 py-1.5 text-sm border border-line rounded" />
          </>
        )}
        {kind === "note" && (
          <>
            <label className="block text-xs font-sans text-muted-foreground mb-1">Note</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className="w-full px-2 py-1.5 text-sm border border-line rounded" />
          </>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-line rounded">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-3 py-1.5 text-sm bg-black text-white rounded disabled:opacity-50">
            {busy ? "Saving…" : kind === "grant" ? "Confirm & Grant Access" : kind === "block" ? "Confirm Block" : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
