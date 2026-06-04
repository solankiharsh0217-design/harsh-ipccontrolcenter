import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import type { SaleDetail, AttributionPayload } from "@/lib/roasExport";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import { logActivity } from "@/lib/auditLog";

const inr = (n: number) => "₹" + (Math.round(n || 0)).toLocaleString("en-IN");

export type SendToPaidPipelineDrawerProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  payload: AttributionPayload;
  selectedSales: SaleDetail[];
  sessionMeta?: {
    webinar_name?: string | null;
    webinar_date?: string | null;
    webinar_type?: string | null;
    webinar_operator?: string | null;
  };
  onDone?: () => void;
};

type Setting = { id: string; setting_type: string; label: string; value: string | null; sort_order: number };
type Product = { id: string; product_name: string; business_unit: string | null; product_price_including_gst: number | null; default_token_amount: number | null; currency?: string | null; revenue_recognition_rule?: string | null };
type Batch = { id: string; batch_name: string; webinar_name: string; webinar_date: string | null; business_unit: string | null };

type RowEdit = {
  key: string;
  sale: SaleDetail;
  selected: boolean;
  deal_value: number;
  token: number;
  total_collected: number;
  payment_model: string;
  pipeline_stage: string;
  finance_required: boolean;
  finance_partner: string;
  follow_up_date: string;
  assigned: string;
};

const STEPS = ["Batch", "Product", "Payment Model", "Offers", "Review", "Confirm"] as const;
const STEP_REVIEW = 4;
const STEP_CONFIRM = 5;

export default function SendToPaidPipelineDrawer({
  open, onOpenChange, sessionId, payload, selectedSales, sessionMeta, onDone,
}: SendToPaidPipelineDrawerProps) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [settings, setSettings] = useState<Setting[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [executives, setExecutives] = useState<{ id: string; full_name: string }[]>([]);

  const settingsByType = (t: string) =>
    settings.filter(s => s.setting_type === t).sort((a, b) => a.sort_order - b.sort_order);

  const [batchMode, setBatchMode] = useState<"new" | "existing">("new");
  const [existingBatchId, setExistingBatchId] = useState<string>("");
  const [batchName, setBatchName] = useState("");
  const [batchWebName, setBatchWebName] = useState("");
  const [batchWebDate, setBatchWebDate] = useState("");
  const [batchWebType, setBatchWebType] = useState("");
  const [batchBU, setBatchBU] = useState("IPC");
  const [batchOffer, setBatchOffer] = useState("");

  const [productMode, setProductMode] = useState<"new" | "existing">("existing");
  const [existingProductId, setExistingProductId] = useState<string>("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState<number>(0);
  const [newProductGstApplicable, setNewProductGstApplicable] = useState(true);
  const [newProductGstRate, setNewProductGstRate] = useState<number>(18);
  const [newProductDefaultToken, setNewProductDefaultToken] = useState<number>(0);
  const [newProductCurrency, setNewProductCurrency] = useState("INR");
  const [newProductRevRule, setNewProductRevRule] = useState("Realized Revenue Only");

  const [defaultPaymentModel, setDefaultPaymentModel] = useState("Token Collected + Balance Later");

  const [rows, setRows] = useState<RowEdit[]>([]);

  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "create_anyway">("skip");

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setResult(null);
    (async () => {
      const [{ data: s }, { data: pr }, { data: ba }, elig] = await Promise.all([
        supabase.from("paid_pipeline_settings").select("*").eq("is_active", true).eq("is_deleted", false).order("sort_order"),
        supabase.from("program_products").select("*").eq("is_active", true).eq("is_deleted", false).order("product_name"),
        supabase.from("webinar_batches").select("*").eq("is_deleted", false).order("created_at", { ascending: false }).limit(50),
        getEligibleAssignees("paid_pipeline"),
      ]);
      setSettings((s as any) || []);
      setProducts((pr as any) || []);
      setBatches((ba as any) || []);
      setExecutives(elig.map((a) => ({ id: a.id, full_name: a.full_name, role: a.role })) as any);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const wn = sessionMeta?.webinar_name || payload.webinarName || "";
    const wd = sessionMeta?.webinar_date || payload.webinarDate || "";
    const wt = sessionMeta?.webinar_type || payload.webinarType || "";
    setBatchWebName(wn);
    setBatchWebDate(wd ? String(wd).slice(0, 10) : "");
    setBatchWebType(wt);
    const dt = wd ? new Date(wd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
    setBatchName(`${wn}${dt ? " - " + dt : ""}`);
  }, [open, sessionMeta, payload.webinarName, payload.webinarDate, payload.webinarType]);

  useEffect(() => {
    if (step !== 3) return;
    const product = products.find(p => p.id === existingProductId);
    const dealValue = productMode === "new" ? Number(newProductPrice || 0) : Number(product?.product_price_including_gst || 0);
    const defaultToken = productMode === "new" ? Number(newProductDefaultToken || 0) : Number(product?.default_token_amount || 0);

    const fullStage = settingsByType("pipeline_stage").find(x => /full payment|enrolled/i.test(x.label))?.label || "Full Payment Received";
    const balStage = settingsByType("pipeline_stage").find(x => /balance pending/i.test(x.label))?.label || "Balance Pending";
    const finStage = settingsByType("pipeline_stage").find(x => /finance.*documents|emi.*documents/i.test(x.label))?.label || "Finance / EMI Documents Pending";
    const followStage = settingsByType("pipeline_stage").find(x => /payment follow/i.test(x.label))?.label || "Payment Follow-Up Pending";

    setRows(selectedSales.map((s, i) => {
      let token = defaultToken;
      let total = token;
      let stage = balStage;
      let financeReq = false;
      if (defaultPaymentModel === "Full Payment Collected") { token = dealValue; total = dealValue; stage = fullStage; }
      else if (defaultPaymentModel === "Token Collected + Finance / EMI") { stage = finStage; financeReq = true; }
      else if (defaultPaymentModel === "No Token Collected") { token = 0; total = 0; stage = followStage; }
      else if (defaultPaymentModel === "Partial Payment Collected") { stage = balStage; }
      else if (defaultPaymentModel === "Free Enrollment / Manual Approval") { token = 0; total = 0; stage = fullStage; }

      return {
        key: `${i}_${s.email || s.phone || s.name || i}`,
        sale: s,
        selected: true,
        deal_value: dealValue,
        token,
        total_collected: total,
        payment_model: defaultPaymentModel,
        pipeline_stage: stage,
        finance_required: financeReq,
        finance_partner: financeReq ? (settingsByType("finance_partner")[0]?.label || "") : "",
        follow_up_date: "",
        assigned: "",
      };
    }));
  }, [step]);

  const updateRow = (i: number, patch: Partial<RowEdit>) =>
    setRows(rs => rs.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, ...patch };
      next.total_collected = Math.max(0, Math.min(next.deal_value, Number(next.token || 0)));
      if (next.payment_model === "Full Payment Collected") next.total_collected = next.deal_value;
      if (next.payment_model === "No Token Collected") { next.token = 0; next.total_collected = 0; }
      return next;
    }));

  const balance = (r: RowEdit) => Math.max(0, r.deal_value - r.total_collected);

  const canNext = () => {
    if (step === 0) return !!(batchMode === "existing" ? existingBatchId : (batchName && batchWebName));
    if (step === 1) {
      if (productMode === "existing") return !!existingProductId;
      return !!(newProductName && newProductPrice > 0);
    }
    if (step === 2) return !!defaultPaymentModel;
    if (step === 3) return rows.some(r => r.selected);
    return true;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let batchId = existingBatchId;
      if (batchMode === "new") {
        const batchPayload: any = {
          batch_name: batchName, webinar_name: batchWebName, webinar_date: batchWebDate || null,
          webinar_type: batchWebType || null, business_unit: batchBU, offer_name: batchOffer || null,
          source_attribution_report_id: sessionId,
          source_attribution_session_id: sessionId,
          source_report_type: "attribution",
          source_created_from: "attribution_report",
          created_by: user?.id,
        };
        let { data, error } = await supabase.from("webinar_batches").insert(batchPayload).select("id").single();
        if (error && /source_attribution_report_id|schema cache|column.*does not exist/i.test(error.message || "")) {
          // Fallback: schema cache lag — retry without optional source fields
          delete batchPayload.source_attribution_report_id;
          delete batchPayload.source_attribution_session_id;
          delete batchPayload.source_report_type;
          delete batchPayload.source_created_from;
          ({ data, error } = await supabase.from("webinar_batches").insert(batchPayload).select("id").single());
        }
        if (error) throw error;
        batchId = data!.id;
      }

      let productId = existingProductId;
      let productName = "";
      let dealValue = 0;
      if (productMode === "new") {
        // Duplicate prevention: same product_name + business_unit
        const dupName = newProductName.trim().toLowerCase();
        const existingProd = products.find(p => (p.product_name || "").trim().toLowerCase() === dupName && (p.business_unit || "") === batchBU);
        if (existingProd) {
          productId = existingProd.id;
          productName = existingProd.product_name;
          dealValue = Number(existingProd.product_price_including_gst || 0);
          toast.message("Reusing existing product with same name");
        } else {
          const { data, error } = await supabase.from("program_products").insert({
            product_name: newProductName, business_unit: batchBU,
            product_price_including_gst: newProductPrice, currency: newProductCurrency,
            gst_applicable: newProductGstApplicable, gst_rate: newProductGstRate,
            default_token_amount: newProductDefaultToken,
            revenue_recognition_rule: newProductRevRule,
            created_by: user?.id,
          } as any).select("*").single();
          if (error) throw error;
          productId = data!.id;
          productName = data!.product_name;
          dealValue = Number(data!.product_price_including_gst || 0);
        }
      } else {
        const p = products.find(x => x.id === productId);
        productName = p?.product_name || "";
        dealValue = Number(p?.product_price_including_gst || 0);
      }

      const { data: existing } = await supabase.from("paid_pipeline_leads")
        .select("id, attribution_sale_id, email, phone")
        .eq("attribution_session_id", sessionId)
        .eq("is_deleted", false);
      const dupKey = (s: SaleDetail) => `${(s.email || "").toLowerCase()}|${s.phone || ""}`;
      const existingKeys = new Set((existing || []).map((l: any) => `${(l.email || "").toLowerCase()}|${l.phone || ""}`));

      let created = 0, skipped = 0;
      const selected = rows.filter(r => r.selected);
      for (const r of selected) {
        const k = dupKey(r.sale);
        if (existingKeys.has(k) && duplicateMode === "skip") { skipped++; continue; }

        const { data: leadRow, error: leadErr } = await supabase.from("paid_pipeline_leads").insert({
          webinar_batch_id: batchId,
          attribution_session_id: sessionId,
          attributed_media_buyer: r.sale.attributedTo,
          match_method: r.sale.matchMethod,
          source_webinar: payload.webinarName,
          source_report_date: payload.webinarDate || null,
          name: r.sale.name || null, email: r.sale.email || null, phone: r.sale.phone || null,
          business_unit: batchBU,
          product_id: productId, product_name_snapshot: productName,
          deal_value_including_gst: r.deal_value || dealValue,
          default_token_amount: r.token,
          token_amount_collected: r.token,
          total_collected: r.total_collected,
          balance_pending: Math.max(0, r.deal_value - r.total_collected),
          payment_model: r.payment_model,
          payment_status: r.total_collected >= r.deal_value && r.deal_value > 0 ? "Full Payment Received" : (r.token > 0 ? "Token Received" : "No Payment"),
          pipeline_stage: r.pipeline_stage,
          finance_required: r.finance_required,
          finance_partner: r.finance_required ? (r.finance_partner || null) : null,
          finance_status: r.finance_required ? "Documents Pending" : null,
          assigned_sales_executive: r.assigned || null,
          follow_up_date: r.follow_up_date || null,
          is_final_sale: r.payment_model === "Full Payment Collected",
          is_enrolled: r.payment_model === "Full Payment Collected" || r.payment_model === "Free Enrollment / Manual Approval",
          created_from_attribution: true,
          created_by: user?.id,
        } as any).select("id").single();
        if (leadErr) { console.error(leadErr); continue; }

        if (r.token > 0) {
          await supabase.from("paid_pipeline_payments").insert({
            paid_pipeline_lead_id: leadRow!.id,
            payment_type: r.payment_model === "Full Payment Collected" ? "Full Payment" : "Token",
            amount: r.token,
            payment_date: payload.webinarDate ? String(payload.webinarDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
            payment_mode: "Unknown",
            is_token: r.payment_model !== "Full Payment Collected",
            is_final_payment: r.payment_model === "Full Payment Collected",
            created_by: user?.id,
          } as any);
        }

        await supabase.from("paid_pipeline_activity_logs").insert({
          paid_pipeline_lead_id: leadRow!.id,
          activity_type: "created_from_attribution",
          note: `Sent from attribution report: ${payload.webinarName}`,
          created_by: user?.id,
        } as any);

        logActivity({
          module_key: "paid_pipeline", module_label: "Paid Pipeline",
          action_type: "paid_pipeline_lead_created", action_label: "Paid pipeline lead created",
          entity_type: "paid_pipeline_lead", entity_id: leadRow!.id, entity_label: r.sale.name || r.sale.email || undefined,
          new_values: {
            name: r.sale.name, email: r.sale.email, phone: r.sale.phone,
            product: productName, batch: batchId, source_webinar: payload.webinarName,
            token: r.token, deal_value: r.deal_value || dealValue,
          },
          metadata: { source_module: "attribution", media_buyer: r.sale.attributedTo },
          summary: `Lead ${r.sale.name || r.sale.email || "(unnamed)"} created from ${payload.webinarName}.`,
        });

        created++;
      }

      setResult({ created, skipped });
      toast.success(`Sent ${created} buyer${created === 1 ? "" : "s"} to Paid Pipeline${skipped ? ` · ${skipped} duplicates skipped` : ""}`);
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to send to Paid Pipeline");
    } finally {
      setBusy(false);
    }
  };

  const goldBtn = "h-9 px-4 bg-black text-white text-[12.5px] rounded-md hover:opacity-90 disabled:opacity-40 font-sans";
  const ghostBtn = "h-9 px-4 border border-line text-black text-[12.5px] rounded-md hover:bg-off font-sans disabled:opacity-40";
  const inputCls = "h-9 w-full border border-line rounded-md px-2.5 text-[12.5px] focus:outline-none focus:border-gold font-sans";
  const labelCls = "block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-1 font-sans";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[920px] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-white border-b border-line px-6 py-4">
          <div className="font-serif text-[22px] text-black">Send Sales to Paid Pipeline</div>
          <div className="font-sans text-[12px] font-light text-muted-foreground mt-1">
            Move attribution sales/token buyers into CRM to track payment, finance/EMI, balance pending, and final sale status.
          </div>
          <div className="flex gap-1 mt-4">
            {STEPS.map((label, i) => (
              <div key={label} className="flex-1">
                <div className={"h-1 rounded " + (i <= step ? "bg-gold" : "bg-line")} />
                <div className={"text-[10px] mt-1.5 font-sans uppercase tracking-[0.08em] " + (i === step ? "text-black" : "text-muted-foreground")}>
                  {i + 1}. {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-5">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button onClick={() => setBatchMode("new")} className={"h-8 px-3 rounded text-[12px] " + (batchMode === "new" ? "bg-black text-white" : "border border-line text-black")}>Create new batch</button>
                <button onClick={() => setBatchMode("existing")} className={"h-8 px-3 rounded text-[12px] " + (batchMode === "existing" ? "bg-black text-white" : "border border-line text-black")}>Use existing</button>
              </div>
              {batchMode === "existing" ? (
                <div>
                  <label className={labelCls}>Existing batch</label>
                  <select className={inputCls} value={existingBatchId} onChange={e => setExistingBatchId(e.target.value)}>
                    <option value="">Select…</option>
                    {batches.map(b => (
                      <option key={b.id} value={b.id}>{b.batch_name} · {b.webinar_name} · {b.webinar_date || "—"}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={labelCls}>Batch name</label>
                    <QuickSaveInput fieldKey="webinar_batch_name" value={batchName} onChange={setBatchName} placeholder="e.g. Diamond Webinar - 14 May 2026" height={36} />
                  </div>
                  <div>
                    <label className={labelCls}>Webinar name</label>
                    <QuickSaveInput fieldKey="webinar_name" value={batchWebName} onChange={setBatchWebName} height={36} />
                  </div>
                  <div><label className={labelCls}>Webinar date</label><input type="date" className={inputCls} value={batchWebDate} onChange={e => setBatchWebDate(e.target.value)} /></div>
                  <div>
                    <label className={labelCls}>Webinar type</label>
                    <QuickSaveInput fieldKey="webinar_type" value={batchWebType} onChange={setBatchWebType} height={36} />
                  </div>
                  <div>
                    <label className={labelCls}>Business unit / Coach</label>
                    <QuickSaveInput fieldKey="business_unit" value={batchBU} onChange={setBatchBU} height={36} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Offer name (optional)</label>
                    <QuickSaveInput fieldKey="offer_name" value={batchOffer} onChange={setBatchOffer} height={36} />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button onClick={() => setProductMode("existing")} className={"h-8 px-3 rounded text-[12px] " + (productMode === "existing" ? "bg-black text-white" : "border border-line text-black")}>Use existing product</button>
                <button onClick={() => setProductMode("new")} className={"h-8 px-3 rounded text-[12px] " + (productMode === "new" ? "bg-black text-white" : "border border-line text-black")}>Create new product</button>
              </div>
              {productMode === "existing" ? (
                <div>
                  <label className={labelCls}>Product / Program</label>
                  <select className={inputCls} value={existingProductId} onChange={e => setExistingProductId(e.target.value)}>
                    <option value="">Select…</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.product_name} · {inr(Number(p.product_price_including_gst || 0))} · token {inr(Number(p.default_token_amount || 0))}</option>
                    ))}
                  </select>
                  {products.length === 0 && <div className="text-[11px] text-muted-foreground mt-2">No products yet. Switch to "Create new product".</div>}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={labelCls}>Product name</label>
                    <QuickSaveInput fieldKey="program_product_name" value={newProductName} onChange={setNewProductName} placeholder="e.g. Diamond Program" height={36} />
                  </div>
                  <div><label className={labelCls}>Price including GST</label><input type="number" className={inputCls} value={newProductPrice || ""} onChange={e => setNewProductPrice(Number(e.target.value))} /></div>
                  <div><label className={labelCls}>Currency</label><input className={inputCls} value={newProductCurrency} onChange={e => setNewProductCurrency(e.target.value)} /></div>
                  <div><label className={labelCls}>GST applicable</label>
                    <select className={inputCls} value={newProductGstApplicable ? "yes" : "no"} onChange={e => setNewProductGstApplicable(e.target.value === "yes")}>
                      <option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  </div>
                  <div><label className={labelCls}>GST rate (%)</label><input type="number" className={inputCls} value={newProductGstRate} onChange={e => setNewProductGstRate(Number(e.target.value))} /></div>
                  <div><label className={labelCls}>Default token amount</label><input type="number" className={inputCls} value={newProductDefaultToken || ""} onChange={e => setNewProductDefaultToken(Number(e.target.value))} /></div>
                  <div><label className={labelCls}>Revenue recognition rule</label>
                    <select className={inputCls} value={newProductRevRule} onChange={e => setNewProductRevRule(e.target.value)}>
                      {(settingsByType("revenue_recognition_rule").length ? settingsByType("revenue_recognition_rule").map(s => s.label) : ["Token Collected Only", "Full Deal Value", "Realized Revenue Only", "Finance Approved Amount"]).map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className={labelCls}>How was payment collected for these buyers?</div>
              {(settingsByType("payment_model").length ? settingsByType("payment_model").map(s => s.label) : [
                "Full Payment Collected", "Token Collected + Balance Later", "Token Collected + Finance / EMI",
                "Partial Payment Collected", "No Token Collected", "Free Enrollment / Manual Approval",
              ]).map(label => (
                <label key={label} className={"flex items-center gap-3 px-3 py-2.5 border rounded-md cursor-pointer text-[13px] " + (defaultPaymentModel === label ? "border-gold bg-gold-pale" : "border-line hover:bg-off")}>
                  <input type="radio" checked={defaultPaymentModel === label} onChange={() => setDefaultPaymentModel(label)} />
                  {label}
                </label>
              ))}
              <div className="text-[11px] text-muted-foreground mt-2">You can override per-buyer in the next step.</div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="flex gap-2 mb-3 text-[12px]">
                <button onClick={() => setRows(rs => rs.map(r => ({ ...r, selected: true })))} className={ghostBtn + " h-8 px-3"}>Select all</button>
                <button onClick={() => setRows(rs => rs.map(r => ({ ...r, selected: r.sale.matchMethod !== "unmatched" })))} className={ghostBtn + " h-8 px-3"}>Matched only</button>
                <button onClick={() => setRows(rs => rs.map(r => ({ ...r, selected: false })))} className={ghostBtn + " h-8 px-3"}>Clear</button>
                <div className="ml-auto self-center text-[11px] text-muted-foreground">{rows.filter(r => r.selected).length} of {rows.length} selected</div>
              </div>
              <div className="border border-line rounded-md overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-off">
                    <tr className="text-left">
                      <th className="px-2 py-2 w-8"></th>
                      <th className="px-2 py-2">Buyer</th>
                      <th className="px-2 py-2">Media buyer</th>
                      <th className="px-2 py-2">Deal</th>
                      <th className="px-2 py-2">Token</th>
                      <th className="px-2 py-2">Total</th>
                      <th className="px-2 py-2">Balance</th>
                      <th className="px-2 py-2">Stage</th>
                      <th className="px-2 py-2">Finance</th>
                      <th className="px-2 py-2">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.key} className="border-t border-line">
                        <td className="px-2 py-2"><input type="checkbox" checked={r.selected} onChange={e => updateRow(i, { selected: e.target.checked })} /></td>
                        <td className="px-2 py-2">
                          <div className="font-medium">{r.sale.name || "—"}</div>
                          <div className="text-[10.5px] text-muted-foreground">{r.sale.email || r.sale.phone || "—"}</div>
                        </td>
                        <td className="px-2 py-2">{r.sale.attributedTo || <span className="text-[#CA8A04]">Unmatched</span>}</td>
                        <td className="px-2 py-2"><input type="number" className="w-24 h-7 border border-line rounded px-1.5 text-[12px]" value={r.deal_value} onChange={e => updateRow(i, { deal_value: Number(e.target.value) })} /></td>
                        <td className="px-2 py-2"><input type="number" className="w-24 h-7 border border-line rounded px-1.5 text-[12px]" value={r.token} onChange={e => updateRow(i, { token: Number(e.target.value) })} /></td>
                        <td className="px-2 py-2 whitespace-nowrap">{inr(r.total_collected)}</td>
                        <td className="px-2 py-2 whitespace-nowrap text-[#CA8A04]">{inr(balance(r))}</td>
                        <td className="px-2 py-2">
                          <select className="h-7 border border-line rounded px-1 text-[11.5px]" value={r.pipeline_stage} onChange={e => updateRow(i, { pipeline_stage: e.target.value })}>
                            {(settingsByType("pipeline_stage").length ? settingsByType("pipeline_stage").map(s => s.label) : [r.pipeline_stage]).map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <label className="inline-flex items-center gap-1 text-[11.5px]">
                            <input type="checkbox" checked={r.finance_required} onChange={e => updateRow(i, { finance_required: e.target.checked })} />
                            Yes
                          </label>
                          {r.finance_required && (
                            <select className="block mt-1 h-7 border border-line rounded px-1 text-[11.5px]" value={r.finance_partner} onChange={e => updateRow(i, { finance_partner: e.target.value })}>
                              {(settingsByType("finance_partner").length ? settingsByType("finance_partner").map(s => s.label) : ["Bajaj Finance", "Razorpay EMI", "Other"]).map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-2 py-2"><input type="date" className="h-7 border border-line rounded px-1.5 text-[12px]" value={r.follow_up_date} onChange={e => updateRow(i, { follow_up_date: e.target.value })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {!result ? (
                <>
                  <div className="border border-line rounded-md p-4 bg-off">
                    <div className="text-[13px]"><strong>Ready to send {rows.filter(r => r.selected).length} buyers</strong> to Paid Pipeline.</div>
                    <div className="text-[11.5px] text-muted-foreground mt-1">Duplicates will be detected by email/phone within this attribution report.</div>
                  </div>
                  <div>
                    <div className={labelCls}>If a duplicate is found</div>
                    <div className="flex gap-2">
                      <button onClick={() => setDuplicateMode("skip")} className={"h-8 px-3 rounded text-[12px] " + (duplicateMode === "skip" ? "bg-black text-white" : "border border-line")}>Skip duplicate</button>
                      <button onClick={() => setDuplicateMode("create_anyway")} className={"h-8 px-3 rounded text-[12px] " + (duplicateMode === "create_anyway" ? "bg-black text-white" : "border border-line")}>Create anyway</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="border border-line rounded-md p-6 text-center">
                  <div className="font-serif text-[24px] text-black mb-2">Done</div>
                  <div className="text-[13px]">{result.created} buyers created · {result.skipped} duplicates skipped</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-line px-6 py-3 flex justify-between">
          <button className={ghostBtn} onClick={() => (step === 0 ? onOpenChange(false) : setStep(s => s - 1))} disabled={busy}>
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < 4 ? (
            <button className={goldBtn} onClick={() => setStep(s => s + 1)} disabled={!canNext()}>Continue</button>
          ) : !result ? (
            <button className={goldBtn} onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send to Paid Pipeline"}</button>
          ) : (
            <button className={goldBtn} onClick={() => onOpenChange(false)}>Close</button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
