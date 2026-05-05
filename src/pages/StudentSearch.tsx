import { useEffect, useMemo, useState } from "react";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";

interface Student { full_name: string | null; phone: string | null; email: string | null; }

export default function StudentSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("students").select("id", { count: "exact", head: true }).then(({ count }) => setTotal(count ?? 0));
  }, []);

  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (!term) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("students")
        .select("full_name, email, phone")
        .ilike("search_text", `%${term}%`)
        .limit(50);
      setResults((data ?? []) as Student[]);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const sub = useMemo(
    () => total === null ? "Search any student instantly from the member database." : `${total.toLocaleString()} members in the database. Search by name, email, or phone.`,
    [total]
  );

  return (
    <div className="max-w-[720px]">
      <PageHead title="Student Search" sub={sub} back />

      <div className="mb-5">
        <label className="form-label">Search student</label>
        <input className="ipc-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name, email, or phone…" />
      </div>

      <div>
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
