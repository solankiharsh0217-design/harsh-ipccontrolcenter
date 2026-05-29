import { useEffect, useMemo, useRef, useState } from "react";
import { X as XIcon, Search, Plus, Trash2, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import type { Lead, Pipeline, Stage } from "@/lib/crmTypes";

type BatchInfo = {
  name: string;
  date: string | null;
  pipelineId: string | null;
  leadIds: string[];
};

type LeadTypeChoice = "keep" | "unpaid" | "paid";
type PaidUnlinkChoice = "keep" | "archive" | "unlink";

type DryRun = {
  totalLeads: number;
  alreadyInDestination: number;
  withPaidLink: number;
  withoutPaidLink: number;
  missingContact: number;
  duplicatePaidByEmailOrPhone: number;
  crmLinkedToOtherPaidBuyer: number;
  conflicts: Array<{ leadId: string; name: string; email: string | null; phone: string | null; reason: string }>;
};

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
const last10 = (s: string | null | undefined) => (s || "").replace(/\D+/g, "").slice(-10);

export default function MoveBatchModal({
  batch, leads, pipelines, stages, isAdmin, onClose, onDone, onPipelinesChanged,
}: {
  batch: BatchInfo;
  leads: Lead[];
  pipelines: Pipeline[];
  stages: Stage[];
  isAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
  onPipelinesChanged?: () => Promise<void> | void;
}) {
  const sourcePipeline = pipelines.find(p => p.id === batch.pipelineId) || null;
  const batchLeads = useMemo(() => leads.filter(l => batch.leadIds.includes(l.id)), [leads, batch.leadIds]);

  const [destPipelineId, setDestPipelineId] = useState<string>("");
  const [destStageId, setDestStageId] = useState<string>("");
  const [leadTypeChoice, setLeadTypeChoice] = useState<LeadTypeChoice>("keep");
  const [batchNameAfter, setBatchNameAfter] = useState<string>(batch.name);
  const [preserveOwners, setPreserveOwners] = useState(true);
  const [preserveTags, setPreserveTags] = useState(true);
  const [preserveFollowUps, setPreserveFollowUps] = useState(true);
  const [createPaidBuyers, setCreatePaidBuyers] = useState(true);
  const [defaultDealValue, setDefaultDealValue] = useState<string>("");
  const [paidUnlinkChoice, setPaidUnlinkChoice] = useState<PaidUnlinkChoice>("keep");

  const [step, setStep] = useState<"config" | "preview" | "confirm">("config");
  const [dry, setDry] = useState<DryRun | null>(null);
  const [busy, setBusy] = useState(false);

  const destPipeline = pipelines.find(p => p.id === destPipelineId) || null;
  const destStages = useMemo(
    () => stages.filter(s => s.pipeline_id === destPipelineId).sort((a, b) => a.position - b.position),
    [stages, destPipelineId],
  );
  const destStage = destStages.find(s => s.id === destStageId) || null;
  const movingToPaid = destPipeline?.type === "paid";
  const movingFromPaid = sourcePipeline?.type === "paid";

  useEffect(() => {
    if (destPipelineId && !destStages.some(s => s.id === destStageId)) {
      setDestStageId(destStages[0]?.id || "");
    }
  }, [destPipelineId, destStages, destStageId]);

  const counts = useMemo(() => {
    const c = { hot: 0, warm: 0, cold: 0, owners: new Set<string>(), paidLinked: 0 };
    for (const l of batchLeads) {
      if (l.grade === "hot" || l.grade === "super-hot") c.hot++;
      else if (l.grade === "warm") c.warm++;
      else c.cold++;
      if (l.assigned_agent_id) c.owners.add(l.assigned_agent_id);
      if (l.paid_pipeline_lead_id) c.paidLinked++;
    }
    return { ...c, ownersCount: c.owners.size };
  }, [batchLeads]);

  const runDryRun = async (): Promise<DryRun | null> => {
    if (!destPipelineId) { toast.error("Pick a destination pipeline"); return null; }
    setBusy(true);
    try {
      const ids = batchLeads.map(l => l.id);
      const emails = batchLeads.map(l => norm(l.email)).filter(Boolean);
      const phones = batchLeads.map(l => last10(l.phone)).filter(Boolean);

      const { data: paidByContact } = await (supabase as any)
        .from("paid_pipeline_leads")
        .select("id, name, email, phone, crm_lead_id")
        .eq("is_deleted", false);
      const paidList = (paidByContact as any[]) || [];

      const dr: DryRun = {
        totalLeads: ids.length,
        alreadyInDestination: batchLeads.filter(l => l.pipeline_id === destPipelineId && (!destStageId || l.stage_id === destStageId)).length,
        withPaidLink: 0, withoutPaidLink: 0, missingContact: 0,
        duplicatePaidByEmailOrPhone: 0, crmLinkedToOtherPaidBuyer: 0, conflicts: [],
      };

      for (const l of batchLeads) {
        const eml = norm(l.email);
        const ph = last10(l.phone);
        if (!eml && !ph) { dr.missingContact++; }
        if (l.paid_pipeline_lead_id) dr.withPaidLink++; else dr.withoutPaidLink++;

        const matchByEmail = eml ? paidList.filter(p => norm(p.email) === eml) : [];
        const matchByPhone = ph ? paidList.filter(p => last10(p.phone) === ph) : [];
        const combined = Array.from(new Set([...matchByEmail, ...matchByPhone].map(p => p.id))).map(id => paidList.find(p => p.id === id)!);

        if (combined.length > 1) {
          dr.duplicatePaidByEmailOrPhone++;
          dr.conflicts.push({ leadId: l.id, name: l.full_name || "—", email: l.email, phone: l.phone, reason: `Matches ${combined.length} paid buyers by email/phone` });
        }
        const linkedOther = combined.find(p => p.crm_lead_id && p.crm_lead_id !== l.id);
        if (linkedOther) {
          dr.crmLinkedToOtherPaidBuyer++;
          dr.conflicts.push({ leadId: l.id, name: l.full_name || "—", email: l.email, phone: l.phone, reason: "Matched paid buyer is linked to a different CRM lead" });
        }
      }
      return dr;
    } finally { setBusy(false); }
  };

  const onPreview = async () => {
    const dr = await runDryRun();
    if (!dr) return;
    setDry(dr);
    setStep("preview");
    await logActivity({
      module_key: "calling_crm", module_label: "Calling CRM",
      action_type: "crm_batch_move_dry_run", action_label: "Batch move dry run",
      entity_type: "crm_batch", entity_label: batch.name,
      metadata: {
        batch_name: batch.name, batch_date: batch.date,
        source_pipeline_id: batch.pipelineId, source_pipeline_name: sourcePipeline?.name,
        destination_pipeline_id: destPipelineId, destination_pipeline_name: destPipeline?.name,
        destination_stage_id: destStageId, destination_stage_name: destStage?.name,
        total_leads: dr.totalLeads, conflicts: dr.conflicts.length,
      },
    });
  };

  const performMove = async () => {
    if (!destPipelineId) { toast.error("Pick destination pipeline"); return; }
    const stageId = destStageId || destStages[0]?.id || null;
    if (!stageId) { toast.error("Destination pipeline has no stages"); return; }
    setBusy(true);
    let movedLeads = 0;
    let paidCreated = 0;
    let paidLinked = 0;
    let skipped = 0;
    try {
      await logActivity({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "crm_batch_move_started", action_label: "Batch move started",
        entity_type: "crm_batch", entity_label: batch.name,
        severity: "warning",
        metadata: {
          batch_name: batch.name, source_pipeline_id: batch.pipelineId, source_pipeline_name: sourcePipeline?.name,
          destination_pipeline_id: destPipelineId, destination_pipeline_name: destPipeline?.name,
          destination_stage_id: stageId,
          total_leads: batchLeads.length, lead_type_choice: leadTypeChoice,
          rename_to: batchNameAfter !== batch.name ? batchNameAfter : null,
          preserve_owners: preserveOwners, create_paid_buyers: createPaidBuyers && movingToPaid,
          paid_unlink_choice: movingFromPaid ? paidUnlinkChoice : null,
        },
      });

      const ids = batchLeads.map(l => l.id);
      const patch: any = { pipeline_id: destPipelineId, stage_id: stageId };
      if (leadTypeChoice === "paid") patch.lead_type = "paid";
      if (leadTypeChoice === "unpaid") patch.lead_type = "unpaid";
      if (batchNameAfter && batchNameAfter !== batch.name) {
        patch.webinar_source = batchNameAfter;
        patch.webinar_name = batchNameAfter;
      }
      if (!preserveOwners) patch.assigned_agent_id = null;
      const { error: updErr } = await supabase.from("leads").update(patch).in("id", ids as any);
      if (updErr) throw updErr;
      movedLeads = ids.length;

      if (movingToPaid && createPaidBuyers) {
        const { data: paidAll } = await (supabase as any)
          .from("paid_pipeline_leads").select("id, email, phone, crm_lead_id").eq("is_deleted", false);
        const paidList = (paidAll as any[]) || [];
        const dv = Number(defaultDealValue) || 0;
        const { data: userData } = await supabase.auth.getUser();
        const myId = userData?.user?.id || null;

        for (const l of batchLeads) {
          try {
            if (l.paid_pipeline_lead_id) {
              paidLinked++;
              continue;
            }
            const eml = norm(l.email);
            const ph = last10(l.phone);
            let match = (eml && paidList.find(p => norm(p.email) === eml))
              || (ph && paidList.find(p => last10(p.phone) === ph))
              || null;
            if (match) {
              await (supabase as any).from("paid_pipeline_leads")
                .update({ crm_lead_id: l.id, paid_batch_name: batchNameAfter || batch.name })
                .eq("id", match.id);
              await supabase.from("leads").update({ paid_pipeline_lead_id: match.id } as any).eq("id", l.id);
              paidLinked++;
            } else {
              const { data: ins, error: insErr } = await (supabase as any).from("paid_pipeline_leads").insert({
                name: l.full_name, email: l.email, phone: l.phone,
                product_name_snapshot: l.program_name || null,
                paid_batch_name: batchNameAfter || batch.name,
                onboarding_batch_name: batchNameAfter || batch.name,
                deal_value_including_gst: dv,
                token_amount_collected: 0, total_collected: 0, balance_pending: dv,
                pipeline_stage: destStage?.name || null,
                assigned_sales_executive: preserveOwners ? l.assigned_agent_id : null,
                crm_lead_id: l.id, crm_pipeline_id: destPipelineId, crm_stage_id: stageId,
                sent_to_crm: true, sent_to_crm_at: new Date().toISOString(),
                created_by: myId,
              }).select("id").maybeSingle();
              if (insErr) { skipped++; continue; }
              if (ins?.id) {
                await supabase.from("leads").update({ paid_pipeline_lead_id: ins.id } as any).eq("id", l.id);
                paidCreated++;
              }
            }
          } catch { skipped++; }
        }
      }

      if (movingFromPaid && !movingToPaid && paidUnlinkChoice !== "keep") {
        const linkedIds = batchLeads.map(l => l.paid_pipeline_lead_id).filter(Boolean) as string[];
        if (linkedIds.length > 0) {
          if (paidUnlinkChoice === "archive") {
            await (supabase as any).from("paid_pipeline_leads").update({ is_deleted: true, deleted_at: new Date().toISOString() }).in("id", linkedIds);
          }
          await (supabase as any).from("paid_pipeline_leads").update({ crm_lead_id: null }).in("id", linkedIds);
          await supabase.from("leads").update({ paid_pipeline_lead_id: null } as any).in("id", batchLeads.map(l => l.id) as any);
        }
      }

      await logActivity({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "crm_batch_moved", action_label: "Batch moved",
        entity_type: "crm_batch", entity_label: batchNameAfter || batch.name,
        severity: "warning",
        summary: `Batch "${batch.name}" moved from ${sourcePipeline?.name || "—"} to ${destPipeline?.name || "—"} (${movedLeads} leads).`,
        metadata: {
          old_batch_name: batch.name, new_batch_name: batchNameAfter || batch.name,
          source_pipeline_id: batch.pipelineId, source_pipeline_name: sourcePipeline?.name,
          destination_pipeline_id: destPipelineId, destination_pipeline_name: destPipeline?.name,
          destination_stage_id: stageId, destination_stage_name: destStage?.name,
          total_leads: batchLeads.length, moved_leads: movedLeads, skipped_leads: skipped,
          paid_buyers_created: paidCreated, paid_buyers_linked: paidLinked,
          conflicts: dry?.conflicts?.length || 0,
        },
      });
      if (paidCreated > 0) {
        await logActivity({
          module_key: "paid_pipeline", module_label: "Paid Pipeline",
          action_type: "paid_buyers_created_from_batch_move", action_label: "Paid buyers created from batch move",
          entity_type: "crm_batch", entity_label: batchNameAfter || batch.name,
          metadata: { count: paidCreated, source_batch: batch.name },
        });
      }
      if (paidLinked > 0) {
        await logActivity({
          module_key: "paid_pipeline", module_label: "Paid Pipeline",
          action_type: "paid_buyers_linked_from_batch_move", action_label: "Paid buyers linked from batch move",
          entity_type: "crm_batch", entity_label: batchNameAfter || batch.name,
          metadata: { count: paidLinked, source_batch: batch.name },
        });
      }
      toast.success(`Batch moved · ${movedLeads} leads${paidCreated || paidLinked ? ` · ${paidCreated} created / ${paidLinked} linked` : ""}`);
      onDone();
      onClose();
    } catch (e: any) {
      await logActivity({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "crm_batch_move_failed", action_label: "Batch move failed",
        entity_type: "crm_batch", entity_label: batch.name,
        severity: "critical",
        metadata: { error: e?.message || String(e) },
      });
      toast.error(e?.message || "Move failed");
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <Shell onClose={onClose} title="Move / Correct Batch">
        <div className="text-sm text-[#DC2626]">Only admins can move full batches.</div>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose} title="Move / Correct Batch">
      <div className="grid grid-cols-2 gap-3 text-[12px] mb-4">
        <Info label="Batch name" value={batch.name} />
        <Info label="Current pipeline" value={sourcePipeline?.name || "—"} />
        <Info label="Total leads" value={String(batchLeads.length)} />
        <Info label="Hot/Warm/Cold" value={`${counts.hot} / ${counts.warm} / ${counts.cold}`} />
        <Info label="Assigned owners" value={String(counts.ownersCount)} />
        <Info label="Paid Pipeline linked" value={String(counts.paidLinked)} />
      </div>

      {step === "config" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="uppercase-label !text-[10px]">Destination pipeline</label>
              <PipelinePicker
                pipelines={pipelines}
                leads={leads}
                value={destPipelineId}
                onChange={setDestPipelineId}
                excludeId={batch.pipelineId || undefined}
                isAdmin={isAdmin}
                onMutated={async () => { if (onPipelinesChanged) await onPipelinesChanged(); }}
              />
            </div>
            <div>
              <label className="uppercase-label !text-[10px]">Destination stage</label>
              <select className="ipc-input !h-10 w-full mt-1" value={destStageId} onChange={e => setDestStageId(e.target.value)} disabled={!destPipelineId}>
                {destStages.length === 0 && <option value="">No stages</option>}
                {destStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="uppercase-label !text-[10px]">Lead type after move</label>
              <select className="ipc-input !h-10 w-full mt-1" value={leadTypeChoice} onChange={e => setLeadTypeChoice(e.target.value as LeadTypeChoice)}>
                <option value="keep">Keep existing</option>
                <option value="unpaid">Mark as unpaid</option>
                <option value="paid">Mark as paid</option>
              </select>
            </div>
            <div>
              <label className="uppercase-label !text-[10px]">Batch name after move</label>
              <input className="ipc-input !h-10 w-full mt-1" value={batchNameAfter} onChange={e => setBatchNameAfter(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-4 text-[12px]">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={preserveOwners} onChange={e => setPreserveOwners(e.target.checked)} /> Preserve assigned owners</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={preserveTags} onChange={e => setPreserveTags(e.target.checked)} /> Preserve tags</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={preserveFollowUps} onChange={e => setPreserveFollowUps(e.target.checked)} /> Preserve follow-ups</label>
          </div>

          {movingToPaid && (
            <div className="mt-4 p-3 rounded-md bg-[#FFFBEB] border border-[#FDE68A]">
              <label className="flex items-center gap-1.5 text-[12px] font-medium">
                <input type="checkbox" checked={createPaidBuyers} onChange={e => setCreatePaidBuyers(e.target.checked)} />
                Create/link Paid Pipeline buyers
              </label>
              {createPaidBuyers && (
                <div className="mt-2">
                  <label className="uppercase-label !text-[10px]">Default deal value (optional)</label>
                  <input className="ipc-input !h-9 w-full mt-1" type="number" min={0} value={defaultDealValue} onChange={e => setDefaultDealValue(e.target.value)} placeholder="0" />
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {Number(defaultDealValue) > 0 ? "Used for new paid buyers; existing buyers will be linked, not updated." : "Paid buyers will be created with 0 deal value. You can update finance later."}
                  </div>
                </div>
              )}
            </div>
          )}

          {movingFromPaid && !movingToPaid && (
            <div className="mt-4 p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA]">
              <div className="text-[12px] font-medium mb-1.5">Linked Paid Pipeline buyers</div>
              <select className="ipc-input !h-9 w-full" value={paidUnlinkChoice} onChange={e => setPaidUnlinkChoice(e.target.value as PaidUnlinkChoice)}>
                <option value="keep">Keep paid buyer records untouched (recommended)</option>
                <option value="unlink">Unlink from CRM leads only</option>
                <option value="archive">Archive linked paid buyers</option>
              </select>
              <div className="text-[11px] text-muted-foreground mt-1">Payments, invoices, and Code of Conduct records are never deleted.</div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-5">
            <button className="ipc-btn ipc-btn-ghost !h-9" onClick={onClose}>Cancel</button>
            <button className="ipc-btn ipc-btn-black !h-9" onClick={onPreview} disabled={busy || !destPipelineId}>
              {busy ? "Checking…" : "Continue · Preview"}
            </button>
          </div>
        </>
      )}

      {step === "preview" && dry && (
        <>
          <div className="font-serif text-[16px] mb-2">Move Preview</div>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <Info label="Leads to move" value={String(dry.totalLeads)} />
            <Info label="Already in destination" value={String(dry.alreadyInDestination)} />
            <Info label="With paid buyer link" value={String(dry.withPaidLink)} />
            <Info label="Without paid buyer link" value={String(dry.withoutPaidLink)} />
            <Info label="Duplicate paid matches" value={String(dry.duplicatePaidByEmailOrPhone)} />
            <Info label="Missing email/phone" value={String(dry.missingContact)} />
            <Info label="CRM linked to other paid" value={String(dry.crmLinkedToOtherPaidBuyer)} />
            <Info label="Conflicts" value={String(dry.conflicts.length)} />
          </div>

          {dry.conflicts.length > 0 && (
            <div className="mt-3 max-h-40 overflow-auto border border-line rounded-md">
              <table className="w-full text-[11.5px]">
                <thead className="bg-off">
                  <tr><th className="text-left p-1.5">Lead</th><th className="text-left p-1.5">Email</th><th className="text-left p-1.5">Phone</th><th className="text-left p-1.5">Reason</th></tr>
                </thead>
                <tbody>
                  {dry.conflicts.slice(0, 50).map((c, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="p-1.5">{c.name}</td><td className="p-1.5">{c.email || "—"}</td><td className="p-1.5">{c.phone || "—"}</td><td className="p-1.5 text-[#B45309]">{c.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ul className="text-[11.5px] text-muted-foreground mt-3 space-y-0.5 list-disc pl-4">
            {movingToPaid && <li>Moving to Paid — Onboarding can create/link Paid Pipeline buyers.</li>}
            {movingFromPaid && !movingToPaid && <li>Moving to Unpaid will not delete payment records.</li>}
            <li>This will not delete any leads.</li>
            <li>Follow-ups, tags, invoices and Code of Conduct records remain linked to each lead.</li>
            <li>This action will be audited.</li>
          </ul>

          <div className="flex justify-between gap-2 mt-5">
            <button className="ipc-btn ipc-btn-ghost !h-9" onClick={() => setStep("config")}>Back</button>
            <div className="flex gap-2">
              <button className="ipc-btn ipc-btn-ghost !h-9" onClick={onClose}>Cancel</button>
              <button className="ipc-btn ipc-btn-black !h-9" onClick={performMove} disabled={busy}>
                {busy ? "Moving…" : "Confirm Move"}
              </button>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-2xl p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-serif text-lg">{title}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-off"><XIcon className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line px-2.5 py-1.5 bg-off">
      <div className="text-[9.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium text-[12.5px] truncate">{value}</div>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { paid: "Paid", unpaid: "Unpaid", custom: "Custom" };
const TYPE_DOT: Record<string, string> = { paid: "#16A34A", unpaid: "#2563EB", custom: "#C8A84B" };

function PipelinePicker({
  pipelines, leads, value, onChange, excludeId, isAdmin, onMutated,
}: {
  pipelines: Pipeline[];
  leads: Lead[];
  value: string;
  onChange: (id: string) => void;
  excludeId?: string;
  isAdmin: boolean;
  onMutated: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"unpaid" | "paid" | "custom">("custom");
  const [newSeed, setNewSeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = pipelines.find(p => p.id === value) || null;

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of leads) map[l.pipeline_id || ""] = (map[l.pipeline_id || ""] || 0) + 1;
    return map;
  }, [leads]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pipelines
      .filter(p => p.id !== excludeId)
      .filter(p => !needle || p.name.toLowerCase().includes(needle) || (TYPE_LABEL[p.type] || "").toLowerCase().includes(needle));
  }, [pipelines, q, excludeId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as any)) { setOpen(false); setShowCreate(false); } };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { toast.error("Name required"); return; }
    const dup = pipelines.find(p => p.name.trim().toLowerCase() === name.toLowerCase() && p.type === newType);
    if (dup) { toast.error(`A ${TYPE_LABEL[newType]} pipeline named "${name}" already exists`); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.from("pipelines").insert({ name, type: newType, position: pipelines.length } as any).select().maybeSingle();
      if (error) throw error;
      if (data && newSeed) {
        const seedStages = newType === "paid"
          ? [{ name: "New", color: "blue" }, { name: "Onboarding", color: "amber" }, { name: "Active", color: "green" }, { name: "Completed", color: "gray", is_won: true }]
          : newType === "unpaid"
            ? [{ name: "New", color: "blue" }, { name: "Contacted", color: "amber" }, { name: "Interested", color: "green" }, { name: "Won", color: "green", is_won: true }, { name: "Lost", color: "red", is_lost: true }]
            : [{ name: "New", color: "blue" }, { name: "In Progress", color: "amber" }, { name: "Done", color: "green", is_won: true }];
        await supabase.from("stages").insert(seedStages.map((s: any, i) => ({
          pipeline_id: (data as any).id, name: s.name, color: s.color, position: i,
          is_won: !!s.is_won, is_lost: !!s.is_lost,
        })) as any);
      }
      await logActivity({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "crm_pipeline_created", action_label: "Pipeline created",
        entity_type: "crm_pipeline", entity_label: name,
        metadata: { name, type: newType, source: "move_batch_modal" },
      });
      toast.success(`Created "${name}"`);
      setShowCreate(false); setNewName(""); setNewType("custom"); setNewSeed(true);
      await onMutated();
      if (data?.id) onChange(data.id as string);
    } catch (e: any) {
      toast.error(e?.message || "Could not create pipeline");
    } finally { setBusy(false); }
  };

  const handleDelete = async (p: Pipeline) => {
    const c = counts[p.id] || 0;
    if (c > 0) { toast.error(`${c} leads attached — move them first`); return; }
    if (!confirm(`Delete pipeline "${p.name}" and its stages? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await supabase.from("stages").delete().eq("pipeline_id", p.id);
      const { error } = await supabase.from("pipelines").delete().eq("id", p.id);
      if (error) throw error;
      await logActivity({
        module_key: "calling_crm", module_label: "Calling CRM",
        action_type: "crm_pipeline_deleted", action_label: "Pipeline deleted",
        entity_type: "crm_pipeline", entity_label: p.name,
        severity: "warning",
        metadata: { id: p.id, name: p.name, type: p.type, source: "move_batch_modal" },
      });
      toast.success(`Deleted "${p.name}"`);
      if (value === p.id) onChange("");
      await onMutated();
    } catch (e: any) {
      toast.error(e?.message || "Could not delete");
    } finally { setBusy(false); }
  };

  return (
    <div className="relative mt-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ipc-input !h-10 w-full flex items-center justify-between text-left"
      >
        {selected ? (
          <span className="flex items-center gap-2 truncate">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: TYPE_DOT[selected.type] || "#999" }} />
            <span className="truncate">{selected.name}</span>
            <span className="text-[10px] text-muted-foreground">· {TYPE_LABEL[selected.type] || selected.type}</span>
          </span>
        ) : (
          <span className="text-muted-foreground text-[12.5px]">Select pipeline…</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-line rounded-md shadow-lg overflow-hidden">
          <div className="p-2 border-b border-line">
            <div className="flex items-center gap-1.5 px-2 h-8 rounded-md border border-line bg-off">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search pipelines…"
                className="bg-transparent outline-none text-[12.5px] flex-1"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-[12px] text-muted-foreground">No matches.</div>
            )}
            {filtered.map(p => {
              const c = counts[p.id] || 0;
              const isSel = p.id === value;
              return (
                <div key={p.id} className={`flex items-center gap-1 px-2 py-1 hover:bg-off ${isSel ? "bg-off" : ""}`}>
                  <button
                    type="button"
                    onClick={() => { onChange(p.id); setOpen(false); setShowCreate(false); }}
                    className="flex-1 flex items-center gap-2 text-left text-[12.5px] py-1"
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: TYPE_DOT[p.type] || "#999" }} />
                    <span className="truncate">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">· {TYPE_LABEL[p.type] || p.type}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{c} leads</span>
                    {isSel && <Check className="w-3.5 h-3.5 text-[#16A34A]" />}
                  </button>
                  {isAdmin && c === 0 && (
                    <button
                      type="button"
                      title="Delete empty pipeline"
                      onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                      className="p-1 rounded hover:bg-[#FEF2F2] text-[#DC2626]"
                      disabled={busy}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <div className="border-t border-line p-2">
              {!showCreate ? (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="w-full flex items-center gap-1.5 text-[12.5px] px-2 py-1.5 rounded hover:bg-off text-left"
                >
                  <Plus className="w-3.5 h-3.5" /> Create new pipeline
                </button>
              ) : (
                <div className="space-y-2 p-1">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">New pipeline</div>
                  <input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Pipeline name (e.g. Q3 Webinar Funnel)"
                    className="ipc-input !h-9 w-full"
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["custom", "unpaid", "paid"] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewType(t)}
                        className={`text-[11.5px] py-1.5 rounded border ${newType === t ? "bg-black text-white border-black" : "border-line hover:bg-off"}`}
                      >
                        {TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 text-[11.5px]">
                    <input type="checkbox" checked={newSeed} onChange={e => setNewSeed(e.target.checked)} />
                    Seed default stages
                  </label>
                  <div className="flex justify-end gap-1.5">
                    <button type="button" className="ipc-btn ipc-btn-ghost !h-8" onClick={() => { setShowCreate(false); setNewName(""); }}>Cancel</button>
                    <button type="button" className="ipc-btn ipc-btn-black !h-8" onClick={handleCreate} disabled={busy}>
                      {busy ? "Creating…" : "Create"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
