import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { recomputePaidLead, inr } from "@/lib/paidPipeline";
import { logActivity } from "@/lib/auditLog";
import InlineManagedSelect from "./InlineManagedSelect";

type Lead = {
  id: string;
  name?: string | null;
  finance_required?: boolean;
  finance_partner?: string | null;
  finance_status?: string | null;
  finance_amount_approved?: number | null;
  finance_amount_disbursed?: number | null;
  finance_disbursement_date?: string | null;
  finance_notes?: string | null;
  finance_count_as_collected?: boolean | null;
  deal_value_including_gst?: number;
};

export default function QuickFinanceModal({
  lead, onClose, onSaved,
}: { lead: Lead; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [required, setRequired] = useState<"Yes" | "No" | "Not Sure">(
    lead.finance_required ? "Yes" : (lead.finance_status === "Not Required" ? "No" : "Not Sure")
  );
  const [partner, setPartner] = useState(lead.finance_partner || "");
  const [status, setStatus] = useState(lead.finance_status || "");
  const [approved, setApproved] = useState<number>(Number(lead.finance_amount_approved || 0));
  const [disbursed, setDisbursed] = useState<number>(Number(lead.finance_amount_disbursed || 0));
  const [disbDate, setDisbDate] = useState<string>(lead.finance_disbursement_date || "");
  const [notes, setNotes] = useState(lead.finance_notes || "");
  const [countCollected, setCountCollected] = useState<boolean>(
    lead.finance_count_as_collected ?? (lead.finance_status === "Disbursed")
  );
  const [busy, setBusy] = useState(false);

  // Auto-default count when status flips to Disbursed
  const handleStatusChange = (s: string) => {
    setStatus(s);
    if (s === "Disbursed" && !lead.finance_count_as_collected) setCountCollected(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const patch: any = {
        finance_required: required === "Yes",
        finance_partner: partner || null,
        finance_status: required === "No" ? "Not Required" : (status || null),
        finance_amount_approved: approved || 0,
        finance_amount_disbursed: disbursed || 0,
        finance_disbursement_date: disbDate || null,
        finance_notes: notes || null,
        finance_count_as_collected: countCollected,
      };
      const { error } = await supabase.from("paid_pipeline_leads").update(patch).eq("id", lead.id);
      if (error) throw error;

      // If counted as collected, ensure a synthetic finance disbursement payment exists / is updated.
      if (countCollected && disbursed > 0) {
        const { data: existing } = await supabase
          .from("paid_pipeline_payments")
          .select("id, amount")
          .eq("paid_pipeline_lead_id", lead.id)
          .eq("is_deleted", false)
          .eq("payment_type", "Finance Disbursement")
          .maybeSingle();
        if (existing) {
          await supabase.from("paid_pipeline_payments").update({
            amount: disbursed,
            payment_date: disbDate || new Date().toISOString().slice(0,10),
            payment_mode: "Finance Partner",
            payment_description: `${partner || "Finance"} disbursement`,
          } as any).eq("id", (existing as any).id);
        } else {
          await supabase.from("paid_pipeline_payments").insert({
            paid_pipeline_lead_id: lead.id,
            payment_category: "EMI / Finance Disbursement",
            payment_type: "Finance Disbursement",
            amount: disbursed,
            payment_mode: "Finance Partner",
            payment_date: disbDate || new Date().toISOString().slice(0,10),
            payment_description: `${partner || "Finance"} disbursement`,
            is_token: false,
            is_final_payment: false,
            finance_linked: true,
            created_by: user?.id,
          } as any);
        }
      }

      await recomputePaidLead(lead.id);

      const statusChanged = (lead.finance_status || "") !== (patch.finance_status || "");
      const disbursalChanged = Number(lead.finance_amount_disbursed || 0) !== disbursed
        || (lead.finance_disbursement_date || "") !== (disbDate || "");

      if (statusChanged) {
        logActivity({
          module_key: "paid_pipeline", module_label: "Paid Pipeline",
          action_type: "finance_status_changed", action_label: "Finance status changed",
          entity_type: "paid_pipeline_lead", entity_id: lead.id, entity_label: lead.name || undefined,
          old_values: { finance_status: lead.finance_status }, new_values: { finance_status: patch.finance_status, partner },
          summary: `Finance status → ${patch.finance_status || "—"}${partner ? " (" + partner + ")" : ""}`,
        });
      }
      if (disbursalChanged) {
        logActivity({
          module_key: "paid_pipeline", module_label: "Paid Pipeline",
          action_type: "finance_disbursal_updated", action_label: "Finance disbursal updated",
          entity_type: "paid_pipeline_lead", entity_id: lead.id, entity_label: lead.name || undefined,
          new_values: { disbursed, disbursement_date: disbDate, count_as_collected: countCollected },
          summary: `Disbursed: ${inr(disbursed)}${disbDate ? " on " + disbDate : ""}`,
        });
      }
      toast.success("Finance updated");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[600px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line sticky top-0 bg-white z-10">
          <div className="font-serif text-[20px]">Update finance</div>
          {lead.name && <div className="text-[12px] text-muted-foreground mt-0.5">{lead.name} · Deal {inr(Number(lead.deal_value_including_gst || 0))}</div>}
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="qsi-label">Finance required?</label>
              <select className="qsi-input" value={required} onChange={(e) => setRequired(e.target.value as any)}>
                <option>Yes</option><option>No</option><option>Not Sure</option>
              </select>
            </div>
            <div>
              <label className="qsi-label">Finance partner</label>
              <InlineManagedSelect
                settingType="finance_partner"
                value={partner}
                onChange={setPartner}
                width="100%"
                triggerClassName="w-full h-10 border border-input rounded-md px-3 text-[13px] text-left bg-background truncate flex items-center justify-between gap-1 hover:bg-off"
              />
            </div>
            <div>
              <label className="qsi-label">Finance status</label>
              <InlineManagedSelect
                settingType="finance_status"
                value={required === "No" ? "Not Required" : status}
                onChange={(v) => handleStatusChange(v)}
                width="100%"
                triggerClassName="w-full h-10 border border-input rounded-md px-3 text-[13px] text-left bg-background truncate flex items-center justify-between gap-1 hover:bg-off"
              />
            </div>
            <div>
              <label className="qsi-label">Approved amount</label>
              <input type="number" className="qsi-input" value={approved || ""} onChange={(e) => setApproved(Number(e.target.value))} placeholder="0" />
            </div>
            <div>
              <label className="qsi-label">Disbursed amount</label>
              <input type="number" className="qsi-input" value={disbursed || ""} onChange={(e) => setDisbursed(Number(e.target.value))} placeholder="0" />
            </div>
            <div>
              <label className="qsi-label">Disbursement date</label>
              <input type="date" className="qsi-input" value={disbDate} onChange={(e) => setDisbDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="qsi-label">Notes</label>
            <textarea className="qsi-input !h-auto py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Bajaj approved 80k, awaiting disbursal" />
          </div>
          <label className="flex items-start gap-2 text-[12.5px] pt-1">
            <input type="checkbox" className="mt-0.5" checked={countCollected} onChange={(e) => setCountCollected(e.target.checked)} />
            <span>
              <span className="font-medium">Count disbursed amount as collected revenue</span>
              <div className="text-[11px] text-muted-foreground">Approved ≠ received. Tick this only when money is treated as received.</div>
            </span>
          </label>
        </div>
        <div className="px-6 py-3 border-t border-line flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black">{busy ? "Saving…" : "Save finance"}</button>
        </div>
      </div>
    </div>
  );
}
