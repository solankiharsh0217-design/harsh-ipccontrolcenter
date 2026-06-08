import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import type { MergedLead, QualifierResult } from "@/lib/qualifier";
import { GRADE_STYLES, ensurePipelineExists } from "@/lib/crmTypes";
import { X } from "lucide-react";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import WebinarPresetSelector, { bumpWebinarUsage, type WebinarPreset } from "@/components/crm/WebinarPresetSelector";
import DedupPreflightPanel from "@/components/qualifier/DedupPreflightPanel";
import { normalizeEmail, normalizePhone } from "@/lib/identity";

interface Props {
  result: QualifierResult;
  onClose: () => void;
  onDone: () => void;
}

export default function SendToCrmModal({ result, onClose, onDone }: Props) {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(result.webinarDate?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [name, setName] = useState(result.webinarName || "");
  const [totalDays, setTotalDays] = useState<number>(3);
  const [currentDay, setCurrentDay] = useState<number>(1);
  const [isSingle, setIsSingle] = useState<boolean>(false);
  const [durationHours, setDurationHours] = useState<number>(2);
  const [durationMinutes, setDurationMinutes] = useState<number>(0);
  const [productName, setProductName] = useState("IPC Diamond Program");
  const [dealValue, setDealValue] = useState<number>(118000);
  const [leadType, setLeadType] = useState<"unpaid" | "paid">("unpaid");
  const [assignment, setAssignment] = useState<"round_robin"|"hot_to_top"|"unassigned">("unassigned");
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [targetPipelineId, setTargetPipelineId] = useState<string>("");
  const [pipelineNotice, setPipelineNotice] = useState<string>("");
  const [superHotEmails, setSuperHotEmails] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Load metadata when opening step 3
  const goToStep3 = async () => {
    setLoading(true);
    setPipelineNotice("");
    try {
      // Make sure a pipeline of the chosen type exists; auto-create if not.
      let createdNow = false;
      let { data: pl } = await supabase.from("pipelines").select("*").order("position");
      const matching = (pl || []).filter((p: any) => p.type === leadType);
      if (matching.length === 0) {
        setPipelineNotice("No pipeline found — creating default…");
        await ensurePipelineExists(supabase, leadType);
        createdNow = true;
        const reload = await supabase.from("pipelines").select("*").order("position");
        pl = reload.data || [];
      }
      const [elig, { data: st }] = await Promise.all([
        getEligibleAssignees("calling_crm"),
        supabase.from("stages").select("*").order("position"),
      ]);
      setAgents(elig.map((a) => ({ id: a.id, full_name: a.full_name, role: a.role })) as any);
      setPipelines(pl || []);
      setStages(st || []);
      const defaultPipe = (pl || []).find((p: any) => p.type === leadType) || (pl || [])[0];
      setTargetPipelineId(defaultPipe?.id || "");
      if (createdNow) setPipelineNotice(`Created default ${leadType} pipeline.`);
      // detect super hot by normalized email match — chunk to avoid URL-length limits on large uploads
      const emails = Array.from(new Set(result.leads.map((l) => normalizeEmail(l.email)).filter(Boolean))) as string[];
      if (emails.length) {
        const found = new Set<string>();
        const chunkSize = 200;
        for (let i = 0; i < emails.length; i += chunkSize) {
          const chunk = emails.slice(i, i + chunkSize);
          const { data: existing, error: exErr } = await supabase
            .from("leads").select("email").in("email", chunk);
          if (exErr) {
            console.warn("super-hot lookup chunk failed", exErr);
            continue;
          }
          (existing || []).forEach((e: any) => found.add(normalizeEmail(e.email)));
        }
        setSuperHotEmails(found);
      }

      setStep(3);
    } catch (e: any) {
      toast.error(e.message || "Failed to prepare pipeline");
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c = { total: result.leads.length, hot: 0, warm: 0, cold: 0, na: 0, ta: 0, superHot: 0 };
    for (const l of result.leads) {
      if (superHotEmails.has(normalizeEmail(l.email))) c.superHot++;
      if (l.grade === "hot") c.hot++;
      else if (l.grade === "warm") c.warm++;
      else if (l.grade === "cold") c.cold++;
      else if (l.grade === "true-absentee") c.ta++;
      else c.na++;
    }
    return c;
  }, [result.leads, superHotEmails]);

  const totalMinutes = Math.max(0, durationHours * 60 + durationMinutes);
  const durationLabel = totalMinutes >= 60
    ? `${(totalMinutes / 60).toFixed(totalMinutes % 60 === 0 ? 0 : 1)}h`
    : `${totalMinutes}m`;
  const dayLabel = isSingle
    ? "Single"
    : totalDays > 1
      ? `Day ${currentDay} of ${totalDays}`
      : `Day ${currentDay}`;
  const batchLabel = name
    ? `${name} — ${dayLabel} · ${durationLabel}`
    : "";

  const importNow = async () => {
    setImporting(true);
    try {
      let pipeline = pipelines.find((p) => p.id === targetPipelineId)
                  || pipelines.find((p) => p.type === leadType)
                  || pipelines[0];
      let pipelineStages = pipeline ? stages.filter((s) => s.pipeline_id === pipeline.id).sort((a, b) => a.position - b.position) : [];
      if (!pipeline || pipelineStages.length === 0) {
        const ensured = await ensurePipelineExists(supabase, leadType);
        const { data: pl } = await supabase.from("pipelines").select("*").eq("id", ensured.pipelineId).maybeSingle();
        const { data: st } = await supabase.from("stages").select("*").eq("pipeline_id", ensured.pipelineId).order("position");
        pipeline = pl;
        pipelineStages = (st || []) as any;
      }
      const firstStage = pipelineStages[0];
      const activeAgents = agents;
      let rr = 0;

      await supabase.from("lead_qualifier_sessions").insert({
        webinar_name: batchLabel, webinar_date: date,
        total_duration: result.durationMin, registrants: result.registrants,
        viewers: result.viewers, uploaded_by: profile?.id,
        mode: result.mode, zoom_file_name: result.zoomFileName || null,
        registration_file_name: result.regFileName || null,
        true_absentee_count: counts.ta,
      });

      // 1) Find all existing leads in one query by normalized email AND normalized phone
      const normEmails = Array.from(new Set(result.leads.map((l) => normalizeEmail(l.email)).filter(Boolean))) as string[];
      const normPhones = Array.from(new Set(result.leads.map((l) => normalizePhone(l.phone)).filter(Boolean))) as string[];
      type ExMeta = { id: string; webinar_count: number; lead_type: string | null; paid_pipeline_lead_id: string | null };
      const existingByEmail = new Map<string, ExMeta>();
      const existingByPhone = new Map<string, ExMeta>();
      const chunkSize = 500;
      for (let i = 0; i < normEmails.length; i += chunkSize) {
        const chunk = normEmails.slice(i, i + chunkSize);
        const { data: ex } = await supabase.from("leads").select("id, email, phone, webinar_count, lead_type, paid_pipeline_lead_id").in("email", chunk);
        (ex || []).forEach((r: any) => {
          const meta: ExMeta = { id: r.id, webinar_count: r.webinar_count || 1, lead_type: r.lead_type, paid_pipeline_lead_id: r.paid_pipeline_lead_id };
          const e = normalizeEmail(r.email); if (e) existingByEmail.set(e, meta);
          const p = normalizePhone(r.phone); if (p) existingByPhone.set(p, meta);
        });
      }
      for (let i = 0; i < normPhones.length; i += chunkSize) {
        const chunk = normPhones.slice(i, i + chunkSize);
        const { data: ex } = await supabase.from("leads").select("id, email, phone, webinar_count, lead_type, paid_pipeline_lead_id").in("phone", chunk);
        (ex || []).forEach((r: any) => {
          const meta: ExMeta = { id: r.id, webinar_count: r.webinar_count || 1, lead_type: r.lead_type, paid_pipeline_lead_id: r.paid_pipeline_lead_id };
          const p = normalizePhone(r.phone); if (p) existingByPhone.set(p, meta);
          const e = normalizeEmail(r.email); if (e) existingByEmail.set(e, meta);
        });
      }

      const toInsert: any[] = [];
      const toUpdate: { id: string; patch: any; activity: any }[] = [];
      const seenIdentityInBatch = new Set<string>();
      let skipped = 0;

      for (const l of result.leads) {
        const normEmail = normalizeEmail(l.email);
        const normPhone = normalizePhone(l.phone);
        // Require either a valid email OR a 10-digit phone — never silently drop phone-only leads.
        if (!normEmail && !normPhone) { skipped++; continue; }

        // Per-batch dedup safety net (should already be deduped by qualifier, but defensive)
        const identityKey = normEmail ? `e:${normEmail}` : `p:${normPhone}`;
        if (seenIdentityInBatch.has(identityKey)) { skipped++; continue; }
        seenIdentityInBatch.add(identityKey);

        const existing =
          (normEmail && existingByEmail.get(normEmail)) ||
          (normPhone && existingByPhone.get(normPhone)) ||
          null;
        const isSH = !!existing;
        let agentId: string | null = null;
        if (assignment === "round_robin" && activeAgents.length) {
          agentId = activeAgents[rr % activeAgents.length].id; rr++;
        } else if (assignment === "hot_to_top" && (l.grade === "hot" || isSH) && activeAgents.length) {
          agentId = activeAgents[rr % Math.min(2, activeAgents.length)].id; rr++;
        }
        const grade = (isSH ? "super-hot" : l.grade) as any;
        const sourceType = l.grade === "true-absentee" ? "true_absentee"
                          : l.grade === "non-attendee" ? "non_attendee"
                          : l.grade === "hot" ? "attendee_hot"
                          : l.grade === "warm" ? "attendee_warm"
                          : "attendee_cold";
        const payload: any = {
          full_name: l.name, email: normEmail || null, phone: normPhone || null, country: l.country || null,
          score: l.score, grade,
          webinar_source: batchLabel, webinar_date: date, webinar_name: batchLabel,
          pipeline_id: pipeline.id, stage_id: firstStage?.id ?? null,
          assigned_agent_id: agentId, lead_type: leadType,
          program_name: productName, deal_value: dealValue,
          total_minutes: l.totalMinutes, attendance_pct: l.attendancePct,
          sessions_count: l.sessions, first_join_time: l.firstJoin || null,
          is_super_hot: isSH, lead_source_type: sourceType,
        };
        if (existing) {
          toUpdate.push({
            id: existing.id,
            patch: { ...payload, webinar_count: existing.webinar_count + 1 },
            activity: { lead_id: existing.id, agent_id: profile?.id, agent_name: profile?.full_name, channel: "system", note: `Auto-upgraded to Super Hot — attended ${name}` },
          });
        } else {
          toInsert.push(payload);
        }
      }

      // 2) Bulk insert in chunks
      let imported = 0;
      const insertChunk = 200;
      for (let i = 0; i < toInsert.length; i += insertChunk) {
        const chunk = toInsert.slice(i, i + insertChunk);
        const { error, data } = await supabase.from("leads").insert(chunk).select("id");
        if (error) { skipped += chunk.length; } else { imported += (data?.length || chunk.length); }
      }

      // 3) Run updates in parallel batches
      let updated = 0;
      const updBatch = 25;
      for (let i = 0; i < toUpdate.length; i += updBatch) {
        const slice = toUpdate.slice(i, i + updBatch);
        await Promise.all(slice.map(async (u) => {
          const { error } = await supabase.from("leads").update(u.patch).eq("id", u.id);
          if (!error) updated++;
        }));
        if (slice.length) await supabase.from("activity_logs").insert(slice.map((u) => u.activity));
      }

      if (selectedPresetId) {
        await bumpWebinarUsage(selectedPresetId);
      }
      toast.success(`Imported ${imported} · Updated ${updated} · Skipped ${skipped}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div>
            <div className="font-serif text-xl">Send to CRM</div>
            <div className="font-sans text-xs text-muted-foreground mt-0.5">Step {step} of 3</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-off flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        {step === 1 && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-[1fr_180px] gap-3 items-start">
              <div>
                <label className="form-label">Webinar name / title</label>
                <WebinarPresetSelector
                  value={name}
                  onChange={(n, preset?: WebinarPreset) => {
                    setName(n);
                    setSelectedPresetId(preset?.id || null);
                  }}
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Search saved webinars, create new ones, or click Manage to rename/archive.
                </p>
              </div>
              <div>
                <label className="form-label">Webinar date</label>
                <input type="date" className="ipc-input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label">Webinar format</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSingle(false)}
                    className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${!isSingle ? "border-black bg-black text-white" : "border-line bg-white text-foreground hover:border-[#bbb]"}`}
                  >
                    Multi-day series
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSingle(true)}
                    className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${isSingle ? "border-black bg-black text-white" : "border-line bg-white text-foreground hover:border-[#bbb]"}`}
                  >
                    Single session
                  </button>
                </div>
              </div>

              {!isSingle && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Total days in series</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      className="ipc-input"
                      value={totalDays}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                        setTotalDays(n);
                        if (currentDay > n) setCurrentDay(n);
                      }}
                    />
                  </div>
                  <div>
                    <label className="form-label">This upload is for</label>
                    <select
                      className="ipc-input"
                      value={currentDay}
                      onChange={(e) => setCurrentDay(Number(e.target.value))}
                    >
                      {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>Day {d}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">Session duration {isSingle ? "" : "(per day)"}</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={24}
                      className="ipc-input"
                      value={durationHours}
                      onChange={(e) => setDurationHours(Math.max(0, Math.min(24, Number(e.target.value) || 0)))}
                    />
                    <span className="text-xs text-muted-foreground">hours</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      className="ipc-input"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                    />
                    <span className="text-xs text-muted-foreground">minutes</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Creates a separate batch in Calling CRM as <span className="font-medium">{batchLabel || "Webinar — Day 1 · 2h"}</span> so each day's leads stay clean and addressable.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
              <button onClick={() => setStep(2)} disabled={!name || !date} className="ipc-btn ipc-btn-black disabled:opacity-50">Continue</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {(["unpaid","paid"] as const).map((t) => (
                <button key={t} onClick={() => setLeadType(t)} className={`text-left p-4 rounded-lg border-2 transition-colors ${leadType === t ? "border-black bg-off" : "border-line hover:border-[#bbb]"}`}>
                  <div className="font-serif text-base">{t === "unpaid" ? "Unpaid leads" : "Paid leads"}</div>
                  <div className="font-sans text-xs text-muted-foreground mt-1">{t === "unpaid" ? "Attended webinar, not yet paid → Sales Pipeline" : "Already paid → Onboarding pipeline"}</div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Product / Program name</label>
                <input type="text" className="ipc-input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Diamond Program" />
              </div>
              <div>
                <label className="form-label">Deal value (₹) per lead</label>
                <input type="number" min={0} className="ipc-input" value={dealValue} onChange={(e) => setDealValue(Number(e.target.value) || 0)} />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#FBF6E9] border border-[#E8D49A] font-sans text-xs">
              <span className="font-medium">{productName || "Product"}</span> · ₹{dealValue.toLocaleString("en-IN")} will be attached as deal value to every imported lead. You can change this per lead later.
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="ipc-btn ipc-btn-ghost">Back</button>
              <button onClick={goToStep3} disabled={loading} className="ipc-btn ipc-btn-black">{loading ? "Loading…" : "Continue"}</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-5 gap-2">
              {[
                { k: "Total", v: counts.total },
                { k: "Hot", v: counts.hot, c: GRADE_STYLES.hot },
                { k: "Warm", v: counts.warm, c: GRADE_STYLES.warm },
                { k: "Cold", v: counts.cold, c: GRADE_STYLES.cold },
                result.mode === 2
                  ? { k: "True Absentees", v: counts.ta, c: GRADE_STYLES["true-absentee"] }
                  : { k: "No Show", v: counts.na, c: GRADE_STYLES["non-attendee"] },
              ].map((s) => (
                <div key={s.k} className="p-3 rounded-lg border border-line text-center">
                  <div className="font-serif text-2xl" style={{ color: (s as any).c?.fg }}>{s.v}</div>
                  <div className="uppercase-label mt-1">{s.k}</div>
                </div>
              ))}
            </div>
            <DedupPreflightPanel summary={result.dedupSummary} mode={result.mode} />
            {counts.superHot > 0 && (
              <div className="p-3 rounded-lg" style={{ background: GRADE_STYLES["super-hot"].bg, border: `1px solid ${GRADE_STYLES["super-hot"].border}`, color: GRADE_STYLES["super-hot"].fg }}>
                <span className="font-medium">★ {counts.superHot} Super Hot leads detected</span> — already attended a previous webinar.
              </div>
            )}
            {pipelineNotice && (
              <div className="p-2 rounded-md bg-off border border-line text-xs text-muted-foreground">{pipelineNotice}</div>
            )}
            <div>
              <label className="form-label">Target pipeline</label>
              <select className="ipc-input" value={targetPipelineId} onChange={(e) => setTargetPipelineId(e.target.value)}>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Assignment method</label>
              <select className="ipc-input" value={assignment} onChange={(e) => setAssignment(e.target.value as any)}>
                <option value="unassigned">Leave unassigned — admin assigns later</option>
                <option value="round_robin">Auto-assign round-robin to all agents ({agents.length})</option>
                <option value="hot_to_top">Hot + Super Hot to top 2 agents only</option>
              </select>
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="ipc-btn ipc-btn-ghost">Back</button>
              <button onClick={importNow} disabled={importing} className="ipc-btn ipc-btn-black">{importing ? "Importing…" : `Import ${counts.total} leads`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
