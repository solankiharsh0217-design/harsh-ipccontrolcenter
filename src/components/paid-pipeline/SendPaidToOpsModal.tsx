import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { ensureOperationsPipeline, findExistingActiveOpsLead } from "@/lib/operationsCrm";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import { logActivity } from "@/lib/auditLog";

interface PaidLeadLite {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  product_name_snapshot: string | null;
  paid_batch_name: string | null;
  crm_lead_id: string | null;
  deal_value_including_gst?: number | null;
}

export default function SendPaidToOpsModal({ lead, onClose, onDone }: { lead: PaidLeadLite; onClose: () => void; onDone?: () => void }) {
  const { profile } = useAuth();
  const [assignees, setAssignees] = useState<{ id: string; full_name: string }[]>([]);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [months, setMonths] = useState<number>(3);
  const [packageName, setPackageName] = useState<string>("Ads Management");
  const [notes, setNotes] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      const rows = await getEligibleAssignees("operations_crm").catch(() => []);
      setAssignees(rows.map((r: any) => ({ id: r.id, full_name: r.full_name })));
      const dup = await findExistingActiveOpsLead({
        crmLeadId: lead.crm_lead_id, paidPipelineLeadId: lead.id,
        email: lead.email, phone: lead.phone,
      });
      setExisting(dup);
    })();
  }, [lead.id]);

  const submit = async () => {
    if (existing) { toast.info("This client is already in Operations CRM"); onClose(); return; }
    setBusy(true);
    try {
      const { pipelineId, firstStageId } = await ensureOperationsPipeline();
      const days = Math.max(1, Math.round(months * 30));
      const buyerName = assigneeId ? (assignees.find(a => a.id === assigneeId)?.full_name ?? null) : null;
      const insert: any = {
        crm_lead_id: lead.crm_lead_id ?? null,
        paid_pipeline_lead_id: lead.id,
        name: lead.name ?? "—",
        email: lead.email,
        phone: lead.phone,
        product_name: lead.product_name_snapshot,
        batch_name: lead.paid_batch_name,
        onboarding_batch: lead.paid_batch_name,
        deal_value: lead.deal_value_including_gst ?? null,
        service_package_name: packageName || null,
        service_months: months,
        service_days_committed: days,
        service_status: "not_started",
        pipeline_id: pipelineId,
        stage_id: firstStageId,
        assigned_media_buyer_id: assigneeId || null,
        assigned_media_buyer_name: buyerName,
        notes: notes || null,
        created_by: profile?.id ?? null,
        ...(startDate ? { current_active_start_date: startDate } : {}),
      };
      const { error } = await supabase.from("operations_leads" as any).insert(insert);
      if (error) throw error;
      await logActivity({
        module_key: "operations_crm",
        action_type: "paid_lead_sent_to_operations",
        entity_type: "operations_leads",
        entity_id: lead.id,
        entity_label: lead.name || undefined,
        summary: `Sent paid client "${lead.name ?? ""}" to Operations CRM`,
        metadata: { paid_pipeline_lead_id: lead.id, assigned_to: assigneeId || null },
      }).catch(() => {});
      toast.success("Client sent to Operations CRM");
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to send to Operations CRM");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-md">
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <div className="font-serif text-base">Send to Operations CRM</div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="bg-off rounded-md p-3 text-[12px]">
            <div className="font-medium">{lead.name || "—"}</div>
            <div className="text-muted-foreground">{lead.email || "—"} · {lead.phone || "—"}</div>
            {lead.paid_batch_name && <div className="text-muted-foreground mt-0.5">Batch: {lead.paid_batch_name}</div>}
          </div>
          {existing ? (
            <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-[12px]">
              This client is already in Operations CRM. No duplicate will be created.
            </div>
          ) : (
            <>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Assign media buyer</label>
                <select className="ipc-input w-full mt-1" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {assignees.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Start date</label>
                  <input type="date" className="ipc-input w-full mt-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Duration (months)</label>
                  <input type="number" min={1} max={60} className="ipc-input w-full mt-1" value={months} onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Service / package</label>
                <input className="ipc-input w-full mt-1" value={packageName} onChange={(e) => setPackageName(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes</label>
                <textarea rows={2} className="ipc-input w-full mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          {!existing && (
            <button onClick={submit} disabled={busy} className="ipc-btn ipc-btn-black">
              {busy ? "Sending…" : "Send to Operations CRM"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
