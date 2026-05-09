import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import QuickSaveInput from "@/components/QuickSaveInput";
import {
  buildCsv, buildAndDownloadPdf, buildWhatsApp, calcCpl, calcMediaBuyerSpend,
  downloadFile, fmtDateLong, fmtNum, formatMetricValue, hashReport, inr,
  type DailyAdAccount, type DailyMediaBuyer, type DailyMetricDef, type DailyReport,
} from "@/lib/dailyReports/helpers";
import DailyHistoryView from "./daily/DailyHistoryView";
import DailyAnalyticsView from "./daily/DailyAnalyticsView";
import ExportMenu from "./daily/ExportMenu";
import { runExportAction, loadFullReport } from "./daily/sharedActions";

const DRAFT_KEY = "ipc_daily_lead_report_draft";
const STEP_KEY = "ipc_daily_lead_report_active_step";

const DEFAULT_BASIC_METRICS: DailyMetricDef[] = [
  { key: "cpm", name: "CPM", type: "currency", aggregation: "average", whatsapp: true, exports: true },
  { key: "ctr", name: "CTR", type: "percentage", aggregation: "average", whatsapp: true, exports: true },
  { key: "cpc", name: "CPC", type: "currency", aggregation: "average", whatsapp: true, exports: true },
  { key: "link_clicks", name: "Link Clicks", type: "number", aggregation: "sum", whatsapp: false, exports: true },
  { key: "lp_views", name: "Landing Page Views", type: "number", aggregation: "sum", whatsapp: false, exports: true },
  { key: "lp_visit_rate", name: "Landing Page Visit Rate", type: "percentage", aggregation: "average", whatsapp: true, exports: true },
];

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function newAdAccount(): DailyAdAccount {
  return { id: uid(), ad_account_name: "", ad_spend: 0, metrics: {} };
}
function newMediaBuyer(): DailyMediaBuyer {
  return {
    id: uid(),
    media_buyer_name: "",
    spend_mode: "breakdown",
    ad_accounts: [newAdAccount()],
    lead_source_url: "",
    total_leads: 0,
    lead_count_source: "google_sheet",
    status: "ready",
    save_mapping: true,
  };
}

function defaultReport(): DailyReport {
  const today = new Date().toISOString().slice(0, 10);
  return {
    report_name: `Daily Lead Report - ${fmtDateLong(today)}`,
    report_date: today,
    notes: "",
    metrics: DEFAULT_BASIC_METRICS,
    media_buyers: [],
  };
}

async function insertReportChildren(reportId: string, report: DailyReport, userId: string | null) {
  for (const mb of report.media_buyers) {
    const spend = calcMediaBuyerSpend(mb);
    const cpl = calcCpl(spend, mb.total_leads);
    const { data: mbRow, error: mbErr } = await (supabase as any)
      .from("daily_lead_report_media_buyers")
      .insert({
        report_id: reportId,
        media_buyer_name: mb.media_buyer_name,
        media_buyer_key: mb.media_buyer_name.toLowerCase().trim(),
        lead_source_url: mb.lead_source_url || null,
        spreadsheet_id: mb.spreadsheet_id || null,
        spreadsheet_title: mb.spreadsheet_title || null,
        tab_name: mb.tab_name || null,
        sheet_id: mb.sheet_id || null,
        date_column: mb.date_column || null,
        total_leads: mb.total_leads || 0,
        lead_count_source: mb.lead_count_source,
        total_ad_spend: spend,
        cpl: cpl ?? 0,
        status: mb.status,
        fetch_metadata: mb.fetch_metadata || null,
      })
      .select()
      .single();
    if (mbErr || !mbRow) continue;
    if (mb.spend_mode === "combined") {
      await (supabase as any).from("daily_lead_report_ad_accounts").insert({
        report_media_buyer_id: mbRow.id,
        ad_account_name: "(combined)",
        ad_spend: spend,
        metrics: mb.combined_metrics || {},
      });
    } else {
      for (const a of mb.ad_accounts) {
        if (!a.ad_account_name && !a.ad_spend) continue;
        await (supabase as any).from("daily_lead_report_ad_accounts").insert({
          report_media_buyer_id: mbRow.id,
          ad_account_name: a.ad_account_name || "(unnamed)",
          ad_spend: Number(a.ad_spend) || 0,
          metrics: a.metrics || {},
        });
      }
    }
    if (mb.save_mapping && mb.media_buyer_name && mb.lead_source_url && mb.tab_name) {
      await (supabase as any).from("daily_lead_source_mappings").insert({
        media_buyer_name: mb.media_buyer_name,
        sheet_url: mb.lead_source_url,
        spreadsheet_id: mb.spreadsheet_id || null,
        spreadsheet_title: mb.spreadsheet_title || null,
        tab_name: mb.tab_name,
        sheet_id: mb.sheet_id || null,
        date_column: mb.date_column || null,
        created_by: userId,
      });
    }
  }
}

type ViewMode = "create" | "history" | "analytics";

export default function DailyLeadReportingModule({ onBack, initialEditReportId }: { onBack?: () => void; initialEditReportId?: string | null }) {
  const { user } = useAuth();
  const [view, setView] = useState<ViewMode>("history");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [report, setReport] = useState<DailyReport>(defaultReport);
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const [editingExistingId, setEditingExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTplBuilder, setShowTplBuilder] = useState(false);

  // Restore draft on mount; if a draft exists default to create view
  useEffect(() => {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      const s = localStorage.getItem(STEP_KEY);
      if (d) {
        const parsed = JSON.parse(d);
        if (parsed && parsed.report_date && parsed.media_buyers && parsed.media_buyers.length > 0) {
          setReport(parsed);
          if (s) setStep(Number(s) as any);
          setView("create");
        }
      }
    } catch {}
  }, []);

  // Persist draft
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(report));
      localStorage.setItem(STEP_KEY, String(step));
    } catch {}
  }, [report, step]);

  // Load templates
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("daily_metric_templates")
        .select("*")
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      setTemplates(data || []);
      if (!report.metric_template_id && data && data.length) {
        const def = data.find((t: any) => t.is_default) || data[0];
        setReport((r) => r.metric_template_id ? r : ({
          ...r,
          metric_template_id: def.id,
          metric_template_name: def.template_name,
          metrics: (def.metrics || DEFAULT_BASIC_METRICS) as DailyMetricDef[],
        }));
      }
    })();
  }, []);

  const totals = useMemo(() => {
    const t = report.media_buyers.reduce(
      (acc, m) => {
        acc.spend += calcMediaBuyerSpend(m);
        acc.leads += m.total_leads || 0;
        return acc;
      },
      { spend: 0, leads: 0 },
    );
    return { ...t, cpl: calcCpl(t.spend, t.leads) };
  }, [report]);

  const startFresh = () => {
    if (report.media_buyers.length > 0 && !confirm("Discard current draft and start a new daily report?")) return;
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(STEP_KEY);
    setReport(defaultReport());
    setSavedReportId(null);
    setEditingExistingId(null);
    setStep(1);
  };

  const newReport = () => {
    startFresh();
    setView("create");
  };

  const editExisting = (full: DailyReport) => {
    setReport(full);
    setEditingExistingId(full.id || null);
    setSavedReportId(null);
    setStep(2);
    setView("create");
  };

  const cancelEditing = () => {
    setEditingExistingId(null);
    setReport(defaultReport());
    setStep(1);
    setView("history");
  };

  return (
    <div style={{ maxWidth: 1100, padding: "8px 4px" }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{ background: "transparent", border: "none", color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "'Jost',sans-serif", marginBottom: 16 }}
        >
          ← Back to ROAS Tools
        </button>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="page-title">Daily Lead Reporting</div>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Track daily Meta spends, fetch lead counts from Google Sheets, and calculate CPL per media buyer.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className={"btn btn-sm " + (view === "create" ? "btn-k" : "btn-g")} onClick={newReport}>+ New Daily Report</button>
          <button className={"btn btn-sm " + (view === "history" ? "btn-k" : "btn-g")} onClick={() => setView("history")}>History</button>
          <button className={"btn btn-sm " + (view === "analytics" ? "btn-k" : "btn-g")} onClick={() => setView("analytics")}>📊 Analytics</button>
        </div>
      </div>

      {view === "history" && (
        <DailyHistoryView
          onNew={newReport}
          onEditReport={editExisting}
          onShowAnalytics={() => setView("analytics")}
        />
      )}
      {view === "analytics" && (
        <DailyAnalyticsView onBack={() => setView("history")} />
      )}
      {view === "create" && (
        <>
          {editingExistingId && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#FBF6E9", border: "1px solid #E8D49A", borderRadius: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#7A5E10" }}>
                <strong>Editing Saved Report</strong> — changes will update the existing report unless you choose "Save as New Copy".
              </div>
              <button className="btn btn-g btn-sm" onClick={cancelEditing}>Cancel Editing</button>
            </div>
          )}
          <Stepper step={step} setStep={(s) => setStep(s)} canGo={() => true} />


          {step === 1 && (
            <Step1Setup
              report={report} setReport={setReport}
              templates={templates} setTemplates={setTemplates}
              showBuilder={showTplBuilder} setShowBuilder={setShowTplBuilder}
              onContinue={() => {
                if (!report.report_date) { toast.error("Please select a report date."); return; }
                if (report.media_buyers.length === 0) {
                  setReport((r) => ({ ...r, media_buyers: [newMediaBuyer()] }));
                }
                setStep(2);
              }}
              onStartFresh={startFresh}
            />
          )}
          {step === 2 && (
            <Step2Buyers
              report={report} setReport={setReport}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3Review
              report={report} setReport={setReport}
              totals={totals}
              saving={saving}
              savedReportId={savedReportId}
              editingExistingId={editingExistingId}
              onBack={() => setStep(2)}
              onSave={async (mode) => {
                const effectiveMode = mode || (editingExistingId ? "update" : "new");
                setSaving(true);
                try {
                  const whatsapp_message = buildWhatsApp(report);
                  const hash = await hashReport(report, user?.id || null);

                  if (effectiveMode === "update" && editingExistingId) {
                    const { error: updErr } = await (supabase as any)
                      .from("daily_lead_reports")
                      .update({
                        report_name: report.report_name,
                        report_date: report.report_date,
                        notes: report.notes || null,
                        metric_template_id: report.metric_template_id || null,
                        total_ad_spend: totals.spend,
                        total_leads: totals.leads,
                        overall_cpl: totals.cpl ?? 0,
                        whatsapp_message,
                        input_hash: hash,
                        report_status: "edited",
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", editingExistingId);
                    if (updErr) throw updErr;
                    const { data: oldMbs } = await (supabase as any)
                      .from("daily_lead_report_media_buyers")
                      .select("id").eq("report_id", editingExistingId);
                    const oldIds = (oldMbs || []).map((x: any) => x.id);
                    if (oldIds.length) {
                      await (supabase as any).from("daily_lead_report_ad_accounts").delete().in("report_media_buyer_id", oldIds);
                      await (supabase as any).from("daily_lead_report_media_buyers").delete().eq("report_id", editingExistingId);
                    }
                    await insertReportChildren(editingExistingId, report, user?.id || null);
                    toast.success("Daily report updated.");
                    setSavedReportId(editingExistingId);
                    setEditingExistingId(null);
                    setStep(4);
                    return;
                  }

                  if (effectiveMode === "new") {
                    const { data: existing } = await (supabase as any)
                      .from("daily_lead_reports")
                      .select("id")
                      .eq("input_hash", hash)
                      .eq("created_by", user?.id || "")
                      .eq("is_deleted", false)
                      .limit(1);
                    if (existing && existing.length) {
                      toast.error("This daily report has already been saved.");
                      setSavedReportId(existing[0].id);
                      setSaving(false);
                      setStep(4);
                      return;
                    }
                  }

                  const { data: inserted, error } = await (supabase as any)
                    .from("daily_lead_reports")
                    .insert({
                      report_name: effectiveMode === "copy" ? `${report.report_name} (Copy)` : report.report_name,
                      report_date: report.report_date,
                      notes: report.notes || null,
                      metric_template_id: report.metric_template_id || null,
                      total_ad_spend: totals.spend,
                      total_leads: totals.leads,
                      overall_cpl: totals.cpl ?? 0,
                      whatsapp_message,
                      input_hash: effectiveMode === "copy" ? hash + "-copy-" + Date.now() : hash,
                      report_status: "saved",
                      created_by: user?.id || null,
                    })
                    .select()
                    .single();
                  if (error || !inserted) throw error || new Error("Failed to save");
                  await insertReportChildren(inserted.id, report, user?.id || null);
                  toast.success(effectiveMode === "copy" ? "Saved as new copy." : "Daily report saved.");
                  setSavedReportId(inserted.id);
                  setEditingExistingId(null);
                  setStep(4);
                } catch (e: any) {
                  toast.error(e?.message || "Failed to save daily report.");
                } finally {
                  setSaving(false);
                }
              }}
              userId={user?.id}
            />
          )}
          {step === 4 && (
            <Step4Saved
              report={report} totals={totals} savedReportId={savedReportId}
              onEdit={() => setStep(3)}
              onNew={() => {
                localStorage.removeItem(DRAFT_KEY);
                localStorage.removeItem(STEP_KEY);
                setReport(defaultReport());
                setSavedReportId(null);
                setStep(1);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

// ============ Stepper ============
function Stepper({ step, setStep }: { step: number; setStep: (s: 1 | 2 | 3 | 4) => void; canGo?: () => boolean }) {
  const steps = ["Setup", "Media Buyers", "Review", "Saved"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, margin: "20px 0 28px" }}>
      {steps.map((label, i) => {
        const num = (i + 1) as 1 | 2 | 3 | 4;
        const isActive = step === num;
        const isDone = step > num;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i === steps.length - 1 ? 0 : 1 }}>
            <button
              onClick={() => setStep(num)}
              style={{
                display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none",
                cursor: "pointer", fontFamily: "'Jost',sans-serif",
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: isActive ? "#0a0a0a" : isDone ? "#C8A84B" : "#F7F6F3",
                color: isActive || isDone ? "#fff" : "#888",
                fontFamily: "'Cormorant Garamond',serif", fontSize: 13, fontWeight: 500,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid " + (isActive ? "#0a0a0a" : isDone ? "#C8A84B" : "#E8E5DE"),
              }}>{num}</div>
              <span style={{ fontSize: 12, color: isActive ? "#0a0a0a" : "#888", fontWeight: isActive ? 500 : 400 }}>{label}</span>
            </button>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: isDone ? "#C8A84B" : "#E8E5DE", margin: "0 12px" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============ Step 1 ============
function Step1Setup({
  report, setReport, templates, setTemplates, showBuilder, setShowBuilder, onContinue, onStartFresh,
}: any) {
  const { user } = useAuth();
  return (
    <div className="step-card" style={{ background: "#fff" }}>
      <div className="step-header">
        <div>
          <div className="step-title">Daily Lead Report Setup</div>
          <div className="step-sub">Choose the date and reporting template for today's media buyer performance report.</div>
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div>
          <label className="fl">Report Date *</label>
          <input
            type="date" className="fi" value={report.report_date}
            onChange={(e) => setReport({ ...report, report_date: e.target.value, report_name: `Daily Lead Report - ${fmtDateLong(e.target.value)}` })}
          />
        </div>
        <div>
          <label className="fl">Report Name</label>
          <input
            className="fi" value={report.report_name}
            onChange={(e) => setReport({ ...report, report_name: e.target.value })}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="fl">Metric Template</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="fsel" style={{ flex: 1, minWidth: 220 }}
            value={report.metric_template_id || ""}
            onChange={(e) => {
              const t = templates.find((x: any) => x.id === e.target.value);
              if (t) setReport({ ...report, metric_template_id: t.id, metric_template_name: t.template_name, metrics: (t.metrics || DEFAULT_BASIC_METRICS) as DailyMetricDef[] });
            }}
          >
            {templates.map((t: any) => (
              <option key={t.id} value={t.id}>{t.template_name}{t.is_default ? " (default)" : ""}</option>
            ))}
          </select>
          <button className="btn btn-g btn-sm" onClick={() => setShowBuilder(!showBuilder)}>
            {showBuilder ? "Close metrics" : "Edit metrics"}
          </button>
        </div>
        <div className="helper" style={{ marginTop: 6 }}>
          {report.metrics.map((m: any) => m.name).join(" · ") || "No metrics."}
        </div>
      </div>

      {showBuilder && (
        <MetricBuilder
          report={report} setReport={setReport}
          templates={templates} setTemplates={setTemplates}
          onSavedTemplate={(t: any) => setTemplates([t, ...templates])}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <label className="fl">Notes</label>
        <textarea
          className="fi" style={{ height: 70, padding: 10, resize: "vertical" }}
          placeholder="Example: Meta dashboard checked at 11:30 AM. Spend entered manually."
          value={report.notes}
          onChange={(e) => setReport({ ...report, notes: e.target.value })}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: "1px solid #E8E5DE" }}>
        <button className="btn btn-g" onClick={onStartFresh}>Start Fresh</button>
        <button className="btn btn-k" onClick={onContinue}>Continue →</button>
      </div>
    </div>
  );
}

function MetricBuilder({ report, setReport, templates, setTemplates, onSavedTemplate }: any) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState<DailyMetricDef["type"]>("number");
  const [agg, setAgg] = useState<NonNullable<DailyMetricDef["aggregation"]>>("display_only");

  const addMetric = () => {
    if (!name.trim()) return;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (report.metrics.some((m: any) => m.key === key)) { toast.error("Metric with this name already exists."); return; }
    const def: DailyMetricDef = {
      key, name: name.trim(), type, aggregation: agg,
      whatsapp: true, exports: true,
    };
    setReport({ ...report, metrics: [...report.metrics, def] });
    setName(""); setType("number"); setAgg("display_only");
  };

  const removeMetric = (key: string) => setReport({ ...report, metrics: report.metrics.filter((m: any) => m.key !== key) });

  const toggle = (key: string, field: "whatsapp" | "exports") => {
    setReport({
      ...report,
      metrics: report.metrics.map((m: any) => m.key === key ? { ...m, [field]: m[field] === false } : m),
    });
  };

  const saveAsTemplate = async () => {
    const tplName = prompt("Template name?");
    if (!tplName) return;
    const { data, error } = await (supabase as any)
      .from("daily_metric_templates")
      .insert({
        template_name: tplName, description: null,
        metrics: report.metrics, created_by: user?.id || null,
      })
      .select().single();
    if (error || !data) { toast.error("Could not save template."); return; }
    onSavedTemplate(data);
    setReport({ ...report, metric_template_id: data.id, metric_template_name: data.template_name });
    toast.success("Template saved.");
  };

  return (
    <div style={{ background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".1em", color: "#888", marginBottom: 10 }}>Metrics in this report</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {report.metrics.map((m: any) => (
          <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E8E5DE", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
            <span style={{ flex: 1, fontWeight: 500 }}>{m.name}</span>
            <span style={{ color: "#888", fontSize: 11 }}>{m.type}</span>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
              <input type="checkbox" checked={m.whatsapp !== false} onChange={() => toggle(m.key, "whatsapp")} /> WA
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
              <input type="checkbox" checked={m.exports !== false} onChange={() => toggle(m.key, "exports")} /> Export
            </label>
            <button className="mb-remove" onClick={() => removeMetric(m.key)}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 150px auto", gap: 8, alignItems: "end" }}>
        <div>
          <label className="fl-sm">Custom metric name</label>
          <input className="fi-sm" placeholder="e.g. Hook Rate" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="fl-sm">Type</label>
          <select className="fi-sm" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="number">Number</option>
            <option value="currency">Currency</option>
            <option value="percentage">Percentage</option>
            <option value="text">Text</option>
          </select>
        </div>
        <div>
          <label className="fl-sm">Aggregation</label>
          <select className="fi-sm" value={agg} onChange={(e) => setAgg(e.target.value as any)}>
            <option value="display_only">Display only</option>
            <option value="sum">Sum</option>
            <option value="average">Average</option>
            <option value="weighted_average">Weighted Avg</option>
          </select>
        </div>
        <button className="btn btn-k btn-sm" onClick={addMetric}>+ Add</button>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-g btn-sm" onClick={saveAsTemplate}>Save as template</button>
      </div>
    </div>
  );
}

// ============ Step 2 ============
function Step2Buyers({ report, setReport, onBack, onNext }: any) {
  const [savedSources, setSavedSources] = useState<any[]>([]);
  const [fetchingAll, setFetchingAll] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("daily_lead_source_mappings")
        .select("*").eq("is_active", true)
        .order("updated_at", { ascending: false });
      setSavedSources(data || []);
    })();
  }, []);

  const updateMb = (id: string, patch: Partial<DailyMediaBuyer>) =>
    setReport({ ...report, media_buyers: report.media_buyers.map((m: DailyMediaBuyer) => m.id === id ? { ...m, ...patch } : m) });

  const removeMb = (id: string) =>
    setReport({ ...report, media_buyers: report.media_buyers.filter((m: DailyMediaBuyer) => m.id !== id) });

  const fetchOne = async (mb: DailyMediaBuyer): Promise<DailyMediaBuyer> => {
    if (!mb.lead_source_url || !mb.tab_name) {
      return { ...mb, status: "needs_review" };
    }
    try {
      const { data, error } = await supabase.functions.invoke("fetch-daily-leads-count", {
        body: {
          sheetUrl: mb.lead_source_url,
          tabName: mb.tab_name,
          sheetId: mb.sheet_id,
          reportDate: report.report_date,
          dateColumn: mb.date_column || "",
          timezone: "Asia/Kolkata",
        },
      });
      if (error || !data || (data as any).error) {
        return { ...mb, status: "failed", fetch_metadata: { error: (data as any)?.error || error?.message } };
      }
      const d = data as any;
      return {
        ...mb,
        total_leads: d.validLeadRows ?? 0,
        lead_count_source: "google_sheet",
        date_column: d.dateColumn || mb.date_column || "",
        spreadsheet_title: d.spreadsheetTitle || mb.spreadsheet_title,
        spreadsheet_id: d.spreadsheetId || mb.spreadsheet_id,
        status: "fetched",
        fetch_metadata: {
          totalRows: d.totalRows, matchingRows: d.matchingRows,
          validLeadRows: d.validLeadRows, sampleRows: d.sampleRows,
          warnings: d.warnings,
        },
      };
    } catch (e: any) {
      return { ...mb, status: "failed", fetch_metadata: { error: e?.message } };
    }
  };

  const fetchAll = async () => {
    setFetchingAll(true);
    const results = [...report.media_buyers];
    for (let i = 0; i < results.length; i++) {
      const mb = results[i];
      if (!mb.media_buyer_name || !mb.lead_source_url || !mb.tab_name) continue;
      toast.message(`Fetching ${i + 1} of ${results.length}…`);
      results[i] = await fetchOne(mb);
    }
    setReport({ ...report, media_buyers: results });
    setFetchingAll(false);
    toast.success("Lead counts updated.");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div className="step-title">Media Buyer Entries</div>
          <div className="step-sub">Add each media buyer, connect their lead source, and enter ad account spend.</div>
        </div>
        <button className="btn btn-g btn-sm" onClick={fetchAll} disabled={fetchingAll}>
          {fetchingAll ? "Fetching…" : "Fetch All Lead Counts"}
        </button>
      </div>

      {report.media_buyers.length === 0 && (
        <div style={{ background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 10, padding: 24, textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, marginBottom: 4 }}>Add your first media buyer</div>
          <div style={{ fontSize: 12, color: "#888" }}>Add a media buyer, connect their lead sheet, and enter daily ad spend.</div>
        </div>
      )}

      {report.media_buyers.map((mb: DailyMediaBuyer, i: number) => (
        <MediaBuyerCard
          key={mb.id} mb={mb} index={i}
          metrics={report.metrics}
          savedSources={savedSources}
          onChange={(patch) => updateMb(mb.id, patch)}
          onRemove={() => removeMb(mb.id)}
          onFetch={async () => {
            const updated = await fetchOne(mb);
            updateMb(mb.id, updated);
          }}
        />
      ))}

      <button className="add-mb-btn" style={{ marginTop: 8 }} onClick={() => setReport({ ...report, media_buyers: [...report.media_buyers, newMediaBuyer()] })}>
        + Add Media Buyer
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: "1px solid #E8E5DE" }}>
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <button className="btn btn-k" onClick={onNext} disabled={report.media_buyers.length === 0}>Continue →</button>
      </div>
    </div>
  );
}

function MediaBuyerCard({
  mb, index, metrics, savedSources, onChange, onRemove, onFetch,
}: {
  mb: DailyMediaBuyer; index: number; metrics: DailyMetricDef[]; savedSources: any[];
  onChange: (patch: Partial<DailyMediaBuyer>) => void;
  onRemove: () => void; onFetch: () => void | Promise<void>;
}) {
  const [detecting, setDetecting] = useState(false);
  const [fetching, setFetching] = useState(false);

  const matchingSaved = savedSources.filter((s) =>
    s.media_buyer_name?.toLowerCase() === mb.media_buyer_name?.toLowerCase());

  const detectTabs = async () => {
    if (!mb.lead_source_url) { toast.error("Paste a Google Sheet URL first."); return; }
    setDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-roas-master-sheet-tabs", {
        body: { masterSheetUrl: mb.lead_source_url },
      });
      if (error || !data || (data as any).error) {
        toast.error((data as any)?.error || error?.message || "Could not detect tabs.");
        return;
      }
      const d = data as any;
      onChange({
        spreadsheet_id: d.spreadsheetId,
        spreadsheet_title: d.spreadsheetTitle,
        available_tabs: (d.tabs || []).map((t: any) => ({
          tabName: t.tabName, sheetId: t.sheetId, headers: t.detectedHeaders || [],
        })),
      });
      toast.success(`Found ${d.tabs?.length || 0} tabs.`);
    } catch (e: any) { toast.error(e?.message || "Failed."); }
    finally { setDetecting(false); }
  };

  const tabHeaders = mb.available_tabs?.find((t) => t.tabName === mb.tab_name)?.headers || [];

  const fetchLeads = async () => {
    setFetching(true);
    try { await onFetch(); } finally { setFetching(false); }
  };

  const updateAdAcc = (id: string, patch: Partial<DailyAdAccount>) =>
    onChange({ ad_accounts: mb.ad_accounts.map((a) => a.id === id ? { ...a, ...patch } : a) });

  return (
    <div className="mb-card" style={{ marginBottom: 14 }}>
      <div className="mb-card-hd">
        <div className="mb-av">{(mb.media_buyer_name || "?").slice(0, 1).toUpperCase()}</div>
        <div>
          <div className="mb-hd-t">{mb.media_buyer_name || `Media Buyer ${index + 1}`}</div>
          <div className="mb-hd-s">
            Status: {mb.status} · Leads: {mb.total_leads}
            {mb.lead_count_source === "manual_override" && " · Manual Override"}
          </div>
        </div>
        <button className="mb-card-x" onClick={onRemove}>✕</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label className="fl-sm">Media Buyer Name</label>
        <QuickSaveInput
          fieldKey="media_buyer_name" placeholder="Select or add media buyer"
          value={mb.media_buyer_name}
          onChange={(v) => {
            // If matching saved source exists, auto-fill
            const m = savedSources.find((s) => s.media_buyer_name?.toLowerCase() === v.toLowerCase());
            const patch: Partial<DailyMediaBuyer> = { media_buyer_name: v };
            if (m && !mb.lead_source_url) {
              patch.lead_source_url = m.sheet_url;
              patch.spreadsheet_id = m.spreadsheet_id;
              patch.spreadsheet_title = m.spreadsheet_title;
              patch.tab_name = m.tab_name;
              patch.sheet_id = m.sheet_id;
              patch.date_column = m.date_column;
            }
            onChange(patch);
          }}
        />
      </div>

      {matchingSaved.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label className="fl-sm">Saved sources for this media buyer</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {matchingSaved.map((s) => (
              <button key={s.id} className="wpill"
                onClick={() => onChange({
                  lead_source_url: s.sheet_url, spreadsheet_id: s.spreadsheet_id,
                  spreadsheet_title: s.spreadsheet_title, tab_name: s.tab_name,
                  sheet_id: s.sheet_id, date_column: s.date_column,
                })}
              >
                {s.spreadsheet_title || s.sheet_url.slice(0, 30)} · {s.tab_name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label className="fl-sm">Lead Source Google Sheet URL</label>
        <input
          className="fi-sm" placeholder="Paste Google Sheet URL"
          value={mb.lead_source_url}
          onChange={(e) => onChange({ lead_source_url: e.target.value, available_tabs: undefined, tab_name: undefined })}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn btn-g btn-sm" onClick={detectTabs} disabled={detecting}>
            {detecting ? "Detecting…" : "Detect Tabs"}
          </button>
          {mb.spreadsheet_title && <span style={{ fontSize: 11, color: "#888", alignSelf: "center" }}>{mb.spreadsheet_title}</span>}
        </div>
      </div>

      {mb.available_tabs && mb.available_tabs.length > 0 && (
        <div className="row-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="fl-sm">Lead Source Tab</label>
            <select className="fi-sm" value={mb.tab_name || ""} onChange={(e) => onChange({ tab_name: e.target.value, sheet_id: mb.available_tabs?.find((t) => t.tabName === e.target.value)?.sheetId, date_column: undefined })}>
              <option value="">— Select tab —</option>
              {mb.available_tabs.map((t) => <option key={t.sheetId} value={t.tabName}>{t.tabName}</option>)}
            </select>
          </div>
          <div>
            <label className="fl-sm">Date Column</label>
            <select className="fi-sm" value={mb.date_column || ""} onChange={(e) => onChange({ date_column: e.target.value })}>
              <option value="">— Auto detect —</option>
              {tabHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button className="btn btn-k btn-sm" onClick={fetchLeads} disabled={fetching || !mb.tab_name}>
          {fetching ? "Fetching…" : "Fetch Leads"}
        </button>
        <div style={{ fontSize: 11, color: "#888" }}>
          {mb.fetch_metadata?.totalRows != null && (
            <>Rows: {mb.fetch_metadata.totalRows} · Matching date: {mb.fetch_metadata.matchingRows} · Valid: {mb.fetch_metadata.validLeadRows}</>
          )}
        </div>
      </div>

      <div className="row-2" style={{ marginBottom: 14 }}>
        <div>
          <label className="fl-sm">Lead Count {mb.lead_count_source === "manual_override" && "(Manual)"}</label>
          <input
            type="number" className="fi-sm"
            value={mb.total_leads || 0}
            onChange={(e) => onChange({ total_leads: parseInt(e.target.value) || 0, lead_count_source: "manual_override" })}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 22 }}>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={mb.save_mapping !== false} onChange={(e) => onChange({ save_mapping: e.target.checked })} />
            Save this source for this media buyer
          </label>
        </div>
      </div>

      {mb.fetch_metadata?.warnings?.length > 0 && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 10, fontSize: 11, color: "#7A5E10", marginBottom: 12 }}>
          {mb.fetch_metadata.warnings.join(" · ")}
        </div>
      )}

      {/* Spend section */}
      <div style={{ borderTop: "1px solid #E8E5DE", paddingTop: 14, marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div className="sl" style={{ marginBottom: 0, paddingBottom: 0, border: "none" }}>Ad Spend</div>
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, color: "#888" }}>
            <input type="checkbox" checked={mb.spend_mode === "combined"} onChange={(e) => onChange({ spend_mode: e.target.checked ? "combined" : "breakdown" })} />
            Enter combined spend only
          </label>
        </div>

        {mb.spend_mode === "combined" ? (
          <div className="row-2" style={{ marginBottom: 8 }}>
            <div>
              <label className="fl-sm">Total Ad Spend</label>
              <input type="number" className="fi-sm" placeholder="0"
                value={mb.combined_spend ?? ""}
                onChange={(e) => onChange({ combined_spend: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        ) : (
          <>
            {mb.ad_accounts.map((a, i) => (
              <div key={a.id} style={{ background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div className="row-2" style={{ marginBottom: 8 }}>
                  <div>
                    <label className="fl-sm">Ad Account Name</label>
                    <QuickSaveInput
                      fieldKey="ad_account_name" placeholder="Select or add ad account"
                      value={a.ad_account_name}
                      onChange={(v) => updateAdAcc(a.id, { ad_account_name: v })}
                    />
                  </div>
                  <div>
                    <label className="fl-sm">Ad Spend (₹)</label>
                    <input type="number" className="fi-sm" placeholder="0"
                      value={a.ad_spend || ""}
                      onChange={(e) => updateAdAcc(a.id, { ad_spend: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                  {metrics.map((def) => (
                    <div key={def.key}>
                      <label className="fl-sm">{def.name}</label>
                      <input className="fi-sm" type={def.type === "text" ? "text" : "number"} placeholder=""
                        value={a.metrics?.[def.key] ?? ""}
                        onChange={(e) => updateAdAcc(a.id, { metrics: { ...a.metrics, [def.key]: e.target.value } })}
                      />
                    </div>
                  ))}
                </div>
                {mb.ad_accounts.length > 1 && (
                  <div style={{ textAlign: "right", marginTop: 6 }}>
                    <button className="mb-remove" onClick={() => onChange({ ad_accounts: mb.ad_accounts.filter((x) => x.id !== a.id) })}>Remove ad account</button>
                  </div>
                )}
              </div>
            ))}
            <button className="add-mb-btn" style={{ padding: "8px 12px", fontSize: 12 }}
              onClick={() => onChange({ ad_accounts: [...mb.ad_accounts, newAdAccount()] })}>
              + Add Ad Account
            </button>
          </>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: "#888", textAlign: "right" }}>
          Total Spend: <strong style={{ color: "#0a0a0a" }}>{inr(calcMediaBuyerSpend(mb))}</strong>
          {" · "}CPL: <strong style={{ color: "#0a0a0a" }}>{calcCpl(calcMediaBuyerSpend(mb), mb.total_leads) == null ? "—" : inr(calcCpl(calcMediaBuyerSpend(mb), mb.total_leads)!)}</strong>
        </div>
        {mb.total_leads === 0 && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 10, fontSize: 11, color: "#7A5E10", marginTop: 10 }}>
            No leads found for this date. CPL cannot be calculated.
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Step 3 ============
function Step3Review({ report, totals, saving, savedReportId, editingExistingId, onBack, onSave }: any) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div className="step-title">Review & Calculate</div>
        <div className="step-sub">Review spends, fetched leads, and calculated CPL before saving.</div>
      </div>

      <div className="sum-row">
        <div className="sum-card plain"><div className="sum-lbl">Total Ad Spend</div><div className="sum-val">{inr(totals.spend)}</div></div>
        <div className="sum-card plain"><div className="sum-lbl">Total Leads</div><div className="sum-val">{fmtNum(totals.leads)}</div></div>
        <div className="sum-card gold"><div className="sum-lbl">Overall CPL</div><div className="sum-val">{totals.cpl == null ? "—" : inr(totals.cpl)}</div></div>
        <div className="sum-card plain"><div className="sum-lbl">Media Buyers</div><div className="sum-val">{report.media_buyers.length}</div></div>
      </div>

      <table className="attr-table">
        <thead>
          <tr>
            <th>Media Buyer</th><th>Ad Accounts</th><th>Ad Spend</th><th>Leads</th><th>CPL</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {report.media_buyers.map((mb: DailyMediaBuyer) => {
            const spend = calcMediaBuyerSpend(mb);
            const cpl = calcCpl(spend, mb.total_leads);
            return (
              <tr key={mb.id}>
                <td className="mb-name-cell">{mb.media_buyer_name || "(unnamed)"}</td>
                <td>{mb.spend_mode === "combined" ? "(combined)" : mb.ad_accounts.map((a: any) => a.ad_account_name).filter(Boolean).join(", ") || "—"}</td>
                <td>{inr(spend)}</td>
                <td>{fmtNum(mb.total_leads)}</td>
                <td>{cpl == null ? "—" : inr(cpl)}</td>
                <td><span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#F7F6F3", border: "1px solid #E8E5DE" }}>{mb.status}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ExportRow report={report} />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: "1px solid #E8E5DE", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-g" onClick={onBack}>← Back</button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {editingExistingId ? (
            <>
              <button className="btn btn-g" onClick={() => onSave("copy")} disabled={saving}>Save as New Copy</button>
              <button className="btn btn-k" onClick={() => onSave("update")} disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </>
          ) : (
            <button className="btn btn-k" onClick={() => onSave("new")} disabled={saving || !!savedReportId}>
              {saving ? "Saving…" : savedReportId ? "Saved ✓" : "Save Daily Report"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportRow({ report }: { report: DailyReport }) {
  const [preview, setPreview] = useState(false);
  const wa = useMemo(() => buildWhatsApp(report), [report]);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <ExportMenu
          includeWhatsapp
          align="left"
          onSelect={(action) => runExportAction(action, report)}
        />
        <button className="btn btn-g btn-sm" onClick={() => setPreview(!preview)}>
          {preview ? "Hide preview" : "Preview WhatsApp"}
        </button>
      </div>
      {preview && (
        <pre style={{ marginTop: 12, background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 8, padding: 14, whiteSpace: "pre-wrap", fontFamily: "'Jost',sans-serif", fontSize: 12, lineHeight: 1.6 }}>{wa}</pre>
      )}
    </div>
  );
}

// ============ Step 4 ============
function Step4Saved({ report, totals, savedReportId, onEdit, onNew }: any) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div className="step-title">Daily Lead Report Saved</div>
        <div className="step-sub">Your report is saved. Export it or copy the WhatsApp summary.</div>
      </div>

      <div className="sum-row">
        <div className="sum-card plain"><div className="sum-lbl">Report Date</div><div className="sum-val" style={{ fontSize: 22 }}>{fmtDateLong(report.report_date)}</div></div>
        <div className="sum-card plain"><div className="sum-lbl">Total Ad Spend</div><div className="sum-val">{inr(totals.spend)}</div></div>
        <div className="sum-card plain"><div className="sum-lbl">Total Leads</div><div className="sum-val">{fmtNum(totals.leads)}</div></div>
        <div className="sum-card gold"><div className="sum-lbl">Overall CPL</div><div className="sum-val">{totals.cpl == null ? "—" : inr(totals.cpl)}</div></div>
      </div>

      <ExportRow report={report} />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: "1px solid #E8E5DE" }}>
        <button className="btn btn-g" onClick={onEdit}>Edit report</button>
        <button className="btn btn-k" onClick={onNew}>Start new daily report</button>
      </div>
    </div>
  );
}

// ============ History ============
function DailyReportsHistory() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [viewing, setViewing] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("daily_lead_reports")
        .select("*")
        .eq("is_deleted", false)
        .order("report_date", { ascending: false })
        .limit(200);
      setRows(data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    if (search && !(r.report_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (from && r.report_date < from) return false;
    if (to && r.report_date > to) return false;
    return true;
  });

  const loadFull = async (reportId: string): Promise<DailyReport | null> => {
    const { data: r } = await (supabase as any).from("daily_lead_reports").select("*").eq("id", reportId).single();
    if (!r) return null;
    const { data: mbs } = await (supabase as any).from("daily_lead_report_media_buyers").select("*").eq("report_id", reportId);
    const mbList: DailyMediaBuyer[] = [];
    for (const mb of (mbs || [])) {
      const { data: aas } = await (supabase as any).from("daily_lead_report_ad_accounts").select("*").eq("report_media_buyer_id", mb.id);
      const ads = aas || [];
      mbList.push({
        id: mb.id, media_buyer_name: mb.media_buyer_name,
        spend_mode: ads.length === 1 && ads[0].ad_account_name === "(combined)" ? "combined" : "breakdown",
        combined_spend: ads.length === 1 && ads[0].ad_account_name === "(combined)" ? Number(ads[0].ad_spend) : undefined,
        combined_metrics: ads.length === 1 && ads[0].ad_account_name === "(combined)" ? (ads[0].metrics || {}) : undefined,
        ad_accounts: ads.map((a: any) => ({ id: a.id, ad_account_name: a.ad_account_name, ad_spend: Number(a.ad_spend), metrics: a.metrics || {} })),
        lead_source_url: mb.lead_source_url || "", spreadsheet_id: mb.spreadsheet_id, spreadsheet_title: mb.spreadsheet_title,
        tab_name: mb.tab_name, sheet_id: mb.sheet_id, date_column: mb.date_column,
        total_leads: mb.total_leads, lead_count_source: mb.lead_count_source,
        status: mb.status, fetch_metadata: mb.fetch_metadata,
      });
    }
    return {
      id: r.id, report_name: r.report_name || "", report_date: r.report_date, notes: r.notes || "",
      metric_template_id: r.metric_template_id,
      metrics: DEFAULT_BASIC_METRICS,
      media_buyers: mbList,
    };
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "end" }}>
        <div><label className="fl-sm">Search</label><input className="fi-sm" placeholder="Report name…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div><label className="fl-sm">From</label><input type="date" className="fi-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="fl-sm">To</label><input type="date" className="fi-sm" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {loading ? <div style={{ color: "#888" }}>Loading…</div> :
        filtered.length === 0 ? (
          <div style={{ background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 10, padding: 24, textAlign: "center" }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18 }}>No daily reports saved yet</div>
            <div style={{ fontSize: 12, color: "#888" }}>Saved daily lead reports will appear here.</div>
          </div>
        ) : (
          <table className="attr-table">
            <thead>
              <tr>
                <th>Created</th><th>Report Date</th><th>Name</th><th>Spend</th><th>Leads</th><th>CPL</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 11, color: "#888" }}>{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                  <td>{fmtDateLong(r.report_date)}</td>
                  <td>{r.report_name}</td>
                  <td>{inr(Number(r.total_ad_spend))}</td>
                  <td>{fmtNum(r.total_leads)}</td>
                  <td>{r.overall_cpl ? inr(Number(r.overall_cpl)) : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button className="btn btn-g btn-sm" onClick={async () => { const full = await loadFull(r.id); if (full) setViewing(full); }}>View</button>
                      <button className="btn btn-g btn-sm" onClick={async () => { const full = await loadFull(r.id); if (full) downloadFile(`daily-lead-report-${full.report_date}.csv`, buildCsv(full), "text/csv"); }}>CSV</button>
                      <button className="btn btn-g btn-sm" onClick={async () => { const full = await loadFull(r.id); if (full) buildAndDownloadPdf(full); }}>PDF</button>
                      <button className="btn btn-g btn-sm" onClick={async () => {
                        const full = await loadFull(r.id);
                        if (!full) return;
                        try { await navigator.clipboard.writeText(buildWhatsApp(full)); toast.success("Copied."); }
                        catch { toast.error("Copy failed."); }
                      }}>WhatsApp</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      {viewing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 50, display: "flex", justifyContent: "center", alignItems: "center" }} onClick={() => setViewing(null)}>
          <div style={{ background: "#fff", maxWidth: 700, width: "92%", maxHeight: "85vh", overflowY: "auto", borderRadius: 12, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22 }}>{viewing.report_name}</div>
              <button className="mb-card-x" onClick={() => setViewing(null)}>✕</button>
            </div>
            <pre style={{ background: "#F7F6F3", border: "1px solid #E8E5DE", borderRadius: 8, padding: 14, whiteSpace: "pre-wrap", fontFamily: "'Jost',sans-serif", fontSize: 12 }}>{buildWhatsApp(viewing)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
