import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ---------------- helpers ---------------- */
const inr = (n: number) => {
  if (!isFinite(n) || isNaN(n)) return "₹0";
  return "₹" + Math.round(n).toLocaleString("en-IN");
};
const safe = (n: number) => (isFinite(n) && !isNaN(n) ? n : 0);

type Pkg = { id: string; name: string; price: number | ""; core: boolean };
type Row = { id: string; pkgId: string; bookings: number | "" };
type State = {
  name: string;
  city: string;
  dream: number | "";
  year: number;
  packages: Pkg[];
  conversion: number; // %
  relevancy: number; // %
  rows: Row[];
  investment: number | "";
};

const uid = () => Math.random().toString(36).slice(2, 9);
const LS_KEY = "ipc_dream_turnover";

const DEFAULT_STATE: State = {
  name: "",
  city: "",
  dream: "",
  year: 2026,
  packages: [
    { id: uid(), name: "Wedding", price: "", core: true },
    { id: uid(), name: "Pre-Wedding", price: "", core: true },
    { id: uid(), name: "Engagement", price: "", core: true },
  ],
  conversion: 10,
  relevancy: 50,
  rows: [
    { id: uid(), pkgId: "", bookings: "" },
    { id: uid(), pkgId: "", bookings: "" },
    { id: uid(), pkgId: "", bookings: "" },
  ],
  investment: "",
};

/* ---------------- component ---------------- */
export default function DreamTurnoverPlanner() {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<State>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        return { ...DEFAULT_STATE, ...p, packages: p.packages ?? DEFAULT_STATE.packages, rows: p.rows ?? DEFAULT_STATE.rows };
      }
    } catch {}
    return DEFAULT_STATE;
  });
  const [savedFlash, setSavedFlash] = useState(false);
  const firstSave = useRef(true);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      if (firstSave.current) { firstSave.current = false; return; }
      setSavedFlash(true);
      const t = setTimeout(() => setSavedFlash(false), 900);
      return () => clearTimeout(t);
    } catch {}
  }, [state]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  /* ------ derived ------ */
  const dream = safe(Number(state.dream) || 0);
  const monthlyTarget = dream / 12;
  const weeklyTarget = monthlyTarget / 4;
  const dailyTarget = monthlyTarget / 30;

  const rowsCalc = useMemo(() => {
    return state.rows.map((r) => {
      const pkg = state.packages.find((p) => p.id === r.pkgId);
      const price = pkg ? safe(Number(pkg.price) || 0) : 0;
      const bookings = safe(Number(r.bookings) || 0);
      const conv = state.conversion / 100;
      const rel = state.relevancy / 100;
      const quotations = conv > 0 ? bookings / conv : 0;
      const leadsMo = rel > 0 ? quotations / rel : 0;
      const leadsDay = leadsMo > 0 ? Math.ceil(leadsMo / 30) : 0;
      const bookingsYr = bookings * 12;
      const revenueMo = bookings * price;
      const revenueYr = revenueMo * 12;
      return { r, pkg, price, bookings, quotations, leadsMo, leadsDay, bookingsYr, revenueMo, revenueYr };
    });
  }, [state.rows, state.packages, state.conversion, state.relevancy]);

  const totalLeadsDay = rowsCalc.reduce((s, x) => s + x.leadsDay, 0);
  const totalRevenueMo = rowsCalc.reduce((s, x) => s + x.revenueMo, 0);
  const projectedYr = rowsCalc.reduce((s, x) => s + x.revenueYr, 0);

  const dreamROI = state.investment && Number(state.investment) > 0 ? dream / Number(state.investment) : 0;
  const projectedROI = state.investment && Number(state.investment) > 0 ? projectedYr / Number(state.investment) : 0;

  /* ------ mutators ------ */
  const patch = (p: Partial<State>) => setState((s) => ({ ...s, ...p }));
  const updatePkg = (id: string, p: Partial<Pkg>) =>
    setState((s) => ({ ...s, packages: s.packages.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const addPkg = () =>
    setState((s) =>
      s.packages.length >= 7 ? s : { ...s, packages: [...s.packages, { id: uid(), name: "", price: "", core: false }] },
    );
  const delPkg = (id: string) =>
    setState((s) => ({
      ...s,
      packages: s.packages.filter((x) => x.id !== id || x.core),
      rows: s.rows.map((r) => (r.pkgId === id ? { ...r, pkgId: "" } : r)),
    }));

  const updateRow = (id: string, p: Partial<Row>) =>
    setState((s) => ({ ...s, rows: s.rows.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const addRow = () =>
    setState((s) => (s.rows.length >= 7 ? s : { ...s, rows: [...s.rows, { id: uid(), pkgId: "", bookings: "" }] }));
  const delRow = (id: string) => setState((s) => ({ ...s, rows: s.rows.filter((x) => x.id !== id) }));

  const resetAll = () => {
    if (!confirm("Start over? This clears all your inputs.")) return;
    localStorage.removeItem(LS_KEY);
    setState(DEFAULT_STATE);
    setStep(1);
  };

  /* ------ validation ------ */
  const canNext1 = state.name.trim().length > 0 && Number(state.dream) > 0;
  const validPackages = state.packages.filter((p) => p.name.trim() && Number(p.price) > 0);
  const canNext3 = validPackages.length >= 1;

  /* ------ pdf ------ */
  const downloadPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    doc.setFont("times", "italic");
    doc.setFontSize(20);
    doc.text("India Photographers Club", W / 2, 50, { align: "center" });
    doc.setDrawColor(200, 168, 75);
    doc.setLineWidth(1);
    doc.line(W / 2 - 40, 58, W / 2 + 40, 58);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("DREAM TURNOVER PLANNER", W / 2, 74, { align: "center" });
    doc.setTextColor(0);

    let y = 100;
    doc.setFontSize(11);
    doc.text(`Name: ${state.name || "-"}`, 40, y); y += 16;
    doc.text(`City: ${state.city || "-"}`, 40, y); y += 16;
    doc.text(`Target Year: ${state.year}`, 40, y); y += 16;
    doc.text(`Dream Annual Turnover: ${inr(dream)}`, 40, y); y += 20;

    doc.setFontSize(12);
    doc.text("Your Targets", 40, y); y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Monthly", "Weekly", "Daily"]],
      body: [[inr(monthlyTarget), inr(weeklyTarget), inr(dailyTarget)]],
      theme: "grid",
      headStyles: { fillColor: [200, 168, 75], textColor: 20 },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    doc.text("Your Packages", 40, y); y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Package", "Price"]],
      body: state.packages.map((p) => [p.name || "-", inr(Number(p.price) || 0)]),
      theme: "grid",
      headStyles: { fillColor: [200, 168, 75], textColor: 20 },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    doc.text(`Revenue Plan  (Conversion ${state.conversion}%  ·  Relevancy ${state.relevancy}%)`, 40, y); y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Package", "Price", "Book/mo", "Quot/mo", "Leads/mo", "Leads/day", "Book/yr", "Rev/mo", "Rev/yr"]],
      body: rowsCalc.map((x) => [
        x.pkg?.name || "-",
        inr(x.price),
        x.bookings,
        Math.round(x.quotations),
        Math.round(x.leadsMo),
        x.leadsDay,
        x.bookingsYr,
        inr(x.revenueMo),
        inr(x.revenueYr),
      ]),
      foot: [["Total", "", "", "", "", totalLeadsDay, "", inr(totalRevenueMo), inr(projectedYr)]],
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [20, 20, 20] },
      footStyles: { fillColor: [251, 246, 233], textColor: 20 },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    doc.setFontSize(11);
    const verdict =
      projectedYr >= dream && dream > 0
        ? `On track — projected ${inr(projectedYr)}/yr, ${inr(projectedYr - dream)} above your goal.`
        : dream > 0
        ? `Short by ${inr(dream - projectedYr)}. Projected ${inr(projectedYr)}/yr vs ${inr(dream)} goal.`
        : `Projected ${inr(projectedYr)}/yr.`;
    doc.text(verdict, 40, y, { maxWidth: W - 80 }); y += 24;

    doc.setFont("times", "italic");
    doc.setFontSize(16);
    doc.text(`To hit ${inr(dream)}, you need ${totalLeadsDay} qualified leads per day.`, 40, y, { maxWidth: W - 80 });
    y += 30;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    if (state.investment && Number(state.investment) > 0) {
      doc.text(`Investment: ${inr(Number(state.investment))}`, 40, y); y += 14;
      doc.text(`Dream ROI: ${dreamROI.toFixed(1)}×    Projected ROI: ${projectedROI.toFixed(1)}×`, 40, y);
    }

    doc.save(`Dream-Turnover-${(state.name || "plan").replace(/\s+/g, "-")}.pdf`);
  };

  /* ---------------- UI helpers ---------------- */
  const Steps = () => {
    const items = ["Your Dream", "Your Targets", "Your Packages", "Revenue Plan"];
    return (
      <div className="flex items-center justify-between gap-2 mb-8">
        {items.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          const clickable = done;
          return (
            <button
              key={n}
              onClick={() => clickable && setStep(n)}
              className={`flex-1 flex flex-col items-center gap-1 ${clickable ? "cursor-pointer" : "cursor-default"}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border transition-colors ${
                  active
                    ? "bg-gold text-black border-gold"
                    : done
                    ? "bg-gold-pale text-gold-deep border-gold-mid"
                    : "bg-white text-muted-foreground border-line"
                }`}
              >
                {done ? "✓" : n}
              </div>
              <div className={`text-[10px] uppercase tracking-widest text-center ${active ? "text-black" : "text-muted-foreground"}`}>
                {label}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const PillRow = ({
    options,
    value,
    onChange,
  }: {
    options: number[];
    value: number;
    onChange: (v: number) => void;
  }) => {
    const isCustom = !options.includes(value);
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`px-4 py-2 rounded-full text-sm border transition-colors ${
              value === o
                ? "bg-black text-white border-black"
                : "bg-white text-black border-line hover:border-gold"
            }`}
          >
            {o}%
          </button>
        ))}
        <button
          onClick={() => onChange(isCustom ? value : 0)}
          className={`px-4 py-2 rounded-full text-sm border transition-colors ${
            isCustom ? "bg-black text-white border-black" : "bg-white text-black border-line hover:border-gold"
          }`}
        >
          Custom
        </button>
        {isCustom && (
          <input
            type="number"
            min={1}
            max={100}
            value={value || ""}
            onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="ipc-input w-24"
            style={{ height: 40 }}
            placeholder="%"
          />
        )}
      </div>
    );
  };

  /* ---------------- render ---------------- */
  return (
    <div className="min-h-screen bg-off">
      {/* Header */}
      <header className="pt-10 pb-6 text-center">
        <div className="font-serif text-3xl md:text-4xl text-black">India Photographers Club</div>
        <div className="mx-auto mt-2 h-px w-16 bg-gold" />
        <div className="mt-3 uppercase-label">Dream Turnover Planner</div>
      </header>

      <main className={`${step === 4 ? "max-w-[1100px]" : "max-w-[760px]"} mx-auto px-4 pb-24`}>
        <Steps />

        {savedFlash && (
          <div className="fixed top-4 right-4 text-xs text-success bg-white border border-line rounded-md px-3 py-1 shadow-sm z-50">
            Saved
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <section className="bg-white border border-line rounded-xl p-6 md:p-8">
            <div className="section-divider">Step 1 · Your Dream</div>
            <div className="grid gap-5">
              <div>
                <label className="form-label">Your Name</label>
                <input className="ipc-input" value={state.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Rohit Sharma" />
              </div>
              <div>
                <label className="form-label">Your City</label>
                <input className="ipc-input" value={state.city} onChange={(e) => patch({ city: e.target.value })} placeholder="e.g. Jaipur" />
              </div>
              <div>
                <label className="form-label">Dream Annual Turnover (₹)</label>
                <input
                  className="ipc-input"
                  type="number"
                  min={0}
                  value={state.dream}
                  onChange={(e) => patch({ dream: e.target.value === "" ? "" : Number(e.target.value) })}
                  placeholder="e.g. 4000000"
                />
                {Number(state.dream) > 0 && (
                  <div className="text-xs text-muted-foreground mt-2">= {inr(Number(state.dream))}</div>
                )}
              </div>
              <div>
                <label className="form-label">Target Year</label>
                <select
                  className="ipc-input"
                  value={state.year}
                  onChange={(e) => patch({ year: Number(e.target.value) })}
                >
                  {[2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end mt-8">
              <button className="ipc-btn ipc-btn-black" disabled={!canNext1} onClick={() => setStep(2)} style={{ opacity: canNext1 ? 1 : 0.4 }}>
                Next →
              </button>
            </div>
          </section>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <section className="bg-white border border-line rounded-xl p-6 md:p-8">
            <div className="section-divider">Step 2 · Your Targets</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Monthly Target", value: monthlyTarget },
                { label: "Weekly Target", value: weeklyTarget },
                { label: "Daily Target", value: dailyTarget },
              ].map((c) => (
                <div key={c.label} className="rounded-xl bg-gold-pale border border-gold-mid p-6 text-center">
                  <div className="uppercase-label mb-2">{c.label}</div>
                  <div className="font-serif text-3xl md:text-4xl text-black">{inr(c.value)}</div>
                </div>
              ))}
            </div>
            <p className="font-serif text-xl md:text-2xl text-center mt-8 text-black leading-snug">
              {state.name || "Friend"}, to earn <span className="text-gold-deep">{inr(dream)}</span> by {state.year},
              you need <span className="text-gold-deep">{inr(monthlyTarget)}</span> every month.
            </p>
            <div className="flex justify-between mt-8">
              <button className="ipc-btn ipc-btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="ipc-btn ipc-btn-black" onClick={() => setStep(3)}>Next →</button>
            </div>
          </section>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <section className="bg-white border border-line rounded-xl p-6 md:p-8">
            <div className="section-divider">Step 3 · Your Packages</div>
            <p className="text-sm text-muted-foreground mb-4">Define up to 7 packages. First 3 are core.</p>
            <div className="space-y-3">
              {state.packages.map((p, idx) => (
                <div key={p.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 md:col-span-6">
                    {idx === 0 && <label className="form-label">Package Name</label>}
                    <input
                      className="ipc-input"
                      value={p.name}
                      onChange={(e) => updatePkg(p.id, { name: e.target.value })}
                      placeholder={p.core ? `Core package ${idx + 1}` : "Optional package"}
                    />
                  </div>
                  <div className="col-span-8 md:col-span-4">
                    {idx === 0 && <label className="form-label">Price (₹)</label>}
                    <input
                      className="ipc-input"
                      type="number"
                      min={0}
                      value={p.price}
                      onChange={(e) => updatePkg(p.id, { price: e.target.value === "" ? "" : Number(e.target.value) })}
                      placeholder="e.g. 140000"
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2 flex items-center justify-end gap-2">
                    <span className={`text-[10px] uppercase tracking-widest ${p.core ? "text-gold-deep" : "text-muted-foreground"}`}>
                      {p.core ? "Core" : "Optional"}
                    </span>
                    {!p.core && (
                      <button
                        onClick={() => delPkg(p.id)}
                        className="w-8 h-8 rounded-md border border-line text-muted-foreground hover:text-danger hover:border-danger"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {state.packages.length < 7 && (
              <button className="ipc-btn ipc-btn-ghost mt-4" onClick={addPkg}>+ Add Package</button>
            )}
            <div className="flex justify-between mt-8">
              <button className="ipc-btn ipc-btn-ghost" onClick={() => setStep(2)}>← Back</button>
              <button
                className="ipc-btn ipc-btn-black"
                disabled={!canNext3}
                onClick={() => setStep(4)}
                style={{ opacity: canNext3 ? 1 : 0.4 }}
              >
                Next →
              </button>
            </div>
          </section>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <section className="space-y-6">
            {/* Rates panel */}
            <div className="bg-gold-pale border border-gold-mid rounded-xl p-6 md:p-8">
              <div className="section-divider" style={{ borderColor: "hsl(var(--gold-mid))" }}>Your Rates</div>
              <div className="space-y-6">
                <div>
                  <div className="font-serif text-lg text-black mb-1">Conversion Rate</div>
                  <div className="text-sm text-muted-foreground mb-3">Out of every 10 quotations you send, how many turn into paying clients?</div>
                  <PillRow options={[5, 10, 15, 20, 25]} value={state.conversion} onChange={(v) => patch({ conversion: v })} />
                </div>
                <div>
                  <div className="font-serif text-lg text-black mb-1">Lead Relevancy Rate</div>
                  <div className="text-sm text-muted-foreground mb-3">Out of every 100 leads you receive, how many are qualified enough to send a quotation to?</div>
                  <PillRow options={[40, 50, 60]} value={state.relevancy} onChange={(v) => patch({ relevancy: v })} />
                </div>
              </div>
            </div>

            {/* Planning rows */}
            <div className="bg-white border border-line rounded-xl p-6 md:p-8">
              <div className="section-divider">Revenue Plan</div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto -mx-2">
                <table className="w-full text-sm border-collapse" style={{ minWidth: 960 }}>
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground border-b border-line">
                      <th className="py-2 px-3" style={{ minWidth: 170 }}>Package</th>
                      <th className="py-2 px-3" style={{ minWidth: 95 }}>Price</th>
                      <th className="py-2 px-3" style={{ minWidth: 90 }}>Book/mo</th>
                      <th className="py-2 px-3" style={{ minWidth: 80 }}>Quot/mo</th>
                      <th className="py-2 px-3" style={{ minWidth: 80 }}>Leads/mo</th>
                      <th className="py-2 px-3" style={{ minWidth: 80 }}>Leads/day</th>
                      <th className="py-2 px-3" style={{ minWidth: 80 }}>Book/yr</th>
                      <th className="py-2 px-3" style={{ minWidth: 100 }}>Rev/mo</th>
                      <th className="py-2 px-3" style={{ minWidth: 110 }}>Rev/yr</th>
                      <th className="py-2 px-2" style={{ width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rowsCalc.map((x) => (
                      <tr key={x.r.id} className="border-b border-line">
                        <td className="py-2 px-3">
                          <select
                            className="ipc-input"
                            style={{ height: 36, minWidth: 150, paddingRight: 28 }}
                            value={x.r.pkgId}
                            onChange={(e) => updateRow(x.r.id, { pkgId: e.target.value })}
                          >
                            <option value="">Select…</option>
                            {validPackages.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3 bg-off text-black whitespace-nowrap">{x.price ? inr(x.price) : "—"}</td>
                        <td className="py-2 px-3">
                          <input
                            className="ipc-input"
                            style={{ height: 36, width: 80 }}
                            type="number"
                            min={0}
                            value={x.r.bookings}
                            onChange={(e) => updateRow(x.r.id, { bookings: e.target.value === "" ? "" : Number(e.target.value) })}
                          />
                        </td>
                        <td className="py-2 px-3 bg-off">{x.quotations ? Math.round(x.quotations) : "—"}</td>
                        <td className="py-2 px-3 bg-off">{x.leadsMo ? Math.round(x.leadsMo) : "—"}</td>
                        <td className="py-2 px-3 bg-off font-medium text-gold-deep">{x.leadsDay || "—"}</td>
                        <td className="py-2 px-3 bg-off">{x.bookingsYr || "—"}</td>
                        <td className="py-2 px-3 bg-off whitespace-nowrap">{x.revenueMo ? inr(x.revenueMo) : "—"}</td>
                        <td className="py-2 px-3 bg-off whitespace-nowrap">{x.revenueYr ? inr(x.revenueYr) : "—"}</td>
                        <td className="py-2 px-2">
                          {state.rows.length > 1 && (
                            <button
                              onClick={() => delRow(x.r.id)}
                              className="w-7 h-7 rounded-md border border-line text-muted-foreground hover:text-danger hover:border-danger"
                              aria-label="Remove row"
                            >×</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gold-pale font-medium">
                      <td className="py-3 px-3" colSpan={5}>Totals</td>
                      <td className="py-3 px-3 text-gold-deep">{totalLeadsDay}</td>
                      <td />
                      <td className="py-3 px-3 text-gold-deep whitespace-nowrap">{inr(totalRevenueMo)}</td>
                      <td className="py-3 px-3 text-gold-deep whitespace-nowrap">{inr(projectedYr)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-4">
                {rowsCalc.map((x, i) => (
                  <div key={x.r.id} className="border border-line rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <select
                        className="ipc-input flex-1"
                        value={x.r.pkgId}
                        onChange={(e) => updateRow(x.r.id, { pkgId: e.target.value })}
                        aria-label={`Row ${i + 1} package`}
                      >
                        <option value="">Select package…</option>
                        {validPackages.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {state.rows.length > 1 && (
                        <button
                          onClick={() => delRow(x.r.id)}
                          className="w-10 h-10 shrink-0 rounded-md border border-line text-muted-foreground hover:text-danger hover:border-danger"
                          aria-label="Remove row"
                        >×</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-1">
                        <label className="form-label">Price</label>
                        <div className="ipc-input flex items-center bg-off">{x.price ? inr(x.price) : "—"}</div>
                      </div>
                      <div className="col-span-1">
                        <label className="form-label">Bookings / Month</label>
                        <input
                          className="ipc-input"
                          type="number"
                          min={0}
                          value={x.r.bookings}
                          onChange={(e) => updateRow(x.r.id, { bookings: e.target.value === "" ? "" : Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm bg-off p-3 rounded-md">
                      <div><span className="uppercase-label block">Quotations/mo</span>{x.quotations ? Math.round(x.quotations) : "—"}</div>
                      <div><span className="uppercase-label block">Leads/mo</span>{x.leadsMo ? Math.round(x.leadsMo) : "—"}</div>
                      <div><span className="uppercase-label block">Leads/day</span><span className="font-medium text-gold-deep">{x.leadsDay || "—"}</span></div>
                      <div><span className="uppercase-label block">Bookings/yr</span>{x.bookingsYr || "—"}</div>
                      <div><span className="uppercase-label block">Revenue/mo</span>{x.revenueMo ? inr(x.revenueMo) : "—"}</div>
                      <div><span className="uppercase-label block">Revenue/yr</span><span className="font-medium text-gold-deep">{x.revenueYr ? inr(x.revenueYr) : "—"}</span></div>
                    </div>
                  </div>
                ))}
                <div className="bg-gold-pale border border-gold-mid rounded-lg p-4 grid grid-cols-3 gap-2 text-center">
                  <div><div className="uppercase-label">Leads/day</div><div className="font-serif text-2xl text-gold-deep">{totalLeadsDay}</div></div>
                  <div><div className="uppercase-label">Rev/mo</div><div className="font-serif text-base text-gold-deep">{inr(totalRevenueMo)}</div></div>
                  <div><div className="uppercase-label">Rev/yr</div><div className="font-serif text-base text-gold-deep">{inr(projectedYr)}</div></div>
                </div>
              </div>

              {state.rows.length < 7 && (
                <button className="ipc-btn ipc-btn-ghost mt-4" onClick={addRow}>+ Add Row</button>
              )}
            </div>

            {/* Verdict */}
            {dream > 0 && (
              <div
                className={`rounded-xl p-6 border ${
                  projectedYr >= dream
                    ? "bg-white border-line"
                    : "bg-gold-pale border-gold-mid"
                }`}
              >
                {projectedYr >= dream ? (
                  <div className="text-success font-medium">
                    🎉 You're on track, {state.name || "Friend"} — projected {inr(projectedYr)}/yr, {inr(projectedYr - dream)} above your goal.
                  </div>
                ) : (
                  <div className="text-gold-deep font-medium">
                    You're {inr(dream - projectedYr)} short. Projected {inr(projectedYr)}/yr vs your {inr(dream)} goal.
                    Increase bookings or add packages to close the gap.
                  </div>
                )}
              </div>
            )}

            {/* Billboard */}
            <div className="rounded-xl bg-black text-white p-8 md:p-12 text-center">
              <div className="text-sm uppercase tracking-widest text-gold-mid">To hit {inr(dream)}, you need</div>
              <div className="font-serif text-6xl md:text-8xl text-gold my-4 leading-none">{totalLeadsDay}</div>
              <div className="text-lg">qualified leads per day from Meta Ads.</div>
              <div className="text-xs text-muted-light mt-3">Based on {state.conversion}% conversion · {state.relevancy}% relevancy</div>
            </div>

            {/* ROI */}
            <details className="bg-white border border-line rounded-xl p-6 md:p-8">
              <summary className="cursor-pointer font-serif text-lg text-black">Calculate your Ad Spend ROI</summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="form-label">Your Investment (₹)</label>
                  <input
                    className="ipc-input"
                    type="number"
                    min={0}
                    value={state.investment}
                    onChange={(e) => patch({ investment: e.target.value === "" ? "" : Number(e.target.value) })}
                    placeholder="e.g. 150000"
                  />
                </div>
                {state.investment && Number(state.investment) > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg bg-off p-4 text-center">
                        <div className="uppercase-label">Dream ROI</div>
                        <div className="font-serif text-3xl text-black">{dreamROI.toFixed(1)}×</div>
                      </div>
                      <div className="rounded-lg bg-gold-pale border border-gold-mid p-4 text-center">
                        <div className="uppercase-label">Projected ROI</div>
                        <div className="font-serif text-3xl text-gold-deep">{projectedROI.toFixed(1)}×</div>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground text-center">
                      Every ₹1 invested is projected to return ₹{projectedROI.toFixed(1)} this year.
                    </div>
                  </>
                )}
              </div>
            </details>

            {/* Actions */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <button className="ipc-btn ipc-btn-ghost" onClick={() => setStep(3)}>← Back</button>
              <div className="flex gap-3">
                <button className="ipc-btn ipc-btn-ghost" onClick={resetAll}>Start Over</button>
                <button className="ipc-btn ipc-btn-black" onClick={downloadPdf}>Download PDF</button>
              </div>
            </div>
          </section>
        )}

        <footer className="text-center text-xs text-muted-foreground mt-12">
          © India Photographers Club · Dream Turnover Planner
        </footer>
      </main>
    </div>
  );
}
