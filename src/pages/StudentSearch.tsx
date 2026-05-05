import { useEffect, useState } from "react";
import { PageHead } from "@/components/ui-bits";
import { toast } from "sonner";

interface Student { name: string; phone: string; email: string; }

export default function StudentSearch() {
  const [url, setUrl] = useState(localStorage.getItem("ipc_sheet_url") ?? "");
  const [data, setData] = useState<Student[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (url) connect(url); /* auto on mount */ /* eslint-disable-next-line */ }, []);

  const connect = async (u?: string) => {
    const link = (u ?? url).trim();
    if (!link) return toast.error("Paste a Google Sheet URL first.");
    setBusy(true);
    const csvUrl = link.includes("output=csv") ? link : link.replace(/\/edit.*/, "/export?format=csv");
    try {
      const res = await fetch(csvUrl);
      const text = await res.text();
      const rows = text.split("\n").map(r => r.split(",").map(c => c.replace(/^"|"$/g, "").trim()));
      const parsed = rows.slice(1).filter(r => r[0]).map(r => ({ name: r[0]||"", phone: r[1]||"", email: r[2]||"" }));
      setData(parsed);
      setStatus(`✓ Connected — ${parsed.length} student records loaded.`);
      localStorage.setItem("ipc_sheet_url", link);
    } catch {
      setData([]);
      setStatus("Could not load — check that the sheet is published as CSV.");
    }
    setBusy(false);
  };

  const found = q.trim() ? data.filter(s => s.name.toLowerCase().includes(q.trim().toLowerCase())) : [];

  return (
    <div className="max-w-[720px]">
      <PageHead title="Student Search" sub="Search any student instantly from the connected Google Sheet database." back />

      <div className="bg-off rounded-xl py-[22px] px-6 mb-7">
        <div className="form-label">Connect Google Sheet</div>
        <div className="flex gap-2.5 mt-3">
          <input className="ipc-input flex-1" value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="Paste published Google Sheet URL here" />
          <button onClick={()=>connect()} disabled={busy} className="ipc-btn ipc-btn-black">{busy?"…":"Connect"}</button>
        </div>
        <div className="font-sans text-[11px] text-muted-foreground mt-2 leading-[1.6]">
          Your sheet must be published to the web as CSV.<br/>
          Go to File → Share → Publish to web → select CSV format → publish.
        </div>
        {status && <div className="mt-2.5 font-sans text-xs text-success">{status}</div>}
      </div>

      <div className="mb-5">
        <label className="form-label">Search student by name</label>
        <input className="ipc-input" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Type a name to search…" />
      </div>

      <div>
        {found.map((s, i) => (
          <div key={i} className="border border-line rounded-[10px] py-5 px-[22px] mb-2.5">
            <div className="font-serif text-[22px] font-medium text-black mb-3">{s.name}</div>
            <Row label="Phone" value={s.phone || "—"} />
            <Row label="Email" value={s.email || "—"} />
          </div>
        ))}
        {q.trim() && found.length === 0 && data.length > 0 && (
          <div className="text-center py-10 font-sans text-[13px] text-muted-foreground">No student found matching that name.</div>
        )}
      </div>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center gap-3 mb-2 last:mb-0">
    <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-muted-foreground w-[60px] flex-shrink-0">{label}</div>
    <div className="font-sans text-[13px] text-black">{value}</div>
  </div>
);
