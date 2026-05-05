import { useEffect, useMemo, useState } from "react";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface Student { full_name: string | null; phone: string | null; email: string | null; }

export default function StudentSearch() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const loadCount = () =>
    supabase.from("students").select("id", { count: "exact", head: true }).then(({ count }) => setTotal(count ?? 0));

  useEffect(() => {
    loadCount();
    if (user) {
      supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
        .then(({ data }) => setIsAdmin(!!data));
    }
  }, [user]);

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

  const sync = async () => {
    setSyncBusy(true);
    const { data, error } = await supabase.functions.invoke("import-students");
    setSyncBusy(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error || error!.message);
    const r = (data as any).results || {};
    const parts = Object.entries(r).map(([k, v]: any) => `${k}: ${v.imported}`).join(" · ");
    toast.success(`Synced — ${parts}`);
    loadCount();
  };

  const sub = useMemo(
    () => total === null ? "Search any student instantly from the member database." : `${total.toLocaleString()} members in the database. Search by name, email, or phone.`,
    [total]
  );

  return (
    <div className="max-w-[720px]">
      <PageHead title="Student Search" sub={sub} back />

      {isAdmin && (
        <div className="bg-off rounded-xl py-4 px-5 mb-5 flex items-center justify-between">
          <div className="font-sans text-[12px] text-muted-foreground">Admin: pull the latest entries from the source sheets.</div>
          <button onClick={sync} disabled={syncBusy} className="ipc-btn ipc-btn-black">{syncBusy ? "Syncing…" : "Sync from sheets"}</button>
        </div>
      )}

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
