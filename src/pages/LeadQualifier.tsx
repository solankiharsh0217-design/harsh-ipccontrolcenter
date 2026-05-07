import { useRef, useState, useMemo } from "react";
import { PageHead } from "@/components/ui-bits";
import {
  parseZoomCsv, parseRegistrationAndZoom, detectFileColumns,
  leadsToCsv, downloadCsv,
  type QualifierResult, type MergedLead, type DetectedColumns,
} from "@/lib/qualifier";
import { GRADE_STYLES } from "@/lib/crmTypes";
import { Upload, FileCheck2, Download, Send, BarChart3, Target, Check, AlertTriangle } from "lucide-react";
import SendToCrmModal from "@/components/SendToCrmModal";
import { toast } from "sonner";

type Mode = 1 | 2;
type Tab = "hot" | "warm" | "cold" | "non-attendee" | "true-absentee";

interface FileSlot {
  file: File | null;
  text: string;
  detection: DetectedColumns | null;
  rowCount: number;
}

const emptySlot = (): FileSlot => ({ file: null, text: "", detection: null, rowCount: 0 });

function DetectionPanel({ d }: { d: DetectedColumns }) {
  const items: { key: "name" | "email" | "phone"; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
  ];
  return (
    <div className="mt-3">
      <div className="uppercase-label !text-[10px] mb-2">Auto-detected columns — verify before analysing</div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => {
          const found = !!d[it.key].header;
          return (
            <div key={it.key} className="p-2.5 rounded-lg border flex items-start gap-2"
                 style={{ background: found ? "#F0FDF4" : "#FFFBEB",
                          borderColor: found ? "#BBF7D0" : "#FDE68A" }}>
              {found ? <Check className="w-3.5 h-3.5 mt-0.5" style={{ color: "#16A34A" }} />
                     : <AlertTriangle className="w-3.5 h-3.5 mt-0.5" style={{ color: "#CA8A04" }} />}
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
                <div className="text-xs font-medium truncate">{found ? d[it.key].header : "Not detected — best guess"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UploadZone({
  slot, label, sub, onFile,
}: { slot: FileSlot; label: string; sub: string; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = !!slot.file && !!slot.detection;
  return (
    <div>
      <div className="uppercase-label !text-[10px] mb-2">{label}</div>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        className="border-2 rounded-xl p-6 text-center cursor-pointer transition-colors"
        style={done
          ? { borderStyle: "solid", borderColor: "#C8A84B", background: "#FBF6E9" }
          : { borderStyle: "dashed", borderColor: "#E8E5DE", background: "#fff" }}
      >
        {done ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <FileCheck2 className="w-5 h-5 text-[#C8A84B]" />
            <div className="text-left">
              <div className="font-serif text-base">{slot.file!.name}</div>
              <div className="text-xs text-muted-foreground">{Math.round(slot.file!.size / 1024)} KB · {slot.rowCount} rows</div>
            </div>
          </div>
        ) : (
          <>
            <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
            <div className="font-serif text-base">{label}</div>
            <div className="text-xs text-muted-foreground mt-1">{sub}</div>
          </>
        )}
        <input ref={ref} type="file" accept=".csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </div>
      {slot.detection && <DetectionPanel d={slot.detection} />}
    </div>
  );
}

export default function LeadQualifier() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [zoomSlot, setZoomSlot] = useState<FileSlot>(emptySlot());
  const [regSlot, setRegSlot] = useState<FileSlot>(emptySlot());
  const [result, setResult] = useState<QualifierResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tab, setTab] = useState<Tab>("hot");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const handleFile = async (kind: "zoom" | "reg", f: File) => {
    const text = await f.text();
    const { detection, rowCount } = detectFileColumns(text);
    const slot: FileSlot = { file: f, text, detection, rowCount };
    if (kind === "zoom") setZoomSlot(slot); else setRegSlot(slot);
  };

  const canAnalyze = mode === 1 ? !!zoomSlot.file : (!!zoomSlot.file && !!regSlot.file);

  const runAnalysis = async () => {
    if (!mode || !canAnalyze) return;
    setBusy(true);
    setProgress(0);
    const stages = ["Reading files…","Matching emails…","Calculating attendance…","Classifying leads…","Preparing report…"];
    for (let i = 0; i < stages.length; i++) {
      setProgress(((i + 1) / stages.length) * 100);
      await new Promise((r) => setTimeout(r, 140));
    }
    try {
      const r = mode === 1
        ? parseZoomCsv(zoomSlot.text, zoomSlot.file!.name)
        : parseRegistrationAndZoom(regSlot.text, zoomSlot.text, regSlot.file!.name, zoomSlot.file!.name);
      setResult(r);
      setTab("hot");
      toast.success(`Parsed ${r.leads.length} unique leads`);
    } catch (e: any) {
      toast.error(e.message || "Parse failed");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null); setZoomSlot(emptySlot()); setRegSlot(emptySlot()); setMode(null);
  };

  const counts = useMemo(() => {
    if (!result) return { total: 0, hot: 0, warm: 0, cold: 0, na: 0, ta: 0, avgMin: 0, showRate: 0, top: null as MergedLead | null };
    let hot = 0, warm = 0, cold = 0, na = 0, ta = 0, totMin = 0, attended = 0;
    let top: MergedLead | null = null;
    for (const l of result.leads) {
      if (l.grade === "hot") hot++;
      else if (l.grade === "warm") warm++;
      else if (l.grade === "cold") cold++;
      else if (l.grade === "true-absentee") ta++;
      else na++;
      totMin += l.totalMinutes;
      if (l.attended) attended++;
      if (!top || l.totalMinutes > top.totalMinutes) top = l;
    }
    return {
      total: result.leads.length, hot, warm, cold, na, ta,
      avgMin: result.leads.length ? Math.round(totMin / result.leads.length) : 0,
      showRate: result.leads.length ? Math.round((attended / result.leads.length) * 100) : 0,
      top,
    };
  }, [result]);

  const filtered = useMemo(() => {
    if (!result) return [];
    const list = result.leads.filter((l) => {
      if (tab === "true-absentee") return l.grade === "true-absentee";
      if (tab === "non-attendee") return l.grade === "non-attendee" || l.grade === "very-cold";
      return l.grade === tab;
    });
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((l) => l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || l.phone.toLowerCase().includes(q));
  }, [result, tab, search]);

  const exportSet = (kind: "all" | Tab) => {
    if (!result) return;
    const list = kind === "all" ? result.leads : result.leads.filter((l) => {
      if (kind === "true-absentee") return l.grade === "true-absentee";
      if (kind === "non-attendee") return l.grade === "non-attendee" || l.grade === "very-cold";
      return l.grade === kind;
    });
    downloadCsv(`leads-${kind}-${Date.now()}.csv`, leadsToCsv(list));
  };

  // ───── MODE SELECTION + UPLOAD ─────
  if (!result) {
    return (
      <div>
        <PageHead title="Lead Qualifier" sub="Choose a mode, upload your file(s), then analyse." />

        <div className="grid grid-cols-2 gap-4 max-w-4xl">
          {/* Mode 1 */}
          <button
            type="button"
            onClick={() => setMode(1)}
            className="text-left p-6 rounded-xl border-2 transition-colors"
            style={mode === 1 ? { borderColor: "#C8A84B", background: "#FBF6E9" } : { borderColor: "#E8E5DE", background: "#fff" }}
          >
            <BarChart3 className="w-6 h-6 mb-3" />
            <div className="font-serif text-xl mb-1">Attendee Analysis</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Upload only the Zoom Attendee Report. Classifies attendees into Hot, Warm, Cold and Non-Attendee by attendance time.
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {["Hot","Warm","Cold","Non-Attendee"].map((t) => (
                <span key={t} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-off border border-line">{t}</span>
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground mt-3">1 file required · Quick mode</div>
          </button>

          {/* Mode 2 */}
          <button
            type="button"
            onClick={() => setMode(2)}
            className="relative text-left p-6 rounded-xl border-2 transition-colors"
            style={mode === 2 || mode === null ? { borderColor: "#C8A84B", background: "#FBF6E9" } : { borderColor: "#E8E5DE", background: "#fff" }}
          >
            <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: "#C8A84B", color: "#0a0a0a" }}>Recommended</span>
            <Target className="w-6 h-6 mb-3" />
            <div className="font-serif text-xl mb-1">True Absentee Finder</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Upload Registration Sheet + Zoom Attendee Report. System cross-matches both. Finds everyone who registered but truly never appeared in Zoom — filling the accuracy gap Zoom's own report misses.
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {["Hot","Warm","Cold","True Absentees"].map((t) => (
                <span key={t} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white border border-[#E8D49A]">{t}</span>
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground mt-3">2 files required · Full accuracy</div>
          </button>
        </div>

        {/* Upload zones */}
        {(mode === 1 || mode === null) && mode === 1 && (
          <div className="mt-8 max-w-3xl">
            <UploadZone
              slot={zoomSlot}
              label="Zoom Attendee Report"
              sub="Drag and drop your Zoom CSV — any format, auto-detected"
              onFile={(f) => handleFile("zoom", f)}
            />
          </div>
        )}

        {mode === 2 && (
          <div className="mt-8 space-y-4 max-w-5xl">
            <div className="grid grid-cols-2 gap-4">
              <UploadZone
                slot={regSlot}
                label="File 1 — Registration Sheet"
                sub="Your Google Sheet export or any CSV with registrant names, emails, and phones."
                onFile={(f) => handleFile("reg", f)}
              />
              <UploadZone
                slot={zoomSlot}
                label="File 2 — Zoom Attendee Report"
                sub="The standard Zoom Webinar Attendee Report CSV exported from your Zoom account."
                onFile={(f) => handleFile("zoom", f)}
              />
            </div>
            <div className="p-4 rounded-xl text-xs leading-relaxed" style={{ background: "#FBF6E9", border: "1px solid #E8D49A", color: "#7A5E10" }}>
              🎯 <strong>How True Absentee Finder works:</strong> The system matches both files by email. Anyone in your Registration Sheet who does not appear in the Zoom Attendee Report is a <strong>True Absentee</strong> — they registered but never joined. They deserve a specific follow-up call.
            </div>
          </div>
        )}

        {mode && (
          <div className="mt-6 flex items-center gap-3">
            <button onClick={runAnalysis} disabled={!canAnalyze || busy} className="ipc-btn ipc-btn-black disabled:opacity-50">
              {busy ? "Analysing…" : "Analyse leads"}
            </button>
            <button onClick={reset} className="ipc-btn ipc-btn-ghost">Reset</button>
            {busy && (
              <div className="flex-1 max-w-xs h-1.5 bg-off rounded-full overflow-hidden">
                <div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ───── RESULTS ─────
  const isMode2 = result.mode === 2;

  return (
    <div>
      <PageHead title="Lead Qualifier" sub={isMode2 ? "True Absentee Finder · cross-matched results" : "Attendee Analysis · Zoom-only results"} />

      {/* Sticky top action bar — always visible while reviewing leads */}
      <div className="sticky top-0 z-30 -mx-10 px-10 py-3 mb-4 bg-white/95 backdrop-blur border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground">
          <span className="font-serif text-base text-foreground mr-2">{result.webinarName}</span>
          {counts.total} leads · <span style={{ color: GRADE_STYLES.hot.fg }}>{counts.hot} Hot</span> · <span style={{ color: GRADE_STYLES.warm.fg }}>{counts.warm} Warm</span> · <span style={{ color: GRADE_STYLES.cold.fg }}>{counts.cold} Cold</span>{isMode2 ? ` · ${counts.ta} True Absentees` : ` · ${counts.na} No Show`}
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportSet("all")} className="ipc-btn ipc-btn-ghost !h-9">Download CSV</button>
          <button onClick={() => setShowModal(true)} className="ipc-btn !h-9" style={{ background: "#C8A84B", color: "#0a0a0a" }}>
            <Send className="w-3.5 h-3.5" /> Send to CRM →
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="p-5 rounded-xl border border-line">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-serif text-xl">{result.webinarName}</div>
              <div className="font-sans text-xs text-muted-foreground mt-1">
                {result.webinarDate || "—"} · Duration {result.durationMin} min · Registrants {result.registrants || "—"} · Mode {result.mode}
              </div>
            </div>
            <button onClick={reset} className="ipc-btn ipc-btn-ghost">Upload another</button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { k: "Total", v: counts.total },
            { k: "Hot", v: counts.hot, c: GRADE_STYLES.hot },
            { k: "Warm", v: counts.warm, c: GRADE_STYLES.warm },
            { k: "Cold", v: counts.cold, c: GRADE_STYLES.cold },
            isMode2
              ? { k: "True Absentees", v: counts.ta, c: GRADE_STYLES["true-absentee"] }
              : { k: "Non-Attendees", v: counts.na, c: GRADE_STYLES["non-attendee"] },
          ].map((s) => {
            const c = (s as any).c;
            const isTA = s.k === "True Absentees";
            return (
              <div key={s.k} className="p-4 rounded-xl border"
                   style={isTA ? { background: "#FFF7ED", borderColor: "#FED7AA" } : { borderColor: "#E8E5DE" }}>
                <div className="uppercase-label">{s.k}</div>
                <div className="font-serif text-3xl mt-1" style={{ color: c?.fg || "#0a0a0a" }}>{s.v}</div>
              </div>
            );
          })}
        </div>

        {/* Insights */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border border-line"><div className="uppercase-label">Avg time in session</div><div className="font-serif text-2xl mt-1">{counts.avgMin} min</div></div>
          <div className="p-4 rounded-xl border border-line"><div className="uppercase-label">Show-up rate</div><div className="font-serif text-2xl mt-1">{counts.showRate}%</div></div>
          <div className="p-4 rounded-xl border border-line"><div className="uppercase-label">Top attendee</div><div className="font-serif text-base mt-1 truncate">{counts.top?.name || "—"}</div><div className="font-sans text-xs text-muted-foreground">{counts.top?.totalMinutes || 0} min</div></div>
        </div>

        {/* Export bar */}
        <div className="p-4 rounded-xl flex items-center gap-2 flex-wrap" style={{ background: "#FBF6E9", border: "1px solid #E8D49A" }}>
          <Download className="w-4 h-4 text-[hsl(var(--gold-deep))]" />
          <span className="font-sans text-xs uppercase tracking-wider text-[hsl(var(--gold-deep))] mr-2">Export</span>
          {(["all","hot","warm","cold", isMode2 ? "true-absentee" : "non-attendee"] as const).map((k) => (
            <button key={k} onClick={() => exportSet(k as any)} className="ipc-btn ipc-btn-ghost !h-9 !px-3 !text-xs capitalize">{String(k).replace("-"," ")}</button>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b border-line flex gap-6">
          {(["hot","warm","cold", isMode2 ? "true-absentee" : "non-attendee"] as Tab[]).map((t) => {
            const c = GRADE_STYLES[t];
            const n = t === "hot" ? counts.hot : t === "warm" ? counts.warm : t === "cold" ? counts.cold : t === "true-absentee" ? counts.ta : counts.na;
            return (
              <button key={t} onClick={() => setTab(t)} className={`py-2.5 font-sans text-xs uppercase tracking-wider border-b-2 transition-colors ${tab === t ? "border-black text-black" : "border-transparent text-muted-foreground hover:text-black"}`}>
                <span style={{ color: c.fg }}>●</span> {c.label} <span className="text-muted-foreground">({n})</span>
              </button>
            );
          })}
        </div>

        <input type="text" placeholder="Search by name, email, phone…" className="ipc-input max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} />

        {/* Table */}
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full font-sans text-sm">
            <thead className="bg-off">
              <tr className="text-left">
                {(tab === "true-absentee" || tab === "non-attendee")
                  ? ["Registrant","Phone","Email","Source","Grade"].map((h) => <th key={h} className="px-4 py-2.5 uppercase-label !text-[10px]">{h}</th>)
                  : ["Attendee","Phone","Total","% of session","Sessions","First joined","Grade"].map((h) => <th key={h} className="px-4 py-2.5 uppercase-label !text-[10px]">{h}</th>)
                }
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No leads in this category.</td></tr>}
              {filtered.slice(0, 500).map((l) => {
                const g = GRADE_STYLES[l.grade as keyof typeof GRADE_STYLES];
                if (tab === "true-absentee" || tab === "non-attendee") {
                  return (
                    <tr key={l.email} className="border-t border-line">
                      <td className="px-4 py-3 font-serif">{l.name}</td>
                      <td className="px-4 py-3 text-xs">{l.phone || "—"}</td>
                      <td className="px-4 py-3 text-xs">{l.email}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{l.source}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider" style={{ background: g.bg, color: g.fg, border: `1px solid ${g.border}` }}>{g.label}</span>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={l.email} className="border-t border-line">
                    <td className="px-4 py-3">
                      <div className="font-serif text-sm">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{l.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{l.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs">{l.totalMinutes} min</div>
                      <div className="h-1 bg-off rounded-full mt-1 w-20 overflow-hidden"><div className="h-full bg-gold" style={{ width: `${Math.min(100, l.attendancePct)}%` }} /></div>
                    </td>
                    <td className="px-4 py-3 text-xs">{l.attendancePct}%</td>
                    <td className="px-4 py-3 text-xs">{l.sessions}</td>
                    <td className="px-4 py-3 text-xs">{l.firstJoin || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider" style={{ background: g.bg, color: g.fg, border: `1px solid ${g.border}` }}>{g.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 500 && <div className="text-xs text-muted-foreground">Showing first 500 — narrow with search.</div>}

        {/* Send to CRM bar */}
        <div className="rounded-xl p-5 flex items-center justify-between gap-4" style={{ background: "#0a0a0a", color: "#fff" }}>
          <div>
            <div className="font-serif text-lg">Ready to send to Calling CRM</div>
            <div className="text-xs opacity-70 mt-1">
              {counts.total} leads ready — {counts.hot} Hot · {counts.warm} Warm · {counts.cold} Cold{isMode2 ? ` · ${counts.ta} True Absentees` : ` · ${counts.na} No Show`}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportSet("all")} className="ipc-btn ipc-btn-ghost">Download CSV first</button>
            <button onClick={() => setShowModal(true)} className="ipc-btn" style={{ background: "#C8A84B", color: "#0a0a0a" }}>
              <Send className="w-3.5 h-3.5" /> Send to CRM →
            </button>
          </div>
        </div>
      </div>

      {showModal && result && <SendToCrmModal result={result} onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); toast.success("Leads imported into CRM"); }} />}
    </div>
  );
}
