import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import AttributionResultsView from "@/components/roas/AttributionResultsView";
import { runAutoAttribution, type TabMapping, type AutoAttribResult } from "@/lib/roas/autoAttribute";
import { resolveSheetCsvUrl, fetchTabAsRows, extractSpreadsheetId } from "@/lib/roas/sheetFetch";

type MBTab = { id: number; name: string; tabName: string; tabInput: string };

export default function AutoFetchWizard({ onBackToMethod }: { onBackToMethod: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1
  const [wbName, setWbName] = useState("");
  const [wbDate, setWbDate] = useState(new Date().toISOString().slice(0, 10));
  const [wbType, setWbType] = useState("1-day");

  // Step 2
  const [sourceName, setSourceName] = useState("");
  const [masterUrl, setMasterUrl] = useState("");
  const [fetchMethod, setFetchMethod] = useState<"published" | "gid">("gid");

  // Step 3
  const [salesTabName, setSalesTabName] = useState("Sales");
  const [salesTabInput, setSalesTabInput] = useState("");
  const idRef = React.useRef(2);
  const [mbs, setMbs] = useState<MBTab[]>([{ id: 1, name: "", tabName: "", tabInput: "" }]);
  const [adSpendMode, setAdSpendMode] = useState<"manual" | "tab">("manual");
  const [adSpendTabName, setAdSpendTabName] = useState("Ad_Spends");
  const [adSpendTabInput, setAdSpendTabInput] = useState("");
  const [showFormat, setShowFormat] = useState(false);

  // Step 4
  const [adSpends, setAdSpends] = useState<Record<string, string>>({});
  const [testStatus, setTestStatus] = useState<{ tab: string; ok: boolean; err?: string; rows?: number }[] | null>(null);
  const [testing, setTesting] = useState(false);

  // Step 5
  const [calcMsg, setCalcMsg] = useState("");
  const [progPct, setProgPct] = useState(0);
  const [results, setResults] = useState<AutoAttribResult | null>(null);
  const [savedHist, setSavedHist] = useState(false);

  const validUrl = useMemo(() => /docs\.google\.com\/spreadsheets/.test(masterUrl), [masterUrl]);
  const namedMbs = mbs.filter((m) => m.name.trim() && m.tabInput.trim());

  const goNext = () => {
    if (step === 1) {
      if (!wbName.trim()) return toast.error("Webinar name is required");
      if (!wbDate) return toast.error("Webinar date is required");
      setStep(2);
    } else if (step === 2) {
      if (!sourceName.trim()) return toast.error("Master sheet name is required");
      if (!masterUrl.trim()) return toast.error("Master sheet URL is required");
      if (!validUrl) return toast.error("This does not look like a valid Google Sheet URL.");
      setStep(3);
    } else if (step === 3) {
      if (!salesTabInput.trim()) return toast.error("Sales tab is required");
      if (namedMbs.length === 0) return toast.error("Add at least one media buyer tab");
      const names = namedMbs.map((m) => m.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) return toast.error("Duplicate media buyer names");
      const tabs = namedMbs.map((m) => m.tabInput.trim());
      if (new Set(tabs).size !== tabs.length) return toast.error("Duplicate tab URLs/gids");
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
    else setStep((s) => (s - 1) as any);
  };

  const addMB = () => setMbs((p) => [...p, { id: idRef.current++, name: "", tabName: "", tabInput: "" }]);
  const removeMB = (id: number) => setMbs((p) => (p.length > 1 ? p.filter((m) => m.id !== id) : p));
  const updateMB = (id: number, patch: Partial<MBTab>) => setMbs((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));

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
    setTesting(true);
    setTestStatus(null);
    const m = buildMappings();
    const all: { tab: string; input: string }[] = [
      { tab: m.salesTab.tabName, input: m.salesTab.tabInput },
      ...m.mediaBuyerTabs.map((x) => ({ tab: x.tabName, input: x.tabInput })),
      ...(m.adSpendTab ? [{ tab: m.adSpendTab.tabName, input: m.adSpendTab.tabInput }] : []),
    ];
    const results = await Promise.all(all.map(async (x) => {
      const r = resolveSheetCsvUrl(masterUrl, x.input);
      if (!r.ok) return { tab: x.tab, ok: false, err: (r as any).error };
      try {
        const rows = await fetchTabAsRows(r.csvUrl);
        return { tab: x.tab, ok: rows.length > 0, rows: rows.length, err: rows.length === 0 ? "Empty tab" : undefined };
      } catch (e: any) {
        return { tab: x.tab, ok: false, err: e?.message || "Fetch failed" };
      }
    }));
    setTestStatus(results);
    setTesting(false);
  };

  const runCalc = async () => {
    setStep(5);
    setProgPct(5);
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
    let li = 0;
    setCalcMsg(labels[0]);
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
        masterSheetUrl: masterUrl,
        webinarDate: wbDate,
        salesTab: m.salesTab,
        mediaBuyerTabs: m.mediaBuyerTabs,
        adSpends: spends,
        adSpendTab: m.adSpendTab,
      }, (msg) => setCalcMsg(msg));
      clearInterval(iv);
      setProgPct(100);
      setResults(res);
    } catch (e: any) {
      clearInterval(iv);
      toast.error(e?.message || "Calculation failed");
      setStep(4);
    }
  };

  const saveHistory = async () => {
    if (!results || !user) return;
    const totals = results.totals;
    const overall = totals.spend > 0 ? totals.revenue / totals.spend : 0;

    // Save master sheet (best-effort)
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
      .from("attribution_sessions")
      .insert({
        webinar_name: wbName, webinar_date: wbDate || null, webinar_type: wbType,
        total_leads: totals.leads, total_sales: totals.sales,
        total_ad_spend: totals.spend, total_revenue: totals.revenue,
        overall_roas: overall, unmatched_count: results.salesDetail.filter((s) => s.matchMethod === "unmatched").length,
        created_by: user.id,
        calculation_method: "automatic_master_sheet",
        master_sheet_id: masterSheetId,
        fetch_log_id: fetchLogId,
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
    setSavedHist(true);
    setTimeout(() => setSavedHist(false), 1500);
    toast.success("Attribution saved to history ✓");
  };

  const stepLabels = ["Webinar", "Master Sheet", "Map Tabs", "Ad Spends", "Results"];

  return (
    <div className={"wiz" + (step === 5 ? " wide" : "")}>
      <div className="wiz-prog">
        {stepLabels.map((lbl, i) => {
          const n = i + 1;
          const status = step > n ? "done" : step === n ? "active" : "";
          return (
            <React.Fragment key={n}>
              <div className={"wiz-step " + status}>
                <div className="wiz-circle">{step > n ? "✓" : n}</div>
                <div className="wiz-lbl">{lbl}</div>
              </div>
              {i < stepLabels.length - 1 && <div className={"wiz-line" + (step > n ? " done" : "")} />}
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
              Private sheets cannot be fetched without Google authentication.
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
            <div className="wiz-sub">Tell the system which tab belongs to which data type. Paste a tab URL, gid, or published CSV URL.</div>

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
              <div className="helper">Expected columns: Name · Email · Phone · Payment Date · Amount · Program Name</div>
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
            <div className="helper" style={{ marginTop: 8 }}>Expected columns: Name · Email · Phone · Registration Date · Webinar Name · Source</div>

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
                <div className="helper">Expected columns: Media Buyer Name · Ad Spend · Webinar Date · Webinar Name</div>
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <button onClick={() => setShowFormat((v) => !v)} style={{ background: "transparent", border: "none", color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "'Jost',sans-serif" }}>
                {showFormat ? "▾" : "▸"} Recommended master sheet format
              </button>
              {showFormat && (
                <div className="info-box" style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 500, marginBottom: 6 }}>Your master Google Sheet should contain tabs like this:</div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 1.7 }}>
                    <div>MB_Abhishek → Name | Email | Phone | Registration Date | Webinar Name | Source</div>
                    <div>MB_Rahul → Name | Email | Phone | Registration Date | Webinar Name | Source</div>
                    <div>Sales → Name | Email | Phone | Payment Date | Amount | Program Name</div>
                    <div>Ad_Spends → Media Buyer Name | Ad Spend | Webinar Date | Webinar Name</div>
                  </div>
                  <div style={{ marginTop: 6 }}>The tab names can be different, but the system needs to know which tab belongs to which media buyer and which contains sales.</div>
                </div>
              )}
            </div>

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

            {namedMbs.map((m) => {
              const v = adSpends[m.name] || "";
              return (
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
                      value={v} onChange={(e) => setAdSpends((p) => ({ ...p, [m.name]: e.target.value }))} />
                  </div>
                </div>
              );
            })}
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
              <button className="wiz-btn wiz-btn-k" onClick={goNext}>Calculate ROAS →</button>
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
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "#C8A84B", marginBottom: 6, fontWeight: 500 }}>
              Calculation Method: Automatic Fetching
            </div>
            <AttributionResultsView
              payload={{
                webinarName: wbName, webinarDate: wbDate, webinarType: wbType,
                totals: results.totals, rows: results.rows, salesDetail: results.salesDetail,
              }}
              onSave={saveHistory}
              savedHist={savedHist}
            />
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={onBackToMethod} style={{ background: "transparent", border: "none", color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "'Jost',sans-serif" }}>
                ← Start a new attribution
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
