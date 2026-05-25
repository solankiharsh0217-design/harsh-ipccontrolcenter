import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { X, Info } from "lucide-react";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import { ensureOperationsPipeline } from "@/lib/operationsCrm";
import { logActivity } from "@/lib/auditLog";
import { createNotification } from "@/lib/notifications";

interface SourceLead {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  program_name: string | null;
  webinar_source: string | null;
  deal_value: number | null;
  stage_id: string | null;
  paid_pipeline_lead_id?: string | null;
}

interface StageOption {
  id: string;
  name: string;
}

interface Props {
  /** Pre-fetched leads that match the active pipeline view */
  candidateLeads: SourceLead[];
  /** Stages of the source pipeline, used to scope which stages to send */
  sourceStages: StageOption[];
  /** Optional pre-selected lead ids (overrides scope selector) */
  preSelectedIds?: string[];
  onClose: () => void;
  onDone: () => void;
}

type AssignMethod = "unassigned" | "single" | "round_robin";
type Scope = "all" | "stages" | "selected";

export default function SendToOperationsCrmModal({
  candidateLeads,
  sourceStages,
  preSelectedIds,
  onClose,
  onDone,
}: Props) {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<Scope>(preSelectedIds && preSelectedIds.length > 0 ? "selected" : "all");
  const [pickedStages, setPickedStages] = useState<Set<string>>(new Set());

  const [serviceMonths, setServiceMonths] = useState<number>(3);
  const [customMonths, setCustomMonths] = useState<string>("");
  const [packageName, setPackageName] = useState<string>("Ads Management");
  const [assignMethod, setAssignMethod] = useState<AssignMethod>("unassigned");
  const [assignees, setAssignees] = useState<{ id: string; full_name: string }[]>([]);
  const [singleAssignee, setSingleAssignee] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update">("skip");

  useEffect(() => {
    getEligibleAssignees("operations_crm")
      .then((rows) => setAssignees(rows.map((r) => ({ id: r.id, full_name: r.full_name }))))
      .catch(() => setAssignees([]));
  }, []);

  const selectedLeads: SourceLead[] = useMemo(() => {
    if (preSelectedIds && preSelectedIds.length > 0 && scope === "selected") {
      const set = new Set(preSelectedIds);
      return candidateLeads.filter((l) => set.has(l.id));
    }
    if (scope === "stages") {
      return candidateLeads.filter((l) => l.stage_id && pickedStages.has(l.stage_id));
    }
    return candidateLeads;
  }, [scope, candidateLeads, preSelectedIds, pickedStages]);

  const monthsFinal = useMemo(() => {
    if (serviceMonths === -1) {
      const n = Math.max(1, Math.min(60, Number(customMonths) || 0));
      return n || 0;
    }
    return serviceMonths;
  }, [serviceMonths, customMonths]);

  const toggleStage = (id: string) => {
    setPickedStages((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = async () => {
    if (selectedLeads.length === 0) {
      toast.error("No leads selected");
      return;
    }
    if (!monthsFinal || monthsFinal <= 0) {
      toast.error("Pick a valid service duration");
      return;
    }
    if (assignMethod === "single" && !singleAssignee) {
      toast.error("Pick a media buyer");
      return;
    }
    if (assignMethod === "round_robin" && assignees.length === 0) {
      toast.error("No eligible media buyers — enable 'Can receive Operations leads' in Team Directory.");
      return;
    }

    setBusy(true);
    try {
      const { pipelineId, firstStageId } = await ensureOperationsPipeline();
      const sourceIds = selectedLeads.map((l) => l.id);

      // Check duplicates among active operations leads
      const { data: existing } = await supabase
        .from("operations_leads" as any)
        .select("id, crm_lead_id, assigned_media_buyer_id, service_status, stage_id")
        .in("crm_lead_id", sourceIds);
      const existingByCrm = new Map<string, any>();
      (existing ?? []).forEach((r: any) => {
        if (r.crm_lead_id && r.service_status !== "stopped" && r.service_status !== "completed") {
          existingByCrm.set(r.crm_lead_id, r);
        }
      });

      const daysCommitted = Math.round(monthsFinal * 30);
      const buyerNameById = new Map(assignees.map((a) => [a.id, a.full_name]));

      let rr = 0;
      const toInsert: any[] = [];
      const toUpdate: { id: string; patch: any }[] = [];
      let skipped = 0;
      const buyerCounts: Record<string, number> = {};

      for (const lead of selectedLeads) {
        const dup = existingByCrm.get(lead.id);
        let buyerId: string | null = null;
        if (assignMethod === "single") buyerId = singleAssignee;
        else if (assignMethod === "round_robin" && assignees.length) {
          buyerId = assignees[rr % assignees.length].id;
          rr++;
        }
        const buyerName = buyerId ? (buyerNameById.get(buyerId) ?? null) : null;

        if (dup) {
          if (duplicateMode === "skip") {
            skipped++;
            continue;
          }
          toUpdate.push({
            id: dup.id,
            patch: {
              service_months: monthsFinal,
              service_days_committed: daysCommitted,
              service_package_name: packageName,
              assigned_media_buyer_id: buyerId,
              assigned_media_buyer_name: buyerName,
              notes: notes || null,
            },
          });
          if (buyerId) buyerCounts[buyerId] = (buyerCounts[buyerId] ?? 0) + 1;
          continue;
        }

        toInsert.push({
          crm_lead_id: lead.id,
          paid_pipeline_lead_id: lead.paid_pipeline_lead_id ?? null,
          name: lead.full_name ?? "—",
          email: lead.email,
          phone: lead.phone,
          product_name: lead.program_name,
          batch_name: lead.webinar_source,
          onboarding_batch: lead.webinar_source,
          deal_value: lead.deal_value,
          service_package_name: packageName,
          service_months: monthsFinal,
          service_days_committed: daysCommitted,
          service_status: "not_started",
          pipeline_id: pipelineId,
          stage_id: firstStageId,
          assigned_media_buyer_id: buyerId,
          assigned_media_buyer_name: buyerName,
          notes: notes || null,
          created_by: profile?.id ?? null,
        });
        if (buyerId) buyerCounts[buyerId] = (buyerCounts[buyerId] ?? 0) + 1;
      }

      let inserted = 0;
      const chunk = 200;
      for (let i = 0; i < toInsert.length; i += chunk) {
        const slice = toInsert.slice(i, i + chunk);
        const { error, data } = await supabase.from("operations_leads" as any).insert(slice).select("id");
        if (!error) inserted += data?.length ?? slice.length;
        else skipped += slice.length;
      }
      let updated = 0;
      for (const u of toUpdate) {
        const { error } = await supabase.from("operations_leads" as any).update(u.patch).eq("id", u.id);
        if (!error) updated++;
      }

      await logActivity({
        action: "operations_leads_sent_from_crm",
        entity: "operations_leads",
        entityId: null,
        details: {
          inserted, updated, skipped,
          service_months: monthsFinal,
          package: packageName,
          assignment_method: assignMethod,
        },
      }).catch(() => {});

      // Grouped notification per assignee
      const triggeredByName = profile?.full_name ?? "Admin";
      await Promise.all(
        Object.entries(buyerCounts).map(([buyerId, count]) =>
          createNotification({
            recipient_user_id: buyerId,
            module_key: "operations_crm",
            notification_type: "operations_leads_assigned",
            title: `${count} new Operations CRM ${count === 1 ? "client" : "clients"} assigned to you`,
            message: `${packageName} · ${monthsFinal} month${monthsFinal === 1 ? "" : "s"} service`,
            priority: "high",
            entity_type: "operations_leads",
            entity_label: `${count} clients`,
            action_url: `/operations-crm?assigned_to=me`,
            action_label: "Open Operations CRM",
            triggered_by_user_id: profile?.id ?? null,
            triggered_by_name: triggeredByName,
            metadata: { count, service_months: monthsFinal, package: packageName },
            allowDuplicate: true,
          }).catch(() => {})
        )
      );

      toast.success(`Sent to Operations CRM · Created ${inserted} · Updated ${updated} · Skipped ${skipped}`);
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to send to Operations CRM");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div>
            <div className="font-serif text-xl">Send to Operations CRM</div>
            <div className="font-sans text-xs text-muted-foreground mt-0.5">
              Hand selected paid clients off to the operations / media buying team.
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-off flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Scope */}
          <div>
            <label className="form-label">Which leads</label>
            <div className="flex gap-2 flex-wrap">
              {preSelectedIds && preSelectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScope("selected")}
                  className={`px-3 py-1.5 rounded-md text-xs border ${scope === "selected" ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
                >
                  Selected ({preSelectedIds.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`px-3 py-1.5 rounded-md text-xs border ${scope === "all" ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
              >
                All leads in current view ({candidateLeads.length})
              </button>
              <button
                type="button"
                onClick={() => setScope("stages")}
                className={`px-3 py-1.5 rounded-md text-xs border ${scope === "stages" ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
              >
                Selected stages
              </button>
            </div>
            {scope === "stages" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sourceStages.map((s) => {
                  const on = pickedStages.has(s.id);
                  const cnt = candidateLeads.filter((l) => l.stage_id === s.id).length;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleStage(s.id)}
                      className={`text-[11px] px-2 py-1 rounded-md border ${on ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
                    >
                      {s.name} · {cnt}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-2 text-[11px] text-muted-foreground">
              Will send <span className="font-medium text-foreground">{selectedLeads.length}</span> lead{selectedLeads.length === 1 ? "" : "s"} to Operations CRM.
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="form-label">Service duration</label>
            <div className="flex flex-wrap gap-2 items-center">
              {[3, 6, 10].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setServiceMonths(m)}
                  className={`px-3 py-1.5 rounded-md text-xs border ${serviceMonths === m ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
                >
                  {m} months
                </button>
              ))}
              <button
                type="button"
                onClick={() => setServiceMonths(-1)}
                className={`px-3 py-1.5 rounded-md text-xs border ${serviceMonths === -1 ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
              >
                Custom
              </button>
              {serviceMonths === -1 && (
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={customMonths}
                  onChange={(e) => setCustomMonths(e.target.value)}
                  placeholder="Months"
                  className="ipc-input !h-8 !text-xs w-24"
                />
              )}
            </div>
          </div>

          {/* Package */}
          <div>
            <label className="form-label">Service package</label>
            <input
              type="text"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              placeholder="e.g. Ads Management"
              className="ipc-input"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {["Ads Management", "Lead Generation Support", "3-Month Service", "6-Month Service"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPackageName(p)}
                  className="text-[10px] px-2 py-0.5 rounded border border-line text-muted-foreground hover:text-black"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Assignment */}
          <div>
            <label className="form-label">Assignment</label>
            <div className="flex gap-2 flex-wrap">
              {([
                ["unassigned", "Leave unassigned"],
                ["single", "Assign to one media buyer"],
                ["round_robin", `Round robin (${assignees.length} eligible)`],
              ] as [AssignMethod, string][]).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAssignMethod(k)}
                  className={`px-3 py-1.5 rounded-md text-xs border ${assignMethod === k ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {assignMethod === "single" && (
              <select
                className="ipc-input !text-xs mt-2 max-w-xs"
                value={singleAssignee}
                onChange={(e) => setSingleAssignee(e.target.value)}
              >
                <option value="">Pick a media buyer…</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.full_name}</option>
                ))}
              </select>
            )}
            {assignees.length === 0 && assignMethod !== "unassigned" && (
              <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1.5">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>No eligible media buyers found. In Team Directory → Manage Member, enable <span className="font-medium">"Can receive Operations leads"</span>.</span>
              </div>
            )}
          </div>

          {/* Duplicates */}
          <div>
            <label className="form-label">If a lead already exists in Operations CRM</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDuplicateMode("skip")}
                className={`px-3 py-1.5 rounded-md text-xs border ${duplicateMode === "skip" ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
              >
                Skip duplicates
              </button>
              <button
                type="button"
                onClick={() => setDuplicateMode("update")}
                className={`px-3 py-1.5 rounded-md text-xs border ${duplicateMode === "update" ? "bg-black text-white border-black" : "border-line hover:border-[#bbb]"}`}
              >
                Update existing record
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="ipc-input !text-xs"
              placeholder="Internal notes for the operations team…"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost" disabled={busy}>Cancel</button>
          <button onClick={run} disabled={busy || selectedLeads.length === 0} className="ipc-btn ipc-btn-black disabled:opacity-50">
            {busy ? "Sending…" : `Send ${selectedLeads.length} to Operations CRM`}
          </button>
        </div>
      </div>
    </div>
  );
}
