import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { initialsOf } from "@/lib/tasks";

export interface AssigneeMember {
  id: string;
  full_name: string;
  email: string | null;
  role: string | null;
  created_at?: string;
}

interface Props {
  value: string;
  valueName: string;
  onChange: (id: string, name: string) => void;
}

export default function AssigneePicker({ value, valueName, onChange }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [all, setAll] = useState<AssigneeMember[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Load profiles (deduped by email, latest by created_at) + hidden list
  const reload = async () => {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, email, role, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as AssigneeMember[];
    const uniqueUsers = rows.reduce<AssigneeMember[]>((acc, u) => {
      const key = (u.email ?? "").toLowerCase().trim();
      if (!key) { acc.push(u); return acc; }
      if (!acc.find((x) => (x.email ?? "").toLowerCase().trim() === key)) acc.push(u);
      return acc;
    }, []);
    uniqueUsers.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
    setAll(uniqueUsers);

    if (user) {
      const { data: hv } = await (supabase as any)
        .from("task_assignee_visibility")
        .select("user_id, is_hidden")
        .eq("hidden_by", user.id);
      setHiddenIds(new Set(((hv ?? []) as any[]).filter((r) => r.is_hidden).map((r) => r.user_id)));
    }
  };

  useEffect(() => { reload(); }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = showHidden
      ? all.filter((u) => hiddenIds.has(u.id))
      : all.filter((u) => !hiddenIds.has(u.id));
    return q ? base.filter((u) => (u.full_name ?? "").toLowerCase().includes(q)) : base;
  }, [all, hiddenIds, showHidden, query]);

  const hiddenCount = hiddenIds.size;

  const toggleHide = async (m: AssigneeMember, hide: boolean) => {
    if (!user) return;
    // Optimistic
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (hide) next.add(m.id); else next.delete(m.id);
      return next;
    });
    try {
      const { data: existing } = await (supabase as any)
        .from("task_assignee_visibility")
        .select("id")
        .eq("user_id", m.id)
        .eq("hidden_by", user.id)
        .maybeSingle();
      if (existing?.id) {
        await (supabase as any).from("task_assignee_visibility")
          .update({ is_hidden: hide }).eq("id", existing.id);
      } else {
        await (supabase as any).from("task_assignee_visibility")
          .insert({ user_id: m.id, hidden_by: user.id, is_hidden: hide });
      }
    } catch {
      reload();
    }
  };

  const selected = all.find((u) => u.id === value);
  const displayName = selected?.full_name || valueName || "Select…";
  const displayInitials = initialsOf(displayName);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between bg-white rounded-[8px] px-3 transition-colors ${
          open ? "border border-[#C8A84B]" : "border border-[#E8E5DE]"
        }`}
        style={{ height: 40 }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span
            className="w-6 h-6 rounded-full bg-black flex items-center justify-center flex-shrink-0"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 9, color: "#C8A84B", fontWeight: 500 }}
          >
            {displayInitials}
          </span>
          <span className="truncate text-left" style={{ fontFamily: "Jost, sans-serif", fontSize: 13 }}>
            {displayName}
          </span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 ml-2" />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 mt-1 bg-white border border-[#E8E5DE] rounded-[10px] shadow-lg overflow-hidden"
          style={{ zIndex: 200 }}
        >
          <div className="flex items-center gap-2 px-3 border-b border-[#E8E5DE]" style={{ height: 34 }}>
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search team member…"
              className="flex-1 bg-transparent outline-none"
              style={{ fontFamily: "Jost, sans-serif", fontSize: 12.5 }}
            />
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {visible.length === 0 && (
              <div className="px-3 py-4 text-center text-muted-foreground" style={{ fontFamily: "Jost, sans-serif", fontSize: 12 }}>
                No results
              </div>
            )}
            {visible.map((m) => {
              const isSel = m.id === value;
              return (
                <div
                  key={m.id}
                  onClick={() => { onChange(m.id, m.full_name); setOpen(false); }}
                  className={`group flex items-center gap-2.5 px-3.5 cursor-pointer ${
                    isSel ? "bg-[#FBF6E9]" : "hover:bg-[#F7F6F3]"
                  }`}
                  style={{ height: 40 }}
                >
                  <span
                    className="w-7 h-7 rounded-full bg-black flex items-center justify-center flex-shrink-0"
                    style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 10, color: "#C8A84B", fontWeight: 500 }}
                  >
                    {initialsOf(m.full_name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-black" style={{ fontFamily: "Jost, sans-serif", fontSize: 13 }}>
                      {m.full_name}
                    </div>
                    {m.role && (
                      <div className="truncate text-muted-foreground" style={{ fontFamily: "Jost, sans-serif", fontSize: 10 }}>
                        {m.role}
                      </div>
                    )}
                  </div>
                  {isSel && <Check className="w-4 h-4 text-[#C8A84B] flex-shrink-0" />}
                  {!isSel && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleHide(m, !showHidden); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-black flex-shrink-0"
                      title={showHidden ? "Restore" : "Hide from list"}
                    >
                      {showHidden ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {(hiddenCount > 0 || showHidden) && (
            <button
              type="button"
              onClick={() => setShowHidden((s) => !s)}
              className="w-full px-3 py-2 text-left text-muted-foreground hover:bg-[#F7F6F3] border-t border-[#E8E5DE]"
              style={{ fontFamily: "Jost, sans-serif", fontSize: 10 }}
            >
              {showHidden ? "← Back to team list" : `Show hidden members (${hiddenCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
