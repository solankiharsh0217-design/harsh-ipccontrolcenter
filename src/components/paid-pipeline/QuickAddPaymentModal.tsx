import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { recomputePaidLead, DEFAULT_FINANCE_PARTNERS } from "@/lib/paidPipeline";
import { logActivity } from "@/lib/auditLog";

const PAYMENT_TYPES = [
  "First Token","Second Token","Additional Token","Balance Payment",
  "Full Payment","Finance Disbursement","Bajaj Finance","EZMI Finance",
  "Refund","Adjustment","Other",
];
const PAYMENT_MODES = ["UPI","Bank Transfer","Cash","Card","Razorpay","Finance Partner","Other"];

export default function QuickAddPaymentModal({
  leadId, leadName, onClose, onSaved,
}: { leadId: string; leadName?: string; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [category, setCategory] = useState("Token Amount");
  const [type, setType] = useState("Token");
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState("UPI");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [isToken, setIsToken] = useState(true);
  const [isFinal, setIsFinal] = useState(false);
  const [financeLinked, setFinanceLinked] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!amount || amount <= 0) { toast.error("Amount required"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("paid_pipeline_payments").insert({
        paid_pipeline_lead_id: leadId,
        payment_category: category,
        payment_type: type,
        amount,
        payment_mode: mode,
        payment_date: date,
        payment_reference: reference || null,
        payment_description: description || null,
        notes: description || null,
        next_payment_expected_date: nextDate || null,
        is_token: isToken,
        is_final_payment: isFinal,
        finance_linked: financeLinked,
        created_by: user?.id,
      } as any);
      if (error) throw error;
      await supabase.from("paid_pipeline_activity_logs").insert({
        paid_pipeline_lead_id: leadId, activity_type: "payment_added",
        note: `${category} (${type}): ₹${amount.toLocaleString("en-IN")}${description ? " — " + description : ""}`,
        created_by: user?.id,
      } as any);
      if (nextDate) {
        await supabase.from("paid_pipeline_leads").update({
          next_follow_up_date: nextDate,
          follow_up_reason: "Collect " + category,
          follow_up_status: "Pending",
        } as any).eq("id", leadId);
      }
      await recomputePaidLead(leadId);
      logActivity({
        module_key: "paid_pipeline", module_label: "Paid Pipeline",
        action_type: "payment_added", action_label: "Payment added",
        entity_type: "paid_pipeline_lead", entity_id: leadId, entity_label: leadName,
        new_values: { category, type, amount, mode, date, reference, is_token: isToken, is_final: isFinal, finance_linked: financeLinked },
        severity: "info",
        summary: `${category} (${type}): ₹${amount.toLocaleString("en-IN")}${leadName ? " — " + leadName : ""}`,
      });
      toast.success("Payment added");
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line sticky top-0 bg-white z-10">
          <div className="font-serif text-[20px]">Add payment</div>
          {leadName && <div className="text-[12px] text-muted-foreground mt-0.5">{leadName}</div>}
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <QuickSaveInput fieldKey="payment_category" label="Payment category" value={category} onChange={setCategory} placeholder="Token Amount" />
            <QuickSaveInput fieldKey="payment_type" label="Payment type" value={type} onChange={setType} placeholder="Token" />
            <div>
              <label className="qsi-label">Amount</label>
              <input type="number" className="qsi-input" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} placeholder="0" />
            </div>
            <QuickSaveInput fieldKey="payment_mode" label="Mode" value={mode} onChange={setMode} placeholder="UPI" />
            <div>
              <label className="qsi-label">Payment date</label>
              <input type="date" className="qsi-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="qsi-label">Next payment expected</label>
              <input type="date" className="qsi-input" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="qsi-label">Description / notes</label>
            <textarea className="qsi-input !h-auto py-2" rows={3} placeholder="e.g. Student paid ₹2,000 token, promised second token tomorrow 4 PM." value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="qsi-label">Payment reference (optional)</label>
            <input className="qsi-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Razorpay / UPI ref" />
          </div>
          <div className="flex flex-wrap gap-4 text-[12.5px] pt-1">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={isToken} onChange={(e) => setIsToken(e.target.checked)} /> Mark as token</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} /> Mark as final payment</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={financeLinked} onChange={(e) => setFinanceLinked(e.target.checked)} /> Finance-linked</label>
          </div>
        </div>
        <div className="px-6 py-3 border-t border-line flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black">{busy ? "Saving…" : "Save payment"}</button>
        </div>
      </div>
    </div>
  );
}
