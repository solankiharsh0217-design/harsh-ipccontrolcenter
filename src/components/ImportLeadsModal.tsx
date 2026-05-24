import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { X, Plus, Upload } from "lucide-react";
import { DEFAULT_PIPELINE_TEMPLATES, ensurePipelineExists, GRADE_STYLES, type LeadGrade } from "@/lib/crmTypes";

export interface ImportResult {
  pipelineId: string;
  pipelineName: string;
  leadType: "unpaid" | "paid";
  batchName: string;
  imported: number;
  skipped: number;
}

interface Props {
  onClose: () => void;
  onDone: (result?: ImportResult) => void;
}

type Row = Record<string, string>;
type FieldKey = "full_name" | "email" | "phone" | "country";

const FIELD_GUESS: Record<FieldKey, RegExp> = {
  full_name: /^(name|full[\s_-]?name|first[\s_-]?name|attendee|user)/i,
  email: /e[\s_-]?mail/i,
  phone: /(phone|mobile|whatsapp|contact|number)/i,
  country: /country/i,
};

function autoMap(headers: string[]): Record<FieldKey, string> {
  const out: any = { full_name: "", email: "", phone: "", country: "" };
  for (const h of headers) {
    for (const k of Object.keys(FIELD_GUESS) as FieldKey[]) {
      if (!out[k] && FIELD_GUESS[k].test(h)) out[k] = h;
    }
  }
  return out;
}

export default function ImportLeadsModal({ onClose, onDone }: Props) {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({ full_name: "", email: "", phone: "", country: "" });

  // Step 2
  const [segmentName, setSegmentName] = useState("");
  const [webinars, setWebinars] = useState<{ id: string; name: string }[]>([]);
  const [webinarName, setWebinarName] = useState("");
  const [addingWebinar, setAddingWebinar] = useState(false);
  const [webinarDate, setWebinarDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  // Step 3
  const [leadType, setLeadType] = useState<"unpaid" | "paid">("unpaid");
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [targetPipelineId, setTargetPipelineId] = useState<string>("");
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [newPipeName, setNewPipeName] = useState("");
  const [newPipeType, setNewPipeType] = useState<"unpaid" | "paid" | "custom">("unpaid");
  const [newPipeSeed, setNewPipeSeed] = useState(true);
  const [defaultGrade, setDefaultGrade] = useState<LeadGrade>("warm");
  const [productName, setProductName] = useState("IPC Diamond Program");
  const [dealValue, setDealValue] = useState<number>(118000);

  // Step 4
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [assignment, setAssignment] = useState<"unassigned" | "round_robin" | "hot_to_top">("unassigned");
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("webinars").select("id, name").order("name").then(({ data }) => setWebinars((data || []) as any));
  }, []);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
    const data = (parsed.data || []).filter((r) => Object.values(r).some((v) => String(v || "").trim()));
    const hdrs = parsed.meta.fields || [];
    setHeaders(hdrs);
    setRows(data);
    setMapping(autoMap(hdrs));
  };

  const saveWebinarToDb = async () => {
    const n = webinarName.trim();
    if (!n) return;
    if (webinars.some((w) => w.name.toLowerCase() === n.toLowerCase())) { toast.info("Already in database"); setAddingWebinar(false); return; }
    const { data, error } = await supabase.from("webinars").insert({ name: n }).select().maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (data) { setWebinars((p) => [...p, data as any].sort((a, b) => a.name.localeCompare(b.name))); setAddingWebinar(false); toast.success("Webinar saved"); }
  };

  const goToStep3 = async () => {
    setLoading(true);
    try {
      const [{ data: pl }, { data: st }, { data: ag }] = await Promise.all([
        supabase.from("pipelines").select("*").order("position"),
        supabase.from("stages").select("*").order("position"),
        supabase.from("profiles").select("id, full_name, role, status").eq("status", "active"),
      ]);
      setPipelines(pl || []);
      setStages(st || []);
      setAgents(((ag || []) as any).filter((a: any) => /BDE|Sales|Agent/i.test(a.role || "")));
      const def = (pl || []).find((p: any) => p.type === leadType) || (pl || [])[0];
      setTargetPipelineId(def?.id || "__new__");
      setNewPipeType(leadType);
      setStep(3);
    } finally { setLoading(false); }
  };

  const filteredPipelines = useMemo(() => pipelines.filter((p) => p.type === leadType || p.type === "custom"), [pipelines, leadType]);

  const importNow = async () => {
    setImporting(true);
    try {
      // Resolve pipeline (existing or create)
      let pipelineId = targetPipelineId;
      if (creatingPipeline || pipelineId === "__new__") {
        if (!newPipeName.trim()) { toast.error("Pipeline name required"); setImporting(false); return; }
        const { data: ins, error } = await supabase.from("pipelines").insert({ name: newPipeName.trim(), type: newPipeType, position: pipelines.length }).select().maybeSingle();
        if (error || !ins) { toast.error(error?.message || "Pipeline create failed"); setImporting(false); return; }
        pipelineId = ins.id;
        if (newPipeSeed) {
          const tmpl = DEFAULT_PIPELINE_TEMPLATES[newPipeType];
          await supabase.from("stages").insert(tmpl.map((s, i) => ({
            pipeline_id: pipelineId, name: s.name, color: s.color, position: i,
            is_won: !!s.is_won, is_lost: !!s.is_lost, is_protected: !!s.is_protected,
          })));
        }
      }

      // Load stages for chosen pipeline
      const { data: pStages } = await supabase.from("stages").select("*").eq("pipeline_id", pipelineId).order("position");
      let stageList = pStages || [];
      if (stageList.length === 0) {
        const ensured = await ensurePipelineExists(supabase, leadType);
        pipelineId = ensured.pipelineId;
        const reload = await supabase.from("stages").select("*").eq("pipeline_id", pipelineId).order("position");
        stageList = reload.data || [];
      }
      const firstStageId = stageList[0]?.id ?? null;

      // Build records
      const get = (r: Row, k: FieldKey) => (mapping[k] ? String(r[mapping[k]] || "").trim() : "");
      const records = rows.map((r) => ({
        full_name: get(r, "full_name") || null,
        email: get(r, "email").toLowerCase() || null,
        phone: get(r, "phone") || null,
        country: get(r, "country") || null,
      })).filter((r) => r.full_name || r.email || r.phone);

      // Dedup detection (by email)
      const emails = records.map((r) => r.email).filter(Boolean) as string[];
      const existingEmails = new Set<string>();
      for (let i = 0; i < emails.length; i += 500) {
        const chunk = emails.slice(i, i + 500);
        const { data: ex } = await supabase.from("leads").select("email").in("email", chunk);
        (ex || []).forEach((e: any) => existingEmails.add((e.email || "").toLowerCase()));
      }

      // Assignment
      const activeAgents = agents;
      let rr = 0;

      const payloads = records.map((r) => {
        const isSH = !!(r.email && existingEmails.has(r.email));
        const grade = (isSH ? "super-hot" : defaultGrade) as LeadGrade;
        let agentId: string | null = null;
        if (assignment === "round_robin" && activeAgents.length) {
          agentId = activeAgents[rr % activeAgents.length].id; rr++;
        } else if (assignment === "hot_to_top" && (grade === "hot" || isSH) && activeAgents.length) {
          agentId = activeAgents[rr % Math.min(2, activeAgents.length)].id; rr++;
        }
        return {
          full_name: r.full_name, email: r.email, phone: r.phone, country: r.country,
          score: 0, grade,
          webinar_source: segmentName, webinar_date: webinarDate, webinar_name: webinarName || segmentName,
          pipeline_id: pipelineId, stage_id: firstStageId,
          assigned_agent_id: agentId, lead_type: leadType,
          program_name: productName, deal_value: dealValue,
          total_minutes: 0, attendance_pct: 0, sessions_count: 0,
          is_super_hot: isSH, lead_source_type: "direct_import",
        };
      });

      let imported = 0, skipped = 0;
      for (let i = 0; i < payloads.length; i += 200) {
        const chunk = payloads.slice(i, i + 200);
        const { data, error } = await supabase.from("leads").insert(chunk).select("id");
        if (error) skipped += chunk.length;
        else imported += data?.length || chunk.length;
      }

      if (notes.trim() && profile?.id) {
        // best-effort: log a single import-summary activity (no lead_id) — silently ignore if not allowed
        // skipping to avoid schema mismatch; notes can be added per-lead later
      }

      toast.success(`Imported ${imported} leads · Segment "${segmentName}"${skipped ? ` · ${skipped} skipped` : ""}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally { setImporting(false); }
  };

  const validRows = rows.length;
  const mappedOk = !!(mapping.full_name || mapping.email || mapping.phone);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div>
            <div className="font-serif text-xl">Import Leads</div>
            <div className="font-sans text-xs text-muted-foreground mt-0.5">Step {step} of 4</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-off flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        {step === 1 && (
          <div className="p-6 space-y-4">
            <label className="block">
              <div className="border-2 border-dashed border-line rounded-lg p-8 text-center cursor-pointer hover:border-black transition-colors">
                <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <div className="font-sans text-sm">{fileName || "Click to upload CSV"}</div>
                <div className="text-[11px] text-muted-foreground mt-1">Headers in first row · UTF-8 CSV</div>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>
            </label>

            {headers.length > 0 && (
              <>
                <div className="text-xs text-muted-foreground">{validRows} rows detected · map your columns:</div>
                <div className="grid grid-cols-2 gap-3">
                  {(["full_name", "email", "phone", "country"] as FieldKey[]).map((k) => (
                    <div key={k}>
                      <label className="form-label capitalize">{k.replace("_", " ")}</label>
                      <select className="ipc-input" value={mapping[k]} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })}>
                        <option value="">— none —</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {rows[0] && (
                  <div className="p-3 rounded-md bg-off border border-line text-xs">
                    <div className="uppercase-label mb-1">Preview row 1</div>
                    <div>{mapping.full_name && <>Name: <b>{rows[0][mapping.full_name]}</b> · </>}{mapping.email && <>Email: <b>{rows[0][mapping.email]}</b> · </>}{mapping.phone && <>Phone: <b>{rows[0][mapping.phone]}</b></>}</div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
              <button onClick={() => setStep(2)} disabled={!mappedOk || validRows === 0} className="ipc-btn ipc-btn-black disabled:opacity-50">Continue</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-6 space-y-4">
            <div>
              <label className="form-label">Segment name *</label>
              <input type="text" className="ipc-input" value={segmentName} onChange={(e) => setSegmentName(e.target.value)} placeholder="e.g. Apr-8 Masterclass — Manual Upload" autoFocus />
              <p className="text-[11px] text-muted-foreground mt-1">Used as the batch label in CRM filters and Kanban cards.</p>
            </div>
            <div>
              <label className="form-label">Webinar</label>
              {!addingWebinar ? (
                <div className="flex gap-2">
                  <select className="ipc-input flex-1" value={webinarName} onChange={(e) => setWebinarName(e.target.value)}>
                    <option value="">Select a webinar…</option>
                    {webinars.map((w) => <option key={w.id} value={w.name}>{w.name}</option>)}
                  </select>
                  <button type="button" onClick={() => { setAddingWebinar(true); setWebinarName(""); }} className="ipc-btn ipc-btn-ghost"><Plus className="w-3.5 h-3.5" /> New</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input type="text" className="ipc-input flex-1" value={webinarName} onChange={(e) => setWebinarName(e.target.value)} placeholder="Webinar title" autoFocus />
                  <button type="button" onClick={saveWebinarToDb} disabled={!webinarName.trim()} className="ipc-btn ipc-btn-black disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Save</button>
                  {webinars.length > 0 && <button type="button" onClick={() => setAddingWebinar(false)} className="ipc-btn ipc-btn-ghost">Cancel</button>}
                </div>
              )}
            </div>
            <div>
              <label className="form-label">Webinar date</label>
              <input type="date" className="ipc-input" value={webinarDate} onChange={(e) => setWebinarDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Source notes (optional)</label>
              <textarea className="ipc-input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where did this list come from?" />
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="ipc-btn ipc-btn-ghost">Back</button>
              <button onClick={goToStep3} disabled={!segmentName.trim() || loading} className="ipc-btn ipc-btn-black disabled:opacity-50">{loading ? "Loading…" : "Continue"}</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {(["unpaid", "paid"] as const).map((t) => (
                <button key={t} onClick={() => { setLeadType(t); setNewPipeType(t); }} className={`text-left p-4 rounded-lg border-2 transition-colors ${leadType === t ? "border-black bg-off" : "border-line hover:border-[#bbb]"}`}>
                  <div className="font-serif text-base">{t === "unpaid" ? "Unpaid leads" : "Paid leads"}</div>
                  <div className="font-sans text-xs text-muted-foreground mt-1">{t === "unpaid" ? "Sales pipeline" : "Onboarding pipeline"}</div>
                </button>
              ))}
            </div>

            <div>
              <label className="form-label">Target pipeline</label>
              <select
                className="ipc-input"
                value={creatingPipeline ? "__new__" : targetPipelineId}
                onChange={(e) => {
                  if (e.target.value === "__new__") { setCreatingPipeline(true); }
                  else { setCreatingPipeline(false); setTargetPipelineId(e.target.value); }
                }}>
                {filteredPipelines.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.type}</option>)}
                <option value="__new__">+ Create new pipeline…</option>
              </select>
            </div>

            {creatingPipeline && (
              <div className="p-3 rounded-lg border border-line bg-off space-y-3">
                <div>
                  <label className="form-label">New pipeline name</label>
                  <input type="text" className="ipc-input" value={newPipeName} onChange={(e) => setNewPipeName(e.target.value)} placeholder="e.g. April Webinar Funnel" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Pipeline type</label>
                    <select className="ipc-input" value={newPipeType} onChange={(e) => setNewPipeType(e.target.value as any)}>
                      <option value="unpaid">Unpaid (Sales)</option>
                      <option value="paid">Paid (Onboarding)</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <label className="flex items-end gap-2 pb-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={newPipeSeed} onChange={(e) => setNewPipeSeed(e.target.checked)} />
                    Seed default stages
                  </label>
                </div>
              </div>
            )}

            <div>
              <label className="form-label">Default grade for these leads</label>
              <select className="ipc-input" value={defaultGrade} onChange={(e) => setDefaultGrade(e.target.value as LeadGrade)}>
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
                <option value="non-attendee">No Show</option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">Existing-email matches will be auto-tagged ★ Super Hot regardless.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Product / Program name</label>
                <input type="text" className="ipc-input" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Deal value (₹) per lead</label>
                <input type="number" min={0} className="ipc-input" value={dealValue} onChange={(e) => setDealValue(Number(e.target.value) || 0)} />
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="ipc-btn ipc-btn-ghost">Back</button>
              <button onClick={() => setStep(4)} disabled={creatingPipeline && !newPipeName.trim()} className="ipc-btn ipc-btn-black disabled:opacity-50">Continue</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-lg border border-line bg-off space-y-1.5 text-sm">
              <div><span className="text-muted-foreground">Rows:</span> <b>{validRows}</b></div>
              <div><span className="text-muted-foreground">Segment:</span> <b>{segmentName}</b></div>
              <div><span className="text-muted-foreground">Webinar:</span> <b>{webinarName || "—"}</b> · {webinarDate}</div>
              <div><span className="text-muted-foreground">Pipeline:</span> <b>{creatingPipeline ? `${newPipeName} (new · ${newPipeType})` : (filteredPipelines.find((p) => p.id === targetPipelineId)?.name || "—")}</b></div>
              <div><span className="text-muted-foreground">Lead type:</span> <b>{leadType}</b> · default grade <b style={{ color: GRADE_STYLES[defaultGrade].fg }}>{GRADE_STYLES[defaultGrade].label}</b></div>
            </div>

            <div>
              <label className="form-label">Assignment</label>
              <select className="ipc-input" value={assignment} onChange={(e) => setAssignment(e.target.value as any)}>
                <option value="unassigned">Leave unassigned</option>
                <option value="round_robin">Round-robin to all agents ({agents.length})</option>
                <option value="hot_to_top">Hot + Super Hot to top 2 agents only</option>
              </select>
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(3)} className="ipc-btn ipc-btn-ghost">Back</button>
              <button onClick={importNow} disabled={importing} className="ipc-btn ipc-btn-black disabled:opacity-50">{importing ? "Importing…" : `Import ${validRows} leads`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
