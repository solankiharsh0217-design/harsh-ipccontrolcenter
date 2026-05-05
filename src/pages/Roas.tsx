import { useState, useMemo } from "react";
import { PageHead } from "@/components/ui-bits";
import { inr } from "@/lib/format";

export default function Roas() {
  const [spend, setSpend] = useState("");
  const [revenue, setRevenue] = useState("");
  const [leads, setLeads] = useState("");
  const [conv, setConv] = useState("");

  const r = useMemo(() => {
    const s = parseFloat(spend) || 0;
    const rev = parseFloat(revenue) || 0;
    const l = parseFloat(leads) || 0;
    const c = parseFloat(conv) || 0;
    if (s <= 0) return null;
    const roas = rev / s;
    const note = roas >= 3 ? "Healthy return — above 3× target." : roas >= 2 ? "Moderate — room to optimise." : "Below target — review your creatives.";
    return {
      roas: roas.toFixed(2) + "×",
      note,
      cpl: l > 0 ? inr(s / l) : "—",
      cvr: l > 0 && c > 0 ? ((c / l) * 100).toFixed(1) + "%" : "—",
      profit: rev > 0 ? inr(rev - s) : "—",
    };
  }, [spend, revenue, leads, conv]);

  return (
    <div className="max-w-[700px]">
      <PageHead title="ROAS Calculator" sub="Calculate return on ad spend and all key media buying metrics instantly." back />
      <div className="grid grid-cols-2 gap-3.5 mb-5">
        <Field label="Total ad spend (₹)" value={spend} onChange={setSpend} placeholder="e.g. 50000" />
        <Field label="Total revenue generated (₹)" value={revenue} onChange={setRevenue} placeholder="e.g. 175000" />
        <Field label="Number of leads" value={leads} onChange={setLeads} placeholder="e.g. 120" />
        <Field label="Number of conversions" value={conv} onChange={setConv} placeholder="e.g. 18" />

        {r && (
          <div className="col-span-2 bg-gold-pale border border-gold-mid rounded-xl py-6 px-7">
            <div className="uppercase-label mb-2">Return on ad spend</div>
            <div className="font-serif text-[52px] font-medium text-gold leading-none">{r.roas}</div>
            <div className="font-sans text-xs text-muted-foreground mt-1.5">{r.note}</div>
          </div>
        )}
      </div>

      {r && (
        <div className="grid grid-cols-3 gap-3 mt-[18px]">
          <SubCard label="Cost per lead" value={r.cpl} />
          <SubCard label="Conversion rate" value={r.cvr} />
          <SubCard label="Net profit" value={r.profit} />
        </div>
      )}
    </div>
  );
}

const Field = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string)=>void; placeholder: string }) => (
  <div>
    <label className="form-label">{label}</label>
    <input className="ipc-input" type="number" placeholder={placeholder} value={value} onChange={(e)=>onChange(e.target.value)} />
  </div>
);

const SubCard = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-off rounded-md py-[14px] px-4">
    <div className="font-sans text-[9px] uppercase tracking-[0.1em] text-muted-foreground mb-[7px]">{label}</div>
    <div className="font-serif text-2xl font-medium text-black">{value}</div>
  </div>
);

