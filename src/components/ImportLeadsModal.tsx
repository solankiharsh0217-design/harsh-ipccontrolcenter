import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { X, Plus, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, Link2, Loader2 } from "lucide-react";
import { DEFAULT_PIPELINE_TEMPLATES, ensurePipelineExists, GRADE_STYLES, type LeadGrade } from "@/lib/crmTypes";
import { logActivity } from "@/lib/auditLog";
import { getEligibleAssignees } from "@/lib/eligibleAssignees";
import { listServicePackages, buildSnapshot, type ServicePackage } from "@/lib/servicePackages";
import { listProcessTemplates, type ProcessTemplate } from "@/lib/operationsTemplates";
import { Link } from "react-router-dom";

export type DuplicatePolicy = "skip" | "update" | "move" | "new_only" | "promote";
export type AssignmentMode = "unassigned" | "assign_to_me" | "assign_to_member" | "round_robin" | "hot_to_top";

export interface ImportResult {
  pipelineId: string;
  pipelineName: string;
  pipelineType: "unpaid" | "paid" | "custom";
  leadType: "unpaid" | "paid";
  batchName: string;
  imported: number;          // total successful (new + updated + moved + promoted) — back-compat
  newImported: number;
  updated: number;
  moved: number;
  promoted: number;
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
type FieldKey = "full_name" | "email" | "phone" | "country" | "token" | "deal_value";

const FIELD_GUESS: Record<FieldKey, RegExp> = {
  full_name: /^(name|full[\s_-]?name|first[\s_-]?name|attendee|user)/i,
  email: /e[\s_-]?mail/i,
  phone: /(phone|mobile|whatsapp|contact|number)/i,
  country: /country/i,
  token: /(token|advance|collected|paid[\s_-]?amount|amount[\s_-]?paid|down[\s_-]?payment)/i,
  deal_value: /(deal[\s_-]?value|product[\s_-]?price|total[\s_-]?fee|program[\s_-]?fee|price[\s_-]?incl|deal[\s_-]?amount|total[\s_-]?amount|fees?)/i,
};

const FIELD_LABEL: Record<FieldKey, string> = {
  full_name: "Full name",
  email: "Email",
  phone: "Phone",
  country: "Country",
  token: "Token / Advance",
  deal_value: "Deal value / Product price",
};

const ALL_FIELDS: FieldKey[] = ["full_name", "email", "phone", "country", "token", "deal_value"];

function autoMap(headers: string[]): Record<FieldKey, string> {
  const out: any = { full_name: "", email: "", phone: "", country: "", token: "", deal_value: "" };
  for (const h of headers) {
    for (const k of ALL_FIELDS) {
      if (!out[k] && FIELD_GUESS[k].test(h)) out[k] = h;
    }
  }
  return out;
}

const normEmail = (v: any) => {
  const s = String(v ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, "").trim().toLowerCase();
  return s;
};
const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const normPhone = (v: any) => {
  let s = String(v ?? "").replace(/\D/g, "");
  if (s.length > 10 && s.startsWith("91")) s = s.slice(s.length - 10);
  if (s.length > 10) s = s.slice(s.length - 10);
  return s;
};
// Parse currency-ish numbers from CSVs. Handles "₹1,18,000", "1.18L", "1,18,000.00", "-", "".
const parseAmount = (v: any): number => {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();
  if (!s || s === "-" || s === "—" || /^n\/?a$/i.test(s)) return 0;
  const lakh = /(\d+(?:\.\d+)?)\s*l(akh)?\b/i.exec(s);
  if (lakh) return Math.round(parseFloat(lakh[1]) * 100000);
  const cr = /(\d+(?:\.\d+)?)\s*cr\b/i.exec(s);
  if (cr) return Math.round(parseFloat(cr[1]) * 10000000);
  s = s.replace(/[₹$,\s]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Insert a single Token payment row for a paid pipeline lead. Idempotency guard:
// skip if an identical token payment (same amount + reference) already exists for this lead.
const recordTokenPayment = async (
  paidLeadId: string,
  amount: number,
  segmentName: string,
  createdBy: string | null,
): Promise<void> => {
  if (!paidLeadId || !(amount > 0)) return;
  const reference = `Import · ${segmentName}`;
  const { data: existing } = await supabase
    .from("paid_pipeline_payments" as any)
    .select("id")
    .eq("paid_pipeline_lead_id", paidLeadId)
    .eq("payment_reference", reference)
    .eq("is_deleted", false)
    .maybeSingle();
  if ((existing as any)?.id) return;
  const { error } = await supabase.from("paid_pipeline_payments" as any).insert({
    paid_pipeline_lead_id: paidLeadId,
    payment_type: "Token",
    payment_category: "token",
    amount,
    payment_mode: "Import",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_reference: reference,
    is_token: true,
    is_final_payment: false,
    payment_description: `Token collected on CSV/Sheet import from segment "${segmentName}"`,
    is_deleted: false,
    created_by: createdBy,
  } as any);
  if (error) throw error;
};


export default function ImportLeadsModal({ onClose, onDone }: Props) {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1 — source
  type SourceType = "csv" | "google_sheet";
  const [sourceType, setSourceType] = useState<SourceType>("csv");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({ full_name: "", email: "", phone: "", country: "", token: "", deal_value: "" });

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
  const [servicePackages, setServicePackages] = useState<ServicePackage[]>([]);
  const [servicePackageId, setServicePackageId] = useState<string>("");
  const [processTemplates, setProcessTemplates] = useState<ProcessTemplate[]>([]);
  const [processTemplateId, setProcessTemplateId] = useState<string>("");
  const [sendToOperations, setSendToOperations] = useState<boolean>(false);
  const [overwriteServicePackage, setOverwriteServicePackage] = useState<boolean>(false);

  // Phase 1 — Programme + Offer identity
  type ProgramRow = { id: string; name: string; program_key: string | null; is_active: boolean; sort_order: number };
  type OfferRow = {
    id: string; product_name: string; program_id: string | null; business_unit: string | null;
    product_price_including_gst: number; default_token_amount: number;
    default_pipeline_id: string | null; default_service_package_id: string | null;
    default_operations_template_id: string | null; default_grade: string | null;
    is_active: boolean; is_deleted: boolean;
  };
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [programId, setProgramId] = useState<string>("");
  const [offerId, setOfferId] = useState<string>("");

  // Step 4
  const [agents, setAgents] = useState<{ id: string; full_name: string; role: string | null }[]>([]);
  const [assignment, setAssignment] = useState<AssignmentMode>("unassigned");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>("skip");
  const [duplicatePolicyTouched, setDuplicatePolicyTouched] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(false);

  // Step 5 — diagnostics result
  const [result, setResult] = useState<ImportResult | null>(null);

  // Preflight summary
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflight, setPreflight] = useState<{
    total: number;
    rowsWithEmail: number;
    missingEmail: number;
    phoneOnlyCount: number;
    nameOnlyCount: number;
    sheetDuplicateEmails: number;
    sheetDuplicatePhones: number;
    existingByEmailCount: number;
    existingByPhoneCount: number;
    matchConflictCount: number;
    archivedMatchCount: number;
    newCount: number;
    invalid: number;
    willImport: number;
    willSkip: number;
    existingByEmail: Map<string, any>;
    existingByPhone: Map<string, any>;
    rowDetails: {
      rowNum: number;
      name: string;
      email: string;
      phone: string;
      status:
        | "new"
        | "existing_by_email"
        | "existing_by_phone"
        | "sheet_duplicate_email"
        | "sheet_duplicate_phone"
        | "phone_only"
        | "name_only"
        | "invalid";
      conflict: boolean;
      existing: {
        full_name: string | null;
        pipeline_name: string | null;
        stage_name: string | null;
        batch_name: string | null;
        archived: boolean;
      } | null;
    }[];
  } | null>(null);
  const [showPreflightRows, setShowPreflightRows] = useState(false);


  useEffect(() => {
    supabase.from("webinars").select("id, name").order("name").then(({ data }) => setWebinars((data || []) as any));
    // Load Programmes (business_units) and Offers (program_products) for Phase 1
    supabase
      .from("business_units" as any)
      .select("id, name, program_key, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .order("name")
      .then(({ data }) => setPrograms((data as any) || []));
    supabase
      .from("program_products" as any)
      .select("id, product_name, program_id, business_unit, product_price_including_gst, default_token_amount, default_pipeline_id, default_service_package_id, default_operations_template_id, default_grade, is_active, is_deleted")
      .eq("is_active", true)
      .eq("is_deleted", false)
      .order("product_name")
      .then(({ data }) => setOffers((data as any) || []));
  }, []);

  const filteredOffers = useMemo(() => {
    if (!programId) return offers;
    const prog = programs.find((p) => p.id === programId);
    return offers.filter((o) =>
      o.program_id === programId ||
      (!!prog && !!o.business_unit && o.business_unit.toUpperCase() === prog.name.toUpperCase()),
    );
  }, [offers, programs, programId]);

  // When an offer is picked, prefill product/deal/package/template/grade and lock destination pipeline.
  const applyOfferDefaults = (offer: OfferRow | null) => {
    if (!offer) return;
    setProductName(offer.product_name || productName);
    if (Number(offer.product_price_including_gst) > 0) setDealValue(Number(offer.product_price_including_gst));
    if (offer.default_service_package_id) setServicePackageId(offer.default_service_package_id);
    if (offer.default_operations_template_id) setProcessTemplateId(offer.default_operations_template_id);
    if (offer.default_grade && ["hot","warm","cold","non-attendee"].includes(offer.default_grade)) {
      setDefaultGrade(offer.default_grade as LeadGrade);
    }
    if (offer.default_pipeline_id) {
      setCreatingPipeline(false);
      setTargetPipelineId(offer.default_pipeline_id);
      const pipe = pipelines.find((p) => p.id === offer.default_pipeline_id);
      if (pipe?.type === "paid") setLeadType("paid");
      else if (pipe?.type === "unpaid") setLeadType("unpaid");
    }
    if (offer.program_id && offer.program_id !== programId) setProgramId(offer.program_id);
  };


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

  // Read a friendly error message from a supabase.functions.invoke() FunctionsHttpError
  const readInvokeError = async (error: any, fallback: string): Promise<string> => {
    try {
      const ctx = error?.context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) return String(body.error);
      } else if (ctx && typeof ctx.text === "function") {
        const txt = await ctx.text();
        try { const j = JSON.parse(txt); if (j?.error) return String(j.error); } catch {}
        if (txt) return txt;
      }
    } catch {}
    return error?.message || fallback;
  };

  const handleFetchGsTabs = async () => {
    setGsError(null);
    const sid = extractSpreadsheetId(gsUrl.trim());
    if (!sid) { setGsError("Please paste a valid Google Sheet URL. It should look like https://docs.google.com/spreadsheets/d/…"); return; }
    setGsLoadingTabs(true);
    setGsTabs([]); setGsSelectedTab(""); setHeaders([]); setRows([]); setFileName("");
    try {
      const { data, error } = await supabase.functions.invoke("fetch-roas-master-sheet-tabs", {
        body: { masterSheetUrl: gsUrl.trim() },
      });
      if (error) throw new Error(await readInvokeError(error, "Failed to fetch sheet tabs"));
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
      if (error) throw new Error(await readInvokeError(error, "Failed to fetch rows"));
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
      const [{ data: pl }, { data: st }, elig, pkgs, tmpls] = await Promise.all([
        supabase.from("pipelines").select("*").order("position"),
        supabase.from("stages").select("*").order("position"),
        getEligibleAssignees("calling_crm"),
        listServicePackages(false).catch(() => [] as ServicePackage[]),
        listProcessTemplates(true).catch(() => [] as ProcessTemplate[]),
      ]);
      setPipelines(pl || []);
      setStages(st || []);
      setAgents(elig.map((a) => ({ id: a.id, full_name: a.full_name, role: a.role })));
      setServicePackages(pkgs);
      setProcessTemplates(tmpls);
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

  // Default duplicate policy: paid → "promote" (recommended); unpaid → "skip".
  // Respect the user's explicit choice once they've changed it.
  useEffect(() => {
    if (duplicatePolicyTouched) return;
    setDuplicatePolicy(leadType === "paid" ? "promote" : "skip");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadType]);

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

        // 1) Parse + classify rows from the file itself
        type Parsed = { idx: number; name: string; email: string; phone: string; emailValid: boolean };
        const parsed: Parsed[] = rows.map((r, i) => {
          const email = normEmail(get(r, "email"));
          return {
            idx: i,
            name: get(r, "full_name"),
            email,
            phone: normPhone(get(r, "phone")),
            emailValid: !!email && isValidEmail(email),
          };
        });

        // 2) Detect duplicates inside the sheet (after normalization)
        const emailFirstSeen = new Map<string, number>();
        const phoneFirstSeen = new Map<string, number>();
        const sheetDupEmailIdx = new Set<number>();
        const sheetDupPhoneIdx = new Set<number>();
        for (const p of parsed) {
          if (p.emailValid) {
            if (emailFirstSeen.has(p.email)) sheetDupEmailIdx.add(p.idx);
            else emailFirstSeen.set(p.email, p.idx);
          }
          if (p.phone.length === 10) {
            if (phoneFirstSeen.has(p.phone)) sheetDupPhoneIdx.add(p.idx);
            else phoneFirstSeen.set(p.phone, p.idx);
          }
        }
        const sheetDuplicateEmails = sheetDupEmailIdx.size;
        const sheetDuplicatePhones = sheetDupPhoneIdx.size;

        // 3) Lookup existing CRM leads by email AND by phone
        const uniqueEmails = Array.from(emailFirstSeen.keys());
        const uniquePhones = Array.from(phoneFirstSeen.keys());
        const existingByEmail = new Map<string, any>();
        const existingByPhone = new Map<string, any>();

        const fetchExisting = async (col: "email" | "phone", values: string[], target: Map<string, any>) => {
          for (let i = 0; i < values.length; i += 300) {
            const chunk = values.slice(i, i + 300);
            const { data } = await supabase
              .from("leads")
              .select("id, email, full_name, phone, pipeline_id, stage_id, lead_type, archived_at, batch_name")
              .in(col, chunk);
            (data || []).forEach((l: any) => {
              if (col === "email") {
                const k = normEmail(l.email);
                if (k && !target.has(k)) target.set(k, l);
              } else {
                const k = normPhone(l.phone);
                if (k.length === 10 && !target.has(k)) target.set(k, l);
              }
            });
          }
        };

        await Promise.all([
          uniqueEmails.length ? fetchExisting("email", uniqueEmails, existingByEmail) : Promise.resolve(),
          uniquePhones.length ? fetchExisting("phone", uniquePhones, existingByPhone) : Promise.resolve(),
        ]);

        // 4) Helpers to render pipeline/stage names
        const pipeName = (id: string | null) => pipelines.find((p: any) => p.id === id)?.name || null;
        const stageName = (id: string | null) => stages.find((s: any) => s.id === id)?.name || null;
        const formatExisting = (l: any) => l ? ({
          full_name: l.full_name || null,
          pipeline_name: pipeName(l.pipeline_id),
          stage_name: stageName(l.stage_id),
          batch_name: l.batch_name || null,
          archived: !!l.archived_at,
        }) : null;

        // 5) Build per-row preflight detail
        let missingEmail = 0;
        let phoneOnlyCount = 0;
        let nameOnlyCount = 0;
        let invalid = 0;
        let existingByEmailCount = 0;
        let existingByPhoneCount = 0;
        let matchConflictCount = 0;
        let archivedMatchCount = 0;
        let newCount = 0;
        let willImport = 0;
        let willSkip = 0;

        const rowDetails = parsed.map((p) => {
          const base = { rowNum: p.idx + 2, name: p.name, email: p.email, phone: p.phone };
          // Invalid: no name AND no usable email AND no phone
          if (!p.name && !p.emailValid && p.phone.length !== 10) {
            invalid++; willSkip++;
            return { ...base, status: "invalid" as const, conflict: false, existing: null };
          }
          // In-sheet duplicate (email takes precedence)
          if (sheetDupEmailIdx.has(p.idx)) {
            willSkip++;
            return { ...base, status: "sheet_duplicate_email" as const, conflict: false, existing: null };
          }
          if (sheetDupPhoneIdx.has(p.idx) && !p.emailValid) {
            willSkip++;
            return { ...base, status: "sheet_duplicate_phone" as const, conflict: false, existing: null };
          }
          // Existing match (email → phone)
          const emailMatch = p.emailValid ? existingByEmail.get(p.email) : null;
          const phoneMatch = p.phone.length === 10 ? existingByPhone.get(p.phone) : null;
          if (emailMatch) {
            existingByEmailCount++;
            const conflict = !!(phoneMatch && phoneMatch.id !== emailMatch.id);
            if (conflict) matchConflictCount++;
            if (emailMatch.archived_at) archivedMatchCount++;
            if (duplicatePolicy === "update" || duplicatePolicy === "promote") willImport++; else willSkip++;
            return { ...base, status: "existing_by_email" as const, conflict, existing: formatExisting(emailMatch) };
          }
          if (phoneMatch) {
            existingByPhoneCount++;
            if (phoneMatch.archived_at) archivedMatchCount++;
            if (duplicatePolicy === "update" || duplicatePolicy === "promote") willImport++; else willSkip++;
            return { ...base, status: "existing_by_phone" as const, conflict: false, existing: formatExisting(phoneMatch) };
          }
          // No email
          if (!p.emailValid) {
            missingEmail++;
            if (p.phone.length === 10) {
              phoneOnlyCount++; willImport++;
              return { ...base, status: "phone_only" as const, conflict: false, existing: null };
            }
            // name only (no email, no phone, has name)
            nameOnlyCount++; willImport++;
            return { ...base, status: "name_only" as const, conflict: false, existing: null };
          }
          newCount++; willImport++;
          return { ...base, status: "new" as const, conflict: false, existing: null };
        });

        const rowsWithEmail = parsed.filter((p) => p.emailValid).length;

        if (!cancelled) {
          setPreflight({
            total: rows.length,
            rowsWithEmail,
            missingEmail,
            phoneOnlyCount,
            nameOnlyCount,
            sheetDuplicateEmails,
            sheetDuplicatePhones,
            existingByEmailCount,
            existingByPhoneCount,
            matchConflictCount,
            archivedMatchCount,
            newCount,
            invalid,
            willImport,
            willSkip,
            existingByEmail,
            existingByPhone,
            rowDetails,
          });
        }
      } finally {
        if (!cancelled) setPreflightLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, rows, mapping, pipelines, stages, duplicatePolicy]);



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

      // Phase 1 hard guard — Programme + Offer identity.
      // Prevents IWC leads from silently landing in IPC pipelines (or vice-versa).
      const selectedOffer = offerId ? offers.find((o) => o.id === offerId) : null;
      if (selectedOffer && selectedOffer.default_pipeline_id && selectedOffer.default_pipeline_id !== pipelineId) {
        const lockedName = pipelines.find((p) => p.id === selectedOffer.default_pipeline_id)?.name || "the offer's default pipeline";
        toast.error(`This offer is locked to "${lockedName}". Change the target pipeline to that, or pick a different offer.`);
        setImporting(false);
        return;
      }
      if (programs.length > 0 && !programId && !selectedOffer) {
        toast.error("Please pick a Programme (IPC / IWC / …) so this batch stays isolated in reports.");
        setImporting(false);
        return;
      }
      // Resolve final program_id — offer wins over dropdown to avoid mismatches.
      const finalProgramId: string | null = (selectedOffer?.program_id) || programId || null;
      const finalOfferId: string | null = selectedOffer?.id || null;

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
      type N = { full_name: string | null; email: string | null; phone: string | null; country: string | null; token: number; deal_value: number };
      const records: N[] = rows.map((r) => ({
        full_name: get(r, "full_name") || null,
        email: normEmail(get(r, "email")) || null,
        phone: normPhone(get(r, "phone")) || null,
        country: get(r, "country") || null,
        token: mapping.token ? parseAmount(r[mapping.token]) : 0,
        deal_value: mapping.deal_value ? parseAmount(r[mapping.deal_value]) : 0,
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
          const phoneKey = normPhone(l.phone);
          if (phoneKey.length === 10 && !existingByPhone.has(phoneKey)) existingByPhone.set(phoneKey, l);
        });
      }
      for (let i = 0; i < phones.length; i += 300) {
        const chunk = phones.slice(i, i + 300);
        const { data } = await supabase.from("leads").select(leadCols).in("phone", chunk);
        (data || []).forEach((l: any) => {
          const phoneKey = normPhone(l.phone);
          if (phoneKey.length === 10 && !existingByPhone.has(phoneKey)) existingByPhone.set(phoneKey, l);
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
        // No match — must have at least an email OR phone OR name to insert.
        if (!r.email && !r.phone && !r.full_name) { failedNoKey++; continue; }
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
      let promoted = 0;
      let restored = 0;
      let phoneOnlyImported = 0;
      let skippedDuplicates = 0;
      let failed = failedNoKey;
      const createdCrmLeadIds = new Set<string>();
      const promotedCrmLeadIds = new Set<string>();
      const errors: string[] = [];
      const reasonCounts = new Map<string, number>();
      if (failedNoKey > 0) reasonCounts.set("Row has neither email nor phone", failedNoKey);

      // --- Build promotion payload (only used when policy === "promote" on paid import) ---
      const selectedPackageForDup = servicePackages.find((p) => p.id === servicePackageId) || null;
      const packageSnapshotForDup = selectedPackageForDup ? buildSnapshot(selectedPackageForDup) : null;

      // --- Handle duplicates per policy ---
      const addReason = (msg: string) => reasonCounts.set(msg, (reasonCounts.get(msg) || 0) + 1);
      if (duplicatePolicy === "promote" && pipelineType === "paid") {
        // Promote each existing unpaid (or stale) lead into the chosen paid pipeline + stage,
        // hide from unpaid sales workload, mark converted, and propagate paid metadata.
        // History (notes/tags/attendance/activity/follow-ups) is preserved by design — we
        // update the lead in place rather than deleting and re-creating it.
        for (const { row, existing, matchedBy } of dupRows) {
          const wasArchived = !!existing.archived_at;
          const wasSoftDeleted = !!(existing as any).deleted_at;
          const base: any = {
            pipeline_id: pipelineId,
            stage_id: firstStageId,
            lead_type: "paid",
            lead_source_type: "direct_import",
            webinar_source: segmentName,
            webinar_date: webinarDate,
            webinar_name: webinarName || segmentName,
            program_name: productName || null,
            deal_value: dealValue,
            program_id: finalProgramId,
            offer_id: finalOfferId,
            source_segment_name: segmentName || null,
            service_package_id: servicePackageId || null,
            service_package_snapshot: packageSnapshotForDup,
            hide_from_sales_workload: true,
            conversion_status: "converted",
            converted_at: new Date().toISOString(),
            converted_by: profile?.id ?? null,
            assigned_agent_id: null, // remove from unpaid sales executive workload
            ...(wasArchived ? { archived_at: null, archived_by: null, archive_reason: null } : {}),
            ...(wasSoftDeleted ? { deleted_at: null, deleted_by: null, delete_reason: null } : {}),
          };
          // Fill missing contact fields only; keep existing ones.
          if (!existing.full_name && row.full_name) base.full_name = row.full_name;
          if (!existing.phone && row.phone) base.phone = row.phone;
          if (!existing.email && row.email) base.email = row.email;

          const { data: updRows, error } = await supabase
            .from("leads").update(base).eq("id", existing.id).select("id");
          if (error) {
            console.error("[ImportLeadsModal] promote existing failed", error, existing.id);
            failed++;
            addReason(`Promote existing failed: ${error.message}`);
            if (!errors.includes(error.message)) errors.push(error.message);
            continue;
          }
          if (!updRows || updRows.length === 0) {
            // RLS silently filtered the update — typically because the existing
            // lead is assigned to another agent and the importer is not an admin.
            console.warn("[ImportLeadsModal] promote produced 0 row updates (RLS blocked)", existing.id);
            failed++;
            addReason("Promote blocked by access policy — existing lead is assigned to another agent. Re-import as an admin (or the assigned owner) to promote.");
            continue;
          }
          promoted++;
          if (wasArchived) restored++;
          if (matchedBy === "phone" && !row.email) phoneOnlyImported++;
          promotedCrmLeadIds.add(existing.id);

          // Cancel active unpaid follow-ups so sales executives don't call them as unpaid.
          // History is preserved (rows kept, just marked completed with a reason).
          try {
            await (supabase.from("follow_up_reminders") as any)
              .update({ status: "completed", completed_at: new Date().toISOString(), completed_reason: "Promoted to paid" })
              .eq("lead_id", existing.id)
              .in("status", ["pending", "scheduled", "active"]);
          } catch { /* schema-tolerant — ignore if columns differ */ }
        }
      } else if (duplicatePolicy !== "update") {
        skippedDuplicates += dupRows.length;
      } else {
        // Safe update: never moves an existing lead or overwrites status/stage/pipeline tracking.
        for (const { row, existing, matchedBy } of dupRows) {
          const wasArchived = !!existing.archived_at;
          const wasSoftDeleted = !!(existing as any).deleted_at;
          const base: any = {
            lead_source_type: "direct_import",
            ...(wasArchived ? { archived_at: null, archived_by: null, archive_reason: null } : {}),
            ...(wasSoftDeleted ? { deleted_at: null, deleted_by: null, delete_reason: null } : {}),
          };
          // Fill missing contact fields only. Existing pipeline/stage/status/owner/deal fields are preserved.
          if (!existing.full_name && row.full_name) base.full_name = row.full_name;
          if (!existing.phone && row.phone) base.phone = row.phone;
          if (!existing.email && row.email) base.email = row.email;
          if (row.country && !(existing as any).country) base.country = row.country;

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
      const selectedPackage = servicePackages.find((p) => p.id === servicePackageId) || null;
      const packageSnapshot = selectedPackage ? buildSnapshot(selectedPackage) : null;
      const resolvedProcessTemplateId =
        processTemplateId || selectedPackage?.default_process_template_id || null;

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
          deal_value: r.deal_value > 0 ? r.deal_value : dealValue,
          program_id: finalProgramId,
          offer_id: finalOfferId,
          source_segment_name: segmentName || null,
          total_minutes: 0,
          attendance_pct: 0,
          sessions_count: 0,
          is_super_hot: false,
          lead_source_type: "direct_import",
          service_package_id: servicePackageId || null,
          service_package_snapshot: packageSnapshot,
        } as any;
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
              createdCrmLeadIds.add(d2.id);
              newImported++;
              if (src?._phoneOnly) phoneOnlyImported++;
            }
          }
        } else {
          (data || []).forEach((d: any) => { if (d?.id) createdCrmLeadIds.add(d.id); });
          newImported += data?.length || chunk.length;
          chunkSrc.forEach((s) => { if (s._phoneOnly) phoneOnlyImported++; });
        }
      }

      // ── Auto-sync paid leads to Paid Pipeline ─────────────────────────────
      // Build a lookup from records to recover per-row Token / Deal Value once the
      // CRM lead is created. Records may have both email + phone or only one.
      const rowMetaByEmail = new Map<string, { token: number; deal_value: number }>();
      const rowMetaByPhone = new Map<string, { token: number; deal_value: number }>();
      for (const r of records) {
        if (r.token > 0 || r.deal_value > 0) {
          const meta = { token: r.token, deal_value: r.deal_value };
          if (r.email && !rowMetaByEmail.has(r.email)) rowMetaByEmail.set(r.email, meta);
          if (r.phone && !rowMetaByPhone.has(r.phone)) rowMetaByPhone.set(r.phone, meta);
        }
      }
      const resolveRowMeta = (email: string | null, phone: string | null) => {
        if (email && rowMetaByEmail.has(email)) return rowMetaByEmail.get(email)!;
        if (phone && rowMetaByPhone.has(phone)) return rowMetaByPhone.get(phone)!;
        return { token: 0, deal_value: 0 };
      };

      let paidSynced = 0;
      let paidLinked = 0;
      let paidUnlinked = 0;
      let paymentRowsCreated = 0;
      let paymentRowsFailed = 0;
      let totalTokenCollected = 0;
      if (pipelineType === "paid") {
        try {
          const syncIds = new Set<string>([...createdCrmLeadIds, ...promotedCrmLeadIds]);
          const { data: crmRows } = syncIds.size > 0
            ? await supabase
              .from("leads")
              .select("id, full_name, email, phone, deal_value, program_name, paid_pipeline_lead_id")
              .in("id", Array.from(syncIds))
            : { data: [] as any[] };

          for (const lead of (crmRows || []) as any[]) {
            const rowMeta = resolveRowMeta(normEmail(lead.email), normPhone(lead.phone));
            const rowDeal = rowMeta.deal_value > 0 ? rowMeta.deal_value : Number(lead.deal_value || dealValue || 0);
            const rowToken = rowMeta.token > 0 ? rowMeta.token : 0;

            if (lead.paid_pipeline_lead_id) {
              paidLinked++;
              if (rowToken > 0) {
                totalTokenCollected += rowToken;
                await recordTokenPayment(lead.paid_pipeline_lead_id, rowToken, segmentName, profile?.id ?? null)
                  .then(() => paymentRowsCreated++)
                  .catch((e) => { paymentRowsFailed++; console.error("[ImportLeadsModal] token payment insert failed", e); });
              }
              continue;
            }
            let existing: any = null;
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
              deal_value_including_gst: rowDeal,
              token_amount_collected: rowToken,
              source_webinar: segmentName,
              pipeline_stage: "Payment Confirmed",
              payment_status: rowToken > 0 ? "Partial Payment" : "No Payment",
              crm_lead_id: lead.id,
              service_package_id: servicePackageId || null,
              service_package_snapshot: packageSnapshot,
              program_id: finalProgramId,
              offer_id: finalOfferId,
              product_id: finalOfferId,
              source_segment_name: segmentName || null,
            };

            let paidLeadId: string | null = null;
            if (existing) {
              const updatePatch: any = { crm_lead_id: lead.id };
              if (rowDeal > 0) updatePatch.deal_value_including_gst = rowDeal;
              if (overwriteServicePackage && servicePackageId) {
                updatePatch.service_package_id = servicePackageId;
                updatePatch.service_package_snapshot = packageSnapshot;
              }
              await supabase.from("paid_pipeline_leads").update(updatePatch).eq("id", existing.id);
              if (lead.paid_pipeline_lead_id !== existing.id) {
                await supabase.from("leads").update({ paid_pipeline_lead_id: existing.id } as any).eq("id", lead.id);
              }
              paidLeadId = existing.id;
              paidLinked++;
            } else {
              payload.created_by = profile?.id;
              const { data: ins, error: insErr } = await supabase
                .from("paid_pipeline_leads").insert(payload).select("id").maybeSingle();
              if (!insErr && ins?.id) {
                await supabase.from("leads").update({ paid_pipeline_lead_id: ins.id } as any).eq("id", lead.id);
                paidSynced++;
                paidLeadId = ins.id;
                if (sendToOperations) {
                  try {
                    await supabase.from("operations_leads" as any).insert({
                      crm_lead_id: lead.id,
                      paid_pipeline_lead_id: ins.id,
                      full_name: lead.full_name,
                      email: lead.email,
                      phone: lead.phone,
                      program_name: lead.program_name || productName || null,
                      deal_value: rowDeal,
                      process_template_id: resolvedProcessTemplateId,
                      service_package_id: servicePackageId || null,
                      service_package_snapshot: packageSnapshot,
                      program_id: finalProgramId,
                      offer_id: finalOfferId,
                      source_type: "crm_import",
                      source_batch_name: segmentName,
                      created_by: profile?.id,
                    } as any);
                  } catch (opsErr: any) {
                    console.error("[ImportLeadsModal] operations_leads insert failed", opsErr);
                  }
                }
              } else if (insErr) {
                console.error("[ImportLeadsModal] paid_pipeline_leads insert failed", insErr);
                paidUnlinked++;
                if (!errors.includes(insErr.message)) errors.push(insErr.message);
              }
            }

            // Token payment row — only when the row has a positive token amount.
            if (paidLeadId && rowToken > 0) {
              totalTokenCollected += rowToken;
              await recordTokenPayment(paidLeadId, rowToken, segmentName, profile?.id ?? null)
                .then(() => paymentRowsCreated++)
                .catch((e) => { paymentRowsFailed++; console.error("[ImportLeadsModal] token payment insert failed", e); });
            }
          }

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
              metadata: {
                batch_name: segmentName, paid_created: paidSynced, paid_linked: paidLinked,
                paid_unlinked: paidUnlinked, pipeline_id: pipelineId,
                token_payments_created: paymentRowsCreated, token_payments_failed: paymentRowsFailed,
                total_token_collected: totalTokenCollected,
              },
              summary: `Paid Pipeline auto-sync: ${paidSynced} created · ${paidLinked} linked · ${paidUnlinked} unlinked · ${paymentRowsCreated} token payments (₹${totalTokenCollected.toLocaleString("en-IN")}) from batch "${segmentName}".`,
            });
          }
        } catch (syncErr: any) {
          console.error("[ImportLeadsModal] paid pipeline sync failed", syncErr);
        }
      }


      // ── Persist batch-level metadata (Service Package, Process Template, etc.) ──
      try {
        const batchPayload: any = {
          batch_name: segmentName,
          webinar_name: webinarName || segmentName,
          webinar_date: webinarDate || null,
          pipeline_id: pipelineId,
          product_name: productName || null,
          deal_value: dealValue || null,
          service_package_id: servicePackageId || null,
          service_package_snapshot: packageSnapshot,
          process_template_id: resolvedProcessTemplateId,
          program_id: finalProgramId,
          business_unit: (programs.find((p) => p.id === finalProgramId)?.name) || undefined,
          imported_lead_count: newImported,
          created_by: profile?.id,
          is_deleted: false,
        };
        // Reuse an existing active batch row when name + webinar_date + pipeline_id all
        // match (case-insensitive name). Prevents duplicate batch rows when the same
        // sheet is re-imported, while still letting two different dates coexist as
        // separate batches under the same name.
        let existingBatchQuery = supabase
          .from("webinar_batches" as any)
          .select("id, imported_lead_count")
          .ilike("batch_name", segmentName)
          .eq("is_deleted", false);
        existingBatchQuery = webinarDate
          ? existingBatchQuery.eq("webinar_date", webinarDate)
          : existingBatchQuery.is("webinar_date", null);
        if (pipelineId) existingBatchQuery = existingBatchQuery.eq("pipeline_id", pipelineId);
        const { data: existingBatchRaw } = await existingBatchQuery.maybeSingle();
        const existingBatch = existingBatchRaw as any;
        if (existingBatch?.id) {
          const patch: any = { ...batchPayload };
          delete patch.created_by;
          // Accumulate count instead of overwriting
          patch.imported_lead_count = (existingBatch.imported_lead_count || 0) + newImported;
          await supabase.from("webinar_batches" as any).update(patch).eq("id", existingBatch.id);
        } else {
          await supabase.from("webinar_batches" as any).insert(batchPayload);
        }
      } catch (batchErr: any) {
        console.error("[ImportLeadsModal] webinar_batches upsert failed", batchErr);
      }

      const totalSuccess = newImported + updated + moved + promoted;
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
          promoted_existing_count: promoted,
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
        summary: `Imported ${newImported} new · ${promoted} promoted · ${moved} moved · ${updated} updated · ${restored} restored · ${skippedDuplicates} skipped · ${failed} failed → "${pipelineName}" — batch "${segmentName}".`,
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
        promoted,
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
    update: "Fill missing contact info only",
    move: "Skip existing matches",
    new_only: "Import new only",
    promote: "Promote existing unpaid leads to Paid Onboarding",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-4 pb-3 border-b border-line">
          <div className="flex items-center justify-between">
            <div className="font-serif text-xl">Import Leads</div>
            <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-off flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
          {step !== 5 ? (
            <div className="mt-3 flex items-center gap-1.5 text-[11px]">
              {["Upload", "Webinar / Segment", "Lead Type & Service", "Review & Import"].map((label, idx) => {
                const n = idx + 1;
                const active = step === n;
                const done = step > n;
                return (
                  <div key={label} className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium ${
                        active ? "bg-black text-white" : done ? "bg-emerald-100 text-emerald-700" : "bg-off text-muted-foreground"
                      }`}
                    >
                      {n}
                    </span>
                    <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
                    {idx < 3 && <span className="text-muted-foreground/40">›</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-1 font-sans text-xs text-muted-foreground">Import complete</div>
          )}
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
                  {ALL_FIELDS.map((k) => (
                    <div key={k}>
                      <label className="form-label">{FIELD_LABEL[k]}{(k === "full_name" || k === "email" || k === "phone") ? "" : <span className="text-muted-foreground font-normal"> (optional)</span>}</label>
                      <select className="ipc-input" value={mapping[k]} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })}>
                        <option value="">— none —</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {rows[0] && (
                  <div className="p-3 rounded-md bg-off border border-line text-xs space-y-1">
                    <div className="uppercase-label">Preview row 1</div>
                    <div>
                      {mapping.full_name && <>Name: <b>{rows[0][mapping.full_name]}</b> · </>}
                      {mapping.email && <>Email: <b>{rows[0][mapping.email]}</b> · </>}
                      {mapping.phone && <>Phone: <b>{rows[0][mapping.phone]}</b></>}
                    </div>
                    {(mapping.token || mapping.deal_value) && (
                      <div className="text-muted-foreground">
                        {mapping.deal_value && <>Deal value: <b className="text-foreground">₹{parseAmount(rows[0][mapping.deal_value]).toLocaleString("en-IN")}</b> · </>}
                        {mapping.token && <>Token: <b className="text-foreground">₹{parseAmount(rows[0][mapping.token]).toLocaleString("en-IN")}</b></>}
                      </div>
                    )}
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

            {/* Phase 1 — Programme + Offer identity */}
            <div className="p-3 rounded-lg border border-line bg-off/60 space-y-3">
              <div className="flex items-center gap-2">
                <div className="font-serif text-sm">Programme &amp; Offer</div>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/20 text-black">Required for IPC / IWC separation</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Programme</label>
                  <select
                    className="ipc-input"
                    value={programId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setProgramId(id);
                      // Clear offer if it doesn't belong to the new programme
                      if (id && offerId) {
                        const cur = offers.find((o) => o.id === offerId);
                        const prog = programs.find((p) => p.id === id);
                        const belongs = cur && (cur.program_id === id || (!!prog && !!cur.business_unit && cur.business_unit.toUpperCase() === prog.name.toUpperCase()));
                        if (!belongs) setOfferId("");
                      }
                    }}
                  >
                    <option value="">— Select programme —</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {programs.length === 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">No programmes defined. Ask an admin to add IPC / IWC in Master Settings.</p>
                  )}
                </div>
                <div>
                  <label className="form-label">Offer / Product</label>
                  <select
                    className="ipc-input"
                    value={offerId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setOfferId(id);
                      const o = offers.find((x) => x.id === id) || null;
                      applyOfferDefaults(o);
                    }}
                  >
                    <option value="">— Select offer —</option>
                    {filteredOffers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.product_name}{o.product_price_including_gst ? ` · ₹${Number(o.product_price_including_gst).toLocaleString("en-IN")}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {offerId && (() => {
                const o = offers.find((x) => x.id === offerId);
                if (!o) return null;
                const lockedPipelineName = o.default_pipeline_id
                  ? (pipelines.find((p) => p.id === o.default_pipeline_id)?.name || "—")
                  : null;
                return (
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    {lockedPipelineName ? (
                      <div>🔒 Destination pipeline locked by offer: <b className="text-black">{lockedPipelineName}</b>. Change it in Master Settings → Offers.</div>
                    ) : (
                      <div>⚠️ This offer has no default pipeline set — imports may land in the wrong programme. Ask an admin to set a default pipeline for this offer.</div>
                    )}
                    <div>Programme tag, offer id, and batch will be stamped on every imported lead for reporting isolation.</div>
                  </div>
                );
              })()}
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label flex items-center justify-between">
                  <span>Service Package / Tier</span>
                  <Link to="/admin-center/service-packages" target="_blank" className="text-[10px] text-muted-foreground hover:text-foreground underline">+ Manage</Link>
                </label>
                <select
                  className="ipc-input"
                  value={servicePackageId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setServicePackageId(id);
                    const pkg = servicePackages.find((p) => p.id === id);
                    if (pkg?.default_process_template_id && !processTemplateId) {
                      setProcessTemplateId(pkg.default_process_template_id);
                    }
                  }}
                >
                  <option value="">— None —</option>
                  {servicePackages.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.code ? ` · ${p.code}` : ""}</option>
                  ))}
                </select>
                {servicePackages.length === 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">No service packages defined yet. Use Manage to add.</p>
                )}
              </div>
              <div>
                <label className="form-label flex items-center justify-between">
                  <span>Operations Process Template</span>
                  <Link to="/operations-crm?tab=settings" target="_blank" className="text-[10px] text-muted-foreground hover:text-foreground underline">+ Manage</Link>
                </label>
                <select className="ipc-input" value={processTemplateId} onChange={(e) => setProcessTemplateId(e.target.value)}>
                  <option value="">— None / Decide later —</option>
                  {processTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {leadType === "paid" && (
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-xs cursor-pointer p-3 rounded-md border border-line bg-off">
                  <input type="checkbox" className="mt-0.5" checked={sendToOperations} onChange={(e) => setSendToOperations(e.target.checked)} />
                  <span>
                    <b>Also send to Operations Intake</b> — creates Operations CRM records using the selected Process Template and Service Package.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs cursor-pointer p-3 rounded-md border border-line">
                  <input type="checkbox" className="mt-0.5" checked={overwriteServicePackage} onChange={(e) => setOverwriteServicePackage(e.target.checked)} />
                  <span>
                    <b>Update service package on existing paid buyers</b> — by default, an existing buyer's package is preserved.
                  </span>
                </label>
              </div>
            )}

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
              <div><span className="text-muted-foreground">Product / Program:</span> <b>{productName || "—"}</b> · ₹{dealValue.toLocaleString("en-IN")}</div>
              <div><span className="text-muted-foreground">Service Package / Tier:</span> <b>{servicePackages.find((p) => p.id === servicePackageId)?.name || "— None —"}</b></div>
              <div><span className="text-muted-foreground">Operations Process Template:</span> <b>{processTemplates.find((t) => t.id === processTemplateId)?.name || servicePackages.find((p) => p.id === servicePackageId)?.default_process_template_id && processTemplates.find((t) => t.id === servicePackages.find((p) => p.id === servicePackageId)?.default_process_template_id)?.name || "— None —"}</b></div>
              {leadType === "paid" && <div><span className="text-muted-foreground">Send to Operations Intake:</span> <b>{sendToOperations ? "Yes" : "No"}</b></div>}
            </div>

            {targetMismatch && (
              <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-800">
                {leadType === "paid"
                  ? "Paid pipeline missing. Please go back to Step 3 and select or create the Paid — Onboarding pipeline before importing paid leads."
                  : "Please select an unpaid pipeline before importing unpaid leads."}
              </div>
            )}

            <div className="p-4 rounded-lg border border-line space-y-2 text-sm">
              <div className="uppercase-label mb-1">Pre-flight check</div>
              {preflightLoading || !preflight ? (
                <div className="text-xs text-muted-foreground">Analyzing rows…</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div><span className="text-muted-foreground">Total rows:</span> <b>{preflight.total}</b></div>
                    <div><span className="text-muted-foreground">Rows with email:</span> <b>{preflight.rowsWithEmail}</b></div>
                    <div><span className="text-muted-foreground">Rows missing email:</span> <b>{preflight.missingEmail}</b></div>
                    <div><span className="text-muted-foreground">Invalid rows (no name/email/phone):</span> <b className={preflight.invalid ? "text-rose-700" : ""}>{preflight.invalid}</b></div>
                    <div><span className="text-muted-foreground">Phone-only rows:</span> <b className={preflight.phoneOnlyCount ? "text-emerald-700" : ""}>{preflight.phoneOnlyCount}</b></div>
                    <div><span className="text-muted-foreground">Name-only rows:</span> <b className={preflight.nameOnlyCount ? "text-emerald-700" : ""}>{preflight.nameOnlyCount}</b></div>
                    <div><span className="text-muted-foreground">Duplicate rows inside sheet (email):</span> <b className={preflight.sheetDuplicateEmails ? "text-amber-700" : ""}>{preflight.sheetDuplicateEmails}</b></div>
                    <div><span className="text-muted-foreground">Duplicate rows inside sheet (phone):</span> <b className={preflight.sheetDuplicatePhones ? "text-amber-700" : ""}>{preflight.sheetDuplicatePhones}</b></div>
                    <div><span className="text-muted-foreground">Existing CRM matches by email:</span> <b className="text-amber-700">{preflight.existingByEmailCount}</b></div>
                    <div><span className="text-muted-foreground">Existing CRM matches by phone:</span> <b className="text-amber-700">{preflight.existingByPhoneCount}</b></div>
                    <div><span className="text-muted-foreground">New email leads:</span> <b className="text-emerald-700">{preflight.newCount}</b></div>
                    <div><span className="text-muted-foreground">New phone-only leads:</span> <b className="text-emerald-700">{preflight.phoneOnlyCount}</b></div>
                    <div className="col-span-2 mt-1 pt-1 border-t border-line flex items-center justify-between">
                      <span><span className="text-muted-foreground">Will be imported:</span> <b className="text-emerald-700">{preflight.willImport}</b></span>
                      <span><span className="text-muted-foreground">Will be skipped:</span> <b className={preflight.willSkip ? "text-amber-700" : ""}>{preflight.willSkip}</b></span>
                    </div>
                  </div>

                  {preflight.missingEmail > 0 && (preflight.phoneOnlyCount + preflight.nameOnlyCount) > 0 && (
                    <div className="mt-2 px-2.5 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                      <b>{preflight.missingEmail}</b> row{preflight.missingEmail === 1 ? "" : "s"} {preflight.missingEmail === 1 ? "is" : "are"} missing email but will still be imported because phone/name is available
                      {preflight.phoneOnlyCount > 0 && <> · <b>{preflight.phoneOnlyCount}</b> phone-only</>}
                      {preflight.nameOnlyCount > 0 && <> · <b>{preflight.nameOnlyCount}</b> name-only (manual follow-up needed)</>}
                      .
                    </div>
                  )}
                  {(preflight.existingByEmailCount > 0 || preflight.existingByPhoneCount > 0) && (
                    <div className="mt-2 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
                      These rows are <b>not duplicates inside your sheet</b>. They match leads already present in CRM and will be handled by the duplicate policy below.
                    </div>
                  )}
                  {preflight.archivedMatchCount > 0 && (
                    <div className="mt-2 px-2.5 py-1.5 rounded-md bg-[#FEF3C7] border border-[#FDE68A] text-[11px] text-[#92400E]">
                      {preflight.archivedMatchCount} existing match{preflight.archivedMatchCount === 1 ? " is" : "es are"} currently archived. Existing matches are not moved to a new stage or batch during import.
                    </div>
                  )}
                  {preflight.matchConflictCount > 0 && (
                    <div className="mt-2 px-2.5 py-1.5 rounded-md bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                      <b>{preflight.matchConflictCount}</b> row{preflight.matchConflictCount === 1 ? "" : "s"} have an email and phone that match <b>different</b> CRM leads — manual review recommended.
                    </div>
                  )}

                  {preflight.rowDetails.length > 0 && (
                    <details className="mt-2 rounded-md border border-line" open={showPreflightRows} onToggle={(e) => setShowPreflightRows((e.target as HTMLDetailsElement).open)}>
                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium select-none">
                        Row-by-row breakdown ({preflight.rowDetails.length})
                      </summary>
                      <div className="max-h-72 overflow-auto border-t border-line">
                        <table className="w-full text-[11px]">
                          <thead className="bg-off sticky top-0">
                            <tr className="text-left">
                              <th className="px-2 py-1.5 font-medium">#</th>
                              <th className="px-2 py-1.5 font-medium">Name</th>
                              <th className="px-2 py-1.5 font-medium">Email</th>
                              <th className="px-2 py-1.5 font-medium">Phone</th>
                              <th className="px-2 py-1.5 font-medium">Status</th>
                              <th className="px-2 py-1.5 font-medium">Existing lead</th>
                              <th className="px-2 py-1.5 font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preflight.rowDetails.map((r) => {
                              const statusLabel: Record<typeof r.status, { text: string; cls: string }> = {
                                new: { text: "New email lead", cls: "text-emerald-700" },
                                existing_by_email: { text: "Existing CRM match (email)", cls: "text-amber-700" },
                                existing_by_phone: { text: "Existing CRM match (phone)", cls: "text-amber-700" },
                                sheet_duplicate_email: { text: "Duplicate inside sheet (email)", cls: "text-amber-700" },
                                sheet_duplicate_phone: { text: "Duplicate inside sheet (phone)", cls: "text-amber-700" },
                                phone_only: { text: "Phone-only lead", cls: "text-emerald-700" },
                                name_only: { text: "Name-only lead", cls: "text-emerald-700" },
                                invalid: { text: "Invalid row", cls: "text-rose-700" },
                              };
                              let action = "";
                              if (r.status === "new") action = "Will create email lead";
                              else if (r.status === "phone_only") action = "Will create phone-only lead";
                              else if (r.status === "name_only") action = "Will create name-only lead (manual follow-up)";
                              else if (r.status === "invalid") action = "Will skip invalid row";
                              else if (r.status === "sheet_duplicate_email" || r.status === "sheet_duplicate_phone") action = "Will skip (duplicate inside sheet)";
                              else if (r.status === "existing_by_email" || r.status === "existing_by_phone") {
                                if (duplicatePolicy === "update") action = "Will fill blank contact fields only";
                                else if (duplicatePolicy === "skip") action = "Will skip (existing match)";
                                else if (duplicatePolicy === "new_only") action = "Will skip (reported as existing)";
                                else action = "Will skip (existing match)";
                              }
                              const ex = r.existing;
                              return (
                                <tr key={r.rowNum} className={`border-t border-line ${r.conflict ? "bg-rose-50/40" : ""}`}>
                                  <td className="px-2 py-1.5 text-muted-foreground">{r.rowNum}</td>
                                  <td className="px-2 py-1.5">{r.name || "—"}</td>
                                  <td className="px-2 py-1.5">{r.email || <span className="text-muted-foreground">—</span>}</td>
                                  <td className="px-2 py-1.5">{r.phone || <span className="text-muted-foreground">—</span>}</td>
                                  <td className={`px-2 py-1.5 ${statusLabel[r.status].cls}`}>{statusLabel[r.status].text}{r.conflict && <span className="ml-1 text-rose-700">· conflict</span>}</td>
                                  <td className="px-2 py-1.5">
                                    {ex ? (
                                      <div className="leading-tight">
                                        <div>{ex.full_name || "—"}{ex.archived && <span className="ml-1 text-[10px] text-[#92400E]">(archived)</span>}</div>
                                        <div className="text-[10px] text-muted-foreground">
                                          {[ex.pipeline_name, ex.stage_name, ex.batch_name].filter(Boolean).join(" · ") || "—"}
                                        </div>
                                      </div>
                                    ) : "—"}
                                  </td>
                                  <td className="px-2 py-1.5">{action}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="form-label">If a row matches an existing CRM lead</label>
              <select className="ipc-input" value={duplicatePolicy} onChange={(e) => { setDuplicatePolicy(e.target.value as DuplicatePolicy); setDuplicatePolicyTouched(true); }}>
                {leadType === "paid" && (
                  <option value="promote">Promote existing unpaid leads to Paid Onboarding — recommended</option>
                )}
                <option value="skip">Skip existing CRM matches{leadType !== "paid" ? " — safest" : ""}</option>
                <option value="update">Only fill missing name/email/phone</option>
                <option value="new_only">Import new only (report existing matches as skipped)</option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {duplicatePolicy === "promote" && "Existing CRM matches will be moved into the selected Paid Onboarding pipeline, marked converted, hidden from the unpaid sales workload, and tagged with the chosen Service Package + Process Template. Notes, tags, attendance and activity history are preserved; active unpaid follow-ups are closed with reason \"Promoted to paid\"."}
                {duplicatePolicy === "update" && "Existing CRM matches will keep their current pipeline, stage, status, owner, product, deal value and batch. Only blank contact fields are filled."}
                {duplicatePolicy === "skip" && "Existing CRM matches will be skipped — no changes made. Only brand-new rows will be inserted."}
                {duplicatePolicy === "new_only" && "Only rows with no email/phone match in CRM will be imported. Existing matches will be reported as skipped."}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Duplicate rows inside the sheet itself are always skipped (first occurrence wins).
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

            {preflight && preflight.willSkip > 0 && (
              <div className="text-[11px] text-muted-foreground">
                {preflight.willSkip} row{preflight.willSkip === 1 ? "" : "s"} will be skipped
                {preflight.invalid > 0 && <> · {preflight.invalid} invalid</>}
                {preflight.sheetDuplicateEmails + preflight.sheetDuplicatePhones > 0 && <> · {preflight.sheetDuplicateEmails + preflight.sheetDuplicatePhones} in-sheet duplicate(s)</>}
                {(duplicatePolicy === "skip" || duplicatePolicy === "new_only") && (preflight.existingByEmailCount + preflight.existingByPhoneCount) > 0 && <> · {preflight.existingByEmailCount + preflight.existingByPhoneCount} existing CRM match(es)</>}
                .
              </div>
            )}
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(3)} className="ipc-btn ipc-btn-ghost">Back</button>
              <button
                onClick={importNow}
                disabled={
                  importing || preflightLoading || targetMismatch ||
                  (resolvedTarget.isNew && !newPipeName.trim()) ||
                  (assignment === "assign_to_member" && !selectedAssigneeId) ||
                  (preflight ? preflight.willImport === 0 : false)
                }
                className="ipc-btn ipc-btn-black disabled:opacity-50"
              >
                {importing ? "Importing…" : `Import ${preflight ? preflight.willImport : validRows} rows`}
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
              <div><span className="text-muted-foreground">Total rows processed:</span> <b>{result.newImported + result.updated + result.moved + result.promoted + result.skippedDuplicates + result.failed}</b></div>
              <div><span className="text-muted-foreground">Created (new):</span> <b className="text-emerald-700">{result.newImported}</b></div>
              <div><span className="text-muted-foreground">Promoted unpaid → paid:</span> <b className={result.promoted > 0 ? "text-emerald-700" : ""}>{result.promoted}</b></div>
              <div><span className="text-muted-foreground">Moved:</span> <b>{result.moved}</b></div>
              <div><span className="text-muted-foreground">Updated:</span> <b>{result.updated}</b></div>
              <div><span className="text-muted-foreground">Restored from archive:</span> <b className={result.restored > 0 ? "text-emerald-700" : ""}>{result.restored}</b></div>
              <div><span className="text-muted-foreground">Phone-only imported:</span> <b>{result.phoneOnlyImported}</b></div>
              <div><span className="text-muted-foreground">Existing CRM matches skipped:</span> <b className="text-amber-700">{result.skippedDuplicates}</b></div>
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
