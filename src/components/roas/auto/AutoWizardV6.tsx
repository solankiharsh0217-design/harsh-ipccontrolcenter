// ROAS Automatic Fetching v6 — minimal webinar details, one-link sheet detection,
// smart tab role mapping, manual ad spend.
// Reuses existing AttributionResultsView, runAutoAttribution, sheetFetch, QuickSaveInput.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import AttributionResultsView from "@/components/roas/AttributionResultsView";
import AttributionAuditPanel from "@/components/roas/AttributionAuditPanel";
import { runAutoAttribution, type AutoAttribResult, type TabMapping, type ColumnOverride } from "@/lib/roas/autoAttribute";
import { extractSpreadsheetId, fetchTabAsRows } from "@/lib/roas/sheetFetch";
import { cleanMediaBuyerName, guessRole, type TabRole } from "@/lib/roas/tabClassify";
import ColumnMappingDrawer, { type ColumnMapping } from "@/components/roas/auto/ColumnMappingDrawer";
import Step4Attendees from "@/components/roas/auto/Step4Attendees";
import { type AttendeeSlot, defaultSlotsForDates, persistAttendeeSlots, slotsAllReady } from "@/lib/roas/attendees";
import { scheduleDraftSync, loadRemoteDraft, clearRemoteDraft, type DraftPayload } from "@/lib/roas/autoDraft";
import {
  computeSpend, effectiveSpendForBasis, loadGstDefaults, saveGstDefaults,
  type AdSpendTaxMode, type RoasSpendBasis,
} from "@/lib/roas/gst";

// ---------- Types & storage ----------
type DateMode = "single" | "range" | "multiple";
type DetectedTab = {
  sheetId: string;
  tabName: string;
  guessedRole: TabRole;
  confidence: number;
  detectedHeaders: string[];
  validRowsCount: number;
  detectedColumnMapping: Record<string, string | null>;
  warnings: string[];
};
type TabRoleAssignment = {
  sheetId: string;
  tabName: string;
  role: TabRole; // user's selection ("unknown" treated as ignore)
  mediaBuyerName?: string;
  columnMapping?: ColumnMapping | null;
};
type WebinarTiming = {
  mode: "none" | "same" | "per_day";
  same?: { from: string; to: string };
  perDay?: Array<{ label: string; from: string; to: string }>;
};
type WebinarDetails = {
  type: string;
  name: string;
  dateMode: DateMode;
  singleDate: string;
  startDate: string;
  endDate: string;
  dates: string[];
  timing: WebinarTiming;
  format: string;
  operator: string;
  sessionSlot: string;
  platform: string;
  zoomAccount: string;
  notes: string;
};
type DraftV6 = {
  step: number;
  webinar: WebinarDetails;
  masterUrl: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  detectedTabs: DetectedTab[];
  tabRoles: TabRoleAssignment[];
  adSpends: Record<string, string>;
  results: AutoAttribResult | null;
  resultsStatus: "fresh" | "outdated" | null;
  savedSessionId: string | null;
};

const DRAFT_KEY = "ipc_roas_auto_draft";
const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_WEBINAR: WebinarDetails = {
  type: "", name: "", dateMode: "single",
  singleDate: today(), startDate: "", endDate: "", dates: [],
  timing: { mode: "none" },
  format: "", operator: "", sessionSlot: "",
  platform: "Zoom", zoomAccount: "", notes: "",
};
const EMPTY: DraftV6 = {
  step: 1, webinar: EMPTY_WEBINAR,
  masterUrl: "", spreadsheetId: "", spreadsheetTitle: "",
  detectedTabs: [], tabRoles: [],
  adSpends: {}, results: null, resultsStatus: null, savedSessionId: null,
};

function sanitizeResults(r: any): AutoAttribResult | null {
  if (!r || typeof r !== "object") return null;
  // Older drafts predate the engine integration and have no engineResult.
  // Without it, Step 4 crashes (mediaBuyerBreakdown access). Drop them.
  if (!r.engineResult || !Array.isArray(r.engineResult?.mediaBuyerBreakdown)) return null;
  return r as AutoAttribResult;
}

function loadDraft(): DraftV6 {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY;
    const j = JSON.parse(raw);
    const merged: DraftV6 = { ...EMPTY, ...j, webinar: { ...EMPTY_WEBINAR, ...(j?.webinar || {}) } };
    merged.results = sanitizeResults(merged.results);
    if (!merged.results && merged.step >= 4) merged.step = 3;
    if (!merged.results) merged.resultsStatus = null;
    return merged;
  } catch { return EMPTY; }
}

function dateModeFor(type: string): DateMode {
  const t = (type || "").toLowerCase();
  if (t.includes("2-day") || t.includes("3-day") || t.includes("range")) return "range";
  if (t.includes("series") || t.includes("multiple")) return "multiple";
  return "single";
}
function isWebinarValid(w: WebinarDetails): string | null {
  if (!w.type.trim()) return "Webinar Type is required.";
  if (!w.name.trim()) return "Webinar Name is required.";
  if (w.dateMode === "single" && !w.singleDate) return "Webinar Date is required.";
  if (w.dateMode === "range") {
    if (!w.startDate || !w.endDate) return "Both From and To dates are required.";
    if (w.endDate < w.startDate) return "End date cannot be before start date.";
  }
  if (w.dateMode === "multiple" && w.dates.filter(Boolean).length === 0) return "At least one date is required.";
  return null;
}

function buildDayLabels(w: WebinarDetails): string[] {
  if (w.dateMode === "single") return w.singleDate ? [w.singleDate] : [];
  if (w.dateMode === "multiple") return (w.dates || []).filter(Boolean);
  if (w.dateMode === "range" && w.startDate && w.endDate) {
    const out: string[] = [];
    const s = new Date(w.startDate); const e = new Date(w.endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [];
    const d = new Date(s);
    let guard = 0;
    while (d <= e && guard < 60) {
      out.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1); guard++;
    }
    return out;
  }
  return [];
}
function effectiveDate(w: WebinarDetails): string {
  if (w.dateMode === "single") return w.singleDate || today();
  if (w.dateMode === "range") return w.startDate || today();
  return w.dates[0] || today();
}

// ============================================================
// Main wizard
// ============================================================
export default function AutoWizardV6({ onBackToMethod }: { onBackToMethod: () => void }) {
  const { user } = useAuth();
  const initial = useRef<DraftV6>(loadDraft());

  const [step, setStep] = useState(initial.current.step);
  const [webinar, setWebinar] = useState<WebinarDetails>(initial.current.webinar);
  const [masterUrl, setMasterUrl] = useState(initial.current.masterUrl);
  const [spreadsheetId, setSpreadsheetId] = useState(initial.current.spreadsheetId);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState(initial.current.spreadsheetTitle);
  const [detectedTabs, setDetectedTabs] = useState<DetectedTab[]>(initial.current.detectedTabs);
  const [tabRoles, setTabRoles] = useState<TabRoleAssignment[]>(initial.current.tabRoles);
  const [adSpends, setAdSpends] = useState<Record<string, string>>(initial.current.adSpends);
  const gstInit = loadGstDefaults();
  const [taxMode, setTaxMode] = useState<AdSpendTaxMode>(gstInit.taxMode);
  const [gstRate, setGstRate] = useState<number>(gstInit.gstRate);
  const [spendBasis, setSpendBasis] = useState<RoasSpendBasis>(gstInit.spendBasis);
  const [results, setResults] = useState<AutoAttribResult | null>(initial.current.results);
  const [resultsStatus, setResultsStatus] = useState<"fresh" | "outdated" | null>(initial.current.resultsStatus);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(initial.current.savedSessionId);
  const [savedHist, setSavedHist] = useState(false);
  const [attendeeSlots, setAttendeeSlots] = useState<AttendeeSlot[]>([]);

  const [detecting, setDetecting] = useState(false);
  const [detectErr, setDetectErr] = useState<string | null>(null);
  const [calcMsg, setCalcMsg] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [showRestored, setShowRestored] = useState(
    !!(initial.current.webinar.name || initial.current.masterUrl || initial.current.results)
  );
  const [showOptional, setShowOptional] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [showDataUsed, setShowDataUsed] = useState(false);
  const [stepErr, setStepErr] = useState<string | null>(null);
  const [mappingDrawer, setMappingDrawer] = useState<{ sheetId: string } | null>(null);
  const [priorityOrder, setPriorityOrder] = useState<string[]>([]); // sheetIds, top wins
  const [lastHashes, setLastHashes] = useState<{ input: string; output: string } | null>(null);
  const [consistency, setConsistency] = useState<{ sameInputSameOutput: boolean | null; sameInputDifferentOutput: boolean }>({ sameInputSameOutput: null, sameInputDifferentOutput: false });

  // Persist draft (local + remote)
  useEffect(() => {
    const d: DraftV6 = {
      step, webinar, masterUrl, spreadsheetId, spreadsheetTitle,
      detectedTabs, tabRoles, adSpends, results, resultsStatus, savedSessionId,
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* */ }
    if (user?.id) scheduleDraftSync(user.id, d as unknown as DraftPayload);
  }, [step, webinar, masterUrl, spreadsheetId, spreadsheetTitle, detectedTabs, tabRoles, adSpends, results, resultsStatus, savedSessionId, user?.id]);

  // One-time remote draft restore if local is empty
  const remoteTried = useRef(false);
  useEffect(() => {
    if (remoteTried.current) return;
    remoteTried.current = true;
    if (!user?.id) return;
    const localEmpty = !initial.current.webinar.name && !initial.current.masterUrl && !initial.current.results;
    if (!localEmpty) return;
    void loadRemoteDraft(user.id).then((rd) => {
      if (!rd) return;
      setStep(rd.step || 1);
      setWebinar({ ...EMPTY_WEBINAR, ...(rd.webinar || {}) });
      setMasterUrl(rd.masterUrl || "");
      setSpreadsheetId(rd.spreadsheetId || "");
      setSpreadsheetTitle(rd.spreadsheetTitle || "");
      setDetectedTabs(rd.detectedTabs || []);
      setTabRoles(rd.tabRoles || []);
      setAdSpends(rd.adSpends || {});
      setResults(sanitizeResults(rd.results));
      setResultsStatus(sanitizeResults(rd.results) ? (rd.resultsStatus || null) : null);
      setSavedSessionId(rd.savedSessionId || null);
      setShowRestored(true);
      if (!sanitizeResults(rd.results) && (rd.step || 1) >= 4) setStep(3);
    });
  }, [user?.id]);

  // Mark outdated when inputs change after results
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (results && resultsStatus === "fresh") setResultsStatus("outdated");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(webinar), masterUrl, JSON.stringify(tabRoles), JSON.stringify(adSpends)]);

  // Derived
  const selectedSales = tabRoles.find((t) => t.role === "sales");
  const selectedMBs = tabRoles.filter((t) => t.role === "media_buyer");
  const ignoredCount = tabRoles.filter((t) => t.role === "ignore").length;
  const mbNamesUnique = useMemo(() => {
    const seen = new Set<string>();
    for (const m of selectedMBs) {
      const n = (m.mediaBuyerName || "").trim().toLowerCase();
      if (!n) return false;
      if (seen.has(n)) return false;
      seen.add(n);
    }
    return true;
  }, [selectedMBs]);

  // Keep priorityOrder in sync with selected media buyer tabs
  useEffect(() => {
    setPriorityOrder((prev) => {
      const ids = selectedMBs.map((m) => m.sheetId);
      const kept = prev.filter((id) => ids.includes(id));
      const additions = ids.filter((id) => !kept.includes(id));
      return [...kept, ...additions];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(selectedMBs.map((m) => m.sheetId))]);

  // Auto-prefill attendee slots from webinar dates when entering step 4
  useEffect(() => {
    if (step !== 4) return;
    if (attendeeSlots.length > 0) return;
    setAttendeeSlots(defaultSlotsForDates(buildDayLabels(webinar)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const attendeesReady = slotsAllReady(attendeeSlots);

  // ---------- Step navigation ----------
  function stepValid(target: number): boolean {
    if (target <= 1) return true;
    if (isWebinarValid(webinar)) return false;
    if (target === 2) return true;
    if (detectedTabs.length === 0) return false;
    if (!selectedSales || selectedMBs.length === 0 || !mbNamesUnique) return false;
    if (target === 3) return true;
    if (target === 4) return !!results;
    return false;
  }
  function goto(n: number) {
    if (n < step || stepValid(n)) { setStep(n); setStepErr(null); }
    else setStepErr("Please complete the required details before continuing.");
  }

  // ---------- Step 2: Detect ----------
  async function detectTabs() {
    setDetectErr(null);
    if (!/docs\.google\.com\/spreadsheets/.test(masterUrl)) {
      setDetectErr("This does not look like a valid Google Sheet URL. Please paste a link from docs.google.com/spreadsheets.");
      return;
    }
    setDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-roas-master-sheet-tabs", {
        body: { masterSheetUrl: masterUrl },
      });
      if (error) throw new Error(error.message || "Detection failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      const sid = (data as any).spreadsheetId || extractSpreadsheetId(masterUrl) || "";
      const title = (data as any).spreadsheetTitle || "";
      const tabs: DetectedTab[] = (data as any).tabs || [];
      setSpreadsheetId(sid);
      setSpreadsheetTitle(title);
      setDetectedTabs(tabs);

      // Try to load saved mapping for this spreadsheet
      let saved: any = null;
      if (sid) {
        const { data: m } = await supabase
          .from("roas_master_sheet_mappings")
          .select("*").eq("spreadsheet_id", sid).eq("is_active", true)
          .order("updated_at", { ascending: false }).limit(1).maybeSingle();
        saved = m;
      }

      let initialRoles: TabRoleAssignment[];
      if (saved) {
        const mbList: any[] = saved.media_buyer_mappings || [];
        const ignored: string[] = (saved.ignored_tabs || []).map((x: any) => String(x.sheetId || x));
        const colMaps: any[] = saved.column_mappings || [];
        const findCol = (sheetId: string, tabName: string): ColumnMapping | null => {
          const fromList = colMaps.find((c: any) => String(c.sheetId) === sheetId || c.tabName === tabName);
          if (fromList?.columnMapping) return fromList.columnMapping;
          const mbCol = mbList.find((m: any) => (String(m.sheetId) === sheetId || m.tabName === tabName) && m.columnMapping);
          return mbCol?.columnMapping || null;
        };
        initialRoles = tabs.map((t) => {
          const mb = mbList.find((m: any) => String(m.sheetId) === t.sheetId || m.tabName === t.tabName);
          const cm = findCol(t.sheetId, t.tabName);
          if (mb) return { sheetId: t.sheetId, tabName: t.tabName, role: "media_buyer", mediaBuyerName: mb.mediaBuyerName || cleanMediaBuyerName(t.tabName), columnMapping: cm };
          if (saved.sales_sheet_id === t.sheetId || saved.sales_tab_name === t.tabName) {
            return { sheetId: t.sheetId, tabName: t.tabName, role: "sales", columnMapping: cm };
          }
          if (ignored.includes(t.sheetId) || ignored.includes(t.tabName)) {
            return { sheetId: t.sheetId, tabName: t.tabName, role: "ignore" };
          }
          const r = (t.guessedRole === "unknown" ? "ignore" : t.guessedRole) as TabRole;
          return { sheetId: t.sheetId, tabName: t.tabName, role: r,
            mediaBuyerName: r === "media_buyer" ? cleanMediaBuyerName(t.tabName) : undefined, columnMapping: cm };
        });
        toast.success("Saved mapping found for this sheet.");
      } else {
        initialRoles = tabs.map((t) => {
          const r = (t.guessedRole === "unknown" ? "ignore" : t.guessedRole) as TabRole;
          return {
            sheetId: t.sheetId, tabName: t.tabName, role: r,
            mediaBuyerName: r === "media_buyer" ? cleanMediaBuyerName(t.tabName) : undefined,
          };
        });
        // Ensure at most one sales (keep highest-confidence)
        const salesIdxs = initialRoles
          .map((r, i) => ({ r, i, c: tabs[i].confidence }))
          .filter((x) => x.r.role === "sales")
          .sort((a, b) => b.c - a.c);
        if (salesIdxs.length > 1) {
          for (let k = 1; k < salesIdxs.length; k++) initialRoles[salesIdxs[k].i].role = "ignore";
        }
      }
      setTabRoles(initialRoles);
    } catch (e: any) {
      setDetectErr(e.message || "Detection failed");
    } finally { setDetecting(false); }
  }

  function setRole(sheetId: string, role: TabRole) {
    setTabRoles((prev) => {
      let next = prev.map((r) => ({ ...r }));
      if (role === "sales") {
        next = next.map((r) => r.role === "sales" ? { ...r, role: "ignore" } : r);
      }
      const t = detectedTabs.find((d) => d.sheetId === sheetId);
      next = next.map((r) => r.sheetId === sheetId
        ? {
            ...r, role,
            mediaBuyerName: role === "media_buyer"
              ? (r.mediaBuyerName || cleanMediaBuyerName(t?.tabName || r.tabName))
              : undefined,
          }
        : r);
      return next;
    });
  }
  function setMBName(sheetId: string, name: string) {
    setTabRoles((p) => p.map((r) => r.sheetId === sheetId ? { ...r, mediaBuyerName: name } : r));
  }
  function setColumnMapping(sheetId: string, mapping: ColumnMapping) {
    setTabRoles((p) => p.map((r) => r.sheetId === sheetId ? { ...r, columnMapping: mapping } : r));
  }

  // ---------- Step 3: Calculate ----------
  async function calculate() {
    setStepErr(null);
    if (!selectedSales) { setStepErr("Please select one tab as Sales Tab."); return; }
    if (selectedMBs.length === 0) { setStepErr("Please select at least one Media Buyer Tab."); return; }
    if (!mbNamesUnique) { setStepErr("Each media buyer name must be unique and not blank."); return; }
    for (const mb of selectedMBs) {
      const v = adSpends[mb.mediaBuyerName!];
      if (v == null || v === "" || isNaN(Number(v))) {
        setStepErr("Please enter ad spend for every selected media buyer.");
        return;
      }
    }

    setCalculating(true);
    setCalcMsg("Reading master sheet…");
    try {
      const salesMap: TabMapping = {
        role: "sales",
        tabName: selectedSales.tabName,
        tabInput: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${selectedSales.sheetId}`,
        columnOverride: (selectedSales.columnMapping || null) as ColumnOverride | null,
      };
      const orderedMBs = priorityOrder.length === selectedMBs.length
        ? priorityOrder.map((id) => selectedMBs.find((m) => m.sheetId === id)!).filter(Boolean)
        : selectedMBs;
      const mbMaps: TabMapping[] = orderedMBs.map((m) => ({
        role: "media_buyer_leads",
        mediaBuyerName: m.mediaBuyerName!,
        tabName: m.tabName,
        tabInput: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${m.sheetId}`,
        columnOverride: (m.columnMapping || null) as ColumnOverride | null,
      }));
      const spendNumbers: Record<string, number> = {};
      const spendBreakdownByBuyer: Record<string, ReturnType<typeof computeSpend>> = {};
      orderedMBs.forEach((m) => {
        const entered = Number(adSpends[m.mediaBuyerName!] || 0);
        const b = computeSpend(entered, taxMode, gstRate);
        spendBreakdownByBuyer[m.mediaBuyerName!] = b;
        spendNumbers[m.mediaBuyerName!] = effectiveSpendForBasis(b, spendBasis);
      });
      // Persist as defaults for next time
      saveGstDefaults({ taxMode, gstRate, spendBasis });
      (window as any).__ipcLastGstBreakdown = spendBreakdownByBuyer;

      const r = await runAutoAttribution({
        masterSheetUrl: masterUrl,
        webinarDate: effectiveDate(webinar),
        salesTab: salesMap,
        mediaBuyerTabs: mbMaps,
        adSpends: spendNumbers,
      }, (msg) => setCalcMsg(msg));

      const er = r.engineResult;
      if (lastHashes) {
        const same = lastHashes.input === er.inputSnapshotHash;
        setConsistency({
          sameInputSameOutput: same && lastHashes.output === er.outputHash,
          sameInputDifferentOutput: same && lastHashes.output !== er.outputHash,
        });
      }
      setLastHashes({ input: er.inputSnapshotHash, output: er.outputHash });

      setResults(r);
      setResultsStatus("fresh");
      setSavedHist(false);
      setSavedSessionId(null);
      setStep(4);

      // Persist mapping for next time (best-effort)
      if (user && spreadsheetId) {
        const mapping = {
          spreadsheet_id: spreadsheetId,
          master_sheet_url: masterUrl,
          spreadsheet_title: spreadsheetTitle,
          sales_sheet_id: selectedSales.sheetId,
          sales_tab_name: selectedSales.tabName,
          media_buyer_mappings: selectedMBs.map((m) => ({
            mediaBuyerName: m.mediaBuyerName,
            sheetId: m.sheetId, tabName: m.tabName,
            role: "media_buyer", isActive: true,
            columnMapping: m.columnMapping || null,
          })),
          ignored_tabs: tabRoles.filter((r) => r.role === "ignore")
            .map((r) => ({ sheetId: r.sheetId, tabName: r.tabName })),
          column_mappings: tabRoles
            .filter((r) => r.columnMapping)
            .map((r) => ({ sheetId: r.sheetId, tabName: r.tabName, role: r.role, columnMapping: r.columnMapping })),
          last_confirmed_by: user.id,
          last_confirmed_at: new Date().toISOString(),
          created_by: user.id,
        };
        await supabase.from("roas_master_sheet_mappings")
          .upsert(mapping as any, { onConflict: "spreadsheet_id" }).then(() => {}, () => {});
      }
    } catch (e: any) {
      toast.error(e?.message || "Calculation failed");
    } finally {
      setCalculating(false); setCalcMsg("");
    }
  }

  // ---------- Save to history ----------
  async function saveHistory() {
    if (!user || !results) return;
    if (resultsStatus !== "fresh") {
      toast.error("Inputs changed. Please recalculate before saving this report.");
      return;
    }
    if (savedSessionId) { toast.info("This report has already been saved to history."); return; }
    const er = results.engineResult;
    // Duplicate detection by calculation_id or (input_hash + output_hash + user)
    if (er) {
      const { data: dup } = await supabase
        .from("attribution_sessions")
        .select("id")
        .or(`calculation_id.eq.${er.calculationId},and(input_snapshot_hash.eq.${er.inputSnapshotHash},output_hash.eq.${er.outputHash},created_by.eq.${user.id})`)
        .limit(1)
        .maybeSingle();
      if (dup?.id) {
        setSavedSessionId(dup.id); setSavedHist(true);
        toast.info("This report has already been saved to history.");
        return;
      }
    }
    const totals = results.totals;
    const overall = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    // Recompute GST totals from current ad spend inputs + tax settings
    let totalNet = 0, totalGst = 0, totalGross = 0;
    selectedMBs.forEach((m) => {
      const entered = Number(adSpends[m.mediaBuyerName!] || 0);
      const b = computeSpend(entered, taxMode, gstRate);
      totalNet += b.net; totalGst += b.gst; totalGross += b.gross;
    });
    const { data: sess, error } = await supabase.from("attribution_sessions").insert({
      webinar_name: webinar.name,
      webinar_date: effectiveDate(webinar),
      webinar_type: webinar.type,
      total_leads: totals.leads, total_sales: totals.sales,
      total_ad_spend: totals.spend, total_revenue: totals.revenue,
      overall_roas: overall,
      unmatched_count: results.salesDetail.filter((s) => s.matchMethod === "unmatched").length,
      created_by: user.id,
      calculation_method: "automatic_master_sheet",
      calculation_display_method: "Automatic Attribution",
      master_sheet_url: masterUrl,
      master_sheet_title: spreadsheetTitle,
      webinar_date_mode: webinar.dateMode,
      webinar_single_date: webinar.dateMode === "single" ? webinar.singleDate : null,
      webinar_start_date: webinar.dateMode === "range" ? webinar.startDate : null,
      webinar_end_date: webinar.dateMode === "range" ? webinar.endDate : null,
      webinar_dates: webinar.dateMode === "multiple" ? webinar.dates : null,
      webinar_timing: webinar.timing,
      webinar_format: webinar.format || null,
      webinar_operator: webinar.operator || null,
      session_slot: webinar.sessionSlot || null,
      webinar_platform: webinar.platform || null,
      zoom_account_used: webinar.zoomAccount || null,
      webinar_notes: webinar.notes || null,
      tab_role_mapping: tabRoles,
      result_status: "fresh",
      attribution_engine_version: er?.engineVersion || null,
      calculation_id: er?.calculationId || null,
      input_snapshot_hash: er?.inputSnapshotHash || null,
      output_hash: er?.outputHash || null,
      media_buyer_order: er ? er.mediaBuyerBreakdown.map((b) => ({ id: b.mediaBuyerId, name: b.mediaBuyerName })) : null,
      duplicate_conflicts_count: er?.duplicateLeadConflicts.length || 0,
      column_mappings_used: tabRoles.filter((r) => r.columnMapping).map((r) => ({ tabName: r.tabName, role: r.role, columnMapping: r.columnMapping })) as any,
      ad_spend_tax_mode: taxMode,
      gst_rate: gstRate,
      roas_spend_basis: spendBasis,
      total_net_ad_spend: totalNet,
      total_gst_amount: totalGst,
      total_gross_ad_spend: totalGross,
    } as any).select().single();
    if (error || !sess) { toast.error("Save failed: " + (error?.message || "")); return; }

    const sid = (sess as any).id;
    const buyerRows = results.rows.map((r) => {
      const mb = selectedMBs.find((m) => (m.mediaBuyerName || "").trim() === r.name);
      const entered = Number(adSpends[r.name] || 0);
      const b = computeSpend(entered, taxMode, gstRate);
      return {
        session_id: sid, media_buyer_name: r.name,
        ad_spend: r.spend, total_leads: r.leads, matched_sales: r.matched, revenue: r.revenue,
        roas_value: r.spend > 0 ? r.revenue / r.spend : 0,
        cpl: r.leads > 0 ? r.spend / r.leads : 0,
        conversion_rate: r.leads > 0 ? (r.matched / r.leads) * 100 : 0,
        source_tab_name: mb?.tabName || null,
        source_sheet_id: mb?.sheetId || null,
        source_type: "google_sheet_auto_fetch",
        entered_ad_spend: b.entered,
        net_ad_spend: b.net,
        gst_amount: b.gst,
        gross_ad_spend: b.gross,
        ad_spend_tax_mode: taxMode,
        gst_rate: gstRate,
      };
    });
    const saleRows = results.salesDetail.map((s, i) => {
      const a = er ? er.auditLog[i] : null;
      return {
        session_id: sid, buyer_name: s.name, email: s.email, phone: s.phone,
        attributed_to: s.attributedTo, match_method: s.matchMethod, revenue: s.revenue,
        webinar_date: s.webinarDate || null,
        source_sales_tab_name: selectedSales?.tabName || null,
        source_sales_sheet_id: selectedSales?.sheetId || null,
        source_type: "google_sheet_auto_fetch",
        sale_id: a?.saleId || null,
        matched_lead_id: a?.matchedLeadId || null,
        matched_lead_name: a?.matchedLeadName || null,
        matched_lead_email: a?.matchedLeadEmail || null,
        matched_lead_phone: a?.matchedLeadPhone || null,
        source_media_buyer: a?.sourceMediaBuyer || null,
        source_row_index: a?.sourceRowIndex ?? null,
        confidence_score: a?.confidenceScore ?? null,
        competing_matches: a ? (a.competingMatches as any) : null,
        match_reason: a?.matchReason || null,
        needs_review: a?.needsReview || false,
      };
    });
    await supabase.from("attribution_media_buyers").insert(buyerRows as any);
    if (saleRows.length) await supabase.from("attribution_sales_detail").insert(saleRows as any);
    if (er) {
      await supabase.from("roas_attribution_audit_logs").insert({
        attribution_session_id: sid,
        calculation_id: er.calculationId,
        input_snapshot_hash: er.inputSnapshotHash,
        output_hash: er.outputHash,
        media_buyer_order: er.mediaBuyerBreakdown.map((b) => ({ id: b.mediaBuyerId, name: b.mediaBuyerName })) as any,
        column_mappings_used: tabRoles.filter((r) => r.columnMapping).map((r) => ({ tabName: r.tabName, role: r.role, columnMapping: r.columnMapping })) as any,
        audit_rows: er.auditLog as any,
        duplicate_conflicts: er.duplicateLeadConflicts as any,
        created_by: user.id,
      } as any);
    }

    setSavedSessionId(sid); setSavedHist(true);

    // Persist attendee lists (parallel; non-blocking for save success)
    if (attendeeSlots.length > 0) {
      try {
        const res = await persistAttendeeSlots(sid, attendeeSlots);
        if (res.failed > 0) {
          toast.error(`Saved report, but ${res.failed} attendee list(s) failed to upload.`);
        } else {
          toast.success(`Report saved with ${res.ok} attendee list(s) ✓`);
        }
      } catch (e: any) {
        toast.error("Report saved, but attendee upload failed: " + (e?.message || ""));
      }
    } else {
      toast.success("Report saved to history ✓");
    }
  }

  function startFresh() {
    if (!confirm("Start a fresh ROAS calculation? Your current draft will be cleared.")) return;
    localStorage.removeItem(DRAFT_KEY);
    if (user?.id) void clearRemoteDraft(user.id);
    setStep(1); setWebinar(EMPTY_WEBINAR);
    setMasterUrl(""); setSpreadsheetId(""); setSpreadsheetTitle("");
    setDetectedTabs([]); setTabRoles([]); setAdSpends({});
    setResults(null); setResultsStatus(null); setSavedSessionId(null);
    setSavedHist(false); setShowRestored(false); setAttendeeSlots([]);
  }

  // ============================================================
  // Render
  // ============================================================
  const stepLabels = ["Webinar Details", "Connect Sheet", "Ad Spends", "Results"];
  const totalManualSpend = selectedMBs.reduce((a, m) => a + Number(adSpends[m.mediaBuyerName!] || 0), 0);

  return (
    <div className="wiz wide" style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button className="btn btn-g btn-sm" onClick={onBackToMethod}>← Method selection</button>
        <button className="btn btn-g btn-sm" onClick={startFresh}>Start fresh</button>
      </div>

      {showRestored && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Your previous ROAS draft has been restored.</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-g btn-sm" onClick={() => setShowRestored(false)}>Continue draft</button>
            <button className="btn btn-g btn-sm" onClick={startFresh}>Start fresh</button>
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="wiz-prog">
        {stepLabels.map((lbl, i) => {
          const n = i + 1;
          const done = step > n && stepValid(n + 1);
          const active = step === n;
          const locked = !active && !done && !stepValid(n);
          return (
            <React.Fragment key={lbl}>
              <div
                className={`wiz-step${active ? " active" : ""}${done ? " done" : ""}${locked ? " locked" : ""}`}
                onClick={() => !locked && goto(n)}
                style={{ cursor: locked ? "not-allowed" : "pointer" }}
              >
                <div className="wiz-circle">{done ? "✓" : n}</div>
                <div className="wiz-lbl">{lbl}</div>
              </div>
              {i < stepLabels.length - 1 && <div className={`wiz-line${done ? " done" : ""}`} />}
            </React.Fragment>
          );
        })}
      </div>

      {stepErr && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginTop: 12 }}>
          {stepErr}
        </div>
      )}

      <div className="wiz-body">
        {step === 1 && (
          <Step1Webinar
            value={webinar} onChange={setWebinar}
            showOptional={showOptional} setShowOptional={setShowOptional}
          />
        )}
        {step === 2 && (
          <Step2Connect
            masterUrl={masterUrl} setMasterUrl={setMasterUrl}
            detect={detectTabs} detecting={detecting} detectErr={detectErr}
            spreadsheetTitle={spreadsheetTitle}
            tabs={detectedTabs} tabRoles={tabRoles}
            setRole={setRole} setMBName={setMBName}
            onOpenMapping={(sheetId) => setMappingDrawer({ sheetId })}
            selectedSales={selectedSales} selectedMBs={selectedMBs}
            ignoredCount={ignoredCount}
            mbNamesUnique={mbNamesUnique}
            showFormat={showFormat} setShowFormat={setShowFormat}
          />
        )}
        {step === 3 && (
          <Step3AdSpends
            mbs={selectedMBs} adSpends={adSpends} setAdSpends={setAdSpends}
            totalSpend={totalManualSpend}
            priorityOrder={priorityOrder} setPriorityOrder={setPriorityOrder}
            taxMode={taxMode} setTaxMode={setTaxMode}
            gstRate={gstRate} setGstRate={setGstRate}
            spendBasis={spendBasis} setSpendBasis={setSpendBasis}
          />
        )}
        {step === 4 && results && (
          <Step4Results
            webinar={webinar} masterTitle={spreadsheetTitle} masterUrl={masterUrl}
            salesTabName={selectedSales?.tabName || ""}
            mbCount={selectedMBs.length}
            results={results}
            resultsStatus={resultsStatus}
            savedHist={!!savedSessionId}
            onSave={saveHistory}
            goEdit={(s) => goto(s)}
            onRecalc={calculate}
            showDataUsed={showDataUsed} setShowDataUsed={setShowDataUsed}
            tabRoles={tabRoles} adSpends={adSpends}
            consistency={consistency}
            taxMode={taxMode} gstRate={gstRate} spendBasis={spendBasis}
          />
        )}
      </div>

      {/* Calculating overlay */}
      {calculating && (
        <div className="calc-wrap" style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.95)", zIndex: 60 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26 }}>Calculating ROAS</div>
          <div className="calc-bar"><div className="calc-bar-fill" style={{ width: "70%" }} /></div>
          <div className="calc-msg" style={{ marginTop: 12 }}>{calcMsg}</div>
        </div>
      )}

      {/* Footer nav */}
      {step < 4 && (
        <div className="wiz-nav">
          {step > 1 && <button className="wiz-btn wiz-btn-g" onClick={() => goto(step - 1)}>← Back</button>}
          {step === 1 && (
            <button className="wiz-btn wiz-btn-k" onClick={() => {
              const err = isWebinarValid(webinar);
              if (err) { setStepErr(err); return; }
              setStepErr(null); setStep(2);
            }}>Continue →</button>
          )}
          {step === 2 && (
            <button className="wiz-btn wiz-btn-k" disabled={!selectedSales || selectedMBs.length === 0 || !mbNamesUnique}
              onClick={() => { setStepErr(null); setStep(3); }}>Continue to Ad Spends →</button>
          )}
          {step === 3 && (
            <button className="wiz-btn wiz-btn-k" onClick={calculate}>Calculate ROAS →</button>
          )}
        </div>
      )}

      {/* Column mapping drawer */}
      {mappingDrawer && (() => {
        const tab = detectedTabs.find((t) => t.sheetId === mappingDrawer.sheetId);
        const role = tabRoles.find((r) => r.sheetId === mappingDrawer.sheetId);
        if (!tab || !role) return null;
        const drawerRole = role.role === "media_buyer" ? "media_buyer" : role.role === "sales" ? "sales" : "ignore";
        return (
          <ColumnMappingDrawer
            open={true}
            onClose={() => setMappingDrawer(null)}
            tabName={tab.tabName}
            role={drawerRole as "sales" | "media_buyer" | "ignore"}
            detectedHeaders={tab.detectedHeaders}
            detectedColumnMapping={tab.detectedColumnMapping as ColumnMapping}
            currentOverride={role.columnMapping}
            onSave={(m) => setColumnMapping(mappingDrawer.sheetId, m)}
          />
        );
      })()}
    </div>
  );
}

// ============================================================
// Step 1: Webinar Details
// ============================================================
function Step1Webinar({
  value, onChange, showOptional, setShowOptional,
}: {
  value: WebinarDetails;
  onChange: (v: WebinarDetails) => void;
  showOptional: boolean; setShowOptional: (b: boolean) => void;
}) {
  const v = value;
  const set = (patch: Partial<WebinarDetails>) => onChange({ ...v, ...patch });
  // Adjust dateMode when type changes
  useEffect(() => {
    if (!v.type) return;
    const wanted = dateModeFor(v.type);
    if (v.type.toLowerCase() === "custom") return; // user picks
    if (v.dateMode !== wanted) set({ dateMode: wanted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.type]);

  return (
    <>
      <div className="wiz-h">Webinar Details</div>
      <div className="wiz-sub">Add the basic webinar information for this ROAS report. Only the most important fields are required.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <QuickSaveInput fieldKey="webinar_type" label="Webinar Type *"
            placeholder="1-Day Webinar / 2-Day / Series / Custom"
            value={v.type} onChange={(x) => set({ type: x })} height={44} />
        </div>
        <div>
          <QuickSaveInput fieldKey="webinar_name" label="Webinar Name *"
            placeholder="Example: 6 Secrets Webinar"
            value={v.name} onChange={(x) => set({ name: x })} height={44} />
        </div>
      </div>

      {/* Date inputs */}
      <div style={{ marginTop: 14 }}>
        {v.type.toLowerCase() === "custom" && (
          <div style={{ marginBottom: 10 }}>
            <label className="fl">Date Structure *</label>
            <select className="fsel" value={v.dateMode} onChange={(e) => set({ dateMode: e.target.value as DateMode })}>
              <option value="single">Single Date</option>
              <option value="range">Date Range</option>
              <option value="multiple">Multiple Dates</option>
            </select>
          </div>
        )}
        {v.dateMode === "single" && (
          <div>
            <label className="fl">Webinar Date *</label>
            <input type="date" className="fi" value={v.singleDate} onChange={(e) => set({ singleDate: e.target.value })} />
          </div>
        )}
        {v.dateMode === "range" && (
          <div className="two-col">
            <div>
              <label className="fl">From *</label>
              <input type="date" className="fi" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </div>
            <div>
              <label className="fl">To *</label>
              <input type="date" className="fi" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} />
            </div>
          </div>
        )}
        {v.dateMode === "multiple" && (
          <div>
            <label className="fl">Webinar Dates *</label>
            {v.dates.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input type="date" className="fi" value={d}
                  onChange={(e) => set({ dates: v.dates.map((x, j) => j === i ? e.target.value : x) })} />
                <button className="btn btn-g btn-sm" onClick={() => set({ dates: v.dates.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button className="btn btn-g btn-sm" onClick={() => set({ dates: [...v.dates, ""] })}>+ Add Date</button>
          </div>
        )}
      </div>

      {/* Optional collapsible */}
      <div style={{ marginTop: 24, border: "1px solid #E8E5DE", borderRadius: 12, padding: 16 }}>
        <button onClick={() => setShowOptional(!showOptional)}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "'Jost',sans-serif", fontSize: 13, fontWeight: 500, display: "flex", justifyContent: "space-between", width: "100%" }}>
          <span>More Webinar Details (optional)</span>
          <span style={{ color: "#888" }}>{showOptional ? "▲" : "▼"}</span>
        </button>
        {showOptional && (
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Timing */}
            <div style={{ gridColumn: "1 / span 2" }}>
              <label className="fl">Webinar Timing</label>
              {(() => {
                const dayLabels = buildDayLabels(v);
                const showPerDayToggle = dayLabels.length >= 2;
                const mode = v.timing?.mode || "none";
                return (
                  <>
                    {showPerDayToggle && (
                      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        <button type="button" className={`btn btn-sm ${mode !== "per_day" ? "btn-k" : "btn-g"}`}
                          onClick={() => set({ timing: { mode: "same", same: v.timing.same || { from: "", to: "" } } })}>
                          Same time each day
                        </button>
                        <button type="button" className={`btn btn-sm ${mode === "per_day" ? "btn-k" : "btn-g"}`}
                          onClick={() => set({
                            timing: {
                              mode: "per_day",
                              perDay: dayLabels.map((label, i) => v.timing.perDay?.[i] || { label, from: v.timing.same?.from || "", to: v.timing.same?.to || "" }),
                            },
                          })}>
                          Different time per day
                        </button>
                      </div>
                    )}
                    {mode !== "per_day" && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="time" className="fi" style={{ width: 140 }}
                          value={v.timing.same?.from || ""}
                          onChange={(e) => set({ timing: { mode: "same", same: { from: e.target.value, to: v.timing.same?.to || "" } } })} />
                        <span style={{ color: "#888", fontSize: 12 }}>to</span>
                        <input type="time" className="fi" style={{ width: 140 }}
                          value={v.timing.same?.to || ""}
                          onChange={(e) => set({ timing: { mode: "same", same: { from: v.timing.same?.from || "", to: e.target.value } } })} />
                      </div>
                    )}
                    {mode === "per_day" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {dayLabels.map((label, i) => {
                          const row = v.timing.perDay?.[i] || { label, from: "", to: "" };
                          const update = (patch: Partial<{ from: string; to: string }>) => {
                            const next = dayLabels.map((lbl, j) => v.timing.perDay?.[j] || { label: lbl, from: "", to: "" });
                            next[i] = { ...row, ...patch, label };
                            set({ timing: { mode: "per_day", perDay: next } });
                          };
                          return (
                            <div key={label + i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ width: 110, fontSize: 12, color: "#555" }}>{label}</span>
                              <input type="time" className="fi" style={{ width: 130 }}
                                value={row.from} onChange={(e) => update({ from: e.target.value })} />
                              <span style={{ color: "#888", fontSize: 12 }}>to</span>
                              <input type="time" className="fi" style={{ width: 130 }}
                                value={row.to} onChange={(e) => update({ to: e.target.value })} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div>
              <QuickSaveInput fieldKey="webinar_format" label="Webinar Format"
                placeholder="Live / Automated / Replay"
                value={v.format} onChange={(x) => set({ format: x })} height={40} />
            </div>
            <div>
              <QuickSaveInput fieldKey="webinar_operator" label="Webinar Operator"
                placeholder="Rohit / Aman / Backend Team"
                value={v.operator} onChange={(x) => set({ operator: x })} height={40} />
            </div>
            <div>
              <QuickSaveInput fieldKey="session_slot" label="Session Slot"
                placeholder="Morning / Afternoon / Evening"
                value={v.sessionSlot} onChange={(x) => set({ sessionSlot: x })} height={40} />
            </div>
            <div>
              <QuickSaveInput fieldKey="webinar_platform" label="Webinar Platform"
                placeholder="Zoom"
                value={v.platform} onChange={(x) => set({ platform: x })} height={40} />
            </div>
            <div>
              <QuickSaveInput fieldKey="zoom_account_used" label="Zoom Account Used"
                placeholder="IPC Zoom 1 / Operations Zoom"
                value={v.zoomAccount} onChange={(x) => set({ zoomAccount: x })} height={40} />
            </div>
            <div style={{ gridColumn: "1 / span 2" }}>
              <label className="fl">Notes</label>
              <textarea className="fi" style={{ height: "auto", minHeight: 80, padding: 10 }}
                placeholder="Example: Webinar disconnected at 3:35 PM. Replay played later."
                value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// Step 2: Connect Sheet + Assign Tab Roles
// ============================================================
function Step2Connect(p: {
  masterUrl: string; setMasterUrl: (s: string) => void;
  detect: () => void; detecting: boolean; detectErr: string | null;
  spreadsheetTitle: string;
  tabs: DetectedTab[]; tabRoles: TabRoleAssignment[];
  setRole: (id: string, r: TabRole) => void;
  setMBName: (id: string, n: string) => void;
  onOpenMapping: (sheetId: string) => void;
  selectedSales: TabRoleAssignment | undefined;
  selectedMBs: TabRoleAssignment[];
  ignoredCount: number;
  mbNamesUnique: boolean;
  showFormat: boolean; setShowFormat: (b: boolean) => void;
}) {
  return (
    <>
      <div className="wiz-h">Connect Master Sheet</div>
      <div className="wiz-sub">Paste one master Google Sheet link. The system will detect tabs and ask you to confirm what each tab represents.</div>

      <QuickSaveInput fieldKey="google_sheet_url" label="Master Google Sheet URL *"
        placeholder="Paste your master Google Sheet URL"
        value={p.masterUrl} onChange={p.setMasterUrl} height={44} />
      {p.detectErr && <div className="err">{p.detectErr}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="wiz-btn wiz-btn-k" onClick={p.detect} disabled={p.detecting || !p.masterUrl.trim()}>
          {p.detecting ? "Detecting…" : "Detect Tabs"}
        </button>
      </div>

      {/* Recommended format */}
      <div style={{ marginTop: 16 }}>
        <button onClick={() => p.setShowFormat(!p.showFormat)}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "#888", fontSize: 12 }}>
          {p.showFormat ? "▲" : "▼"} Recommended Master Sheet Format
        </button>
        {p.showFormat && (
          <div style={{ background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 8, padding: 14, marginTop: 8, fontSize: 12, color: "#555", lineHeight: 1.7 }}>
            Create one Google Sheet with tabs like: <strong>Sales</strong>, <strong>Hemant</strong>, <strong>Akhil</strong>, <strong>Rahul</strong>.<br />
            Sales tab columns: Name | Email | Phone | Payment Date | Amount | Program Name<br />
            Each media buyer tab columns: Name | Email | Phone | Registration Date | Webinar Name | Source<br />
            Ad spend will be entered manually in the next step.
          </div>
        )}
      </div>

      {p.tabs.length > 0 && (
        <>
          <div style={{ marginTop: 28 }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, marginBottom: 4 }}>
              Assign Tab Roles
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>
              Confirm what each tab represents before calculating ROAS.
              {p.spreadsheetTitle && <> · Sheet: <strong style={{ color: "#0a0a0a" }}>{p.spreadsheetTitle}</strong></>}
            </div>
            <div className="sum-row">
              <SumLite label="Total Tabs" value={String(p.tabs.length)} />
              <SumLite label="Sales Tab" value={p.selectedSales ? p.selectedSales.tabName : "—"} />
              <SumLite label="Media Buyer Tabs" value={String(p.selectedMBs.length)} />
              <SumLite label="Ignored Tabs" value={String(p.ignoredCount)} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {p.tabs.map((t) => {
              const role = p.tabRoles.find((r) => r.sheetId === t.sheetId);
              const mbName = role?.mediaBuyerName || "";
              const status: { lbl: string; color: string } = role?.role === "ignore"
                ? { lbl: "Ignored", color: "#888" }
                : t.detectedHeaders.length === 0
                  ? { lbl: "Empty", color: "#CA8A04" }
                  : { lbl: "Ready", color: "#16A34A" };
              return (
                <div key={t.sheetId} style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500 }}>{t.tabName}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                        Guess: {t.guessedRole} · Rows: {t.validRowsCount} · Columns: {t.detectedHeaders.length}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: status.color, padding: "3px 10px", borderRadius: 20, border: `1px solid ${status.color}33`, background: `${status.color}10` }}>
                      {status.lbl}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: role?.role === "media_buyer" ? "1fr 1fr" : "1fr", gap: 10 }}>
                    <div>
                      <label className="fl">What is this tab?</label>
                      <select className="fsel" value={role?.role || "ignore"}
                        onChange={(e) => p.setRole(t.sheetId, e.target.value as TabRole)}>
                        <option value="sales">Sales Tab</option>
                        <option value="media_buyer">Media Buyer Tab</option>
                        <option value="ignore">Ignore This Tab</option>
                      </select>
                    </div>
                    {role?.role === "media_buyer" && (
                      <div>
                        <QuickSaveInput
                          fieldKey="media_buyer_name"
                          label="Media Buyer Name *"
                          placeholder="Select or add media buyer"
                          value={mbName}
                          onChange={(v) => p.setMBName(t.sheetId, v)}
                          height={38}
                        />
                      </div>
                    )}

                  </div>
                  {t.detectedHeaders.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {t.detectedHeaders.slice(0, 8).map((h, i) => (
                        <span key={i} style={{ fontSize: 10, color: "#888", border: "1px solid #E8E5DE", padding: "2px 8px", borderRadius: 12 }}>{h}</span>
                      ))}
                      {t.detectedHeaders.length > 8 && (
                        <span style={{ fontSize: 10, color: "#888" }}>+{t.detectedHeaders.length - 8} more</span>
                      )}
                    </div>
                  )}
                  {role?.role !== "ignore" && t.detectedHeaders.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#888" }}>
                        {role?.columnMapping ? "Custom column mapping applied" : "Auto-detected column mapping"}
                      </span>
                      <button className="btn btn-g btn-sm" onClick={() => p.onOpenMapping(t.sheetId)}>
                        Configure columns
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!p.mbNamesUnique && (
            <div className="err" style={{ marginTop: 10 }}>Each media buyer tab must have a unique, non-blank name.</div>
          )}
        </>
      )}
    </>
  );
}

function SumLite({ label, value }: { label: string; value: string }) {
  return (
    <div className="sum-card plain">
      <div className="sum-lbl">{label}</div>
      <div className="sum-val" style={{ fontSize: 22 }}>{value}</div>
    </div>
  );
}

// ============================================================
// Step 3: Ad Spends
// ============================================================
function Step3AdSpends(p: {
  mbs: TabRoleAssignment[];
  adSpends: Record<string, string>;
  setAdSpends: (r: Record<string, string>) => void;
  totalSpend: number;
  priorityOrder: string[];
  setPriorityOrder: (ids: string[]) => void;
  taxMode: AdSpendTaxMode;
  setTaxMode: (m: AdSpendTaxMode) => void;
  gstRate: number;
  setGstRate: (n: number) => void;
  spendBasis: RoasSpendBasis;
  setSpendBasis: (b: RoasSpendBasis) => void;
}) {
  const inr = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
  const ordered = p.priorityOrder.length === p.mbs.length
    ? p.priorityOrder.map((id) => p.mbs.find((m) => m.sheetId === id)!).filter(Boolean)
    : p.mbs;
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...ordered.map((m) => m.sheetId)];
    const j = idx + dir; if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    p.setPriorityOrder(next);
  };
  const breakdowns = p.mbs.map((m) => ({
    m, b: computeSpend(Number(p.adSpends[m.mediaBuyerName!] || 0), p.taxMode, p.gstRate),
  }));
  const totals = breakdowns.reduce(
    (a, x) => ({ entered: a.entered + x.b.entered, net: a.net + x.b.net, gst: a.gst + x.b.gst, gross: a.gross + x.b.gross }),
    { entered: 0, net: 0, gst: 0, gross: 0 },
  );
  const helper =
    p.taxMode === "exclusive" ? "Gross ad spend = entered + GST. ROAS is fairer when revenue is GST-inclusive."
    : p.taxMode === "inclusive" ? "Net spend and GST are derived from the entered amount."
    : "Entered ad spend is used as final ad spend.";

  return (
    <>
      <div className="wiz-h">Enter Ad Spends</div>
      <div className="wiz-sub">Enter the ad spend for each selected media buyer.</div>

      <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 16, marginBottom: 14, background: "#FAFAF8" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "#7A5E10", marginBottom: 10 }}>GST / Tax Settings</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.4fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Ad Spend Tax Mode</div>
            <select className="fsel" style={{ width: "100%", height: 36, padding: "0 10px", border: "1px solid #E8E5DE", borderRadius: 8, background: "#fff" }}
              value={p.taxMode} onChange={(e) => p.setTaxMode(e.target.value as AdSpendTaxMode)}>
              <option value="exclusive">Ad Spend Excludes GST</option>
              <option value="inclusive">Ad Spend Includes GST</option>
              <option value="none">No GST / Not Applicable</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>GST %</div>
            <input type="number" min={0} step={0.5} disabled={p.taxMode === "none"}
              value={p.gstRate}
              onChange={(e) => p.setGstRate(Number(e.target.value || 0))}
              style={{ width: "100%", height: 36, padding: "0 10px", border: "1px solid #E8E5DE", borderRadius: 8 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>ROAS Spend Basis</div>
            <select className="fsel" style={{ width: "100%", height: 36, padding: "0 10px", border: "1px solid #E8E5DE", borderRadius: 8, background: "#fff" }}
              value={p.spendBasis} onChange={(e) => p.setSpendBasis(e.target.value as RoasSpendBasis)}>
              <option value="gross">Gross Ad Spend (recommended)</option>
              <option value="net">Net Ad Spend</option>
            </select>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "#7A5E10", marginTop: 8, lineHeight: 1.6 }}>{helper}</div>
      </div>

      <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: "8px 18px" }}>
        {breakdowns.map(({ m, b }) => (
          <div className="spend-row" key={m.sheetId}>
            <div className="left">
              <div className="spend-av">{(m.mediaBuyerName || "?")[0]?.toUpperCase()}</div>
              <div>
                <div className="spend-name">{m.mediaBuyerName}</div>
                <div style={{ fontSize: 11, color: "#888" }}>From tab: {m.tabName}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {p.taxMode !== "none" && (
                <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#555" }}>
                  <span title="Net">Net <strong style={{ color: "#0a0a0a" }}>{inr(b.net)}</strong></span>
                  <span title="GST">GST <strong style={{ color: "#0a0a0a" }}>{inr(b.gst)}</strong></span>
                  <span title="Gross">Gross <strong style={{ color: "#0a0a0a" }}>{inr(b.gross)}</strong></span>
                </div>
              )}
              <div className="spend-input-wrap">
                <span className="pfx">₹</span>
                <input className="spend-inp" type="number" min={0}
                  placeholder="0"
                  value={p.adSpends[m.mediaBuyerName!] || ""}
                  onChange={(e) => p.setAdSpends({ ...p.adSpends, [m.mediaBuyerName!]: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="spend-tot" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <span>Total Net Ad Spend: <strong style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20 }}>{inr(totals.net)}</strong></span>
        <span>Total GST: <strong style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20 }}>{inr(totals.gst)}</strong></span>
        <span>Total Gross Ad Spend: <strong style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: "#0a0a0a" }}>{inr(totals.gross)}</strong></span>
      </div>
      <div style={{ fontSize: 11.5, color: "#7A5E10", marginTop: 6 }}>
        ROAS will be calculated using {p.spendBasis === "gross" ? "Gross Ad Spend" : "Net Ad Spend"}.
      </div>

      {p.mbs.length > 0 && (
        <div style={{ marginTop: 18, border: "1px solid #E8D49A", background: "#FBF6E9", borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
            Media Buyer Priority Order
          </div>
          <div style={{ fontSize: 11.5, color: "#7A5E10", marginBottom: 10, lineHeight: 1.5 }}>
            When the same lead exists in multiple tabs, the buyer listed first wins. This order is locked into the snapshot for reproducibility.
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5 }}>
            {ordered.map((m, i) => (
              <li key={m.sheetId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <span style={{ flex: 1 }}><strong>{m.mediaBuyerName}</strong> <span style={{ color: "#888", fontSize: 11 }}>· {m.tabName}</span></span>
                <button className="btn btn-g btn-sm" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn btn-g btn-sm" disabled={i === ordered.length - 1} onClick={() => move(i, 1)}>↓</button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

// ============================================================
// Step 4: Results
// ============================================================
function Step4Results(p: {
  webinar: WebinarDetails; masterTitle: string; masterUrl: string;
  salesTabName: string; mbCount: number;
  results: AutoAttribResult;
  resultsStatus: "fresh" | "outdated" | null;
  savedHist: boolean;
  onSave: () => void;
  goEdit: (s: number) => void;
  onRecalc: () => void;
  showDataUsed: boolean; setShowDataUsed: (b: boolean) => void;
  tabRoles: TabRoleAssignment[];
  adSpends: Record<string, string>;
  consistency: { sameInputSameOutput: boolean | null; sameInputDifferentOutput: boolean };
}) {
  const w = p.webinar;
  const fmtD = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const dateLabel = w.dateMode === "single" ? fmtD(w.singleDate)
    : w.dateMode === "range" ? `${fmtD(w.startDate)} - ${fmtD(w.endDate)}`
    : (w.dates || []).filter(Boolean).map(fmtD).join(", ") || "—";
  const createdOn = new Date().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const opt = (label: string, val?: string) => val ? (
    <div><div style={{ fontSize: 11, color: "#888" }}>{label}</div><div style={{ fontSize: 13 }}>{val}</div></div>
  ) : null;

  return (
    <>
      {/* Context */}
      <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#888" }}>Calculation Method</div>
            <div style={{ fontWeight: 500, color: "#C8A84B" }}>Automatic Attribution</div>
          </div>
          <div><div style={{ fontSize: 11, color: "#888" }}>Webinar Name</div><div style={{ fontSize: 13 }}>{w.name}</div></div>
          <div><div style={{ fontSize: 11, color: "#888" }}>Webinar Type</div><div style={{ fontSize: 13 }}>{w.type || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: "#888" }}>Webinar Date / Period</div><div style={{ fontSize: 13 }}>{dateLabel}</div></div>
          <div><div style={{ fontSize: 11, color: "#888" }}>Created On</div><div style={{ fontSize: 13 }}>{createdOn}</div></div>
          <div><div style={{ fontSize: 11, color: "#888" }}>Master Sheet</div><div style={{ fontSize: 13 }}>{p.masterTitle || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: "#888" }}>Sales Tab</div><div style={{ fontSize: 13 }}>{p.salesTabName}</div></div>
          <div><div style={{ fontSize: 11, color: "#888" }}>Media Buyer Tabs</div><div style={{ fontSize: 13 }}>{p.mbCount}</div></div>
          <div><div style={{ fontSize: 11, color: "#888" }}>Ad Spend Source</div><div style={{ fontSize: 13 }}>Manual Entry</div></div>
          {opt("Webinar Format", w.format)}
          {opt("Webinar Operator", w.operator)}
          {opt("Session Slot", w.sessionSlot)}
          {opt("Platform", w.platform)}
          {opt("Zoom Account Used", w.zoomAccount)}
          {w.notes ? (<div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, color: "#888" }}>Notes</div><div style={{ fontSize: 13 }}>{w.notes}</div></div>) : null}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-g btn-sm" onClick={() => p.goEdit(1)}>Edit Webinar Details</button>
          <button className="btn btn-g btn-sm" onClick={() => p.goEdit(2)}>Edit Tab Roles</button>
          <button className="btn btn-g btn-sm" onClick={() => p.goEdit(3)}>Edit Ad Spends</button>
          <button className="btn btn-k btn-sm" onClick={p.onRecalc}>Recalculate</button>
        </div>
      </div>

      {p.resultsStatus === "outdated" && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#7A5E10", borderRadius: 8, padding: "10px 12px", fontSize: 12, marginBottom: 12 }}>
          Inputs changed. Please recalculate ROAS before saving this report.
        </div>
      )}

      <AttributionResultsView
        payload={{
          webinarName: w.name,
          webinarDate: w.dateMode === "range" ? w.startDate : (w.dateMode === "single" ? w.singleDate : (w.dates[0] || "")),
          webinarType: w.type,
          totals: p.results.totals,
          rows: p.results.rows,
          salesDetail: p.results.salesDetail,
          meta: {
            createdOn: new Date().toLocaleString("en-IN"),
            calculationMethod: "Automatic Attribution",
            webinarPeriod: dateLabel,
            adSpendSource: "Master Sheet",
            calculationId: p.results.engineResult?.calculationId,
            inputSnapshotHash: p.results.engineResult?.inputSnapshotHash,
            outputHash: p.results.engineResult?.outputHash,
            engineVersion: p.results.engineResult?.engineVersion,
          },
        }}
        onSave={p.onSave}
        savedHist={p.savedHist}
        allowSave={p.resultsStatus === "fresh"}
      />

      <AttributionAuditPanel
        result={p.results.engineResult}
        mediaBuyerOrder={p.results.engineResult.mediaBuyerBreakdown.map((b) => ({
          id: b.mediaBuyerId, displayName: b.mediaBuyerName,
          leads: b.leads, source: "google_sheet_auto_fetch",
        }))}
        columnMappingsUsed={p.tabRoles.filter((r) => r.role !== "ignore").map((r) => ({
          source: r.role === "sales" ? "Sales" : (r.mediaBuyerName || r.tabName),
          tabName: r.tabName, mapping: r.columnMapping || null,
        }))}
        consistency={p.consistency}
      />

      {/* Data used */}
      <div style={{ marginTop: 24, border: "1px solid #E8E5DE", borderRadius: 12, padding: 14 }}>
        <button onClick={() => p.setShowDataUsed(!p.showDataUsed)}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 12, color: "#0a0a0a", fontWeight: 500 }}>
          {p.showDataUsed ? "▲" : "▼"} Data Used For This Calculation
        </button>
        {p.showDataUsed && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#555", lineHeight: 1.7 }}>
            <div>Method: Automatic Attribution</div>
            <div>Result status: {p.resultsStatus === "fresh" ? "Fresh" : "Needs Recalculation"}</div>
            <div>Sales tab: {p.salesTabName} · Media buyer tabs: {p.mbCount}</div>
            <div style={{ marginTop: 8 }}>
              {p.results.rows.map((r) => (
                <div key={r.name}>• <strong>{r.name}</strong> — {r.leads} leads, {r.matched} sales, ad spend ₹{Number(r.spend).toLocaleString("en-IN")}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
