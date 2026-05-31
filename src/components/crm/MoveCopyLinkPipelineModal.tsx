// Cross-Pipeline Move / Copy / Link wizard for Calling CRM leads.
// Move: relocates the lead row to the destination pipeline+stage (preserves
// FK-linked payments, CoC, follow-ups, tags — nothing is duplicated).
// Copy: inserts a new lead row in the destination, no payments/CoC copied.
// Link: writes the appropriate cross-table linkage (paid_pipeline_lead_id,
// converted_to_crm_lead_id) onto an existing destination record.

import { useEffect, useMemo, useState } from "react";
import { X, ArrowRight, Copy as CopyIcon, Link as LinkIcon, MoveRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import { resolveLinkBundle, type LinkBundle } from "@/lib/leadLinks";

type Intent = "move" | "copy" | "link";

interface Pipeline { id: string; name: string; type: string }
interface Stage { id: string; name: string; pipeline_id: string; position: number }

interface Props {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  leadEmail: string | null;
  leadPhone: string | null;
  currentPipelineId: string | null;
  currentStageId: string | null;
  onDone: () => void;
}

export default function MoveCopyLinkPipelineModal({
  open, onClose, leadId, leadName, leadEmail, leadPhone, currentPipelineId, currentStageId, onDone,
}: Props) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [intent, setIntent] = useState<Intent>("move");
  const [destPipelineId, setDestPipelineId] = useState<string>("");
  const [destStageId, setDestStageId] = useState<string>("");
  const [bundle, setBundle] = useState<LinkBundle | null>(null);
  const [linkTargetId, setLinkTargetId] = useState<string>("");
  const [adminOverrideDup, setAdminOverrideDup] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [pRes, sRes, b] = await Promise.all([
        (supabase as any).from("pipelines").select("id, name, type").order("name"),
        (supabase as any).from("stages").select("id, name, pipeline_id, position").order("position"),
        resolveLinkBundle({ crmLeadId: leadId, email: leadEmail, phone: leadPhone }),
      ]);
      setPipelines(pRes.data || []);
      setStages(sRes.data || []);
      setBundle(b);
      // Default destination = first pipeline that's not the current
      const first = (pRes.data || []).find((p: any) => p.id !== currentPipelineId);
      if (first) setDestPipelineId(first.id);
    })();
    logActivity({
      module_key: "calling_crm",
      action_type: "crm_cross_pipeline_move_started",
      entity_type: "lead", entity_id: leadId, entity_label: leadName,
      metadata: { from_pipeline_id: currentPipelineId },
    }).catch(() => {});
  }, [open, leadId, leadEmail, leadPhone, currentPipelineId, leadName]);

  const destStages = useMemo(
    () => stages.filter((s) => s.pipeline_id === destPipelineId).sort((a, b) => a.position - b.position),
    [stages, destPipelineId],
  );
  useEffect(() => {
    if (destStages.length && !destStages.find((s) => s.id === destStageId)) setDestStageId(destStages[0].id);
  }, [destStages, destStageId]);

  const destPipeline = pipelines.find((p) => p.id === destPipelineId);
  const existingMatchesInDest = useMemo(() => {
    if (!bundle || !destPipeline) return [];
    const matches = [
      ...bundle.source_unpaid_crm,
      ...bundle.paid_onboarding_crm,
    ].filter((s) => s.pipelineId === destPipelineId && s.id !== leadId);
    if (destPipeline.type === "paid") matches.push(...bundle.paid_pipeline_buyer.map((b) => ({ ...b, pipelineId: destPipelineId } as any)));
    return matches;
  }, [bundle, destPipeline, destPipelineId, leadId]);

  // Force Link when a sibling already exists, unless admin overrides
  const forceLink = existingMatchesInDest.length > 0 && !adminOverrideDup;
  const effectiveIntent: Intent = forceLink && intent === "copy" ? "link" : intent;

  const submit = async () => {
    if (!destPipelineId || !destStageId) { toast.error("Choose a destination pipeline and stage."); return; }
    setSubmitting(true);
    try {
      if (effectiveIntent === "move") {
        const { error } = await (supabase as any).from("leads")
          .update({ pipeline_id: destPipelineId, stage_id: destStageId })
          .eq("id", leadId);
        if (error) throw error;
        await logActivity({
          module_key: "calling_crm",
          action_type: "crm_cross_pipeline_move_completed",
          entity_type: "lead", entity_id: leadId, entity_label: leadName,
          metadata: {
            from_pipeline_id: currentPipelineId, from_stage_id: currentStageId,
            to_pipeline_id: destPipelineId, to_stage_id: destStageId, action_type: "move",
          },
          summary: `Moved lead to ${destPipeline?.name || "destination"}.`,
        });
        toast.success("Lead moved.");
      } else if (effectiveIntent === "copy") {
        const { data: src } = await (supabase as any).from("leads").select("*").eq("id", leadId).maybeSingle();
        if (!src) throw new Error("Source lead not found");
        const insert: any = {
          full_name: src.full_name, email: src.email, phone: src.phone,
          pipeline_id: destPipelineId, stage_id: destStageId,
          lead_type: destPipeline?.type === "paid" ? "paid" : "unpaid",
          program_name: src.program_name, webinar_source: src.webinar_source,
          deal_value: src.deal_value,
          assigned_agent_id: src.assigned_agent_id,
          conversion_status: "not_converted",
          hide_from_sales_workload: destPipeline?.type === "paid",
        };
        const { data: created, error } = await (supabase as any).from("leads").insert(insert).select("id").maybeSingle();
        if (error) throw error;
        await logActivity({
          module_key: "calling_crm",
          action_type: "crm_cross_pipeline_copy_created",
          entity_type: "lead", entity_id: (created as any)?.id, entity_label: leadName,
          metadata: {
            source_lead_id: leadId, destination_lead_id: (created as any)?.id,
            to_pipeline_id: destPipelineId, to_stage_id: destStageId, action_type: "copy",
          },
          summary: `Copied lead to ${destPipeline?.name || "destination"}.`,
        });
        toast.success("Lead copied to destination.");
      } else { // link
        if (!linkTargetId) { toast.error("Select an existing record to link."); setSubmitting(false); return; }
        const target = existingMatchesInDest.find((m) => m.id === linkTargetId);
        if (!target) { toast.error("Invalid link target."); setSubmitting(false); return; }
        if (target.kind === "paid_pipeline_buyer") {
          await (supabase as any).from("leads")
            .update({ paid_pipeline_lead_id: target.id, conversion_status: "linked_to_paid" })
            .eq("id", leadId);
        } else {
          await (supabase as any).from("leads")
            .update({ converted_to_crm_lead_id: target.id })
            .eq("id", leadId);
        }
        await logActivity({
          module_key: "calling_crm",
          action_type: "crm_records_linked",
          entity_type: "lead", entity_id: leadId, entity_label: leadName,
          metadata: {
            source_lead_id: leadId, destination_lead_id: target.id,
            link_target_kind: target.kind, action_type: "link",
          },
          summary: `Linked lead to existing ${target.kind}.`,
        });
        toast.success("Records linked.");
      }
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <div className="font-serif text-lg">Move / Copy / Link to Pipeline</div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-off flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Step 1 — Intent */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">1. Action</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "move",  label: "Move",  icon: <MoveRight className="w-3.5 h-3.5" />, desc: "Relocate this lead" },
                { v: "copy",  label: "Copy",  icon: <CopyIcon className="w-3.5 h-3.5" />, desc: "Create a new linked lead" },
                { v: "link",  label: "Link",  icon: <LinkIcon className="w-3.5 h-3.5" />, desc: "Connect to existing record" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setIntent(opt.v)}
                  className={`text-left p-2 rounded-md border ${intent === opt.v ? "border-black bg-off" : "border-line hover:bg-off/60"}`}
                >
                  <div className="flex items-center gap-1 text-[12px] font-medium">{opt.icon} {opt.label}</div>
                  <div className="text-[10.5px] text-muted-foreground mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 — Destination */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">2. Destination</div>
            <div className="grid grid-cols-2 gap-2">
              <select value={destPipelineId} onChange={(e) => setDestPipelineId(e.target.value)} className="ipc-input !h-9 !text-xs">
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={destStageId} onChange={(e) => setDestStageId(e.target.value)} className="ipc-input !h-9 !text-xs" disabled={effectiveIntent === "link"}>
                {destStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Step 3 — Existing matches */}
          {existingMatchesInDest.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5">
              <div className="text-[11px] font-semibold text-amber-900 mb-1.5">This person already exists in the destination:</div>
              <div className="space-y-1">
                {existingMatchesInDest.map((m: any) => (
                  <label key={m.id} className="flex items-center gap-2 text-[11.5px] text-amber-900 cursor-pointer">
                    <input type="radio" name="linkTarget" value={m.id} checked={linkTargetId === m.id} onChange={(e) => setLinkTargetId(e.target.value)} />
                    <span className="truncate"><b>{m.name || "(no name)"}</b> · {m.pipelineName} / {m.stageName || "—"}</span>
                  </label>
                ))}
              </div>
              {intent === "copy" && (
                <label className="mt-2 flex items-center gap-1.5 text-[10.5px] text-amber-900">
                  <input type="checkbox" checked={adminOverrideDup} onChange={(e) => setAdminOverrideDup(e.target.checked)} />
                  Create a duplicate anyway (admin override)
                </label>
              )}
              {forceLink && (
                <div className="text-[10.5px] text-amber-800 mt-1">Defaulting to <b>Link</b> to avoid a duplicate.</div>
              )}
            </div>
          )}

          {/* Step 4 — Review */}
          <div className="rounded-md border border-line bg-off/40 p-2.5 text-[12px] text-foreground/90">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Review</div>
            {effectiveIntent === "move" && <>Move <b>{leadName}</b> to <b>{destPipeline?.name || "—"}</b> / <b>{destStages.find((s) => s.id === destStageId)?.name || "—"}</b>. Payments, CoC, follow-ups, and tags are preserved.</>}
            {effectiveIntent === "copy" && <>Create a new lead for <b>{leadName}</b> in <b>{destPipeline?.name || "—"}</b> / <b>{destStages.find((s) => s.id === destStageId)?.name || "—"}</b>. Payments and CoC are not copied.</>}
            {effectiveIntent === "link" && <>Link <b>{leadName}</b> to the selected existing record. No new lead will be created.</>}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost !h-9">Cancel</button>
          <button onClick={submit} disabled={submitting} className="ipc-btn ipc-btn-black !h-9">
            <ArrowRight className="w-3.5 h-3.5" /> {submitting ? "Working…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
