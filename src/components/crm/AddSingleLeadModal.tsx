import { useEffect, useMemo, useState } from "react";
import { X, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/auditLog";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import { recomputePaidLead, DEFAULT_PAYMENT_MODES, DEFAULT_PAYMENT_CATEGORIES } from "@/lib/paidPipeline";
import { createTag, assignTag } from "@/lib/leadTags";
import type { Pipeline, Stage, LeadGrade } from "@/lib/crmTypes";

// Validation schema — name-only is allowed (warned in UI), but any provided email/phone must be valid.
const phoneRegex = /^[0-9+\-\s()]{7,20}$/;
const baseLeadSchema = z.object({
  fullName: z.string().trim().max(120, "Name too long (max 120)").optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(255, "Email too long")
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(20, "Phone too long")
    .regex(phoneRegex, "Invalid phone number")
    .optional()
    .or(z.literal("")),
  country: z.string().trim().max(120, "Too long").optional().or(z.literal("")),
  notes: z.string().trim().max(2000, "Notes too long (max 2000)").optional().or(z.literal("")),
  programName: z.string().trim().max(200, "Program name too long").optional().or(z.literal("")),
  dealValue: z.number().nonnegative("Deal value must be ≥ 0").max(100_000_000, "Deal value too large").optional(),
}).refine(
  (v) => !!(v.fullName?.trim() || v.email?.trim() || v.phone?.trim()),
  { path: ["fullName"], message: "Provide at least a name, email, or phone" },
);

const paidLeadSchema = baseLeadSchema.and(
  z.object({
    programName: z.string().trim().min(1, "Program is required for paid leads").max(200),
    dealValue: z.number().positive("Paid leads require a deal value > 0"),
    tokenCollected: z.number().nonnegative().optional(),
    totalCollected: z.number().nonnegative().optional(),
  }),
);

interface Props {
  pipelines: Pipeline[];
  stages: Stage[];
  defaultPipelineId?: string | null;
  onClose: () => void;
  onCreated: (leadId: string, openDrawer: boolean) => void;
}

type LeadType = "unpaid" | "paid";

const GRADES: { v: LeadGrade; label: string }[] = [
  { v: "super-hot", label: "★ Super Hot" },
  { v: "hot", label: "Hot" },
  { v: "warm", label: "Warm" },
  { v: "cold", label: "Cold" },
  { v: "non-attendee", label: "No Show" },
];

function normEmail(s: string) {
  return s.trim().toLowerCase();
}
function normPhone(s: string) {
  const d = (s || "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

export default function AddSingleLeadModal({ pipelines, stages, defaultPipelineId, onClose, onCreated }: Props) {
  const { profile, isAdmin } = useAuth();
  const [leadType, setLeadType] = useState<LeadType>("unpaid");

  // Selected pipeline defaults
  const initialPipeline = useMemo(() => {
    if (defaultPipelineId && pipelines.find((p) => p.id === defaultPipelineId)) return defaultPipelineId;
    return pipelines[0]?.id ?? "";
  }, [defaultPipelineId, pipelines]);

  const [pipelineId, setPipelineId] = useState<string>(initialPipeline);
  const [stageId, setStageId] = useState<string>("");
  const [batchName, setBatchName] = useState("");
  const [webinarName, setWebinarName] = useState("");
  const [webinarDate, setWebinarDate] = useState("");
  const [grade, setGrade] = useState<LeadGrade>("warm");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");

  const [programName, setProgramName] = useState("");
  const [dealValue, setDealValue] = useState<string>("");
  const [sourceTxt, setSourceTxt] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  // Assignment
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [assignMode, setAssignMode] = useState<"unassigned" | "me" | "member">("unassigned");
  const [assigneeId, setAssigneeId] = useState<string>("");

  // Paid details
  const [tokenCollected, setTokenCollected] = useState<string>("");
  const [totalCollected, setTotalCollected] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<string>("UPI");
  const [paymentCategory, setPaymentCategory] = useState<string>("Token Amount");
  const [financeStatus, setFinanceStatus] = useState<string>("Not Required");
  const [revenueRule, setRevenueRule] = useState<string>("Realized Revenue Only");
  const [createPaidBuyer, setCreatePaidBuyer] = useState<boolean>(true);

  // Duplicate
  const [dupCheckBusy, setDupCheckBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<any | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<"email" | "phone" | null>(null);
  const [dupAction, setDupAction] = useState<"update" | "move" | "create" | null>(null);

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validateForm() {
    const schema = leadType === "paid" ? paidLeadSchema : baseLeadSchema;
    const result = schema.safeParse({
      fullName,
      email,
      phone,
      country,
      notes,
      programName,
      dealValue: dealValue === "" ? undefined : Number(dealValue),
      tokenCollected: tokenCollected === "" ? undefined : Number(tokenCollected),
      totalCollected: totalCollected === "" ? undefined : Number(totalCollected),
    });
    if (result.success) return { ok: true as const };
    const errs: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as string;
      if (key && !errs[key]) errs[key] = issue.message;
    }
    return { ok: false as const, errors: errs };
  }

  useEffect(() => {
    getEligibleAssignees("calling_crm").then((list) => setAgents(list as any)).catch(() => {});
  }, []);

  // Reset stage when pipeline changes
  useEffect(() => {
    const sList = stages.filter((s) => s.pipeline_id === pipelineId).sort((a, b) => a.position - b.position);
    if (!sList.find((s) => s.id === stageId)) {
      setStageId(sList[0]?.id ?? "");
    }
  }, [pipelineId, stages]); // eslint-disable-line

  // Infer lead type from selected pipeline
  useEffect(() => {
    const p = pipelines.find((x) => x.id === pipelineId);
    if (p?.type === "paid") setLeadType("paid");
  }, [pipelineId, pipelines]);

  const pipelineStages = useMemo(
    () => stages.filter((s) => s.pipeline_id === pipelineId).sort((a, b) => a.position - b.position),
    [stages, pipelineId],
  );

  // Live duplicate check (debounced)
  useEffect(() => {
    const e = normEmail(email);
    const p = normPhone(phone);
    if (!e && !p) {
      setDuplicate(null);
      setDuplicateMatch(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setDupCheckBusy(true);
      try {
        let match: any = null;
        let matchedBy: "email" | "phone" | null = null;
        if (e) {
          const { data } = await supabase
            .from("leads")
            .select("id, full_name, email, phone, pipeline_id, stage_id, assigned_agent_id, archived_at, paid_pipeline_lead_id")
            .eq("email", e)
            .limit(1);
          if (data && data[0]) { match = data[0]; matchedBy = "email"; }
        }
        if (!match && p) {
          const { data } = await supabase
            .from("leads")
            .select("id, full_name, email, phone, pipeline_id, stage_id, assigned_agent_id, archived_at, paid_pipeline_lead_id")
            .ilike("phone", `%${p}`)
            .limit(1);
          if (data && data[0]) { match = data[0]; matchedBy = "phone"; }
        }
        if (cancelled) return;
        setDuplicate(match);
        setDuplicateMatch(matchedBy);
        if (match) setDupAction("update");
      } finally {
        if (!cancelled) setDupCheckBusy(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [email, phone]);

  const minKeyOk = !!(fullName.trim() || email.trim() || phone.trim());
  const nameOnly = !!fullName.trim() && !email.trim() && !phone.trim();
  const paidOk = leadType !== "paid" || (!!programName.trim() && Number(dealValue || 0) > 0);
  const canSave = minKeyOk && !!pipelineId && !!stageId && paidOk && !busy &&
    (!duplicate || dupAction !== null) &&
    (dupAction !== "create" || isAdmin);

  async function resolveAgentId(): Promise<string | null> {
    if (assignMode === "me") return profile?.id ?? null;
    if (assignMode === "member") return assigneeId || null;
    return null;
  }

  async function applyTags(crmLeadId: string, paidLeadId: string | null) {
    const names = new Set<string>();
    tagsInput.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => names.add(t));
    if (leadType === "paid") {
      names.add("Paid");
      if (Number(tokenCollected || 0) > 0) names.add("Token Paid");
      const bal = Math.max(0, Number(dealValue || 0) - Number(totalCollected || 0));
      if (bal > 0) names.add("Balance Pending");
    }
    for (const n of names) {
      try {
        const tag = await createTag(n);
        if (tag?.id) await assignTag(tag.id, { crmLeadId, paidLeadId });
      } catch (e) { /* ignore */ }
    }
  }

  async function handleSave(openDrawerAfter: boolean) {
    if (!canSave) return;
    const v = validateForm();
    if (!v.ok) {
      setErrors(v.errors);
      const first = Object.values(v.errors)[0];
      toast.error(typeof first === "string" ? first : "Please fix the highlighted fields");
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const e = normEmail(email);
      const p = phone.trim();
      const agentId = await resolveAgentId();
      const sel = pipelines.find((x) => x.id === pipelineId);
      const pipelineType = sel?.type;

      let crmLeadId: string | null = null;
      let usedExisting = false;
      let auditAction: string = "crm_single_lead_created";

      // 1) Handle duplicate
      if (duplicate && dupAction !== "create") {
        const patch: any = {
          pipeline_id: pipelineId,
          stage_id: stageId,
          lead_type: leadType,
          grade,
          program_name: programName || undefined,
          deal_value: dealValue ? Number(dealValue) : undefined,
          webinar_source: batchName || undefined,
          webinar_name: webinarName || batchName || undefined,
          webinar_date: webinarDate || undefined,
          ...(agentId ? { assigned_agent_id: agentId } : {}),
          ...(duplicate.archived_at ? { archived_at: null, archived_by: null, archive_reason: null } : {}),
        };
        if (dupAction === "update") {
          if (fullName.trim()) patch.full_name = fullName.trim();
          if (e) patch.email = e;
          if (p) patch.phone = p;
          if (country.trim()) patch.country = country.trim();
        }
        // Remove undefined keys
        Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
        const { error } = await supabase.from("leads").update(patch).eq("id", duplicate.id);
        if (error) throw error;
        crmLeadId = duplicate.id;
        usedExisting = true;
        auditAction = dupAction === "update" ? "crm_single_lead_updated_existing" : "crm_single_lead_moved_existing";
      } else {
        // 2) Insert new
        const payload: any = {
          full_name: fullName.trim() || null,
          email: e || null,
          phone: p || null,
          country: country.trim() || null,
          score: 0,
          grade,
          webinar_source: batchName || sourceTxt || null,
          webinar_date: webinarDate || null,
          webinar_name: webinarName || batchName || null,
          pipeline_id: pipelineId,
          stage_id: stageId,
          assigned_agent_id: agentId,
          lead_type: leadType,
          program_name: programName || "",
          deal_value: Number(dealValue || 0),
          total_minutes: 0,
          attendance_pct: 0,
          sessions_count: 0,
          is_super_hot: grade === "super-hot",
          lead_source_type: "manual_single_add",
        };
        const { data, error } = await supabase.from("leads").insert(payload).select("id").maybeSingle();
        if (error) throw error;
        crmLeadId = data?.id ?? null;
        if (duplicate && dupAction === "create") {
          auditAction = "single_lead_duplicate_override_created";
        }
      }

      if (!crmLeadId) throw new Error("Lead creation failed");

      // 3) Notes → activity log entry
      if (notes.trim()) {
        await supabase.from("activity_logs").insert({
          lead_id: crmLeadId,
          agent_id: profile?.id ?? null,
          agent_name: profile?.full_name ?? null,
          channel: "note",
          note: notes.trim(),
        } as any);
      }

      // 4) Paid pipeline buyer
      let paidLeadId: string | null = null;
      if (leadType === "paid" && createPaidBuyer) {
        // Look for existing buyer to link
        let existing: any = null;
        if (usedExisting && duplicate?.paid_pipeline_lead_id) {
          const { data } = await supabase.from("paid_pipeline_leads")
            .select("id").eq("id", duplicate.paid_pipeline_lead_id).maybeSingle();
          existing = data;
        }
        if (!existing && e) {
          const { data } = await supabase.from("paid_pipeline_leads")
            .select("id").eq("email", e).eq("is_deleted", false).maybeSingle();
          existing = data;
        }
        if (!existing && p) {
          const { data } = await supabase.from("paid_pipeline_leads")
            .select("id").eq("phone", p).eq("is_deleted", false).maybeSingle();
          existing = data;
        }

        const tok = Number(tokenCollected || 0);
        const tot = Number(totalCollected || 0);
        const deal = Number(dealValue || 0);
        const buyerPayload: any = {
          name: fullName.trim() || null,
          email: e || null,
          phone: p || null,
          product_name_snapshot: programName || null,
          deal_value_including_gst: deal,
          token_amount_collected: tok,
          total_collected: tot,
          balance_pending: Math.max(0, deal - tot),
          source_webinar: batchName || null,
          pipeline_stage: "Payment Confirmed",
          payment_status: tot >= deal && deal > 0 ? "Full Payment Received" : (tok > 0 ? "Token Received" : "No Payment"),
          finance_status: financeStatus !== "Not Required" ? financeStatus : null,
          revenue_recognition_rule: revenueRule,
          assigned_sales_executive: agentId,
          crm_lead_id: crmLeadId,
        };

        if (existing) {
          await supabase.from("paid_pipeline_leads").update(buyerPayload).eq("id", existing.id);
          paidLeadId = existing.id;
          logActivity({
            module_key: "paid_pipeline",
            action_type: "paid_pipeline_buyer_linked_from_single_lead",
            entity_type: "paid_pipeline_lead",
            entity_id: paidLeadId,
            entity_label: fullName || e || p,
            metadata: { crm_lead_id: crmLeadId, source: "manual_single_add" },
            summary: `Linked existing Paid Pipeline buyer from manual single-lead add.`,
          });
        } else {
          buyerPayload.created_by = profile?.id ?? null;
          const { data: ins, error: insErr } = await supabase
            .from("paid_pipeline_leads").insert(buyerPayload).select("id").maybeSingle();
          if (insErr) throw insErr;
          paidLeadId = ins?.id ?? null;
          if (paidLeadId) {
            logActivity({
              module_key: "paid_pipeline",
              action_type: "paid_pipeline_buyer_created_from_single_lead",
              entity_type: "paid_pipeline_lead",
              entity_id: paidLeadId,
              entity_label: fullName || e || p,
              metadata: { crm_lead_id: crmLeadId, source: "manual_single_add" },
              summary: `Created Paid Pipeline buyer from manual single-lead add.`,
            });
          }
        }

        if (paidLeadId) {
          await supabase.from("leads").update({ paid_pipeline_lead_id: paidLeadId } as any).eq("id", crmLeadId);

          // Optional payment
          if (tok > 0 || tot > 0) {
            const payAmount = tok > 0 ? tok : tot;
            const isToken = tok > 0;
            const { error: payErr } = await supabase.from("paid_pipeline_payments").insert({
              paid_pipeline_lead_id: paidLeadId,
              payment_type: isToken ? "Token" : "Full Payment",
              payment_category: paymentCategory || (isToken ? "Token Amount" : "Full Payment"),
              amount: payAmount,
              payment_date: paymentDate || new Date().toISOString().slice(0, 10),
              payment_mode: paymentMode || "Unknown",
              is_token: isToken,
              is_final_payment: !isToken && tot >= deal && deal > 0,
              created_by: profile?.id ?? null,
            } as any);
            if (!payErr) {
              logActivity({
                module_key: "paid_pipeline",
                action_type: "single_lead_payment_recorded",
                entity_type: "paid_pipeline_lead",
                entity_id: paidLeadId,
                entity_label: fullName || e || p,
                metadata: { amount: payAmount, mode: paymentMode, category: paymentCategory, source: "manual_single_add" },
                summary: `Recorded ${isToken ? "token" : "payment"} of ₹${payAmount} from manual single-lead add.`,
              });
            }
            await recomputePaidLead(paidLeadId);
          }
        }
      }

      // 5) Tags
      await applyTags(crmLeadId, paidLeadId);

      // 6) Audit log for CRM
      logActivity({
        module_key: "calling_crm",
        action_type: auditAction,
        entity_type: "crm_lead",
        entity_id: crmLeadId,
        entity_label: fullName || e || p,
        metadata: {
          pipeline_id: pipelineId,
          stage_id: stageId,
          assigned_agent_id: agentId,
          lead_type: leadType,
          duplicate_match_type: duplicateMatch,
          paid_pipeline_lead_id: paidLeadId,
          source: "manual_single_add",
        },
        summary: usedExisting
          ? `Manual single-add ${dupAction === "move" ? "moved" : "updated"} existing CRM lead.`
          : `Manual single-add created new CRM lead in ${sel?.name ?? ""}.`,
      });

      toast.success(usedExisting ? "Existing lead updated" : "Lead added successfully");
      if (leadType === "paid" && createPaidBuyer) toast.success("Paid buyer linked successfully");
      onCreated(crmLeadId, openDrawerAfter);
    } catch (err: any) {
      console.error("[AddSingleLeadModal] save error", err);
      toast.error(err?.message || "Failed to add lead");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-line px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold">Add Lead</h2>
            <p className="text-[11px] text-muted-foreground">Quickly create a single CRM lead — paid or unpaid.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-black p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Lead Type */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Lead Type</label>
            <div className="flex gap-2 mt-1">
              {(["unpaid", "paid"] as LeadType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setLeadType(t)}
                  className={`px-3 py-1.5 rounded-md text-xs border ${leadType === t ? "bg-black text-white border-black" : "border-line bg-white text-muted-foreground hover:text-black"}`}
                >
                  {t === "paid" ? "Paid lead" : "Unpaid lead"}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline / Stage / Batch / Grade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Pipeline *</label>
              <select className="ipc-input !h-9 !text-xs w-full mt-1" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                <option value="">Select pipeline…</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Stage *</label>
              <select className="ipc-input !h-9 !text-xs w-full mt-1" value={stageId} onChange={(e) => setStageId(e.target.value)}>
                <option value="">Select stage…</option>
                {pipelineStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Batch / Segment</label>
              <input className="ipc-input !h-9 !text-xs w-full mt-1" value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g. Oct Webinar" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Webinar / Source name</label>
              <input className="ipc-input !h-9 !text-xs w-full mt-1" value={webinarName} onChange={(e) => setWebinarName(e.target.value)} placeholder="Webinar / campaign name" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Webinar date</label>
              <input type="date" className="ipc-input !h-9 !text-xs w-full mt-1" value={webinarDate} onChange={(e) => setWebinarDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Grade / Temperature</label>
              <select className="ipc-input !h-9 !text-xs w-full mt-1" value={grade} onChange={(e) => setGrade(e.target.value as LeadGrade)}>
                {GRADES.map((g) => <option key={g.v} value={g.v}>{g.label}</option>)}
              </select>
            </div>
          </div>

          {/* Basic Details */}
          <div>
            <div className="text-xs font-semibold mb-2">Basic Details</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input maxLength={120} className="ipc-input !h-9 !text-xs w-full" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
                {errors.fullName && <div className="text-[11px] text-[#DC2626] mt-0.5">{errors.fullName}</div>}
              </div>
              <div>
                <input maxLength={20} className="ipc-input !h-9 !text-xs w-full" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
                {errors.phone && <div className="text-[11px] text-[#DC2626] mt-0.5">{errors.phone}</div>}
              </div>
              <div>
                <input maxLength={255} className="ipc-input !h-9 !text-xs w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
                {errors.email && <div className="text-[11px] text-[#DC2626] mt-0.5">{errors.email}</div>}
              </div>
              <input maxLength={120} className="ipc-input !h-9 !text-xs" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="City / State / Country" />
              <div className="col-span-2">
                <textarea maxLength={2000} className="ipc-input !text-xs w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (logged as the first activity)" />
                {errors.notes && <div className="text-[11px] text-[#DC2626] mt-0.5">{errors.notes}</div>}
              </div>
            </div>
            {!minKeyOk && (
              <div className="text-[11px] text-[#DC2626] mt-1">Add at least a name, phone, or email.</div>
            )}
            {nameOnly && (
              <div className="text-[11px] text-[#92400E] bg-[#FEF3C7] border border-[#FDE68A] rounded-md px-2 py-1 mt-1">
                Name-only lead — please add phone/email later for follow-up and duplicate matching.
              </div>
            )}
          </div>

          {/* Duplicate panel */}
          {dupCheckBusy && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking for duplicates…</div>
          )}
          {duplicate && (() => {
            const targetPipelineName = pipelines.find((p) => p.id === pipelineId)?.name || "selected pipeline";
            const targetStageName = pipelineStages.find((s) => s.id === stageId)?.name || "selected stage";
            const samePlace = duplicate.pipeline_id === pipelineId && duplicate.stage_id === stageId;
            return (
              <div className="rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs">
                <div className="flex items-center gap-1 font-medium text-[#92400E]">
                  <AlertTriangle className="w-3.5 h-3.5" /> Possible existing lead found (matched by {duplicateMatch})
                </div>
                <div className="mt-1 text-[#92400E]">
                  <div><b>{duplicate.full_name || "—"}</b> · {duplicate.email || "—"} · {duplicate.phone || "—"}</div>
                  <div className="text-[10px] opacity-80">
                    Currently in: {pipelines.find((p) => p.id === duplicate.pipeline_id)?.name || "—"} ·
                    {" "}{stages.find((s) => s.id === duplicate.stage_id)?.name || "—"} ·
                    {duplicate.archived_at ? " archived" : " active"}
                    {duplicate.paid_pipeline_lead_id ? " · linked to Paid Pipeline" : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    className="px-2 py-1 rounded-md text-[11px] border border-line inline-flex items-center gap-1 bg-white hover:bg-off"
                    onClick={() => { onCreated(duplicate.id, true); onClose(); }}
                  >
                    <ExternalLink className="w-3 h-3" /> Open existing
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-1 rounded-md text-[11px] border ${dupAction === "update" ? "bg-black text-white border-black" : "border-line"}`}
                    onClick={() => setDupAction("update")}
                  >
                    Update existing
                  </button>
                  <button
                    type="button"
                    disabled={samePlace}
                    title={samePlace ? "Already in selected pipeline/stage" : undefined}
                    className={`px-2 py-1 rounded-md text-[11px] border disabled:opacity-50 ${dupAction === "move" ? "bg-black text-white border-black" : "border-line"}`}
                    onClick={() => setDupAction("move")}
                  >
                    Move to {targetPipelineName} · {targetStageName}
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      className={`px-2 py-1 rounded-md text-[11px] border ${dupAction === "create" ? "bg-[#DC2626] text-white border-[#DC2626]" : "border-line text-[#DC2626]"}`}
                      onClick={() => setDupAction("create")}
                    >
                      Create anyway (admin)
                    </button>
                  ) : (
                    <span className="px-2 py-1 rounded-md text-[11px] border border-dashed border-line text-muted-foreground">
                      Create anyway — admin only
                    </span>
                  )}
                </div>
                {dupAction === "create" && isAdmin && (
                  <div className="mt-2 text-[10px] text-[#DC2626]">
                    A duplicate CRM lead will be created. This action is logged in the audit trail.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Program */}
          <div>
            <div className="text-xs font-semibold mb-2">Program Details</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input maxLength={200} className="ipc-input !h-9 !text-xs w-full" value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder={`Program / product${leadType === "paid" ? " *" : ""}`} />
                {errors.programName && <div className="text-[11px] text-[#DC2626] mt-0.5">{errors.programName}</div>}
              </div>
              <div>
                <input className="ipc-input !h-9 !text-xs w-full" inputMode="decimal" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder={`Deal value (₹)${leadType === "paid" ? " *" : ""}`} />
                {errors.dealValue && <div className="text-[11px] text-[#DC2626] mt-0.5">{errors.dealValue}</div>}
              </div>
              <input maxLength={120} className="ipc-input !h-9 !text-xs" value={sourceTxt} onChange={(e) => setSourceTxt(e.target.value)} placeholder="Source (optional)" />
              <input maxLength={250} className="ipc-input !h-9 !text-xs" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="Tags (comma separated)" />
            </div>
            {leadType === "paid" && !paidOk && (
              <div className="text-[11px] text-[#DC2626] mt-1">Paid leads require program/product and a deal value &gt; 0.</div>
            )}
          </div>

          {/* Assignment */}
          <div>
            <div className="text-xs font-semibold mb-2">Assignment</div>
            <div className="flex flex-wrap gap-2 items-center">
              {([["unassigned", "Keep unassigned"], ["me", "Assign to me"], ["member", "Assign to member"]] as [any, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setAssignMode(k)} className={`px-2.5 py-1 rounded-md text-[11px] border ${assignMode === k ? "bg-black text-white border-black" : "border-line"}`}>{l}</button>
              ))}
              {assignMode === "member" && (
                <select className="ipc-input !h-8 !text-xs" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">Select member…</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Paid details */}
          {leadType === "paid" && (
            <div className="rounded-md border border-line bg-off p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold">Paid Details</div>
                <label className="text-[11px] inline-flex items-center gap-1">
                  <input type="checkbox" checked={createPaidBuyer} onChange={(e) => setCreatePaidBuyer(e.target.checked)} />
                  Create Paid Pipeline buyer
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground">Token collected (₹)</label>
                  <input className="ipc-input !h-9 !text-xs w-full" inputMode="decimal" value={tokenCollected} onChange={(e) => setTokenCollected(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Total collected (₹)</label>
                  <input className="ipc-input !h-9 !text-xs w-full" inputMode="decimal" value={totalCollected} onChange={(e) => setTotalCollected(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Balance pending</label>
                  <input className="ipc-input !h-9 !text-xs w-full bg-white" disabled value={Math.max(0, Number(dealValue || 0) - Number(totalCollected || 0)).toString()} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Payment date</label>
                  <input type="date" className="ipc-input !h-9 !text-xs w-full" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Payment mode</label>
                  <select className="ipc-input !h-9 !text-xs w-full" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                    {DEFAULT_PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Payment category</label>
                  <select className="ipc-input !h-9 !text-xs w-full" value={paymentCategory} onChange={(e) => setPaymentCategory(e.target.value)}>
                    {DEFAULT_PAYMENT_CATEGORIES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Finance status</label>
                  <select className="ipc-input !h-9 !text-xs w-full" value={financeStatus} onChange={(e) => setFinanceStatus(e.target.value)}>
                    {["Not Required", "Interested", "Documents Pending", "Documents Submitted", "Approved", "Disbursed", "Rejected"].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">Revenue recognition</label>
                  <select className="ipc-input !h-9 !text-xs w-full" value={revenueRule} onChange={(e) => setRevenueRule(e.target.value)}>
                    {["Realized Revenue Only", "Token Collected Only", "Full Deal Value", "Finance Approved Amount"].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mt-2">Token/payment details are optional. If entered, a payment record will be created and totals recomputed.</div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-line px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Cancel</button>
          <button
            onClick={() => handleSave(false)}
            disabled={!canSave}
            className="ipc-btn ipc-btn-ghost !h-9 !text-xs disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save Lead
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={!canSave}
            className="ipc-btn ipc-btn-black !h-9 !text-xs disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save & Open Drawer
          </button>
        </div>
      </div>
    </div>
  );
}
