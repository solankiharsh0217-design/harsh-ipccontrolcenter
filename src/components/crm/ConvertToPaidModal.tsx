import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { X, AlertTriangle, CheckCircle2, Link2, Plus } from "lucide-react";
import { recomputePaidLead } from "@/lib/paidPipeline";
import { logActivity } from "@/lib/auditLog";
import { ensurePaidPipelineCrmLead } from "@/lib/paidCrmMirror";
import type { Lead } from "@/lib/crmTypes";

interface Props {
  lead: Lead;
  agents: { id: string; full_name: string }[];
  onClose: () => void;
  onConverted: () => void;
}

type PaidMatch = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  pipeline_stage: string | null;
  deal_value_including_gst: number;
  total_collected: number;
  assigned_sales_executive: string | null;
  archived_at: string | null;
  created_at: string;
};

const normEmail = (e?: string | null) => (e || "").trim().toLowerCase();
const normPhone = (p?: string | null) => {
  const digits = (p || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
};
const inr = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

export default function ConvertToPaidModal({ lead, agents, onClose, onConverted }: Props) {
  const { profile, isAdmin } = useAuth();
  const [matches, setMatches] = useState<PaidMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [mode, setMode] = useState<"auto" | "link" | "create">("auto");
  const [linkTargetId, setLinkTargetId] = useState<string>("");

  // Create-new form fields
  const [businessUnit, setBusinessUnit] = useState("IPC");
  const [productName, setProductName] = useState(lead.program_name || "IPC Diamond Program");
  const [dealValue, setDealValue] = useState<number>(Number(lead.deal_value) || 0);
  const [tokenAmount, setTokenAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<string>("UPI");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [ownerId, setOwnerId] = useState<string>(lead.assigned_agent_id || "");
  const [hideFromSales, setHideFromSales] = useState<boolean>(true);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingMatches(true);
      const email = normEmail(lead.email);
      const phone = normPhone(lead.phone);
      const filters: string[] = [];
      if (email) filters.push(`email.ilike.${email}`);
      if (phone) filters.push(`phone.ilike.%${phone}`);
      if (filters.length === 0) {
        setMatches([]);
        setLoadingMatches(false);
        return;
      }
      const { data } = await supabase
        .from("paid_pipeline_leads")
        .select("id,name,email,phone,pipeline_stage,deal_value_including_gst,total_collected,assigned_sales_executive,archived_at,created_at")
        .or(filters.join(","))
        .limit(10);
      const list = (data as any[] | null) || [];
      // Refine phone match: ensure last-10 actually equals (DB stores varied formats)
      const refined = list.filter((m) => {
        if (email && normEmail(m.email) === email) return true;
        if (phone && normPhone(m.phone) === phone) return true;
        return false;
      });
      setMatches(refined as PaidMatch[]);
      if (refined.length > 0) {
        setMode("link");
        setLinkTargetId(refined[0].id);
      } else {
        setMode("create");
      }
      setLoadingMatches(false);
    })();
  }, [lead.id, lead.email, lead.phone]);

  const ownerName = useMemo(() => {
    return agents.find((a) => a.id === ownerId)?.full_name || "Unassigned";
  }, [ownerId, agents]);

  const doLinkExisting = async () => {
    if (!linkTargetId) {
      toast.error("Pick a paid buyer to link to");
      return;
    }
    setSubmitting(true);
    try {
      const target = matches.find((m) => m.id === linkTargetId);
      // Update paid buyer with missing identity fields only (non-destructive)
      const patch: any = {};
      if (target && !target.name && lead.full_name) patch.name = lead.full_name;
      if (target && !target.email && lead.email) patch.email = lead.email;
      if (target && !target.phone && lead.phone) patch.phone = lead.phone;
      if (Object.keys(patch).length > 0) {
        await supabase.from("paid_pipeline_leads").update(patch).eq("id", linkTargetId);
      }

      const updates: any = {
        paid_pipeline_lead_id: linkTargetId,
        conversion_status: "linked_to_paid",
        converted_at: new Date().toISOString(),
        converted_by: profile?.id || null,
        hide_from_sales_workload: hideFromSales,
      };
      const { error } = await supabase.from("leads").update(updates).eq("id", lead.id);
      if (error) throw error;

      await supabase.from("crm_lead_conversions").insert({
        source_lead_id: lead.id,
        paid_pipeline_lead_id: linkTargetId,
        conversion_type: "linked_existing_paid",
        source_pipeline_id: lead.pipeline_id,
        source_stage_id: lead.stage_id,
        program_name: lead.program_name,
        deal_value: target?.deal_value_including_gst ?? null,
        assigned_owner_id: target?.assigned_sales_executive ?? null,
        status: "success",
        created_by: profile?.id || null,
        metadata_json: { email: lead.email, phone: lead.phone, matched_by: "email_or_phone" },
      });

      await logActivity({
        module_key: "crm",
        action_type: "crm_lead_linked_to_existing_paid",
        entity_type: "lead",
        entity_id: lead.id,
        entity_label: lead.full_name || "Lead",
        metadata: { paid_pipeline_lead_id: linkTargetId },
        summary: `Linked '${lead.full_name || "Lead"}' to existing paid buyer.`,
      });

      toast.success("Lead linked to existing paid buyer");
      onConverted();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to link");
    } finally {
      setSubmitting(false);
    }
  };

  const doCreateNew = async () => {
    if (!businessUnit) {
      toast.error("Business unit is required");
      return;
    }
    if (dealValue <= 0) {
      toast.error("Deal value must be greater than 0");
      return;
    }
    setSubmitting(true);
    try {
      // Create paid buyer
      const { data: paidRow, error: insErr } = await supabase
        .from("paid_pipeline_leads")
        .insert({
          name: lead.full_name,
          email: lead.email,
          phone: lead.phone,
          business_unit: businessUnit,
          product_name_snapshot: productName || null,
          deal_value_including_gst: dealValue,
          default_token_amount: 0,
          token_amount_collected: 0,
          total_collected: 0,
          balance_pending: dealValue,
          final_revenue_realized: 0,
          pipeline_stage: tokenAmount > 0 ? "Token Paid" : "Payment Follow-Up Pending",
          assigned_sales_executive: ownerId || null,
          source_webinar: lead.webinar_source || null,
          crm_lead_id: lead.id,
          created_from_attribution: false,
        } as any)
        .select("id")
        .maybeSingle();
      if (insErr || !paidRow) throw insErr || new Error("Could not create paid buyer");

      // Record token payment if entered
      if (tokenAmount > 0) {
        await supabase.from("paid_pipeline_payments").insert({
          paid_pipeline_lead_id: paidRow.id,
          payment_type: "Token",
          payment_category: "Token Amount",
          amount: tokenAmount,
          payment_mode: paymentMode,
          payment_date: paymentDate,
          is_token: true,
          created_by: profile?.id || null,
        } as any);
        await recomputePaidLead(paidRow.id);
      }

      // Update CRM lead
      await supabase
        .from("leads")
        .update({
          paid_pipeline_lead_id: paidRow.id,
          conversion_status: "converted",
          converted_at: new Date().toISOString(),
          converted_by: profile?.id || null,
          hide_from_sales_workload: hideFromSales,
        } as any)
        .eq("id", lead.id);

      // Audit
      await supabase.from("crm_lead_conversions").insert({
        source_lead_id: lead.id,
        paid_pipeline_lead_id: paidRow.id,
        conversion_type: "created_new_paid",
        source_pipeline_id: lead.pipeline_id,
        source_stage_id: lead.stage_id,
        program_name: productName,
        deal_value: dealValue,
        token_amount: tokenAmount,
        total_collected: tokenAmount,
        balance_pending: Math.max(0, dealValue - tokenAmount),
        assigned_owner_id: ownerId || null,
        status: "success",
        created_by: profile?.id || null,
        metadata_json: { business_unit: businessUnit, hide_from_sales_workload: hideFromSales },
      });

      await logActivity({
        module_key: "crm",
        action_type: "crm_lead_converted_to_paid",
        entity_type: "lead",
        entity_id: lead.id,
        entity_label: lead.full_name || "Lead",
        metadata: {
          paid_pipeline_lead_id: paidRow.id,
          deal_value: dealValue,
          token_amount: tokenAmount,
        },
        summary: `Converted '${lead.full_name || "Lead"}' to Paid Onboarding (deal ${inr(dealValue)}).`,
      });

      toast.success("Lead converted. Paid Pipeline buyer created.");
      onConverted();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Conversion failed. No data was changed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <div>
            <div className="font-serif text-[18px] leading-tight">Convert Lead to Paid</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {lead.full_name || "Lead"} · {lead.phone || "—"} · {lead.email || "—"}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded hover:bg-off flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loadingMatches && (
            <div className="text-sm text-muted-foreground">Checking for existing paid records…</div>
          )}

          {!loadingMatches && matches.length > 0 && (
            <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#92400E] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-[#92400E]">
                    Possible existing paid record found
                  </div>
                  <div className="text-[11px] text-[#92400E]/80 mt-0.5">
                    We matched {matches.length} paid buyer{matches.length > 1 ? "s" : ""} by email/phone. Link instead of creating a duplicate.
                  </div>
                  <div className="mt-2 space-y-2">
                    {matches.map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer ${
                          mode === "link" && linkTargetId === m.id
                            ? "bg-white border-[#92400E]"
                            : "bg-white/60 border-line hover:bg-white"
                        }`}
                      >
                        <input
                          type="radio"
                          name="match"
                          className="mt-1"
                          checked={mode === "link" && linkTargetId === m.id}
                          onChange={() => {
                            setMode("link");
                            setLinkTargetId(m.id);
                          }}
                        />
                        <div className="flex-1 min-w-0 text-[12px]">
                          <div className="font-medium truncate">
                            {m.name || "(no name)"}
                            {m.archived_at && (
                              <span className="ml-1.5 inline-flex px-1.5 py-0 rounded text-[9px] bg-gray-200 text-gray-700">archived</span>
                            )}
                          </div>
                          <div className="text-muted-foreground truncate">
                            {m.phone || "—"} · {m.email || "—"}
                          </div>
                          <div className="text-muted-foreground mt-0.5">
                            Stage: {m.pipeline_stage || "—"} · Deal {inr(m.deal_value_including_gst)} · Collected {inr(m.total_collected)}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {isAdmin && (
                    <label className="flex items-center gap-2 mt-2 text-[11px] text-[#92400E]">
                      <input
                        type="radio"
                        name="match"
                        checked={mode === "create"}
                        onChange={() => setMode("create")}
                      />
                      Create a new paid buyer anyway (admin only)
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {!loadingMatches && matches.length === 0 && (
            <div className="rounded-lg border border-line bg-off/40 p-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#15803D] mt-0.5" />
              <div className="text-[12px]">
                No existing paid record matched. A new Paid Pipeline buyer will be created.
              </div>
            </div>
          )}

          {mode === "create" && (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">New Paid Buyer</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="uppercase-label mb-1">Business unit</div>
                  <select
                    value={businessUnit}
                    onChange={(e) => setBusinessUnit(e.target.value)}
                    className="ipc-input !h-9 !text-xs w-full"
                  >
                    <option value="IPC">IPC</option>
                    <option value="Diamond">Diamond</option>
                    <option value="Silver">Silver</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <div className="uppercase-label mb-1">Program / Product</div>
                  <input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="ipc-input !h-9 !text-xs w-full"
                    placeholder="IPC Diamond Program"
                  />
                </div>
                <div>
                  <div className="uppercase-label mb-1">Deal value (incl. GST)</div>
                  <input
                    type="number"
                    value={dealValue}
                    onChange={(e) => setDealValue(Number(e.target.value) || 0)}
                    className="ipc-input !h-9 !text-xs w-full"
                  />
                </div>
                <div>
                  <div className="uppercase-label mb-1">Token amount (optional)</div>
                  <input
                    type="number"
                    value={tokenAmount}
                    onChange={(e) => setTokenAmount(Number(e.target.value) || 0)}
                    className="ipc-input !h-9 !text-xs w-full"
                  />
                </div>
                {tokenAmount > 0 && (
                  <>
                    <div>
                      <div className="uppercase-label mb-1">Payment mode</div>
                      <select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                        className="ipc-input !h-9 !text-xs w-full"
                      >
                        <option>UPI</option>
                        <option>Razorpay</option>
                        <option>Cash</option>
                        <option>Bank Transfer</option>
                        <option>Card</option>
                        <option>Finance / EMI</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <div className="uppercase-label mb-1">Payment date</div>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="ipc-input !h-9 !text-xs w-full"
                      />
                    </div>
                  </>
                )}
                <div className="col-span-2">
                  <div className="uppercase-label mb-1">Assign to</div>
                  <select
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="ipc-input !h-9 !text-xs w-full"
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-[12px] text-foreground pt-1">
            <input
              type="checkbox"
              checked={hideFromSales}
              onChange={(e) => setHideFromSales(e.target.checked)}
            />
            Hide this lead from active sales workload after conversion
          </label>
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="ipc-btn ipc-btn-ghost !h-9 !text-xs"
          >
            Cancel
          </button>
          {mode === "link" ? (
            <button
              onClick={doLinkExisting}
              disabled={submitting || !linkTargetId}
              className="ipc-btn ipc-btn-black !h-9 !text-xs"
            >
              <Link2 className="w-3.5 h-3.5" />
              {submitting ? "Linking…" : "Link to Existing Paid Buyer"}
            </button>
          ) : (
            <button
              onClick={doCreateNew}
              disabled={submitting}
              className="ipc-btn ipc-btn-black !h-9 !text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              {submitting ? "Converting…" : "Convert & Create Paid Buyer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
