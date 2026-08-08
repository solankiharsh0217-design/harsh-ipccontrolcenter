// Explicit "Send to Paid Onboarding" flow for an unpaid/source CRM lead.
// Lets the user choose how to materialize the Paid Onboarding CRM record
// without ever creating a duplicate paid buyer or touching payments/CoC.

import { useEffect, useState } from "react";
import { X, ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import { resolveLinkBundle, type LinkBundle } from "@/lib/leadLinks";
import { ensurePaidPipelineCrmLead } from "@/lib/paidCrmMirror";
import { EmptyState } from "@/components/ui-bits";
import { ensurePipelineExists } from "@/lib/crmTypes";

type Mode = "link_create" | "move" | "copy";

interface Props {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  leadEmail: string | null;
  leadPhone: string | null;
  onDone: () => void;
}

export default function SendToPaidOnboardingModal({
  open, onClose, leadId, leadName, leadEmail, leadPhone, onDone,
}: Props) {
  const [bundle, setBundle] = useState<LinkBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("link_create");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    resolveLinkBundle({ crmLeadId: leadId, email: leadEmail, phone: leadPhone })
      .then((b) => setBundle(b))
      .finally(() => setLoading(false));
  }, [open, leadId, leadEmail, leadPhone]);

  if (!open) return null;

  const existingOnboarding = bundle?.paid_onboarding_crm?.[0] || null;
  const existingBuyer = bundle?.paid_pipeline_buyer?.[0] || null;

  const submit = async () => {
    setSubmitting(true);
    try {
      // Mode A — Keep source as sales history, create/link Paid Onboarding CRM
      if (mode === "link_create") {
        if (existingOnboarding) {
          // already linked; just write back-link on source if missing
          await (supabase as any).from("leads")
            .update({ converted_to_crm_lead_id: existingOnboarding.id })
            .eq("id", leadId);
          await logActivity({
            module_key: "calling_crm",
            action_type: "paid_onboarding_crm_lead_linked",
            entity_type: "lead", entity_id: leadId, entity_label: leadName,
            metadata: { source_lead_id: leadId, paid_onboarding_crm_lead_id: existingOnboarding.id, action_taken: "already_present" },
            summary: "Paid Onboarding CRM lead already exists; linked source lead to it.",
          });
          toast.success("Linked to existing Paid Onboarding CRM lead.");
        } else if (existingBuyer) {
          const res = await ensurePaidPipelineCrmLead(existingBuyer.id, { sourceUnpaidLeadId: leadId });
          if (!res.ok || !res.crmLeadId) throw new Error(res.message || "Could not create Paid Onboarding CRM lead.");
          toast.success(res.action === "created" || res.action === "promoted_from_source"
            ? "Created Paid Onboarding CRM lead."
            : "Linked to existing Paid Onboarding CRM lead.");
        } else {
          // No paid buyer yet — create a Paid Onboarding CRM lead from this source lead.
          // Does NOT create a paid_pipeline_leads (buyer) row — that requires a payment.
          const { data: src } = await (supabase as any).from("leads").select("*").eq("id", leadId).maybeSingle();
          if (!src) throw new Error("Source lead not found");
          const { pipelineId, firstStageId } = await ensurePipelineExists(supabase as any, "paid", "Paid — Onboarding");
          const { data: stages } = await (supabase as any).from("stages").select("id, name, position").eq("pipeline_id", pipelineId).order("position");
          const preferred = (stages || []).find((s: any) => s.name === "Payment Confirmed");
          const stageId = preferred?.id ?? firstStageId ?? (stages || [])[0]?.id ?? null;
          const insert: any = {
            full_name: src.full_name, email: src.email, phone: src.phone,
            pipeline_id: pipelineId, stage_id: stageId,
            lead_type: "paid",
            program_name: src.program_name, webinar_source: src.webinar_source,
            deal_value: src.deal_value,
            assigned_agent_id: src.assigned_agent_id,
            conversion_status: "converted",
            hide_from_sales_workload: false,
          };
          const { data: created, error } = await (supabase as any).from("leads").insert(insert).select("id").maybeSingle();
          if (error) throw error;
          const newId = (created as any)?.id;
          await (supabase as any).from("leads")
            .update({ converted_to_crm_lead_id: newId, conversion_status: "converted", converted_at: new Date().toISOString() })
            .eq("id", leadId);
          await logActivity({
            module_key: "calling_crm",
            action_type: "paid_onboarding_crm_lead_created",
            entity_type: "lead", entity_id: newId, entity_label: leadName,
            metadata: { source_lead_id: leadId, paid_onboarding_crm_lead_id: newId, action_taken: "created_from_source" },
            summary: "Created Paid Onboarding CRM lead from source unpaid lead.",
          });
          toast.success("Created Paid Onboarding CRM lead.");
        }
      } else if (mode === "move") {
        const { pipelineId, firstStageId } = await ensurePipelineExists(supabase as any, "paid", "Paid — Onboarding");
        const { data: stages } = await (supabase as any).from("stages").select("id, name, position").eq("pipeline_id", pipelineId).order("position");
        const preferred = (stages || []).find((s: any) => s.name === "Payment Confirmed");
        const stageId = preferred?.id ?? firstStageId ?? (stages || [])[0]?.id ?? null;
        const { error } = await (supabase as any).from("leads")
          .update({ pipeline_id: pipelineId, stage_id: stageId, lead_type: "paid", hide_from_sales_workload: false })
          .eq("id", leadId);
        if (error) throw error;
        await logActivity({
          module_key: "calling_crm",
          action_type: "crm_cross_pipeline_move_completed",
          entity_type: "lead", entity_id: leadId, entity_label: leadName,
          metadata: { to_pipeline_id: pipelineId, to_stage_id: stageId, action_type: "move", destination: "paid_onboarding" },
          summary: "Moved source lead into Paid — Onboarding.",
        });
        toast.success("Lead moved to Paid Onboarding.");
      } else { // copy
        const { data: src } = await (supabase as any).from("leads").select("*").eq("id", leadId).maybeSingle();
        if (!src) throw new Error("Source lead not found");
        const { pipelineId, firstStageId } = await ensurePipelineExists(supabase as any, "paid", "Paid — Onboarding");
        const { data: stages } = await (supabase as any).from("stages").select("id, name, position").eq("pipeline_id", pipelineId).order("position");
        const preferred = (stages || []).find((s: any) => s.name === "Payment Confirmed");
        const stageId = preferred?.id ?? firstStageId ?? (stages || [])[0]?.id ?? null;
        const insert: any = {
          full_name: src.full_name, email: src.email, phone: src.phone,
          pipeline_id: pipelineId, stage_id: stageId,
          lead_type: "paid",
          program_name: src.program_name, webinar_source: src.webinar_source,
          deal_value: src.deal_value,
          assigned_agent_id: src.assigned_agent_id,
          conversion_status: "converted",
          hide_from_sales_workload: false,
        };
        const { data: created, error } = await (supabase as any).from("leads").insert(insert).select("id").maybeSingle();
        if (error) throw error;
        const newId = (created as any)?.id;
        await (supabase as any).from("leads")
          .update({ converted_to_crm_lead_id: newId })
          .eq("id", leadId);
        await logActivity({
          module_key: "calling_crm",
          action_type: "crm_cross_pipeline_copy_created",
          entity_type: "lead", entity_id: newId, entity_label: leadName,
          metadata: { source_lead_id: leadId, destination_lead_id: newId, to_pipeline_id: pipelineId, to_stage_id: stageId, action_type: "copy", destination: "paid_onboarding" },
          summary: "Copied source lead into Paid — Onboarding.",
        });
        toast.success("Copied to Paid Onboarding (source kept).");
      }
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Action failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <div className="font-serif text-lg">Send to Paid Onboarding</div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-off flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Existing linked records */}
          <div className="rounded-md border border-line bg-off/40 p-3">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5">Existing linked records</div>
            {loading ? (
              <div className="text-[12px] text-muted-foreground">Checking links…</div>
            ) : (
              <div className="space-y-1 text-[12px]">
                {existingBuyer ? (
                  <div className="flex items-center justify-between gap-2">
                    <span><b>Paid Buyer</b> · {existingBuyer.stageName || "—"}</span>
                    <Link to={`/paid-pipeline?lead=${existingBuyer.id}`} className="inline-flex items-center gap-1 text-[11px] text-foreground/80 hover:underline">
                      <ExternalLink className="w-3 h-3" /> Open
                    </Link>
                  </div>
                ) : <div className="text-muted-foreground">No paid buyer record yet.</div>}
                {existingOnboarding ? (
                  <div className="flex items-center justify-between gap-2">
                    <span><b>Paid Onboarding CRM</b> · {existingOnboarding.stageName || "—"}</span>
                    <Link to={`/crm?lead=${existingOnboarding.id}`} className="inline-flex items-center gap-1 text-[11px] text-foreground/80 hover:underline">
                      <ExternalLink className="w-3 h-3" /> Open
                    </Link>
                  </div>
                ) : <div className="text-muted-foreground">No Paid Onboarding CRM lead yet.</div>}
              </div>
            )}
          </div>

          {/* Behavior choice */}
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Choose behavior</div>
            {([
              { v: "link_create", title: "Keep source as sales history, create/link Paid Onboarding CRM", desc: "Recommended. Source lead stays in Sales Pipeline; a Paid Onboarding CRM card is created or linked. No duplicate paid buyer." },
              { v: "move", title: "Move this lead to Paid Onboarding", desc: "Source lead is relocated into Paid — Onboarding. Payments, CoC, follow-ups, and tags are preserved." },
              { v: "copy", title: "Copy this lead to Paid Onboarding (keep source)", desc: "Creates a new Paid Onboarding CRM lead and keeps the source. Payments and CoC are not copied." },
            ] as const).map((opt) => (
              <label key={opt.v} className={`block rounded-md border p-2.5 cursor-pointer ${mode === opt.v ? "border-black bg-off" : "border-line hover:bg-off/60"}`}>
                <div className="flex items-start gap-2">
                  <input type="radio" name="sendMode" checked={mode === opt.v} onChange={() => setMode(opt.v as Mode)} className="mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium">{opt.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</div>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="text-[11px] text-muted-foreground">
            No paid buyer will be created or duplicated. Payments, Code of Conduct, invoices, and follow-ups are never modified.
          </div>
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost !h-9">Cancel</button>
          <button onClick={submit} disabled={submitting || loading} className="ipc-btn ipc-btn-black !h-9">
            <ArrowRight className="w-3.5 h-3.5" /> {submitting ? "Working…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
