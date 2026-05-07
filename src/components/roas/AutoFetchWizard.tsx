import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import AttributionResultsView from "@/components/roas/AttributionResultsView";
import { runAutoAttribution, type AutoAttribResult } from "@/lib/roas/autoAttribute";
import { resolveSheetCsvUrl, fetchTabAsRows, extractSpreadsheetId } from "@/lib/roas/sheetFetch";

type MBTab = { id: number; name: string; tabName: string; tabInput: string };

const DRAFT_KEY = "ipc_roas_automatic_draft_v2";

type DraftShape = {
  step: number;
  wbName: string; wbDate: string; wbType: string;
  sourceName: string; masterUrl: string; fetchMethod: "published" | "gid";
  salesTabName: string; salesTabInput: string;
  mbs: MBTab[];
  adSpendMode: "manual" | "tab";
  adSpendTabName: string; adSpendTabInput: string;
  adSpends: Record<string, string>;
  results: AutoAttribResult | null;
  resultsStatus: "fresh" | "outdated" | null;
  savedSessionId: string | null;
};

const EMPTY: DraftShape = {
  step: 1,
  wbName: "", wbDate: new Date().toISOString().slice(0, 10), wbType: "1-day",
  sourceName: "", masterUrl: "", fetchMethod: "gid",
  salesTabName: "Sales", salesTabInput: "",
  mbs: [{ id: 1, name: "", tabName: "", tabInput: "" }],
  adSpendMode: "manual", adSpendTabName: "Ad_Spends", adSpendTabInput: "",
  adSpends: {},
  results: null, resultsStatus: null, savedSessionId: null,
};

function loadDraft(): DraftShape {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch { return EMPTY; }
}

export default function AutoFetchWizard({ onBackToMethod }: { onBackToMethod: () => void }) {
  const { user } = useAuth();
  const initial = useRef<DraftShape>(loadDraft());

  const [step, setStep] = useState<number>(initial.current.step);
  const [wbName, setWbName] = useState(initial.current.wbName);
  const [wbDate, setWbDate] = useState(initial.current.wbDate);
  const [wbType, setWbType] = useState(initial.current.wbType);
  const [sourceName, setSourceName] = useState(initial.current.sourceName);
  const [masterUrl, setMasterUrl] = useState(initial.current.masterUrl);
  const [fetchMethod, setFetchMethod] = useState<"published" | "gid">(initial.current.fetchMethod);
  const [salesTabName, setSalesTabName] = useState(initial.current.salesTabName);
  const [salesTabInput, setSalesTabInput] = useState(initial.current.salesTabInput);
  const idRef = useRef((initial.current.mbs.reduce((a, m) => Math.max(a, m.id), 0) || 0) + 1);
  const [mbs, setMbs] = useState<MBTab[]>(initial.current.mbs);
  const [adSpendMode, setAdSpendMode] = useState<"manual" | "tab">(initial.current.adSpendMode);
  const [adSpendTabName, setAdSpendTabName] = useState(initial.current.adSpendTabName);
  const [adSpendTabInput, setAdSpendTabInput] = useState(initial.current.adSpendTabInput);
  const [adSpends, setAdSpends] = useState<Record<string, string>>(initial.current.adSpends);
  const [showFormat, setShowFormat] = useState(false);
  const [testStatus, setTestStatus] = useState<{ tab: string; ok: boolean; err?: string; rows?: number }[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [calcMsg, setCalcMsg] = useState("");
  const [progPct, setProgPct] = useState(0);
  const [results, setResults] = useState<AutoAttribResult | null>(initial.current.results);
  const [resultsStatus, setResultsStatus] = useState<"fresh" | "outdated" | null>(initial.current.resultsStatus);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(initial.current.savedSessionId);
  const [savedHist, setSavedHist] = useState(false);
  const [showRestored, setShowRestored] = useState(
    !!(initial.current.wbName || initial.current.masterUrl || initial.current.results)
  );
  const [showDataUsed, setShowDataUsed] = useState(false);

  const validUrl = useMemo(() => /docs\.google\.com\/spreadsheets/.test(masterUrl), [masterUrl]);
  const namedMbs = mbs.filter((m) => m.name.trim() && m.tabInput.trim());

  // Persist draft
  useEffect(() => {
    const draft: DraftShape = {
      step, wbName, wbDate, wbType, sourceName, masterUrl, fetchMethod,
      salesTabName, salesTabInput, mbs, adSpendMode, adSpendTabName, adSpendTabInput,
      adSpends, results, resultsStatus, savedSessionId,
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* quota */ }
  }, [step, wbName, wbDate, wbType, sourceName, masterUrl, fetchMethod, salesTabName, salesTabInput,
      mbs, adSpendMode, adSpendTabName, adSpendTabInput, adSpends, results, resultsStatus, savedSessionId]);

  // Mark outdated when inputs change after results exist
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (results && resultsStatus === "fresh") {
      setResultsStatus("outdated");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wbName, wbDate, wbType, masterUrl, salesTabInput, salesTabName,
      JSON.stringify(mbs), JSON.stringify(adSpends), adSpendTabInput, adSpendMode]);

  // Step validation
  const step1Valid = !!(wbName.trim() && wbDate && wbType);
  const step2Valid = step1Valid && !!(sourceName.trim() && masterUrl.trim() && validUrl);
  const step3Valid = step2Valid && !!salesTabInput.trim() && namedMbs.length > 0
    && new Set(namedMbs.map((m) => m.name.trim().toLowerCase())).size === namedMbs.length
    && new Set(namedMbs.map((m) => m.tabInput.trim())).size === namedMbs.length
    && (adSpendMode !== "tab" || !!adSpendTabInput.trim());
  const step4Valid = step3Valid && (adSpendMode === "tab" ||
    namedMbs.every((m) => parseFloat(adSpends[m.name] || "") >= 0));
  const step5Available = !!results;

  const stepValid = (n: number) => [true, step1Valid, step2Valid, step3Valid, step4Valid, step5Available][n] ?? false;

  const goNext = () => {
    if (step === 1) {
      if (!step1Valid) return toast.error("Please complete webinar details.");
      setStep(2);
    } else if (step === 2) {
      if (!sourceName.trim()) return toast.error("Master sheet name is required");
      if (!masterUrl.trim()) return toast.error("Master sheet URL is required");
      if (!validUrl) return toast.error("This does not look like a valid Google Sheet URL.");
      setStep(3);
    } else if (step === 3) {
      if (!salesTabInput.trim()) return toast.error("Sales tab is required");
      if (namedMbs.length === 0) return toast.error("Add at least one media buyer tab");
      if (new Set(namedMbs.map((m) => m.name.trim().toLowerCase())).size !== namedMbs.length)
        return toast.error("Duplicate media buyer names");
      if (new Set(namedMbs.map((m) => m.tabInput.trim())).size !== namedMbs.length)
        return toast.error("Duplicate tab URLs/gids");
      if (adSpendMode === "tab" && !adSpendTabInput.trim()) return toast.error("Ad spend tab is required");
      setStep(4);
    } else if (step === 4) {
      if (adSpendMode === "manual") {
        const missing = namedMbs.find((m) => !(parseFloat(adSpends[m.name] || "0") >= 0));
        if (missing) return toast.error("Enter ad spend for every media buyer");
      }
      runCalc();
    }
  };

  const goBack = () => {
    if (step === 1) onBackToMethod();
    else setStep((s) => s - 1);
  };

  const goToStep = (n: number) => {
    if (n === step) return;
    if (!stepValid(n)) {
      toast.error("Complete previous steps first.");
      return;
    }
    setStep(n);
  };

  const startFresh = () => {
    if (!confirm("Start a fresh ROAS calculation? Your current draft will be cleared.")) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    Object.assign(initial.current, EMPTY);
    setStep(1); setWbName(""); setWbDate(EMPTY.wbDate); setWbType("1-day");
    setSourceName(""); setMasterUrl(""); setFetchMethod("gid");
    setSalesTabName("Sales"); setSalesTabInput("");
    setMbs([{ id: 1, name: "", tabName: "", tabInput: "" }]);
    setAdSpendMode("manual"); setAdSpendTabName("Ad_Spends"); setAdSpendTabInput("");
    setAdSpends({}); setResults(null); setResultsStatus(null); setSavedSessionId(null);
    setShowRestored(false);
  };

  const addMB = () => setMbs((p) => [...p, { id: idRef.current++, name: "", tabName: "", tabInput: "" }]);
  const removeMB = (id: number) => setMbs((p) => (p.length > 1 ? p.filter((m) => m.id !== id) : p));
  const updateMB = (id: number, patch: Partial<MBTab>) =>
    setMbs((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const buildMappings = () => ({
    salesTab: { role: "sales" as const, tabName: salesTabName || "Sales", tabInput: salesTabInput },
    mediaBuyerTabs: namedMbs.map((m) => ({
      role: "media_buyer_leads" as const, mediaBuyerName: m.name.trim(),
      tabName: m.tabName || m.name, tabInput: m.tabInput,
    })),
    adSpendTab: adSpendMode === "tab"
      ? { role: "ad_spends" as const, tabName: adSpendTabName, tabInput: adSpendTabInput }
      : null,
  });

  const runTestFetch = async () => {
    setTesting(true); setTestStatus(null);
    const m = buildMappings();
    const all: { tab: string; input: string }[] = [
      { tab: m.salesTab.tabName, input: m.salesTab.tabInput },
      ...m.mediaBuyerTabs.map((x) => ({ tab: x.tabName, input: x.tabInput })),
      ...(m.adSpendTab ? [{ tab: m.adSpendTab.tabName, input: m.adSpendTab.tabInput }] : []),
    ];
    const res = await Promise.all(all.map(async (x) => {
      const r = resolveSheetCsvUrl(masterUrl, x.input);
      if (!r.ok) return { tab: x.tab, ok: false, err: (r as any).error };
      try {
        const rows = await fetchTabAsRows(r.csvUrl);
        return { tab: x.tab, ok: rows.length > 0, rows: rows.length, err: rows.length === 0 ? "Empty tab" : undefined };
      } catch (e: any) {
        return { tab: x.tab, ok: false, err: e?.message || "Fetch failed" };
      }
    }));
    setTestStatus(res); setTesting(false);
  };

  const runCalc = async () => {
    setStep(5); setProgPct(5);
    const labels = [
      "Reading master sheet mappings…",
      "Fetching media buyer lead tabs…",
      "Fetching sales tab…",
      "Fetching ad spends…",
      "Normalizing emails and phone numbers…",
      "Matching sales by email…",
      "Matching sales by phone…",
      "Matching sales by name…",
      "Calculating media buyer ROAS…",
      "Preparing attribution report…",
    ];
    let li = 0; setCalcMsg(labels[0]);
    const iv = setInterval(() => {
      li = Math.min(li + 1, labels.length - 1);
      setCalcMsg(labels[li]);
      setProgPct((p) => Math.min(95, p + 7 + Math.random() * 8));
    }, 380);
    try {
      const m = buildMappings();
      const spends: Record<string, number> = {};
      namedMbs.forEach((b) => { spends[b.name.trim()] = parseFloat(adSpends[b.name] || "0") || 0; });
      const res = await runAutoAttribution({
        masterSheetUrl: masterUrl, webinarDate: wbDate,
        salesTab: m.salesTab, mediaBuyerTabs: m.mediaBuyerTabs,
        adSpends: spends, adSpendTab: m.adSpendTab,
      }, (msg) => setCalcMsg(msg));
      clearInterval(iv); setProgPct(100);
      setResults(res);
      setResultsStatus("fresh");
      setSavedSessionId(null); // recalculation requires a fresh save
      // schedule outdated guard reset on next renders (firstRender already false)
      firstRender.current = true;
      setTimeout(() => { firstRender.current = false; }, 50);
    } catch (e: any) {
      clearInterval(iv);
      toast.error(e?.message || "Calculation failed");
      setStep(4);
    }
  };

  const saveHistory = async () => {
    if (!results || !user) return;
    if (resultsStatus === "outdated") {
      toast.error("Please recalculate before saving this report to history.");
      return;
    }
    if (savedSessionId) {
      toast.error("This report has already been saved to history.");
      return;
    }
    const totals = results.totals;
    const overall = totals.spend > 0 ? totals.revenue / totals.spend : 0;

    let masterSheetId: string | null = null;
    try {
      const { data: ms } = await supabase.from("roas_master_sheets").insert({
        source_name: sourceName, master_sheet_url: masterUrl,
        spreadsheet_id: extractSpreadsheetId(masterUrl),
        fetch_method: fetchMethod === "published" ? "published_csv" : "gid_mapping",
        created_by: user.id,
      } as any).select().single();
      if (ms) masterSheetId = (ms as any).id;
    } catch { /* non-fatal */ }

    const failed = results.fetchStatus.filter((s) => !s.ok).length;
    let fetchLogId: string | null = null;
    try {
      const { data: fl } = await supabase.from("roas_fetch_logs").insert({
        master_sheet_id: masterSheetId,
        fetch_status: failed === 0 ? "success" : failed === results.fetchStatus.length ? "failed" : "partial_success",
        fetched_tabs_count: results.fetchStatus.length - failed,
        failed_tabs_count: failed,
        fetched_by: user.id,
      } as any).select().single();
      if (fl) fetchLogId = (fl as any).id;
    } catch { /* non-fatal */ }

    const { data: session, error: sessErr } = await supabase
      .from("attribution_sessions").insert({
        webinar_name: wbName, webinar_date: wbDate || null, webinar_type: wbType,
        total_leads: totals.leads, total_sales: totals.sales,
        total_ad_spend: totals.spend, total_revenue: totals.revenue,
        overall_roas: overall,
        unmatched_count: results.salesDetail.filter((s) => s.matchMethod === "unmatched").length,
        created_by: user.id,
        calculation_method: "automatic_master_sheet",
        master_sheet_id: masterSheetId, fetch_log_id: fetchLogId,
      } as any).select().single();
    if (sessErr || !session) { toast.error("Save failed: " + (sessErr?.message || "")); return; }

    const sid = (session as any).id;
    const buyerRows = results.rows.map((r) => {
      const tab = namedMbs.find((m) => m.name.trim() === r.name);
      const status = results.fetchStatus.find((s) => s.tabName === (tab?.tabName || tab?.name));
      return {
        session_id: sid, media_buyer_name: r.name,
        ad_spend: r.spend, total_leads: r.leads, matched_sales: r.matched, revenue: r.revenue,
        roas_value: r.spend > 0 ? r.revenue / r.spend : 0,
        cpl: r.leads > 0 ? r.spend / r.leads : 0,
        conversion_rate: r.leads > 0 ? (r.matched / r.leads) * 100 : 0,
        source_tab_name: tab?.tabName || null,
        source_tab_gid: status?.gid || null,
        source_type: "google_sheet_auto_fetch",
      };
    });
    const saleRows = results.salesDetail.map((s) => ({
      session_id: sid, buyer_name: s.name, email: s.email, phone: s.phone,
      attributed_to: s.attributedTo, match_method: s.matchMethod, revenue: s.revenue,
      webinar_date: s.webinarDate || null,
      source_sales_tab_name: salesTabName || "Sales",
      source_type: "google_sheet_auto_fetch",
    }));
    await supabase.from("attribution_media_buyers").insert(buyerRows as any);
    if (saleRows.length) await supabase.from("attribution_sales_detail").insert(saleRows as any);
    setSavedHist(true); setSavedSessionId(sid);
    toast.success("Report saved to history ✓");
  };

  const stepLabels = ["Webinar", "Master Sheet", "Map Tabs", "Ad Spends", "Results"];

  return (
    <div className={"wiz" + (step === 5 ? " wide" : "")}>
      {showRestored && (
        <div style={{
          background: "#FBF6E9", border: "1px solid #E8D49A", borderRadius: 12,
          padding: "12px 16px", marginBottom: 18, display: "flex", justifyContent: "space-between",
          alignItems: "center", gap: 12, fontFamily: "'Jost',sans-serif", fontSize: 13,
        }}>
          <span>Your previous ROAS draft has been restored. Continue or start fresh.</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowRestored(false)} style={btnGhost}>Continue Draft</button>
            <button onClick={startFresh} style={btnGhost}>Start Fresh</button>
          </div>
        </div>
      )}

      <div className="wiz-prog">
        {stepLabels.map((lbl, i) => {
          const n = i + 1;
          const isDone = step > n;
          const isActive = step === n;
          const canClick = stepValid(n);
          const cls = (isActive ? "active " : "") + (isDone ? "done " : "") + (!canClick && !isActive ? "locked" : "");
          return (
            <React.Fragment key={n}>
              <div
                className={"wiz-step " + cls}
                onClick={() => goToStep(n)}
                style={{ cursor: canClick ? "pointer" : "not-allowed" }}
                title={!canClick ? "Complete previous steps first." : ""}
              >
                <div className="wiz-circle">{isDone ? "✓" : n}</div>
                <div className="wiz-lbl">{lbl}</div>
              </div>
              {i < stepLabels.length - 1 && <div className={"wiz-line" + (isDone ? " done" : "")} />}
            </React.Fragment>
          );
        })}
      </div>

      <div className="wiz-body" key={step}>
        {step === 1 && (
          <>
            <div className="wiz-h">Webinar details</div>
            <div className="wiz-sub">Enter the webinar details so results are clearly labelled and saved to history.</div>
            <div style={{ marginBottom: 18 }}>
              <QuickSaveInput fieldKey="webinar_name" label="Webinar name"
                placeholder="Select or enter webinar name" value={wbName} onChange={setWbName} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label className="fl">Webinar date</label>
              <input className="fi fi-h" type="date" value={wbDate} onChange={(e) => setWbDate(e.target.value)} />
            </div>
            <div>
              <label className="fl">Webinar type</label>
              <div className="wpills">
                {[["1-day", "1 Day"], ["2-day", "2 Days"], ["3-day", "3 Days"], ["series", "Series"]].map(([v, l]) => (
                  <button key={v} className={"wpill" + (wbType === v ? " sel" : "")} onClick={() => setWbType(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="wiz-nav">
              <button className="wiz-btn wiz-btn-g" onClick={goBack}>← Back to method selection</button>
              <button className="wiz-btn wiz-btn-k" onClick={goNext}>Continue →</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="wiz-h">Connect your master Google Sheet</div>
            <div className="wiz-sub">One workbook with separate tabs for media buyer leads, sales, and ad spends.</div>
            <div style={{ marginBottom: 18 }}>
              <QuickSaveInput fieldKey="data_source_name" label="Master sheet name"
                placeholder="Example: IPC Webinar Master Sheet — May 2026" value={sourceName} onChange={setSourceName} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <QuickSaveInput fieldKey="google_sheet_url" label="Master Google Sheet URL"
                placeholder="Paste Google Sheet URL" value={masterUrl} onChange={setMasterUrl} />
              {masterUrl && !validUrl && <div className="err">This does not look like a valid Google Sheet URL.</div>}
            </div>
            <div>
              <label className="fl">Fetch method</label>
              <div className="sheet-opts">
                <div className={"sheet-opt" + (fetchMethod === "published" ? " sel" : "")} onClick={() => setFetchMethod("published")}>
                  <div className="so-title">Published CSV / Public Sheet</div>
                  <div className="so-desc">Each tab has a published CSV link.</div>
                </div>
                <div className={"sheet-opt" + (fetchMethod === "gid" ? " sel" : "")} onClick={() => setFetchMethod("gid")}>
                  <div className="so-title">Tab Links / GID Mapping</div>
                  <div className="so-desc">Use the master sheet URL plus per-tab gid.</div>
                </div>
              </div>
            </div>
            <div className="info-box" style={{ marginTop: 18 }}>
              ⚠ Make sure the Google Sheet is shared as "Anyone with the link can view" or published to the web.
            </div>
            <div className="wiz-nav">
              <button className="wiz-btn wiz-btn-g" onClick={goBack}>← Back</button>
              <button className="wiz-btn wiz-btn-k" onClick={goNext}>Continue →</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="wiz-h">Map sheet tabs</div>
            <div className="wiz-sub">Tell the system which tab belongs to which data type.</div>

            <div className="sl">Sales tab</div>
            <div className="mb-card">
              <div className="row-2">
                <div>
                  <label className="fl-sm">Sales tab name</label>
                  <input className="fi-sm" value={salesTabName} onChange={(e) => setSalesTabName(e.target.value)} placeholder="Sales" />
                </div>
                <div>
                  <label className="fl-sm">Tab URL / gid / CSV link</label>
                  <input className="fi-sm" value={salesTabInput} onChange={(e) => setSalesTabInput(e.target.value)} placeholder="Paste tab URL, gid, or CSV link" />
                </div>
              </div>
            </div>

            <div className="sl" style={{ marginTop: 24 }}>Media buyer lead tabs</div>
            {mbs.map((m) => (
              <div className="mb-card" key={m.id}>
                <div className="mb-card-hd">
                  <div className="mb-av">{(m.name || "?").slice(0, 1).toUpperCase()}</div>
                  <div>
                    <div className="mb-hd-t">{m.name || "New media buyer"}</div>
                    <div className="mb-hd-s">Lead tab inside the master sheet</div>
                  </div>
                  <button className="mb-card-x" onClick={() => removeMB(m.id)} disabled={mbs.length === 1}>✕</button>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <QuickSaveInput fieldKey="media_buyer_name" label="Media buyer name"
                    placeholder="e.g. Abhishek" value={m.name} onChange={(v) => updateMB(m.id, { name: v })} />
                </div>
                <div className="row-2">
                  <div>
                    <label className="fl-sm">Lead tab name</label>
                    <input className="fi-sm" value={m.tabName} onChange={(e) => updateMB(m.id, { tabName: e.target.value })} placeholder="e.g. MB_Abhishek" />
                  </div>
                  <div>
                    <label className="fl-sm">Tab URL / gid / CSV link</label>
                    <input className="fi-sm" value={m.tabInput} onChange={(e) => updateMB(m.id, { tabInput: e.target.value })} placeholder="Paste tab URL, gid, or CSV link" />
                  </div>
                </div>
              </div>
            ))}
            <button className="add-mb-btn" onClick={addMB}>+ Add media buyer tab</button>

            <div className="sl" style={{ marginTop: 24 }}>Ad spend source</div>
            <div className="sheet-opts">
              <div className={"sheet-opt" + (adSpendMode === "manual" ? " sel" : "")} onClick={() => setAdSpendMode("manual")}>
                <div className="so-title">Enter ad spends manually</div>
                <div className="so-desc">Type spends in the next step.</div>
              </div>
              <div className={"sheet-opt" + (adSpendMode === "tab" ? " sel" : "")} onClick={() => setAdSpendMode("tab")}>
                <div className="so-title">Fetch from Ad_Spends tab</div>
                <div className="so-desc">Pull spends automatically.</div>
              </div>
            </div>
            {adSpendMode === "tab" && (
              <div className="mb-card" style={{ marginTop: 12 }}>
                <div className="row-2">
                  <div>
                    <label className="fl-sm">Ad spend tab name</label>
                    <input className="fi-sm" value={adSpendTabName} onChange={(e) => setAdSpendTabName(e.target.value)} placeholder="Ad_Spends" />
                  </div>
                  <div>
                    <label className="fl-sm">Tab URL / gid / CSV link</label>
                    <input className="fi-sm" value={adSpendTabInput} onChange={(e) => setAdSpendTabInput(e.target.value)} placeholder="Paste tab URL, gid, or CSV link" />
                  </div>
                </div>
              </div>
            )}

            <div className="wiz-nav">
              <button className="wiz-btn wiz-btn-g" onClick={goBack}>← Back</button>
              <button className="wiz-btn wiz-btn-k" onClick={goNext}>Continue →</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="wiz-h">Review ad spends</div>
            <div className="wiz-sub">
              {adSpendMode === "manual"
                ? "Enter the ad spend per media buyer for this webinar."
                : "Spends will be fetched from the Ad_Spends tab. Override below if needed."}
            </div>
            {namedMbs.map((m) => (
              <div className="spend-row" key={m.id}>
                <div className="left">
                  <div className="spend-av">{(m.name || "?").slice(0, 1).toUpperCase()}</div>
                  <div>
                    <div className="spend-name">{m.name}</div>
                    <div style={{ fontSize: 10, color: "#888" }}>Tab: {m.tabName || m.name}</div>
                  </div>
                </div>
                <div className="spend-input-wrap">
                  <span className="pfx">₹</span>
                  <input className="spend-inp" type="number" placeholder="Amount spent"
                    value={adSpends[m.name] || ""}
                    onChange={(e) => setAdSpends((p) => ({ ...p, [m.name]: e.target.value }))} />
                </div>
              </div>
            ))}
            <div className="spend-tot">
              Total ad spend: <strong style={{ color: "#0a0a0a" }}>
                ₹{namedMbs.reduce((a, m) => a + (parseFloat(adSpends[m.name] || "0") || 0), 0).toLocaleString("en-IN")}
              </strong>
            </div>
            {testStatus && (
              <div className="info-box" style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>Test fetch results</div>
                {testStatus.map((s, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: s.ok ? "#16A34A" : "#DC2626" }}>
                    {s.ok ? "✓" : "✗"} {s.tab} {s.ok ? `· ${s.rows} rows` : `· ${s.err}`}
                  </div>
                ))}
              </div>
            )}
            <div className="wiz-nav">
              <button className="wiz-btn wiz-btn-g" onClick={goBack}>← Back</button>
              <button className="wiz-btn wiz-btn-g" onClick={runTestFetch} disabled={testing}>{testing ? "Testing…" : "Test fetch"}</button>
              <button className="wiz-btn wiz-btn-k" onClick={goNext}>
                {results ? "Recalculate ROAS →" : "Calculate ROAS →"}
              </button>
            </div>
          </>
        )}

        {step === 5 && !results && (
          <div className="calc-wrap">
            <div className="wiz-h" style={{ marginBottom: 8 }}>Calculating Automatic ROAS</div>
            <div className="calc-msg">{calcMsg}</div>
            <div className="calc-bar"><div className="calc-bar-fill" style={{ width: progPct + "%" }} /></div>
          </div>
        )}

        {step === 5 && results && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "#C8A84B", fontWeight: 500 }}>
                Calculation Method: Automatic Fetching
                {resultsStatus === "outdated" && (
                  <span style={{
                    marginLeft: 10, background: "#FFFBEB", border: "1px solid #FDE68A",
                    color: "#CA8A04", padding: "2px 8px", borderRadius: 12, fontSize: 10, letterSpacing: ".08em",
                  }}>Needs Recalculation</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={btnGhost} onClick={() => setStep(1)}>Edit Webinar Details</button>
                <button style={btnGhost} onClick={() => setStep(2)}>Edit Master Sheet</button>
                <button style={btnGhost} onClick={() => setStep(3)}>Edit Map Tabs</button>
                <button style={btnGhost} onClick={() => setStep(4)}>Edit Ad Spends</button>
              </div>
            </div>

            {resultsStatus === "outdated" && (
              <div style={{
                background: "#FFFBEB", border: "1px solid #FDE68A", color: "#7A5E10",
                borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex",
                justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
                fontFamily: "'Jost',sans-serif", fontSize: 13,
              }}>
                <span>Inputs changed. Recalculate ROAS to update these results.</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...btnGhost, borderColor: "#CA8A04", color: "#CA8A04" }} onClick={runCalc}>Recalculate ROAS</button>
                </div>
              </div>
            )}

            <AttributionResultsView
              payload={{
                webinarName: wbName, webinarDate: wbDate, webinarType: wbType,
                totals: results.totals, rows: results.rows, salesDetail: results.salesDetail,
              }}
              onSave={resultsStatus === "fresh" && !savedSessionId ? saveHistory : undefined}
              savedHist={savedHist || !!savedSessionId}
              allowSave={resultsStatus === "fresh" && !savedSessionId}
            />

            {/* Data used */}
            <div style={{ marginTop: 24, border: "1px solid #E8E5DE", borderRadius: 12 }}>
              <button onClick={() => setShowDataUsed((v) => !v)}
                style={{
                  width: "100%", textAlign: "left", padding: "12px 16px", background: "transparent",
                  border: "none", cursor: "pointer", fontFamily: "'Jost',sans-serif", fontSize: 12.5,
                  color: "#0a0a0a", display: "flex", justifyContent: "space-between",
                }}>
                <span>{showDataUsed ? "▾" : "▸"} Data used for this calculation</span>
                <span style={{ color: "#888", fontSize: 11 }}>{resultsStatus === "fresh" ? "Fresh" : "Needs Recalculation"}</span>
              </button>
              {showDataUsed && (
                <div style={{ padding: "0 16px 14px", fontSize: 12, color: "#555", lineHeight: 1.7 }}>
                  <div>Calculation method: Automatic Fetching</div>
                  <div>Webinar: {wbName} · {wbDate}</div>
                  <div>Master sheet: {sourceName}</div>
                  <div>Sales tab: {salesTabName} · rows detected: {results.salesDetail.length}</div>
                  <div>Media buyer tabs fetched: {namedMbs.length}</div>
                  <div>Ad spend source: {adSpendMode === "tab" ? "fetched" : "manual"}</div>
                  <div style={{ marginTop: 8, fontWeight: 500, color: "#0a0a0a" }}>Per media buyer:</div>
                  {results.rows.map((r) => {
                    const tab = namedMbs.find((m) => m.name.trim() === r.name);
                    return (
                      <div key={r.name}>
                        • {r.name} — tab: {tab?.tabName || r.name} · leads: {r.leads} · spend: ₹{r.spend.toLocaleString("en-IN")} · sales: {r.matched}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={startFresh} style={{ background: "transparent", border: "none", color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "'Jost',sans-serif" }}>
                ← Start a new attribution
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  height: 30, padding: "0 12px", borderRadius: 8, background: "#fff",
  border: "1px solid #E8E5DE", color: "#0a0a0a", fontFamily: "'Jost',sans-serif",
  fontSize: 11.5, cursor: "pointer", transition: "border-color .12s, color .12s",
};
