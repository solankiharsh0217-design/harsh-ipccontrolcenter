import { useRef, useState, useMemo } from "react";
import { PageHead } from "@/components/ui-bits";
import { parseZoomCsv, leadsToCsv, downloadCsv, type QualifierResult, type MergedLead } from "@/lib/qualifier";
import { GRADE_STYLES } from "@/lib/crmTypes";
import { Upload, FileCheck2, Download, Send } from "lucide-react";
import SendToCrmModal from "@/components/SendToCrmModal";
import { toast } from "sonner";

type Tab = "hot" | "warm" | "cold" | "non-attendee";

export default function LeadQualifier() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<QualifierResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tab, setTab] = useState<Tab>("hot");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setFile(f);
    setResult(null);
    setBusy(true);
    setProgress(0);
    const stages = ["Reading attendee records…","Merging duplicate entries…","Calculating attendance…","Classifying leads…","Preparing reports…"];
    const text = await f.text();
    for (let i = 0; i < stages.length; i++) {
      setProgress(((i + 1) / stages.length) * 100);
      await new Promise((r) => setTimeout(r, 180));
    }
    try {
      const r = parseZoomCsv(text);
      setResult(r);
      toast.success(`Parsed ${r.leads.length} unique attendees`);
    } catch (e: any) {
      toast.error(e.message || "Parse failed");
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    if (!result) return { total: 0, hot: 0, warm: 0, cold: 0, na: 0, avgMin: 0, showRate: 0, top: null as MergedLead | null };
    let hot = 0, warm = 0, cold = 0, na = 0, totMin = 0, attended = 0;
    let top: MergedLead | null = null;
    for (const l of result.leads) {
      if (l.grade === "hot") hot++;
      else if (l.grade === "warm") warm++;
      else if (l.grade === "cold") cold++;
      else na++;
      totMin += l.totalMinutes;
      if (l.attended) attended++;
      if (!top || l.totalMinutes > top.totalMinutes) top = l;
    }
    return { total: result.leads.length, hot, warm, cold, na, avgMin: result.leads.length ? Math.round(totMin / result.leads.length) : 0, showRate: result.leads.length ? Math.round((attended / result.leads.length) * 100) : 0, top };
  }, [result]);

  const filtered = useMemo(() => {
    if (!result) return [];
    const list = result.leads.filter((l) => {
      if (tab === "non-attendee") return l.grade === "non-attendee" || l.grade === "very-cold";
      return l.grade === tab;
    });
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((l) => l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || l.phone.toLowerCase().includes(q));
  }, [result, tab, search]);

  const exportSet = (kind: "all" | Tab) => {
    if (!result) return;
    const list = kind === "all" ? result.leads : result.leads.filter((l) => kind === "non-attendee" ? (l.grade === "non-attendee" || l.grade === "very-cold") : l.grade === kind);
    downloadCsv(`leads-${kind}-${Date.now()}.csv`, leadsToCsv(list));
  };

  return (
    <div>
      <PageHead title="Lead Qualifier" sub="Upload Zoom webinar attendee report — auto-classify leads." />

      {!result && (
        <div className="max-w-3xl">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-line rounded-xl p-12 text-center cursor-pointer hover:border-gold transition-colors bg-white"
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-serif text-lg">Drop Zoom Attendee Report CSV here</div>
            <div className="font-sans text-xs text-muted-foreground mt-1">or click to browse</div>
            <input ref={inputRef} type="file" accept=".csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
          {file && busy && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-2"><FileCheck2 className="w-4 h-4 text-gold" /><span className="font-sans text-sm">{file.name}</span></div>
              <div className="h-1.5 bg-off rounded-full overflow-hidden"><div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Session header */}
          <div className="p-5 rounded-xl border border-line">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-serif text-xl">{result.webinarName}</div>
                <div className="font-sans text-xs text-muted-foreground mt-1">
                  {result.webinarDate || "—"} · Duration {result.durationMin} min · Registrants {result.registrants || "—"}
                </div>
              </div>
              <button onClick={() => { setResult(null); setFile(null); }} className="ipc-btn ipc-btn-ghost">Upload another</button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { k: "Total", v: counts.total, c: undefined },
              { k: "Hot", v: counts.hot, c: GRADE_STYLES.hot },
              { k: "Warm", v: counts.warm, c: GRADE_STYLES.warm },
              { k: "Cold", v: counts.cold, c: GRADE_STYLES.cold },
              { k: "No Show", v: counts.na, c: GRADE_STYLES["non-attendee"] },
            ].map((s) => (
              <div key={s.k} className="p-4 rounded-xl border border-line">
                <div className="uppercase-label">{s.k}</div>
                <div className="font-serif text-3xl mt-1" style={{ color: (s as any).c?.fg || "#0a0a0a" }}>{s.v}</div>
              </div>
            ))}
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
            {(["all","hot","warm","cold","non-attendee"] as const).map((k) => (
              <button key={k} onClick={() => exportSet(k)} className="ipc-btn ipc-btn-ghost !h-9 !px-3 !text-xs capitalize">{k.replace("-"," ")}</button>
            ))}
            <div className="ml-auto">
              <button onClick={() => setShowModal(true)} className="ipc-btn ipc-btn-black !h-10"><Send className="w-3.5 h-3.5" /> Send to CRM</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-line flex gap-6">
            {(["hot","warm","cold","non-attendee"] as Tab[]).map((t) => {
              const c = GRADE_STYLES[t];
              const n = t === "hot" ? counts.hot : t === "warm" ? counts.warm : t === "cold" ? counts.cold : counts.na;
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
                  {["Name","Phone","Total","% of session","Sessions","First joined","Grade"].map((h) => (
                    <th key={h} className="px-4 py-2.5 uppercase-label !text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No leads in this category.</td></tr>}
                {filtered.slice(0, 500).map((l) => {
                  const g = GRADE_STYLES[l.grade as keyof typeof GRADE_STYLES];
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
        </div>
      )}

      {showModal && result && <SendToCrmModal result={result} onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); toast.success("Leads imported into CRM"); }} />}
    </div>
  );
}
