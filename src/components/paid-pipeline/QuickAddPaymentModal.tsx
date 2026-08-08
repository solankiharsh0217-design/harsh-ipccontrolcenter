import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { recomputePaidLead, DEFAULT_FINANCE_PARTNERS } from "@/lib/paidPipeline";
import { logActivity } from "@/lib/auditLog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PaymentTypeOpt = { value: string; dot: string };
const PAYMENT_TYPES: PaymentTypeOpt[] = [
  { value: "First Token",          dot: "bg-emerald-500" },
  { value: "Second Token",         dot: "bg-sky-500" },
  { value: "Additional Token",     dot: "bg-violet-500" },
  { value: "Balance Payment",      dot: "bg-amber-500" },
  { value: "Full Payment",         dot: "bg-emerald-600" },
  { value: "Finance Disbursement", dot: "bg-indigo-500" },
  { value: "Bajaj Finance",        dot: "bg-indigo-400" },
  { value: "EZMI Finance",         dot: "bg-indigo-400" },
  { value: "Refund",               dot: "bg-rose-500" },
  { value: "Adjustment",           dot: "bg-slate-400" },
  { value: "Other",                dot: "bg-neutral-400" },
];

const PAYMENT_MODES: PaymentTypeOpt[] = [
  { value: "UPI",            dot: "bg-emerald-500" },
  { value: "Bank Transfer",  dot: "bg-sky-500" },
  { value: "Cash",           dot: "bg-amber-500" },
  { value: "Card",           dot: "bg-violet-500" },
  { value: "Razorpay",       dot: "bg-indigo-500" },
  { value: "Finance Partner",dot: "bg-orange-500" },
  { value: "Other",          dot: "bg-neutral-400" },
];

function dotFor(list: PaymentTypeOpt[], value: string) {
  return list.find(o => o.value === value)?.dot || "bg-neutral-300";
}

export default function QuickAddPaymentModal({
  leadId, leadName, onClose, onSaved, prefill, headerNote,
}: {
  leadId: string;
  leadName?: string;
  onClose: () => void;
  onSaved: () => void;
  prefill?: { type?: string; category?: string; amount?: number; description?: string; isToken?: boolean; mode?: string };
  headerNote?: string;
}) {
  const { user } = useAuth();
  const [category, setCategory] = useState(prefill?.category || "Token Amount");
  const [type, setType] = useState(prefill?.type || "First Token");
  const [amount, setAmount] = useState<number>(prefill?.amount || 0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState(prefill?.mode || "UPI");
  const [financePartner, setFinancePartner] = useState("");
  const [description, setDescription] = useState(prefill?.description || "");
  const [reference, setReference] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [isToken, setIsToken] = useState(prefill?.isToken ?? false);
  const [isFinal, setIsFinal] = useState(false);
  const [financeLinked, setFinanceLinked] = useState(false);
  const [busy, setBusy] = useState(false);

  // Auto-toggle helpers based on payment type
  useEffect(() => {
    if (type === "Full Payment") setIsFinal(true);
    if (/Finance/i.test(type)) setFinanceLinked(true);
  }, [type]);

  const handleTypeChange = (val: string) => {
    setType(val);
    if (val.includes("Token")) setCategory(val === "First Token" ? "Token Amount" : "Second Token");
    else if (val === "Balance Payment") setCategory("Balance Payment");
    else if (val === "Refund") setCategory("Refund");
    else if (val === "Full Payment") setCategory("Full Payment");
    else if (val.includes("Finance")) setCategory("EMI / Finance Disbursement");
  };

  const save = async () => {
    if (!amount || amount <= 0) { toast.error("Payment amount must be greater than 0."); return; }
    const isTokenPayment = isToken || /token/i.test(type) || /token/i.test(category);
    if (isTokenPayment) {
      const { data: existing } = await supabase
        .from("paid_pipeline_payments")
        .select("id, amount, payment_type, payment_category, is_token")
        .eq("paid_pipeline_lead_id", leadId)
        .eq("is_deleted", false);
      const hasToken = ((existing as any[]) || []).some(p =>
        p.is_token || /token/i.test(p.payment_type || "") || /token/i.test(p.payment_category || "")
      );
      if (hasToken) {
        const ok = confirm("A token payment already exists for this buyer. Add another token payment?\n\nClick Cancel to go back and change the payment type to Balance Payment instead.");
        if (!ok) return;
      }
    }
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
      if (financePartner) {
        await supabase.from("paid_pipeline_leads").update({
          finance_partner: financePartner, finance_required: true,
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
    } catch (e: any) {
      console.error("Add payment failed", e);
      const msg = String(e?.message || "");
      if (/row-level security|permission/i.test(msg)) {
        toast.error("Payment could not be saved because your account does not have payment-entry permission. Please contact admin.");
      } else {
        toast.error(msg || "Failed to save payment");
      }
    } finally { setBusy(false); }
  };

  const fieldLabel = "block text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1";
  const inputBase = "w-full h-10 rounded-md border border-line bg-white px-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20";

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-line w-full max-w-[640px] max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-line sticky top-0 bg-white z-10">
          <div className="font-serif text-[20px] leading-tight">Add payment</div>
          {leadName && <div className="text-[12.5px] text-muted-foreground mt-0.5">{leadName}</div>}
          {headerNote && (
            <div className="mt-2 text-[12px] rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-foreground">
              {headerNote}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Row 1 — Payment Type + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Payment type</label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger className="h-10 text-[13.5px]">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${dotFor(PAYMENT_TYPES, type)}`} />
                      <span>{type}</span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  {PAYMENT_TYPES.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${o.dot}`} />
                        <span>{o.value}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={fieldLabel}>Payment category</label>
              <input
                className={inputBase}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Token Amount"
              />
            </div>
          </div>

          {/* Row 2 — Amount (prominent) + Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground">₹</span>
                <input
                  type="number"
                  className="w-full h-12 rounded-md border border-line bg-white pl-7 pr-3 text-[18px] font-semibold tracking-tight focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30"
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className={fieldLabel}>Mode</label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-12 text-[13.5px]">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${dotFor(PAYMENT_MODES, mode)}`} />
                      <span>{mode}</span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  {PAYMENT_MODES.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${o.dot}`} />
                        <span>{o.value}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Finance partner (conditional) */}
          {(type.includes("Finance") || mode === "Finance Partner") && (
            <div>
              <label className={fieldLabel}>Finance partner</label>
              <input
                list="qap-finance-partners"
                className={inputBase}
                value={financePartner}
                onChange={(e) => setFinancePartner(e.target.value)}
                placeholder="Bajaj Finance"
              />
              <datalist id="qap-finance-partners">
                {DEFAULT_FINANCE_PARTNERS.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
          )}

          {/* Row 3 — Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Payment date</label>
              <input type="date" className={inputBase} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={fieldLabel}>Next payment expected</label>
              <input type="date" className={inputBase} value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={fieldLabel}>Description / notes</label>
            <textarea
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20"
              rows={3}
              placeholder="e.g. Student paid ₹2,000 token, promised second token tomorrow 4 PM."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Reference */}
          <div>
            <label className={fieldLabel}>Payment reference (optional)</label>
            <input
              className={inputBase}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Razorpay / UPI ref"
            />
          </div>

          {/* Checkboxes */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] pt-1 border-t border-line/60 pt-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={isToken} onChange={(e) => setIsToken(e.target.checked)} />
              Mark as token
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
              Mark as final payment
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={financeLinked} onChange={(e) => setFinanceLinked(e.target.checked)} />
              Finance-linked
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black">
            {busy ? "Saving…" : "Save payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
