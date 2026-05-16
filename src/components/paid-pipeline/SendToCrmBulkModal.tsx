import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";

type Pipeline = { id: string; name: string };
type Stage = { id: string; pipeline_id: string; name: string; position: number };

export default function SendToCrmBulkModal({
  leadIds, leads, paidBatches, onClose, onDone,
}: {
  leadIds: string[];
  leads: any[];
  paidBatches?: { id: string; batch_name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [batchName, setBatchName] = useState("");
  const [paidBatchId, setPaidBatchId] = useState("");
  const [owner, setOwner] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: s }, { data: ag }] = await Promise.all([
        supabase.from("pipelines").select("id, name").order("position"),
        supabase.from("stages").select("id, pipeline_id, name, position").order("position"),
        supabase.from("profiles").select("id, full_name, status").eq("status", "active"),
      ]);
      const pipes = (p || []) as any;
      setPipelines(pipes);
      setStages((s || []) as any);
      setAgents((ag || []) as any);
      const onboarding = pipes.find((x: any) => /onboarding/i.test(x.name));
      if (onboarding) setPipelineId(onboarding.id);
      else if (pipes[0]) setPipelineId(pipes[0].id);
    })();
  }, []);

  useEffect(() => {
    const first = stages.find(s => s.pipeline_id === pipelineId);
    if (first) setStageId(first.id);
  }, [pipelineId, stages]);

  const pipelineStages = useMemo(() => stages.filter(s => s.pipeline_id === pipelineId), [stages, pipelineId]);

  const send = async () => {
    if (!pipelineId) { toast.error("Choose a CRM pipeline"); return; }
    if (!stageId) { toast.error("Choose a stage"); return; }
    setBusy(true);
    try {
      let inserted = 0; let skipped = 0;
      const selected = leads.filter(l => leadIds.includes(l.id));
      for (const l of selected) {
        // Duplicate check inside this pipeline by phone OR email
        let existingId: string | null = null;
        if (l.phone || l.email) {
          let q = supabase.from("leads").select("id").eq("pipeline_id", pipelineId).limit(1);
          if (l.phone && l.email) q = q.or(`phone.eq.${l.phone},email.eq.${l.email}`);
          else if (l.phone) q = q.eq("phone", l.phone);
          else if (l.email) q = q.eq("email", l.email);
          const { data: ex } = await q.maybeSingle();
          if (ex?.id) existingId = ex.id;
        }
        let crmLeadId: string | null = existingId;
        if (!existingId) {
          const { data: newLead, error } = await supabase.from("leads").insert({
            full_name: l.name, email: l.email, phone: l.phone,
            pipeline_id: pipelineId, stage_id: stageId,
            assigned_agent_id: owner || null,
            program_name: l.product_name_snapshot || "Paid Onboarding",
            webinar_source: batchName || l.source_webinar || null,
            lead_type: "paid",
            deal_value: l.deal_value_including_gst || 0,
            grade: "warm",
          } as any).select("id").maybeSingle();
          if (error) { skipped++; continue; }
          crmLeadId = newLead?.id || null;
          inserted++;
        } else {
          skipped++;
        }
        await supabase.from("paid_pipeline_to_crm_links").insert({
          paid_pipeline_lead_id: l.id, crm_lead_id: crmLeadId,
          crm_pipeline_id: pipelineId, crm_stage_id: stageId,
          onboarding_batch_name: batchName || null,
          sent_by: user?.id, notes: notes || null,
        } as any);
        await supabase.from("paid_pipeline_leads").update({
          crm_pipeline_id: pipelineId, crm_stage_id: stageId, crm_lead_id: crmLeadId,
          onboarding_batch_name: batchName || null,
          paid_batch_id: paidBatchId || null,
          sent_to_crm: true, sent_to_crm_at: new Date().toISOString(),
        } as any).eq("id", l.id);
        await supabase.from("paid_pipeline_activity_logs").insert({
          paid_pipeline_lead_id: l.id, activity_type: "sent_to_crm",
          note: `Sent to CRM pipeline (batch: ${batchName || "—"})`, created_by: user?.id,
        } as any);
      }
      toast.success(`Sent ${inserted} new lead(s) to CRM. ${skipped} already existed (linked).`);
      onDone(); onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line sticky top-0 bg-white z-10">
          <div className="font-serif text-[20px]">Send to CRM / Paid Onboarding</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">{leadIds.length} lead(s) selected</div>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="qsi-label">CRM Pipeline</label>
            <select className="qsi-input" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
              <option value="">Select pipeline…</option>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="qsi-label">CRM Stage</label>
            <select className="qsi-input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              <option value="">Select stage…</option>
              {pipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="text-[11px] text-muted-foreground mt-1">
              Need a different stage? Add it from Calling CRM → Stages or from the Kanban "+ Stage" button.
            </div>
          </div>
          <div>
            <label className="qsi-label">Paid Batch (optional)</label>
            <select className="qsi-input" value={paidBatchId} onChange={(e) => setPaidBatchId(e.target.value)}>
              <option value="">— None —</option>
              {(paidBatches || []).map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
            </select>
          </div>
          <QuickSaveInput fieldKey="onboarding_batch_name" label="Onboarding batch name" value={batchName} onChange={setBatchName} placeholder="e.g. Diamond May 2026 Batch 1" />
          <div>
            <label className="qsi-label">Assign owner</label>
            <select className="qsi-input" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">— Unassigned —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="qsi-label">Notes (optional)</label>
            <textarea className="qsi-input !h-auto py-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="text-[11px] text-muted-foreground">
            Duplicates (same phone or email already in this CRM pipeline) will be skipped — only the link record is created.
          </div>
        </div>
        <div className="px-6 py-3 border-t border-line flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={send} disabled={busy} className="ipc-btn ipc-btn-black">{busy ? "Sending…" : `Send ${leadIds.length} to CRM`}</button>
        </div>
      </div>
    </div>
  );
}
