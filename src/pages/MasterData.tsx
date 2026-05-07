import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface Entry {
  id: string;
  field_key: string;
  value: string;
  created_by: string | null;
  created_at: string;
  sort_order: number;
}

const FIELD_DEFS: { key: string; label: string; usedIn: string }[] = [
  { key: "webinar_name", label: "Webinar Names", usedIn: "ROAS Calculator, Lead Qualifier, Calling CRM" },
  { key: "media_buyer_name", label: "Media Buyers", usedIn: "ROAS Calculator" },
  { key: "stage_name", label: "Stage Names", usedIn: "Calling CRM" },
  { key: "pipeline_name", label: "Pipeline Names", usedIn: "Calling CRM" },
  { key: "google_sheet_url", label: "Google Sheet URLs", usedIn: "Student Search, ROAS Calculator, Lead Qualifier" },
  { key: "data_source_name", label: "Data Source Names", usedIn: "Data Sources" },
  { key: "announcement_title", label: "Announcement Titles", usedIn: "Admin Panel" },
  { key: "team_role", label: "Team Roles", usedIn: "Team Directory" },
  { key: "department", label: "Departments", usedIn: "Team Directory, Registration" },
  { key: "program_name", label: "Program Names", usedIn: "Calling CRM" },
];

export default function MasterData() {
  const { isAdmin } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [activeKey, setActiveKey] = useState(FIELD_DEFS[0].key);
  const [search, setSearch] = useState("");
  const [newVal, setNewVal] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("quick_save_entries")
      .select("id, field_key, value, created_by, created_at, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    setEntries((data as Entry[]) || []);
  };

  useEffect(() => {
    load();
    supabase.from("profiles").select("id, full_name").then(({ data }) => {
      const m: Record<string, string> = {};
      (data || []).forEach((p: any) => { m[p.id] = p.full_name; });
      setProfiles(m);
    });
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    entries.forEach((e) => { c[e.field_key] = (c[e.field_key] || 0) + 1; });
    return c;
  }, [entries]);

  const def = FIELD_DEFS.find((f) => f.key === activeKey)!;
  const filtered = entries
    .filter((e) => e.field_key === activeKey)
    .filter((e) => !search.trim() || e.value.toLowerCase().includes(search.toLowerCase()));

  const add = async () => {
    const v = newVal.trim();
    if (!v) return;
    const dup = entries.some((e) => e.field_key === activeKey && e.value.toLowerCase() === v.toLowerCase());
    if (dup) { toast.error("This entry already exists"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("quick_save_entries").insert({ field_key: activeKey, value: v, created_by: user?.id });
    if (error) { toast.error(error.message); return; }
    setNewVal("");
    await load();
  };

  const saveEdit = async (id: string) => {
    const v = editVal.trim();
    if (!v) return;
    const { error } = await supabase.from("quick_save_entries").update({ value: v }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditId(null); setEditVal("");
    await load();
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("quick_save_entries").update({ is_active: false }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setConfirmId(null);
    await load();
  };

  return (
    <div className="max-w-[1100px]">
      <h1 className="font-serif text-[28px] text-black">Master Data</h1>
      <p className="font-sans text-[13px] font-light text-muted-foreground mt-1 mb-7">
        All saved entries used across the IPC Control Center. Manage webinar names, media buyer names, stages, and more from one place.
      </p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-line mb-6">
        {FIELD_DEFS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setActiveKey(f.key); setSearch(""); setEditId(null); setConfirmId(null); }}
            className={
              "relative px-4 py-2.5 font-sans text-[12.5px] transition-colors " +
              (activeKey === f.key
                ? "text-black after:absolute after:left-3 after:right-3 after:bottom-[-1px] after:h-[2px] after:bg-gold"
                : "text-muted-foreground hover:text-black")
            }
          >
            {f.label}
            {counts[f.key] ? (
              <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full bg-gold-pale text-[9px] text-gold-deep font-medium">{counts[f.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Add form */}
      <div className="flex gap-2 mb-3">
        <input
          className="flex-1 h-10 border border-line rounded-md px-3.5 font-sans text-[13px] focus:outline-none focus:border-gold"
          placeholder={`Add new ${def.label.replace(/s$/, "").toLowerCase()}…`}
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <button onClick={add} className="h-10 px-5 bg-black text-white font-sans text-[13px] rounded-md hover:opacity-90">Add</button>
      </div>

      {/* Search */}
      <input
        className="w-full h-10 border border-line rounded-md px-3.5 font-sans text-[13px] mb-4 focus:outline-none focus:border-gold"
        placeholder="Search entries…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      <div className="border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_120px_220px_120px] bg-off px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-sans">
          <div>Value</div>
          <div>Added by</div>
          <div>Date</div>
          <div>Used in</div>
          <div className="text-right">{isAdmin ? "Actions" : ""}</div>
        </div>
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center font-sans text-[13px] text-muted-foreground">
            {search ? "No entries match your search" : "No entries yet — add one above"}
          </div>
        )}
        {filtered.map((e) => (
          <div key={e.id} className="border-t border-line">
            <div className="grid grid-cols-[1fr_140px_120px_220px_120px] px-4 py-3 items-center hover:bg-off/50">
              <div>
                {editId === e.id ? (
                  <div className="flex gap-2 items-center">
                    <input
                      autoFocus
                      className="flex-1 h-9 border border-line rounded-md px-2.5 font-sans text-[13px] focus:outline-none focus:border-gold"
                      value={editVal}
                      onChange={(ev) => setEditVal(ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === "Enter") saveEdit(e.id); }}
                    />
                    <button onClick={() => saveEdit(e.id)} className="h-9 px-3 bg-black text-white text-[12px] rounded-md">Save</button>
                    <button onClick={() => { setEditId(null); setEditVal(""); }} className="h-9 px-3 text-[12px] text-muted-foreground hover:text-black">Cancel</button>
                  </div>
                ) : (
                  <span className="font-serif text-[16px] font-medium text-black break-words">{e.value}</span>
                )}
              </div>
              <div className="font-sans text-[12px] text-muted-foreground truncate">{profiles[e.created_by || ""] || "—"}</div>
              <div className="font-sans text-[12px] text-muted-foreground">{new Date(e.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
              <div className="font-sans text-[11px] text-muted-foreground">{def.usedIn}</div>
              <div className="text-right">
                {isAdmin && editId !== e.id && (
                  <div className="flex gap-1.5 justify-end">
                    <button title="Edit" onClick={() => { setEditId(e.id); setEditVal(e.value); }} className="w-7 h-7 rounded-md hover:bg-off text-muted-foreground hover:text-black">✎</button>
                    <button title="Delete" onClick={() => setConfirmId(e.id)} className="w-7 h-7 rounded-md hover:bg-[#FEF2F2] text-muted-foreground hover:text-[#DC2626]">🗑</button>
                  </div>
                )}
              </div>
            </div>
            {confirmId === e.id && (
              <div className="px-4 py-3 bg-[#FEF2F2] border-t border-line text-[12.5px]">
                <div className="text-black mb-2">Delete "{e.value}"? It will no longer appear in dropdowns. Past calculations are not affected.</div>
                <div className="flex gap-2">
                  <button onClick={() => del(e.id)} className="h-8 px-3 bg-[#DC2626] text-white text-[12px] rounded-md">Yes, delete</button>
                  <button onClick={() => setConfirmId(null)} className="h-8 px-3 text-[12px] text-muted-foreground hover:text-black">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
