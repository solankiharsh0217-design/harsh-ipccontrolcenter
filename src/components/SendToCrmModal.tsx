import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import type { MergedLead, QualifierResult } from "@/lib/qualifier";
import { GRADE_STYLES, ensurePipelineExists } from "@/lib/crmTypes";
import { X } from "lucide-react";

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
      const [{ data: ag }, { data: st }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, role, status").eq("status", "active"),
        supabase.from("stages").select("*").order("position"),
      ]);
      setAgents((ag || []).filter((a: any) => /BDE|Sales|Agent/i.test(a.role || "")) as any);
      setPipelines(pl || []);
      setStages(st || []);
      const defaultPipe = (pl || []).find((p: any) => p.type === leadType) || (pl || [])[0];
      setTargetPipelineId(defaultPipe?.id || "");
      if (createdNow) setPipelineNotice(`Created default ${leadType} pipeline.`);
      // detect super hot by email match
      const emails = result.leads.map((l) => l.email).filter(Boolean);
      if (emails.length) {
        const { data: existing } = await supabase.from("leads").select("email").in("email", emails);
        setSuperHotEmails(new Set((existing || []).map((e: any) => (e.email || "").toLowerCase())));
      }
      setStep(3);
    } catch (e: any) {
      toast.error(e.message || "Failed to prepare pipeline");
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c = { total: result.leads.length, hot: 0, warm: 0, cold: 0, na: 0, superHot: 0 };
    for (const l of result.leads) {
      if (superHotEmails.has(l.email)) c.superHot++;
      if (l.grade === "hot") c.hot++;
      else if (l.grade === "warm") c.warm++;
      else if (l.grade === "cold") c.cold++;
      else c.na++;
    }
    return c;
  }, [result.leads, superHotEmails]);

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
        webinar_name: name, webinar_date: date,
        total_duration: result.durationMin, registrants: result.registrants,
        viewers: result.viewers, uploaded_by: profile?.id,
      });

      // 1) Find all existing emails in one query (for super-hot detection / dedupe)
      const allEmails = result.leads.map((l) => l.email).filter(Boolean);
      const existingMap = new Map<string, { id: string; webinar_count: number }>();
      if (allEmails.length) {
        const chunkSize = 500;
        for (let i = 0; i < allEmails.length; i += chunkSize) {
          const chunk = allEmails.slice(i, i + chunkSize);
          const { data: ex } = await supabase.from("leads").select("id, email, webinar_count").in("email", chunk);
          (ex || []).forEach((r: any) => existingMap.set((r.email || "").toLowerCase(), { id: r.id, webinar_count: r.webinar_count || 1 }));
        }
      }

      const toInsert: any[] = [];
      const toUpdate: { id: string; patch: any; activity: any }[] = [];
      let skipped = 0;

      for (const l of result.leads) {
        if (!l.email) { skipped++; continue; }
        const existing = existingMap.get(l.email.toLowerCase());
        const isSH = !!existing;
        let agentId: string | null = null;
        if (assignment === "round_robin" && activeAgents.length) {
          agentId = activeAgents[rr % activeAgents.length].id; rr++;
        } else if (assignment === "hot_to_top" && (l.grade === "hot" || isSH) && activeAgents.length) {
          agentId = activeAgents[rr % Math.min(2, activeAgents.length)].id; rr++;
        }
        const grade = (isSH ? "super-hot" : l.grade) as any;
        const payload: any = {
          full_name: l.name, email: l.email, phone: l.phone || null, country: l.country || null,
          score: l.score, grade,
          webinar_source: name, webinar_date: date, webinar_name: name,
          pipeline_id: pipeline.id, stage_id: firstStage?.id ?? null,
          assigned_agent_id: agentId, lead_type: leadType,
          program_name: productName, deal_value: dealValue,
          total_minutes: l.totalMinutes, attendance_pct: l.attendancePct,
          sessions_count: l.sessions, first_join_time: l.firstJoin || null,
          is_super_hot: isSH,
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
            <div>
              <label className="form-label">Webinar date</label>
              <input type="date" className="ipc-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Webinar name / title</label>
              <input type="text" className="ipc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diamond Program Masterclass — Apr 8" />
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
            <div className="p-3 rounded-lg bg-[#FBF6E9] border border-[#E8D49A] font-sans text-xs">
              <span className="font-medium">IPC Diamond Program</span> · ₹1,00,000 + GST = ₹1,18,000 auto-attached as deal value.
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
                { k: "No Show", v: counts.na, c: GRADE_STYLES["non-attendee"] },
              ].map((s) => (
                <div key={s.k} className="p-3 rounded-lg border border-line text-center">
                  <div className="font-serif text-2xl" style={{ color: (s as any).c?.fg }}>{s.v}</div>
                  <div className="uppercase-label mt-1">{s.k}</div>
                </div>
              ))}
            </div>
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
