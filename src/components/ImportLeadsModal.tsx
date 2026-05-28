import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { X, Plus, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, Link2, Loader2 } from "lucide-react";
import { DEFAULT_PIPELINE_TEMPLATES, ensurePipelineExists, GRADE_STYLES, type LeadGrade } from "@/lib/crmTypes";
import { logActivity } from "@/lib/auditLog";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";

export type DuplicatePolicy = "skip" | "update" | "move" | "new_only";
export type AssignmentMode = "unassigned" | "assign_to_me" | "assign_to_member" | "round_robin" | "hot_to_top";

export interface ImportResult {
  pipelineId: string;
  pipelineName: string;
  pipelineType: "unpaid" | "paid" | "custom";
  leadType: "unpaid" | "paid";
  batchName: string;
  imported: number;          // total successful (new + updated + moved) — back-compat
  newImported: number;
  updated: number;
  moved: number;
  restored: number;
  phoneOnlyImported: number;
  skippedDuplicates: number;
  failed: number;
  skipped: number;           // back-compat alias = skippedDuplicates + failed
  duplicatePolicy: DuplicatePolicy;
  paidCreated: number;
  paidLinked: number;
  paidUnlinked: number;
  errors: string[];
  failureReasons: { reason: string; count: number }[];
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

const normEmail = (v: any) => String(v || "").trim().toLowerCase();

export default function ImportLeadsModal({ onClose, onDone }: Props) {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1 — source
  type SourceType = "csv" | "google_sheet";
  const [sourceType, setSourceType] = useState<SourceType>("csv");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({ full_name: "", email: "", phone: "", country: "" });

  // Google Sheet sub-state
  const [gsUrl, setGsUrl] = useState("");
  const [gsLoadingTabs, setGsLoadingTabs] = useState(false);
  const [gsLoadingRows, setGsLoadingRows] = useState(false);
  const [gsError, setGsError] = useState<string | null>(null);
  const [gsSpreadsheetId, setGsSpreadsheetId] = useState<string>("");
  const [gsSpreadsheetTitle, setGsSpreadsheetTitle] = useState<string>("");
  const [gsTabs, setGsTabs] = useState<{ sheetId: string; tabName: string; validRowsCount: number; detectedHeaders: string[] }[]>([]);
  const [gsSelectedTab, setGsSelectedTab] = useState<string>("");
  const [gsFetchedAt, setGsFetchedAt] = useState<string>("");

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
  const [agents, setAgents] = useState<{ id: string; full_name: string; role: string | null }[]>([]);
  const [assignment, setAssignment] = useState<AssignmentMode>("unassigned");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>("move");
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(false);

  // Step 5 — diagnostics result
  const [result, setResult] = useState<ImportResult | null>(null);

  // Preflight summary
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflight, setPreflight] = useState<{
    total: number;
    newCount: number;
    dupCount: number;
    archivedDupCount: number;
    missingEmail: number;
    invalid: number;
    existingByEmail: Map<string, any>;
  } | null>(null);

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

  // ── Google Sheets: extract spreadsheet ID ──────────────────────────────
  const extractSpreadsheetId = (url: string): string | null => {
    if (!url) return null;
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : null;
  };

  const handleFetchGsTabs = async () => {
    setGsError(null);
    const sid = extractSpreadsheetId(gsUrl.trim());
    if (!sid) { setGsError("Please paste a valid Google Sheet URL."); return; }
    setGsLoadingTabs(true);
    setGsTabs([]); setGsSelectedTab(""); setHeaders([]); setRows([]); setFileName("");
    try {
      const { data, error } = await supabase.functions.invoke("fetch-roas-master-sheet-tabs", {
        body: { masterSheetUrl: gsUrl.trim() },
      });
      if (error) throw new Error(error.message || "Failed to fetch sheet tabs");
      if ((data as any)?.error) throw new Error((data as any).error);
      const tabs = ((data as any)?.tabs || []) as any[];
      if (tabs.length === 0) { setGsError("No tabs were found in this spreadsheet."); return; }
      setGsSpreadsheetId((data as any)?.spreadsheetId || sid);
      setGsSpreadsheetTitle((data as any)?.spreadsheetTitle || "");
      setGsTabs(tabs.map((t) => ({
        sheetId: t.sheetId, tabName: t.tabName,
        validRowsCount: Number(t.validRowsCount || 0),
        detectedHeaders: Array.isArray(t.detectedHeaders) ? t.detectedHeaders : [],
      })));
      setGsFetchedAt(new Date().toLocaleString());
    } catch (e: any) {
      setGsError(e?.message || "Failed to fetch tabs");
    } finally { setGsLoadingTabs(false); }
  };

  const handleSelectGsTab = async (tabName: string) => {
    setGsSelectedTab(tabName);
    setGsError(null);
    if (!tabName || !gsSpreadsheetId) return;
    setGsLoadingRows(true);
    setHeaders([]); setRows([]);
    try {
      const { data, error } = await supabase.functions.invoke("google-sheets-fetch-rows", {
        body: { spreadsheetId: gsSpreadsheetId, tabName },
      });
      if (error) throw new Error(error.message || "Failed to fetch rows");
      if ((data as any)?.error) throw new Error((data as any).error);
      const hdrs = ((data as any)?.headers || []) as string[];
      const rws = ((data as any)?.rows || []) as Row[];
      if (rws.length === 0) { setGsError("This tab has no rows to import."); return; }
      setHeaders(hdrs);
      setRows(rws);
      setMapping(autoMap(hdrs));
      setFileName(`${gsSpreadsheetTitle || "Google Sheet"} · ${tabName}`);
    } catch (e: any) {
      setGsError(e?.message || "Failed to fetch sheet rows");
    } finally { setGsLoadingRows(false); }
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
      const [{ data: pl }, { data: st }, elig] = await Promise.all([
        supabase.from("pipelines").select("*").order("position"),
        supabase.from("stages").select("*").order("position"),
        getEligibleAssignees("calling_crm"),
      ]);
      setPipelines(pl || []);
      setStages(st || []);
      setAgents(elig.map((a) => ({ id: a.id, full_name: a.full_name, role: a.role })));
      const list = pl || [];
      const def = resolveDefaultPipelineId(leadType, list);
      setTargetPipelineId(def);
      setNewPipeType(leadType);
      if (def === "__new__") {
        setCreatingPipeline(true);
        setNewPipeName(leadType === "paid" ? "Paid — Onboarding" : "Sales Pipeline (Unpaid)");
      } else {
        setCreatingPipeline(false);
      }
      setStep(3);
    } finally { setLoading(false); }
  };

  // Only show pipelines whose type matches the chosen lead type. Paid leads must never
  // land in an unpaid pipeline (and vice versa). Custom pipelines are excluded from the
  // auto-flow to keep paid/unpaid routing unambiguous.
  const filteredPipelines = useMemo(
    () => pipelines.filter((p) => p.type === leadType),
    [pipelines, leadType],
  );

  // Find a sensible default target pipeline for a given lead type.
  // For paid: prefer name containing "Paid — Onboarding" / "Onboarding" / "Paid",
  // otherwise the first type==='paid' pipeline.
  const resolveDefaultPipelineId = (type: "paid" | "unpaid", list: any[]): string => {
    const ofType = list.filter((p) => p.type === type);
    if (type === "paid") {
      const named = ofType.find((p) => /paid.*onboarding|onboarding/i.test(p.name || ""))
        || ofType.find((p) => /paid/i.test(p.name || ""));
      if (named) return named.id;
    } else {
      const named = ofType.find((p) => /sales.*pipeline|unpaid/i.test(p.name || ""));
      if (named) return named.id;
    }
    return ofType[0]?.id || "__new__";
  };

  // When user toggles lead type inside step 3, re-resolve the target pipeline
  // so Step 4 never shows "Pipeline: —" or a stale mismatched pipeline.
  useEffect(() => {
    if (step < 3 || pipelines.length === 0) return;
    if (creatingPipeline) { setNewPipeType(leadType); return; }
    const current = pipelines.find((p) => p.id === targetPipelineId);
    if (!current || current.type !== leadType) {
      const next = resolveDefaultPipelineId(leadType, pipelines);
      setTargetPipelineId(next);
      if (next === "__new__") {
        setCreatingPipeline(true);
        setNewPipeType(leadType);
        setNewPipeName(leadType === "paid" ? "Paid — Onboarding" : "Sales Pipeline (Unpaid)");
      }
    }
    setNewPipeType(leadType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadType, pipelines, step]);

  // Resolved target pipeline (used by Step 4 review + guard).
  const resolvedTarget = useMemo(() => {
    if (creatingPipeline || targetPipelineId === "__new__") {
      return {
        id: "__new__",
        name: newPipeName.trim() || (leadType === "paid" ? "Paid — Onboarding" : "Sales Pipeline (Unpaid)"),
        type: newPipeType,
        isNew: true,
      };
    }
    const p = pipelines.find((x) => x.id === targetPipelineId);
    return p
      ? { id: p.id, name: p.name, type: p.type as "paid" | "unpaid" | "custom", isNew: false }
      : { id: "", name: "", type: undefined as any, isNew: false };
  }, [creatingPipeline, targetPipelineId, newPipeName, newPipeType, pipelines, leadType]);

  const targetMismatch = !resolvedTarget.type
    || (resolvedTarget.type !== "custom" && resolvedTarget.type !== leadType);

  // Run pre-flight when entering step 4
  useEffect(() => {
    if (step !== 4) return;
    let cancelled = false;
    (async () => {
      setPreflightLoading(true);
      try {
        const get = (r: Row, k: FieldKey) => (mapping[k] ? String(r[mapping[k]] || "").trim() : "");
        let missingEmail = 0;
        let invalid = 0;
        const emailSet = new Set<string>();
        for (const r of rows) {
          const fn = get(r, "full_name");
          const em = normEmail(get(r, "email"));
          const ph = get(r, "phone");
          if (!fn && !em && !ph) { invalid++; continue; }
          if (!em) { missingEmail++; continue; }
          emailSet.add(em);
        }
        const emails = Array.from(emailSet);
        const existingByEmail = new Map<string, any>();
        for (let i = 0; i < emails.length; i += 300) {
          const chunk = emails.slice(i, i + 300);
          const { data } = await supabase
            .from("leads")
            .select("id, email, full_name, phone, pipeline_id, stage_id, lead_type, archived_at")
            .in("email", chunk);
          (data || []).forEach((l: any) => {
            const k = normEmail(l.email);
            if (k && !existingByEmail.has(k)) existingByEmail.set(k, l);
          });
        }
        const dupCount = emails.filter((e) => existingByEmail.has(e)).length;
        const archivedDupCount = emails.filter((e) => {
          const ex = existingByEmail.get(e);
          return ex && ex.archived_at;
        }).length;
        const newCount = emails.length - dupCount;
        if (!cancelled) {
          setPreflight({
            total: rows.length,
            newCount,
            dupCount,
            archivedDupCount,
            missingEmail,
            invalid,
            existingByEmail,
          });
          // NOTE: We intentionally do NOT auto-switch the duplicate policy here.
          // Previously this forced "new_only" when all dups were archived, which
          // silently skipped archived rows the user wanted to restore via "move".
        }
      } finally {
        if (!cancelled) setPreflightLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, rows, mapping]);

  const importNow = async () => {
    setImporting(true);
    try {
      // Resolve pipeline (existing or create)
      let pipelineId = targetPipelineId;
      let pipelineName = "";
      let pipelineType: "unpaid" | "paid" | "custom" = leadType;
      if (creatingPipeline || pipelineId === "__new__") {
        if (!newPipeName.trim()) { toast.error("Pipeline name required"); setImporting(false); return; }
        const { data: ins, error } = await supabase.from("pipelines").insert({ name: newPipeName.trim(), type: newPipeType, position: pipelines.length }).select().maybeSingle();
        if (error || !ins) { toast.error(error?.message || "Pipeline create failed"); setImporting(false); return; }
        pipelineId = ins.id;
        pipelineName = ins.name;
        pipelineType = (ins.type as any) ?? newPipeType;
        if (newPipeSeed) {
          const tmpl = DEFAULT_PIPELINE_TEMPLATES[newPipeType];
          await supabase.from("stages").insert(tmpl.map((s, i) => ({
            pipeline_id: pipelineId, name: s.name, color: s.color, position: i,
            is_won: !!s.is_won, is_lost: !!s.is_lost, is_protected: !!s.is_protected,
          })));
        }
      } else {
        const sel = pipelines.find((p) => p.id === pipelineId);
        pipelineName = sel?.name || "";
        pipelineType = (sel?.type as any) || leadType;
      }

      // Safety: paid leads must never silently land in an unpaid pipeline (and vice-versa for non-custom).
      if (pipelineType !== "custom" && pipelineType !== leadType) {
        toast.error(`Selected pipeline is "${pipelineType}" but you chose "${leadType}" leads. Pick a matching pipeline or create a new one.`);
        setImporting(false);
        return;
      }

      // Load stages for chosen pipeline; auto-seed if empty
      const { data: pStages } = await supabase.from("stages").select("*").eq("pipeline_id", pipelineId).order("position");
      let stageList = pStages || [];
      if (stageList.length === 0) {
        const ensured = await ensurePipelineExists(supabase, leadType);
        pipelineId = ensured.pipelineId;
        const reload = await supabase.from("stages").select("*").eq("pipeline_id", pipelineId).order("position");
        stageList = reload.data || [];
        const reloadP = await supabase.from("pipelines").select("name,type").eq("id", pipelineId).maybeSingle();
        pipelineName = reloadP.data?.name || pipelineName;
        pipelineType = (reloadP.data?.type as any) || pipelineType;
      }
      const firstStageId = stageList[0]?.id ?? null;

      // Build normalized rows
      const get = (r: Row, k: FieldKey) => (mapping[k] ? String(r[mapping[k]] || "").trim() : "");
      type N = { full_name: string | null; email: string | null; phone: string | null; country: string | null };
      const records: N[] = rows.map((r) => ({
        full_name: get(r, "full_name") || null,
        email: normEmail(get(r, "email")) || null,
        phone: get(r, "phone") || null,
        country: get(r, "country") || null,
      })).filter((r) => r.full_name || r.email || r.phone);

      // Fresh duplicate maps — match by email AND by phone (phone is a fallback
      // unique key when email is missing or doesn't match an existing record).
      const emails = Array.from(new Set(records.map((r) => r.email).filter(Boolean) as string[]));
      const phones = Array.from(new Set(records.map((r) => r.phone).filter(Boolean) as string[]));
      const existingByEmail = new Map<string, any>();
      const existingByPhone = new Map<string, any>();
      const leadCols = "id, email, full_name, phone, pipeline_id, stage_id, lead_type, archived_at, archived_by, archive_reason, paid_pipeline_lead_id";
      for (let i = 0; i < emails.length; i += 300) {
        const chunk = emails.slice(i, i + 300);
        const { data } = await supabase.from("leads").select(leadCols).in("email", chunk);
        (data || []).forEach((l: any) => {
          const k = normEmail(l.email);
          if (k && !existingByEmail.has(k)) existingByEmail.set(k, l);
          if (l.phone && !existingByPhone.has(l.phone)) existingByPhone.set(l.phone, l);
        });
      }
      for (let i = 0; i < phones.length; i += 300) {
        const chunk = phones.slice(i, i + 300);
        const { data } = await supabase.from("leads").select(leadCols).in("phone", chunk);
        (data || []).forEach((l: any) => {
          if (l.phone && !existingByPhone.has(l.phone)) existingByPhone.set(l.phone, l);
          const k = normEmail(l.email);
          if (k && !existingByEmail.has(k)) existingByEmail.set(k, l);
        });
      }

      // Bucket: new vs existing. Dedup within CSV by email then phone.
      const seenEmails = new Set<string>();
      const seenPhones = new Set<string>();
      const newRows: (N & { _phoneOnly?: boolean })[] = [];
      const dupRows: { row: N; existing: any; matchedBy: "email" | "phone" }[] = [];
      let failedNoKey = 0;
      for (const r of records) {
        let existing: any = null;
        let matchedBy: "email" | "phone" | null = null;
        if (r.email) {
          if (seenEmails.has(r.email)) continue;
          seenEmails.add(r.email);
          const ex = existingByEmail.get(r.email);
          if (ex) { existing = ex; matchedBy = "email"; }
        }
        if (!existing && r.phone) {
          if (!r.email && seenPhones.has(r.phone)) continue;
          if (r.phone) seenPhones.add(r.phone);
          const ex = existingByPhone.get(r.phone);
          if (ex) { existing = ex; matchedBy = "phone"; }
        }
        if (existing) { dupRows.push({ row: r, existing, matchedBy: matchedBy! }); continue; }
        // No match — must have at least an email OR phone to insert.
        if (!r.email && !r.phone) { failedNoKey++; continue; }
        newRows.push({ ...r, _phoneOnly: !r.email && !!r.phone });
      }

      // Assignment helper — applies to BOTH new rows and dup moves/updates.
      const activeAgents = agents;
      let rr = 0;
      const assign = (grade: LeadGrade, isSH: boolean): string | null => {
        if (assignment === "assign_to_me") return profile?.id || null;
        if (assignment === "assign_to_member") return selectedAssigneeId || null;
        if (assignment === "round_robin" && activeAgents.length) {
          const id = activeAgents[rr % activeAgents.length].id; rr++; return id;
        }
        if (assignment === "hot_to_top" && (grade === "hot" || isSH) && activeAgents.length) {
          const id = activeAgents[rr % Math.min(2, activeAgents.length)].id; rr++; return id;
        }
        return null;
      };

      let newImported = 0;
      let updated = 0;
      let moved = 0;
      let restored = 0;
      let phoneOnlyImported = 0;
      let skippedDuplicates = 0;
      let failed = failedNoKey;
      const errors: string[] = [];
      const reasonCounts = new Map<string, number>();
      if (failedNoKey > 0) reasonCounts.set("Row has neither email nor phone", failedNoKey);

      // --- Handle duplicates per policy ---
      const addReason = (msg: string) => reasonCounts.set(msg, (reasonCounts.get(msg) || 0) + 1);
      if (duplicatePolicy === "skip" || duplicatePolicy === "new_only") {
        skippedDuplicates += dupRows.length;
      } else {
        // update / move
        for (const { row, existing, matchedBy } of dupRows) {
          const isSH = true; // existing match → super-hot per original logic
          const grade = (isSH ? "super-hot" : defaultGrade) as LeadGrade;
          const wasArchived = !!existing.archived_at;
          const wasSoftDeleted = !!(existing as any).deleted_at;
          const agentId = assign(grade, isSH);
          const base: any = {
            pipeline_id: pipelineId,
            stage_id: firstStageId,
            lead_type: leadType,
            webinar_source: segmentName,
            webinar_date: webinarDate,
            webinar_name: webinarName || segmentName,
            grade,
            is_super_hot: true,
            program_name: productName,
            deal_value: dealValue,
            lead_source_type: "direct_import",
            ...(wasArchived ? { archived_at: null, archived_by: null, archive_reason: null } : {}),
            ...(wasSoftDeleted ? { deleted_at: null, deleted_by: null, delete_reason: null } : {}),
            ...(agentId ? { assigned_agent_id: agentId } : {}),
          };
          // Always fill missing fields; for "update" also overwrite country.
          if (!existing.full_name && row.full_name) base.full_name = row.full_name;
          if (!existing.phone && row.phone) base.phone = row.phone;
          if (!existing.email && row.email) base.email = row.email;
          if (duplicatePolicy === "update" && row.country) base.country = row.country;

          const { error } = await supabase.from("leads").update(base).eq("id", existing.id);
          if (error) {
            console.error("[ImportLeadsModal] update existing failed", error, existing.id);
            failed++;
            addReason(`Update existing failed: ${error.message}`);
            if (!errors.includes(error.message)) errors.push(error.message);
          } else {
            if (duplicatePolicy === "update") updated++;
            else moved++;
            if (wasArchived) restored++;
            if (matchedBy === "phone" && !row.email) phoneOnlyImported++;
          }
        }
      }


      // --- Insert new rows in chunks ---
      const newPayloads = newRows.map((r) => {
        const grade = defaultGrade;
        const agentId = assign(grade, false);
        return {
          full_name: r.full_name,
          email: r.email,
          phone: r.phone,
          country: r.country,
          score: 0,
          grade,
          webinar_source: segmentName,
          webinar_date: webinarDate,
          webinar_name: webinarName || segmentName,
          pipeline_id: pipelineId,
          stage_id: firstStageId,
          assigned_agent_id: agentId,
          lead_type: leadType,
          program_name: productName,
          deal_value: dealValue,
          total_minutes: 0,
          attendance_pct: 0,
          sessions_count: 0,
          is_super_hot: false,
          lead_source_type: "direct_import",
        };
      });

      for (let i = 0; i < newPayloads.length; i += 200) {
        const chunk = newPayloads.slice(i, i + 200);
        const chunkSrc = newRows.slice(i, i + 200);
        const { data, error } = await supabase.from("leads").insert(chunk).select("id");
        if (error) {
          // Fallback: race condition / unseen duplicate — retry one-by-one
          console.error("[ImportLeadsModal] insert chunk error, retrying per-row", error);
          for (let j = 0; j < chunk.length; j++) {
            const row = chunk[j];
            const src = chunkSrc[j];
            const { data: d2, error: e2 } = await supabase.from("leads").insert(row).select("id").maybeSingle();
            if (e2) {
              if (e2.code === "23505" || /duplicate key/i.test(e2.message)) {
                skippedDuplicates++;
                addReason("Duplicate key collision on insert");
              } else {
                failed++;
                addReason(`Insert failed: ${e2.message}`);
                if (!errors.includes(e2.message)) errors.push(e2.message);
              }
            } else if (d2) {
              newImported++;
              if (src?._phoneOnly) phoneOnlyImported++;
            }
          }
        } else {
          newImported += data?.length || chunk.length;
          chunkSrc.forEach((s) => { if (s._phoneOnly) phoneOnlyImported++; });
        }
      }

      // ── Auto-sync paid leads to Paid Pipeline ─────────────────────────────
      let paidSynced = 0;
      let paidLinked = 0;
      let paidUnlinked = 0;
      if (pipelineType === "paid") {
        try {
          // Pull the freshly imported/updated CRM leads for this batch
          const { data: crmRows } = await supabase
            .from("leads")
            .select("id, full_name, email, phone, deal_value, program_name, paid_pipeline_lead_id")
            .eq("pipeline_id", pipelineId)
            .eq("webinar_source", segmentName);

          for (const lead of (crmRows || []) as any[]) {
            // Match priority: existing link → email → phone (covers backfill of older rows)
            let existing: any = null;
            if (lead.paid_pipeline_lead_id) {
              const { data } = await supabase.from("paid_pipeline_leads")
                .select("id, crm_lead_id").eq("id", lead.paid_pipeline_lead_id).maybeSingle();
              existing = data;
            }
            if (!existing && lead.email) {
              const { data } = await supabase.from("paid_pipeline_leads")
                .select("id, crm_lead_id").eq("email", lead.email).eq("is_deleted", false).maybeSingle();
              existing = data;
            }
            if (!existing && lead.phone) {
              const { data } = await supabase.from("paid_pipeline_leads")
                .select("id, crm_lead_id").eq("phone", lead.phone).eq("is_deleted", false).maybeSingle();
              existing = data;
            }

            const payload: any = {
              name: lead.full_name,
              email: lead.email,
              phone: lead.phone,
              product_name_snapshot: lead.program_name || productName || null,
              deal_value_including_gst: Number(lead.deal_value || dealValue || 0),
              source_webinar: segmentName,
              pipeline_stage: "Payment Confirmed",
              payment_status: "No Payment",
              crm_lead_id: lead.id,
            };

            if (existing) {
              await supabase.from("paid_pipeline_leads").update({
                crm_lead_id: lead.id,
                source_webinar: segmentName,
                product_name_snapshot: payload.product_name_snapshot,
              } as any).eq("id", existing.id);
              if (lead.paid_pipeline_lead_id !== existing.id) {
                await supabase.from("leads").update({ paid_pipeline_lead_id: existing.id } as any).eq("id", lead.id);
              }
              paidLinked++;
            } else {
              payload.created_by = profile?.id;
              const { data: ins, error: insErr } = await supabase
                .from("paid_pipeline_leads").insert(payload).select("id").maybeSingle();
              if (!insErr && ins?.id) {
                await supabase.from("leads").update({ paid_pipeline_lead_id: ins.id } as any).eq("id", lead.id);
                paidSynced++;
              } else if (insErr) {
                console.error("[ImportLeadsModal] paid_pipeline_leads insert failed", insErr);
                paidUnlinked++;
                if (!errors.includes(insErr.message)) errors.push(insErr.message);
              }
            }
          }

          // Recount unlinked by re-querying — authoritative diagnostic
          const { data: linkCheck } = await supabase
            .from("leads")
            .select("id, paid_pipeline_lead_id")
            .eq("pipeline_id", pipelineId)
            .eq("webinar_source", segmentName);
          paidUnlinked = (linkCheck || []).filter((r: any) => !r.paid_pipeline_lead_id).length;

          if (paidSynced + paidLinked > 0) {
            logActivity({
              module_key: "paid_pipeline",
              action_type: "paid_pipeline_record_created_from_crm",
              entity_type: "crm_batch",
              entity_label: segmentName,
              metadata: { batch_name: segmentName, paid_created: paidSynced, paid_linked: paidLinked, paid_unlinked: paidUnlinked, pipeline_id: pipelineId },
              summary: `Paid Pipeline auto-sync: ${paidSynced} created · ${paidLinked} linked · ${paidUnlinked} unlinked from batch "${segmentName}".`,
            });
          }
        } catch (syncErr: any) {
          console.error("[ImportLeadsModal] paid pipeline sync failed", syncErr);
        }
      }

      const totalSuccess = newImported + updated + moved;
      if (totalSuccess === 0 && failed === 0 && skippedDuplicates === 0) {
        toast.error("No leads were imported.");
        setImporting(false);
        return;
      }
      if (totalSuccess === 0 && failed > 0) {
        toast.error(errors[0] ? `Import failed: ${errors[0]}` : "Import failed.");
        setImporting(false);
        return;
      }

      logActivity({
        module_key: "calling_crm",
        action_type: "crm_leads_imported",
        entity_type: "crm_batch",
        entity_label: segmentName,
        metadata: {
          batch_name: segmentName,
          source_type: sourceType,
          source_file_name: sourceType === "csv" ? fileName : null,
          source_spreadsheet_id: sourceType === "google_sheet" ? gsSpreadsheetId : null,
          source_spreadsheet_title: sourceType === "google_sheet" ? gsSpreadsheetTitle : null,
          source_sheet_tab: sourceType === "google_sheet" ? gsSelectedTab : null,
          pipeline_id: pipelineId,
          pipeline_name: pipelineName,
          pipeline_type: pipelineType,
          lead_type: leadType,
          total_rows: rows.length,
          new_imported_count: newImported,
          updated_existing_count: updated,
          moved_existing_count: moved,
          restored_count: restored,
          skipped_duplicate_count: skippedDuplicates,
          failed_count: failed,
          paid_created: paidSynced,
          paid_linked: paidLinked,
          paid_unlinked: paidUnlinked,
          duplicate_policy: duplicatePolicy,
          assignment_mode: assignment,
          assigned_to: assignment === "assign_to_me" ? profile?.id : (assignment === "assign_to_member" ? selectedAssigneeId : null),
          default_grade: defaultGrade,
          product_name: productName,
          deal_value: dealValue,
          webinar_name: webinarName || segmentName,
          webinar_date: webinarDate,
        },
        summary: `Imported ${newImported} new · ${moved} moved · ${updated} updated · ${restored} restored · ${skippedDuplicates} skipped · ${failed} failed → "${pipelineName}" — batch "${segmentName}".`,
      });

      const finalResult: ImportResult = {
        pipelineId: pipelineId as string,
        pipelineName,
        pipelineType,
        leadType,
        batchName: segmentName,
        imported: totalSuccess,
        newImported,
        updated,
        moved,
        restored,
        phoneOnlyImported,
        skippedDuplicates,
        failed,
        skipped: skippedDuplicates + failed,
        duplicatePolicy,
        paidCreated: paidSynced,
        paidLinked,
        paidUnlinked,
        errors,
        failureReasons: Array.from(reasonCounts.entries()).map(([reason, count]) => ({ reason, count })),
      };
      setResult(finalResult);
      setStep(5);
    } catch (e: any) {
      console.error("[ImportLeadsModal] importNow failed", e);
      toast.error(e.message || "Import failed");
    } finally { setImporting(false); }
  };


  const validRows = rows.length;
  const mappedOk = !!(mapping.full_name || mapping.email || mapping.phone);

  const policyLabel: Record<DuplicatePolicy, string> = {
    skip: "Skip duplicates",
    update: "Update existing lead",
    move: `Move existing lead to ${leadType === "paid" ? "Paid — Onboarding" : "selected pipeline"}`,
    new_only: "Import new only",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div>
            <div className="font-serif text-xl">Import Leads</div>
            <div className="font-sans text-xs text-muted-foreground mt-0.5">{step === 5 ? "Import complete" : `Step ${step} of 4`}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-off flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        {step === 1 && (
          <div className="p-6 space-y-4">
            {/* Source picker */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSourceType("csv")}
                className={`text-left rounded-lg border p-3 transition-colors ${sourceType === "csv" ? "border-black bg-off" : "border-line hover:border-black/40"}`}
              >
                <div className="flex items-center gap-2 font-sans text-sm font-medium"><Upload className="w-4 h-4" /> Upload CSV</div>
                <div className="text-[11px] text-muted-foreground mt-1">Paste/upload a UTF-8 CSV file with headers.</div>
              </button>
              <button
                type="button"
                onClick={() => setSourceType("google_sheet")}
                className={`text-left rounded-lg border p-3 transition-colors ${sourceType === "google_sheet" ? "border-black bg-off" : "border-line hover:border-black/40"}`}
              >
                <div className="flex items-center gap-2 font-sans text-sm font-medium"><FileSpreadsheet className="w-4 h-4" /> Import from Google Sheet</div>
                <div className="text-[11px] text-muted-foreground mt-1">Paste a Google Sheet link, pick a tab, and import.</div>
              </button>
            </div>

            {sourceType === "csv" && (
              <label className="block">
                <div className="border-2 border-dashed border-line rounded-lg p-8 text-center cursor-pointer hover:border-black transition-colors">
                  <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                  <div className="font-sans text-sm">{fileName || "Click to upload CSV"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Headers in first row · UTF-8 CSV</div>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </div>
              </label>
            )}

            {sourceType === "google_sheet" && (
              <div className="space-y-3">
                <div>
                  <label className="form-label flex items-center gap-1"><Link2 className="w-3.5 h-3.5" /> Google Sheet link</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="ipc-input flex-1"
                      placeholder="https://docs.google.com/spreadsheets/d/…"
                      value={gsUrl}
                      onChange={(e) => setGsUrl(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleFetchGsTabs}
                      disabled={gsLoadingTabs || !gsUrl.trim()}
                      className="ipc-btn ipc-btn-black disabled:opacity-50"
                    >
                      {gsLoadingTabs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Fetch Tabs
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Sheet must be shared as "Anyone with the link can view" or accessible to the connected Google account.
                  </p>
                </div>

                {gsError && (
                  <div className="flex items-start gap-2 p-3 rounded-md border border-rose-200 bg-rose-50 text-xs text-rose-700">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <div>{gsError}</div>
                  </div>
                )}

                {gsTabs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                      <span>Sheet: <b className="text-foreground">{gsSpreadsheetTitle || "—"}</b></span>
                      <span>ID: <code>{gsSpreadsheetId.slice(0, 6)}…{gsSpreadsheetId.slice(-4)}</code></span>
                      {gsFetchedAt && <span>Fetched: {gsFetchedAt}</span>}
                    </div>
                    <div>
                      <label className="form-label">Select tab</label>
                      <select
                        className="ipc-input"
                        value={gsSelectedTab}
                        onChange={(e) => handleSelectGsTab(e.target.value)}
                        disabled={gsLoadingRows}
                      >
                        <option value="">— choose a tab —</option>
                        {gsTabs.map((t) => (
                          <option key={t.sheetId} value={t.tabName}>
                            {t.tabName} · {t.validRowsCount} rows · {t.detectedHeaders.length} cols
                          </option>
                        ))}
                      </select>
                      {gsLoadingRows && (
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> Fetching rows…
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

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
              <div>
                <span className="text-muted-foreground">Pipeline:</span>{" "}
                <b>
                  {resolvedTarget.name
                    ? `${resolvedTarget.name}${resolvedTarget.isNew ? ` (new · ${resolvedTarget.type})` : ` · ${resolvedTarget.type}`}`
                    : "—"}
                </b>
              </div>
              <div><span className="text-muted-foreground">Lead type:</span> <b>{leadType}</b> · default grade <b style={{ color: GRADE_STYLES[defaultGrade].fg }}>{GRADE_STYLES[defaultGrade].label}</b></div>
            </div>

            {targetMismatch && (
              <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-800">
                {leadType === "paid"
                  ? "Paid pipeline missing. Please go back to Step 3 and select or create the Paid — Onboarding pipeline before importing paid leads."
                  : "Please select an unpaid pipeline before importing unpaid leads."}
              </div>
            )}

            <div className="p-4 rounded-lg border border-line space-y-1.5 text-sm">
              <div className="uppercase-label mb-1">Pre-flight check</div>
              {preflightLoading || !preflight ? (
                <div className="text-xs text-muted-foreground">Checking for duplicate emails…</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div><span className="text-muted-foreground">Total rows:</span> <b>{preflight.total}</b></div>
                    <div><span className="text-muted-foreground">New leads:</span> <b className="text-emerald-700">{preflight.newCount}</b></div>
                    <div><span className="text-muted-foreground">Duplicate emails:</span> <b className="text-amber-700">{preflight.dupCount}</b></div>
                    <div><span className="text-muted-foreground">Of which archived:</span> <b className="text-[#92400E]">{preflight.archivedDupCount}</b></div>
                    <div><span className="text-muted-foreground">Missing email:</span> <b>{preflight.missingEmail}</b></div>
                    <div><span className="text-muted-foreground">Invalid rows:</span> <b>{preflight.invalid}</b></div>
                  </div>
                  {preflight.archivedDupCount > 0 && (
                    <div className="mt-2 px-2.5 py-1.5 rounded-md bg-[#FEF3C7] border border-[#FDE68A] text-[11px] text-[#92400E]">
                      {preflight.archivedDupCount} duplicate{preflight.archivedDupCount === 1 ? " is" : "s are"} currently archived. Choosing <b>Move</b> or <b>Update</b> will restore them with the new batch info. <b>Skip</b> leaves them archived.
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="form-label">If duplicate email is found</label>
              <select className="ipc-input" value={duplicatePolicy} onChange={(e) => setDuplicatePolicy(e.target.value as DuplicatePolicy)}>
                <option value="move">Move existing lead to selected pipeline (recommended)</option>
                <option value="update">Update existing lead (batch, grade, product, deal, fill missing fields)</option>
                <option value="skip">Skip duplicates</option>
                <option value="new_only">Import new only (report duplicates as skipped)</option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {duplicatePolicy === "move" && `Existing leads will be moved into "${creatingPipeline ? newPipeName : (filteredPipelines.find((p) => p.id === targetPipelineId)?.name || "selected pipeline")}" and attached to this batch.`}
                {duplicatePolicy === "update" && "Existing leads will be updated with this batch, grade, product and deal value. Name/phone filled only if missing."}
                {duplicatePolicy === "skip" && "Rows whose email already exists will be skipped — no changes made."}
                {duplicatePolicy === "new_only" && "Only brand-new emails will be inserted. Duplicates reported as skipped."}
              </p>
            </div>

            <div>
              <label className="form-label">Assignment (applies to all imported leads)</label>
              <select className="ipc-input" value={assignment} onChange={(e) => setAssignment(e.target.value as AssignmentMode)}>
                <option value="unassigned">Keep unassigned</option>
                <option value="assign_to_me">Assign all to me{profile?.full_name ? ` (${profile.full_name})` : ""}</option>
                <option value="assign_to_member" disabled={agents.length === 0}>Assign all to selected team member…</option>
                <option value="round_robin" disabled={agents.length === 0}>Round-robin among eligible sales team ({agents.length})</option>
                <option value="hot_to_top" disabled={agents.length === 0}>Hot + Super Hot to top 2 agents only</option>
              </select>
              {assignment === "assign_to_member" && (
                <select
                  className="ipc-input mt-2"
                  value={selectedAssigneeId}
                  onChange={(e) => setSelectedAssigneeId(e.target.value)}
                >
                  <option value="">— pick a team member —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.full_name}{a.role ? ` · ${a.role}` : ""}</option>
                  ))}
                </select>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Eligible list = active members with “Can receive Calling CRM leads”. Round-robin requires “Include in round-robin” too.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(3)} className="ipc-btn ipc-btn-ghost">Back</button>
              <button
                onClick={importNow}
                disabled={
                  importing || preflightLoading || targetMismatch ||
                  (resolvedTarget.isNew && !newPipeName.trim()) ||
                  (assignment === "assign_to_member" && !selectedAssigneeId)
                }
                className="ipc-btn ipc-btn-black disabled:opacity-50"
              >
                {importing ? "Importing…" : `Import ${validRows} rows`}
              </button>
            </div>
          </div>
        )}

        {step === 5 && result && (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg border border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-emerald-900">Import complete</div>
                <div className="text-emerald-800/80 text-xs mt-0.5">
                  Batch <b>"{result.batchName}"</b> → {result.pipelineName} ({result.pipelineType})
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm p-4 rounded-lg border border-line">
              <div className="uppercase-label col-span-2 mb-1">Calling CRM</div>
              <div><span className="text-muted-foreground">Total rows processed:</span> <b>{result.newImported + result.updated + result.moved + result.skippedDuplicates + result.failed}</b></div>
              <div><span className="text-muted-foreground">Created (new):</span> <b className="text-emerald-700">{result.newImported}</b></div>
              <div><span className="text-muted-foreground">Moved:</span> <b>{result.moved}</b></div>
              <div><span className="text-muted-foreground">Updated:</span> <b>{result.updated}</b></div>
              <div><span className="text-muted-foreground">Restored from archive:</span> <b className={result.restored > 0 ? "text-emerald-700" : ""}>{result.restored}</b></div>
              <div><span className="text-muted-foreground">Phone-only imported:</span> <b>{result.phoneOnlyImported}</b></div>
              <div><span className="text-muted-foreground">Skipped duplicates:</span> <b className="text-amber-700">{result.skippedDuplicates}</b></div>
              <div><span className="text-muted-foreground">Failed:</span> <b className={result.failed ? "text-red-700" : ""}>{result.failed}</b></div>
            </div>

            {result.pipelineType === "paid" && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm p-4 rounded-lg border border-line">
                <div className="uppercase-label col-span-2 mb-1">Paid Pipeline sync</div>
                <div><span className="text-muted-foreground">Created in Paid Pipeline:</span> <b className="text-emerald-700">{result.paidCreated}</b></div>
                <div><span className="text-muted-foreground">Linked to existing buyer:</span> <b>{result.paidLinked}</b></div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Unlinked (CRM leads with no Paid Pipeline row):</span>{" "}
                  <b className={result.paidUnlinked > 0 ? "text-amber-700" : "text-emerald-700"}>{result.paidUnlinked}</b>
                </div>
                <div className="col-span-2 pt-1">
                  <PaidSyncCheckButton pipelineId={result.pipelineId} onComplete={(r) => {
                    setResult((prev) => prev ? { ...prev, paidCreated: prev.paidCreated + r.created, paidLinked: prev.paidLinked + r.linked, paidUnlinked: r.unlinkedAfter } : prev);
                  }} />
                </div>
                {result.paidUnlinked > 0 && (
                  <div className="col-span-2 flex items-start gap-2 mt-1 p-2.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
                    <span>Some paid CRM leads are not linked to Paid Pipeline. Click "Run Paid Import Sync Check" above to backfill.</span>
                  </div>
                )}
              </div>
            )}

            {result.failureReasons.length > 0 && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs">
                <div className="font-medium text-amber-900 mb-1">Failure reasons</div>
                <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                  {result.failureReasons.map((r, i) => <li key={i}>{r.reason} — <b>{r.count}</b></li>)}
                </ul>
              </div>
            )}

            {result.errors.length > 0 && (
              <details className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs">
                <summary className="cursor-pointer font-medium text-red-800">Errors ({result.errors.length})</summary>
                <ul className="list-disc pl-4 mt-2 space-y-0.5 text-red-700">
                  {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => onDone(result)} className="ipc-btn ipc-btn-black">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Finds Paid pipeline CRM leads with no paid_pipeline_lead_id and backfills them. */
function PaidSyncCheckButton({ pipelineId, onComplete }: { pipelineId: string; onComplete: (r: { before: number; created: number; linked: number; unlinkedAfter: number }) => void }) {
  const { profile } = useAuth();
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<{ before: number; created: number; linked: number; unlinkedAfter: number } | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const { data: crm } = await supabase
        .from("leads")
        .select("id, full_name, email, phone, deal_value, program_name, paid_pipeline_lead_id, archived_at")
        .eq("pipeline_id", pipelineId)
        .is("archived_at", null);
      const unlinked = (crm || []).filter((l: any) => !l.paid_pipeline_lead_id);
      const before = unlinked.length;
      let created = 0, linked = 0;
      for (const lead of unlinked as any[]) {
        let existing: any = null;
        if (lead.email) {
          const { data } = await supabase.from("paid_pipeline_leads")
            .select("id").eq("email", lead.email).eq("is_deleted", false).maybeSingle();
          existing = data;
        }
        if (!existing && lead.phone) {
          const { data } = await supabase.from("paid_pipeline_leads")
            .select("id").eq("phone", lead.phone).eq("is_deleted", false).maybeSingle();
          existing = data;
        }
        if (existing) {
          await supabase.from("paid_pipeline_leads").update({ crm_lead_id: lead.id } as any).eq("id", existing.id);
          await supabase.from("leads").update({ paid_pipeline_lead_id: existing.id } as any).eq("id", lead.id);
          linked++;
        } else {
          const { data: ins } = await supabase.from("paid_pipeline_leads").insert({
            name: lead.full_name, email: lead.email, phone: lead.phone,
            product_name_snapshot: lead.program_name || null,
            deal_value_including_gst: Number(lead.deal_value || 0),
            pipeline_stage: "Payment Confirmed", payment_status: "No Payment",
            crm_lead_id: lead.id, created_by: profile?.id,
          } as any).select("id").maybeSingle();
          if (ins?.id) {
            await supabase.from("leads").update({ paid_pipeline_lead_id: ins.id } as any).eq("id", lead.id);
            created++;
          }
        }
      }
      const { data: after } = await supabase.from("leads")
        .select("id, paid_pipeline_lead_id").eq("pipeline_id", pipelineId).is("archived_at", null);
      const unlinkedAfter = (after || []).filter((l: any) => !l.paid_pipeline_lead_id).length;
      const result = { before, created, linked, unlinkedAfter };
      setLast(result);
      onComplete(result);
      toast.success(`Sync check: ${created} created · ${linked} linked · ${unlinkedAfter} still unlinked`);
      logActivity({
        module_key: "paid_pipeline", action_type: "paid_pipeline_sync_check_run",
        entity_type: "pipeline", entity_id: pipelineId,
        summary: `Paid Import Sync Check: ${before} unlinked → ${created} created · ${linked} linked · ${unlinkedAfter} still unlinked.`,
        metadata: { pipeline_id: pipelineId, before, created, linked, unlinked_after: unlinkedAfter },
      }).catch(() => {});
    } catch (e: any) {
      console.error("[PaidSyncCheckButton]", e);
      toast.error(e?.message || "Sync check failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button onClick={run} disabled={running} className="ipc-btn ipc-btn-ghost text-xs self-start disabled:opacity-50">
        {running ? "Checking…" : "Run Paid Import Sync Check"}
      </button>
      {last && (
        <div className="text-[11px] text-muted-foreground">
          Before: <b>{last.before}</b> unlinked → After: <b>{last.unlinkedAfter}</b> unlinked (created {last.created}, linked {last.linked})
        </div>
      )}
    </div>
  );
}
