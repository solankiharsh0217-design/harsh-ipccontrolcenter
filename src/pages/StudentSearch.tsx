import { useEffect, useMemo, useState } from "react";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface Student { full_name: string | null; phone: string | null; email: string | null; tier?: string | null; }

export default function StudentSearch() {
  const { profile, loading: authLoading } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const loadCount = async () => {
    const { data, error } = await supabase.rpc("students_count");
    if (error) { setTotal(0); return 0; }
    const c = Number(data ?? 0);
    setTotal(c);
    return c;
  };

  const sync = async () => {
    setSyncBusy(true);
    const { data, error } = await supabase.functions.invoke("import-students");
    setSyncBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error!.message);
      return;
    }
    const r = (data as any).results || {};
    const parts = Object.entries(r).map(([k, v]: any) => `${k}: ${v.imported}`).join(" · ");
    toast.success(`Synced — ${parts}`);
    await loadCount();
  };

  // initial load + auto-sync if empty
  useEffect(() => {
    if (authLoading || profile?.status !== "active") return;
    (async () => {
      const c = await loadCount();
      if (c === 0) {
        toast.message("Loading the student database for the first time…");
        await sync();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile?.status]);

  // search
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_students", { _q: term, _limit: 50 });
      if (error) toast.error(error.message);
      setResults(((data as any[]) ?? []).map(r => ({ full_name: r.full_name, email: r.email, phone: r.phone, tier: r.tier })));
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const sub = useMemo(
    () => total === null ? "Search any student instantly from the member database." : `${total.toLocaleString()} members in the database. Search by name, email, or phone.`,
    [total]
  );

  return (
    <div className="max-w-[720px]">
      <PageHead title="Student Search" sub={sub} back />

      <div className="bg-off rounded-xl py-4 px-5 mb-5 flex items-center justify-between gap-4">
        <div className="font-sans text-[12px] text-muted-foreground">Pull the latest entries from the source sheets at any time.</div>
        <button onClick={sync} disabled={syncBusy} className="ipc-btn ipc-btn-black whitespace-nowrap">{syncBusy ? "Syncing…" : "Refresh student database"}</button>
      </div>

      <div className="mb-5">
        <label className="form-label">Search student</label>
        <input className="ipc-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name, email, or phone…" autoFocus />
      </div>

      <div>
        {loading && <div className="text-center py-6 font-sans text-[12px] text-muted-foreground">Searching…</div>}
        {results.map((s, i) => (
          <div key={i} className="border border-line rounded-[10px] py-5 px-[22px] mb-2.5">
            <div className="font-serif text-[22px] font-medium text-black mb-3">{s.full_name || "—"}</div>
            <Row label="Phone" value={s.phone || "—"} />
            <Row label="Email" value={s.email || "—"} />
          </div>
        ))}
        {q.trim() && !loading && results.length === 0 && (
          <div className="text-center py-10 font-sans text-[13px] text-muted-foreground">No student found matching that search.</div>
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
