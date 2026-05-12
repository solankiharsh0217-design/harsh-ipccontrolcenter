import { useEffect, useState } from "react";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { initials, formatTime, formatDateShort } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { toast } from "sonner";
import { Shield, X } from "lucide-react";

interface Member {
  id: string;
  full_name: string;
  role: string;
  department: string | null;
  last_login: string | null;
}

export default function Team() {
  const { isAdmin, user, refreshProfile } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<Member | null>(null);
  const [editAdmin, setEditAdmin] = useState(false);
  const [editModules, setEditModules] = useState<Set<ModuleKey>>(new Set());
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, role, department").eq("status","active").order("full_name");
    const { data: logs } = await supabase.from("attendance_logs").select("user_id, login_time").order("login_time", { ascending: false });
    const lastByUser = new Map<string, string>();
    logs?.forEach(l => { if (!lastByUser.has(l.user_id)) lastByUser.set(l.user_id, l.login_time); });
    setMembers((profiles ?? []).map(p => ({ ...p, last_login: lastByUser.get(p.id) ?? null })));
  };

  useEffect(() => { load(); }, []);

  const openEdit = async (m: Member) => {
    setEditing(m);
    setEditName(m.full_name ?? "");
    setEditRole(m.role ?? "");
    setEditDepartment(m.department ?? "");
    const [{ data: roles }, { data: mods }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", m.id),
      supabase.from("user_module_access").select("module_key").eq("user_id", m.id),
    ]);
    setEditAdmin(!!roles?.some((r: any) => r.role === "admin"));
    setEditModules(new Set((mods ?? []).map((x: any) => x.module_key as ModuleKey)));
  };

  const toggleModule = (k: ModuleKey) => {
    setEditModules(prev => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      // Update profile fields (name, role/position, department)
      const { error: pErr } = await supabase.from("profiles").update({
        full_name: editName.trim() || editing.full_name,
        role: editRole.trim() || editing.role,
        department: editDepartment.trim() || null,
      }).eq("id", editing.id);
      if (pErr) throw pErr;

      // Sync admin role
      if (editAdmin) {
        await supabase.from("user_roles").upsert({ user_id: editing.id, role: "admin" }, { onConflict: "user_id,role" });
      } else {
        await supabase.from("user_roles").delete().eq("user_id", editing.id).eq("role", "admin");
      }
      // Sync modules: replace all
      await supabase.from("user_module_access").delete().eq("user_id", editing.id);
      const rows = Array.from(editModules).map(k => ({ user_id: editing.id, module_key: k, granted_by: user?.id ?? null }));
      if (rows.length) {
        const { error } = await supabase.from("user_module_access").insert(rows);
        if (error) throw error;
      }
      toast.success(`Updated ${editName || editing.full_name}`);
      setEditing(null);
      await load();
      if (editing.id === user?.id) await refreshProfile();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update access");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[780px]">
      <PageHead title="Team Directory" sub="All active IPC team members and their roles." back />
      {members.length === 0 && <div className="font-sans text-sm text-muted-foreground">No active members yet.</div>}
      <div className="grid grid-cols-2 gap-3">
        {members.map((m, i) => {
          const alt = i % 2 === 1;
          const today = m.last_login && new Date(m.last_login).toDateString() === new Date().toDateString();
          return (
            <div key={m.id} className="border border-line rounded-xl py-5 px-[22px] flex items-center gap-3.5 hover:bg-off transition-colors relative">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-serif text-sm font-medium flex-shrink-0
                ${alt ? "bg-gold-pale border border-gold-mid text-gold-deep" : "bg-black text-gold"}`}>
                {initials(m.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[17px] font-medium text-black mb-0.5 truncate">{m.full_name}</div>
                <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{m.role}</div>
              </div>
              {m.last_login && (
                <div className="font-sans text-[10px] text-muted-foreground whitespace-nowrap text-right">
                  {today ? `Today ${formatTime(m.last_login)}` : formatDateShort(m.last_login)}
                </div>
              )}
              {isAdmin && (
                <button
                  onClick={() => openEdit(m)}
                  className="absolute top-2 right-2 h-7 px-2 rounded-md border border-line bg-white hover:bg-off text-[10px] font-sans uppercase tracking-wider flex items-center gap-1 text-muted-foreground hover:text-black transition-colors"
                  title="Manage access"
                >
                  <Shield className="w-3 h-3" /> Access
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-6" onClick={() => !saving && setEditing(null)}>
          <div className="bg-white rounded-xl w-full max-w-[520px] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-line">
              <div>
                <div className="font-serif text-[20px] font-medium text-black">Manage member</div>
                <div className="font-sans text-[12px] text-muted-foreground mt-0.5">{editing.full_name} · {editing.role}</div>
              </div>
              <button onClick={() => setEditing(null)} disabled={saving} className="text-muted-foreground hover:text-black"><X className="w-4 h-4" /></button>
            </div>

            <div className="px-6 py-4 border-b border-line">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editAdmin} onChange={(e) => setEditAdmin(e.target.checked)} className="w-4 h-4" />
                <div>
                  <div className="font-serif text-[15px] text-black">Admin access</div>
                  <div className="font-sans text-[11px] text-muted-foreground">Full access to all modules, including Admin Panel.</div>
                </div>
              </label>
            </div>

            <div className="px-6 py-4">
              <div className="font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">Module access</div>
              {Array.from(new Set(MODULES.map(m => m.group))).map(group => (
                <div key={group} className="mb-4">
                  <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{group}</div>
                  <div className="space-y-1.5">
                    {MODULES.filter(m => m.group === group).map(mod => (
                      <label key={mod.key} className={`flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer transition-colors ${editAdmin ? "opacity-50 bg-off border-line" : editModules.has(mod.key) ? "bg-off border-line" : "border-line hover:bg-off"}`}>
                        <input
                          type="checkbox"
                          checked={editAdmin || editModules.has(mod.key)}
                          disabled={editAdmin}
                          onChange={() => toggleModule(mod.key)}
                          className="w-4 h-4"
                        />
                        <span className="font-serif text-[14px] text-black">{mod.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 pb-5 pt-2 flex justify-end gap-2 border-t border-line">
              <button onClick={() => setEditing(null)} disabled={saving} className="ipc-btn">Cancel</button>
              <button onClick={save} disabled={saving} className="ipc-btn ipc-btn-black">{saving ? "Saving…" : "Save access"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
