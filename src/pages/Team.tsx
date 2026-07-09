import { useEffect, useState } from "react";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { initials, formatTime, formatDateShort } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { moduleAliases } from "@/lib/eligibleAssignees";
import PayrollFieldsSection, { emptyPayroll, dbToPayroll, payrollToDb, type PayrollFormState } from "@/components/PayrollFieldsSection";
import QuickSaveInput from "@/components/QuickSaveInput";
import { toast } from "sonner";
import { X } from "lucide-react";
import { logActivity } from "@/lib/auditLog";
import MemberActionMenu from "@/components/team/MemberActionMenu";
import MemberActionModal from "@/components/team/MemberActionModal";
import MemberAssignedLeadsModal from "@/components/team/MemberAssignedLeadsModal";
import ApplyTemplateModal from "@/components/team/ApplyTemplateModal";

interface Member {
  id: string;
  full_name: string;
  role: string;
  department: string | null;
  email: string | null;
  last_login: string | null;
  deactivated_at: string | null;
  deactivation_reason: string | null;
}


type EligibilityFlags = {
  can_receive_calling_crm_leads: boolean;
  can_receive_paid_pipeline_leads: boolean;
  can_receive_follow_up_tasks: boolean;
  can_receive_payment_recovery_leads: boolean;
  can_receive_media_buyer_cases: boolean;
  can_receive_operations_leads: boolean;
  include_in_round_robin: boolean;
  active_for_assignment: boolean;
};
const emptyEligibility = (): EligibilityFlags => ({
  can_receive_calling_crm_leads: false,
  can_receive_paid_pipeline_leads: false,
  can_receive_follow_up_tasks: false,
  can_receive_payment_recovery_leads: false,
  can_receive_media_buyer_cases: false,
  can_receive_operations_leads: false,
  include_in_round_robin: false,
  active_for_assignment: true,
});


export default function Team() {
  const { isAdmin, user, refreshProfile } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<Member | null>(null);
  const [editAdmin, setEditAdmin] = useState(false);
  const [editModules, setEditModules] = useState<Set<ModuleKey>>(new Set());
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editPayroll, setEditPayroll] = useState<PayrollFormState>(emptyPayroll());
  const [editEligibility, setEditEligibility] = useState<EligibilityFlags>(emptyEligibility());
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState<"active" | "deactivated" | "all">("active");
  const [actionModal, setActionModal] = useState<{ action: "deactivate" | "remove_access" | "restore" | "delete"; member: Member } | null>(null);
  const [assignedLeadsMember, setAssignedLeadsMember] = useState<Member | null>(null);

  // ─── Login Access (admin only) ───
  type AuthState = "active" | "confirmed" | "invited" | "unconfirmed" | "no_auth" | "unknown";
  interface AuthRow { state: AuthState; last_sign_in_at: string | null; user_id: string | null }
  const [authStatus, setAuthStatus] = useState<Record<string, AuthRow>>({});
  const [authBusy, setAuthBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadAuthStatus = async (rows: Member[]) => {
    if (!isAdmin) return;
    const emails = Array.from(new Set(rows.map((r) => (r.email || "").toLowerCase()).filter(Boolean)));
    if (!emails.length) { setAuthStatus({}); return; }
    try {
      const { data, error } = await supabase.functions.invoke("admin-team-auth", { body: { op: "status", emails } });
      if (error) throw error;
      setAuthStatus(((data as any)?.statuses ?? {}) as Record<string, AuthRow>);
    } catch (e) {
      console.warn("[team] auth status fetch failed", e);
    }
  };

  const load = async () => {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, role, department, email, deactivated_at, deactivation_reason").neq("status","pending").order("full_name");
    const { data: logs } = await supabase.from("attendance_logs").select("user_id, login_time").order("login_time", { ascending: false });
    const lastByUser = new Map<string, string>();
    logs?.forEach(l => { if (!lastByUser.has(l.user_id)) lastByUser.set(l.user_id, l.login_time); });
    const next = (profiles ?? []).map((p: any) => ({ ...p, last_login: lastByUser.get(p.id) ?? null }));
    setMembers(next);
    loadAuthStatus(next);
  };


  useEffect(() => { load(); }, []);

  const getAuthFor = (m: Member): AuthRow => {
    const em = (m.email || "").toLowerCase();
    if (!em) return { state: "unknown", last_sign_in_at: null, user_id: null };
    return authStatus[em] ?? { state: "unknown", last_sign_in_at: null, user_id: null };
  };

  const sendInvite = async (m: Member) => {
    if (!m.email) { toast.error("Member has no email"); return; }
    if (!confirm(`Send invite email to ${m.email}?`)) return;
    setAuthBusy(m.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-team-auth", {
        body: { op: "invite", email: m.email, redirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Invite sent to ${m.email}`);
      logActivity({
        module_key: "team_directory", action_type: "invite_sent",
        entity_type: "team_member", entity_id: m.id, entity_label: m.full_name,
        target_user_id: m.id, target_name: m.full_name,
        summary: `Invite email sent to ${m.email}.`, severity: "info",
      });
      loadAuthStatus(members);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send invite");
    } finally { setAuthBusy(null); }
  };

  const sendReset = async (m: Member) => {
    if (!m.email) { toast.error("Member has no email"); return; }
    if (!confirm(`Send password reset email to ${m.email}?`)) return;
    setAuthBusy(m.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-team-auth", {
        body: { op: "reset", email: m.email, redirectTo: `${window.location.origin}/reset-password` },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Password reset sent to ${m.email}`);
      logActivity({
        module_key: "team_directory", action_type: "password_reset_sent",
        entity_type: "team_member", entity_id: m.id, entity_label: m.full_name,
        target_user_id: m.id, target_name: m.full_name,
        summary: `Password reset email sent to ${m.email}.`, severity: "warning",
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send reset");
    } finally { setAuthBusy(null); }
  };

  const toggleSelected = (id: string) => setSelected((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const bulkReset = async () => {
    const targets = members.filter((m) => selected.has(m.id));
    const eligible = targets.filter((m) => {
      if (!m.email) return false;
      const st = getAuthFor(m).state;
      return st === "active" || st === "confirmed";
    });
    const skipped = targets.length - eligible.length;
    if (!eligible.length) {
      toast.error(`No eligible members${skipped ? ` (${skipped} skipped — no active auth)` : ""}`);
      return;
    }
    if (!confirm(`Send password reset to ${eligible.length} member(s)?${skipped ? ` ${skipped} will be skipped.` : ""}`)) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const m of eligible) {
      try {
        const { data, error } = await supabase.functions.invoke("admin-team-auth", {
          body: { op: "reset", email: m.email, redirectTo: `${window.location.origin}/reset-password` },
        });
        if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
        ok++;
        logActivity({
          module_key: "team_directory", action_type: "password_reset_sent",
          entity_type: "team_member", entity_id: m.id, entity_label: m.full_name,
          target_user_id: m.id, target_name: m.full_name,
          summary: `Password reset email sent to ${m.email} (bulk).`, severity: "warning",
        });
      } catch (e) {
        console.warn("[bulk reset] failed for", m.email, e);
        fail++;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    toast.success(`Reset: ${ok} sent, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}`);
  };

  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const fetchMemberAccess = async (m: Member) => {
    setAccessError(null);
    setAccessLoading(true);
    try {
      if (!m?.id) throw new Error("Missing team member id");
      const [rolesRes, modsRes, payrollRes, eligRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", m.id),
        supabase.from("user_module_access").select("module_key").eq("user_id", m.id),
        supabase.from("team_payroll_profiles").select("*").eq("team_member_id", m.id).maybeSingle(),
        supabase.from("profiles").select("can_receive_calling_crm_leads, can_receive_paid_pipeline_leads, can_receive_follow_up_tasks, can_receive_payment_recovery_leads, can_receive_media_buyer_cases, can_receive_operations_leads, include_in_round_robin, active_for_assignment").eq("id", m.id).maybeSingle(),
      ]);
      if (rolesRes.error) throw rolesRes.error;
      if (modsRes.error) throw modsRes.error;
      if (payrollRes.error && payrollRes.error.code !== "PGRST116") throw payrollRes.error;
      setEditAdmin(!!rolesRes.data?.some((r: any) => r.role === "admin"));
      setEditModules(new Set((modsRes.data ?? []).map((x: any) => x.module_key as ModuleKey)));
      setEditPayroll(payrollRes.data ? dbToPayroll(payrollRes.data) : emptyPayroll());
      setEditEligibility(eligRes.data ? {
        can_receive_calling_crm_leads: !!(eligRes.data as any).can_receive_calling_crm_leads,
        can_receive_paid_pipeline_leads: !!(eligRes.data as any).can_receive_paid_pipeline_leads,
        can_receive_follow_up_tasks: !!(eligRes.data as any).can_receive_follow_up_tasks,
        can_receive_payment_recovery_leads: !!(eligRes.data as any).can_receive_payment_recovery_leads,
        can_receive_media_buyer_cases: !!(eligRes.data as any).can_receive_media_buyer_cases,
        can_receive_operations_leads: !!(eligRes.data as any).can_receive_operations_leads,
        include_in_round_robin: !!(eligRes.data as any).include_in_round_robin,
        active_for_assignment: (eligRes.data as any).active_for_assignment !== false,
      } : emptyEligibility());
    } catch (e: any) {
      console.error("access fetch failed", e);
      setAccessError("Could not load access settings. Please retry.");
      setEditAdmin(false);
      setEditModules(new Set());
      setEditPayroll(emptyPayroll());
      setEditEligibility(emptyEligibility());
    } finally {
      setAccessLoading(false);
    }
  };

  const openEdit = async (m: Member) => {
    setEditing(m);
    setEditName(m.full_name ?? "");
    setEditRole(m.role ?? "");
    setEditDepartment(m.department ?? "");
    setEditPayroll(emptyPayroll());
    setEditAdmin(false);
    setEditModules(new Set());
    setEditEligibility(emptyEligibility());
    await fetchMemberAccess(m);
  };

  const toggleEligibility = (k: keyof EligibilityFlags) =>
    setEditEligibility((p) => ({ ...p, [k]: !p[k] }));

  const hasModuleChecked = (k: ModuleKey) =>
    moduleAliases(k as string).some((a) => editModules.has(a as ModuleKey));

  const toggleModule = (k: ModuleKey) => {
    setEditModules(prev => {
      const n = new Set(prev);
      const aliases = moduleAliases(k as string) as ModuleKey[];
      const has = aliases.some((a) => n.has(a));
      if (has) {
        // remove all aliases
        aliases.forEach((a) => n.delete(a));
      } else {
        // grant canonical key
        n.add(k);
      }
      return n;
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    // Snapshot pre-save state for diffing
    const oldProfile = {
      full_name: editing.full_name, role: editing.role, department: editing.department,
    };
    const oldEligibility = { ...editEligibility };
    const oldModules = new Set<string>();
    const oldAdmin = editAdmin;
    try {
      const [prevModsRes, prevElig, prevRoles] = await Promise.all([
        supabase.from("user_module_access").select("module_key").eq("user_id", editing.id),
        supabase.from("profiles").select("can_receive_calling_crm_leads, can_receive_paid_pipeline_leads, can_receive_follow_up_tasks, can_receive_payment_recovery_leads, can_receive_media_buyer_cases, can_receive_operations_leads, include_in_round_robin, active_for_assignment").eq("id", editing.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", editing.id),
      ]);
      (prevModsRes.data ?? []).forEach((m: any) => oldModules.add(m.module_key));
      const prevElig2: any = prevElig.data || {};
      const prevAdmin = !!(prevRoles.data ?? []).find((r: any) => r.role === "admin");

      const newProfile = {
        full_name: editName.trim() || editing.full_name,
        role: editRole.trim() || editing.role,
        department: editDepartment.trim() || null,
        can_receive_calling_crm_leads: editEligibility.can_receive_calling_crm_leads,
        can_receive_paid_pipeline_leads: editEligibility.can_receive_paid_pipeline_leads,
        can_receive_follow_up_tasks: editEligibility.can_receive_follow_up_tasks,
        can_receive_payment_recovery_leads: editEligibility.can_receive_payment_recovery_leads,
        can_receive_media_buyer_cases: editEligibility.can_receive_media_buyer_cases,
        can_receive_operations_leads: editEligibility.can_receive_operations_leads,
        include_in_round_robin: editEligibility.include_in_round_robin,
        active_for_assignment: editEligibility.active_for_assignment,
      };

      const { error: pErr } = await supabase.from("profiles").update(newProfile as any).eq("id", editing.id);
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
      // Upsert payroll profile
      if (isAdmin) {
        if (editPayroll.payroll_applicable && !editPayroll.joining_date) {
          throw new Error("Joining date is required for payroll-applicable members.");
        }
        const payload = {
          team_member_id: editing.id,
          full_name_snapshot: editName.trim() || editing.full_name,
          role_snapshot: editRole.trim() || editing.role,
          department_snapshot: editDepartment.trim() || null,
          ...payrollToDb(editPayroll),
          updated_by: user?.id ?? null,
        };
        const { error: payErr } = await supabase
          .from("team_payroll_profiles")
          .upsert(payload, { onConflict: "team_member_id" });
        if (payErr) throw payErr;
        logActivity({ module_key: "team_directory", action_type: "payroll_details_updated", entity_type: "team_member", entity_id: editing.id, entity_label: newProfile.full_name, target_user_id: editing.id, target_name: newProfile.full_name, summary: `Payroll details updated for ${newProfile.full_name}.` });
      }

      // ─── Audit logging ───
      const memberName = newProfile.full_name;
      const t = { module_key: "team_directory", entity_type: "team_member", entity_id: editing.id, entity_label: memberName, target_user_id: editing.id, target_name: memberName };
      if (oldProfile.full_name !== newProfile.full_name || oldProfile.role !== newProfile.role || (oldProfile.department ?? null) !== (newProfile.department ?? null)) {
        logActivity({ ...t, action_type: "team_member_updated", old_values: oldProfile, new_values: { full_name: newProfile.full_name, role: newProfile.role, department: newProfile.department }, summary: `${memberName} profile updated.` });
      }
      if (oldProfile.role !== newProfile.role) {
        logActivity({ ...t, action_type: "role_changed", old_values: { role: oldProfile.role }, new_values: { role: newProfile.role }, summary: `Role changed from ${oldProfile.role ?? "—"} to ${newProfile.role ?? "—"} for ${memberName}.` });
      }
      if ((oldProfile.department ?? null) !== (newProfile.department ?? null)) {
        logActivity({ ...t, action_type: "department_changed", old_values: { department: oldProfile.department }, new_values: { department: newProfile.department }, summary: `Department changed for ${memberName}.` });
      }
      if (prevAdmin !== editAdmin) {
        logActivity({ ...t, action_type: editAdmin ? "module_access_granted" : "module_access_removed", old_values: { admin: prevAdmin }, new_values: { admin: editAdmin }, summary: `Admin role ${editAdmin ? "granted to" : "removed from"} ${memberName}.`, severity: "warning" });
      }
      const newModSet = new Set(Array.from(editModules) as string[]);
      const granted = [...newModSet].filter((k) => !oldModules.has(k));
      const removed = [...oldModules].filter((k) => !newModSet.has(k));
      granted.forEach((k) => logActivity({ ...t, action_type: "module_access_granted", entity_label: memberName, old_values: { [k]: false }, new_values: { [k]: true }, summary: `${k} access granted to ${memberName}.` }));
      removed.forEach((k) => logActivity({ ...t, action_type: "module_access_removed", entity_label: memberName, old_values: { [k]: true }, new_values: { [k]: false }, summary: `${k} access removed from ${memberName}.`, severity: "warning" }));
      const eligKeys: (keyof EligibilityFlags)[] = ["can_receive_calling_crm_leads","can_receive_paid_pipeline_leads","can_receive_follow_up_tasks","can_receive_payment_recovery_leads","can_receive_media_buyer_cases","can_receive_operations_leads","include_in_round_robin","active_for_assignment"];
      const eligDiff: any = { old: {}, new: {} }; let eligChanged = false;
      eligKeys.forEach((k) => {
        const ov = !!prevElig2[k]; const nv = !!editEligibility[k];
        if (ov !== nv) { eligDiff.old[k] = ov; eligDiff.new[k] = nv; eligChanged = true; }
      });
      if (eligChanged) {
        logActivity({ ...t, action_type: "assignment_eligibility_updated", old_values: eligDiff.old, new_values: eligDiff.new, summary: `Assignment eligibility updated for ${memberName}.` });
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

  const visible = members.filter((m) => filter === "all" ? true : filter === "deactivated" ? !!m.deactivated_at : !m.deactivated_at);

  return (
    <div className="max-w-[780px]">
      <PageHead title="Team Directory" sub="All IPC team members and their roles." back />
      <div className="flex items-center gap-1 mb-3 border border-line rounded-md p-0.5 w-fit bg-off">
        {(["active","deactivated","all"] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 h-7 rounded text-[11px] font-sans uppercase tracking-wider ${filter === k ? "bg-white text-black shadow-sm" : "text-muted-foreground hover:text-black"}`}>
            {k === "active" ? "Active" : k === "deactivated" ? "Deactivated" : "All"}
            <span className="ml-1.5 text-muted-foreground/70 normal-case tracking-normal">
              ({k === "active" ? members.filter(m=>!m.deactivated_at).length : k === "deactivated" ? members.filter(m=>!!m.deactivated_at).length : members.length})
            </span>
          </button>
        ))}
      </div>
      {isAdmin && (() => {
        const eligibleForBulk = members.filter((m) => {
          if (!m.email || m.deactivated_at) return false;
          const st = getAuthFor(m).state;
          return st === "active" || st === "confirmed";
        });
        const allSelected = eligibleForBulk.length > 0 && eligibleForBulk.every((m) => selected.has(m.id));
        const someSelected = eligibleForBulk.some((m) => selected.has(m.id));
        return (
          <div className="mb-3 flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-line bg-off">
            <label className="flex items-center gap-2 font-sans text-[12px] text-black cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelected(new Set(eligibleForBulk.map((m) => m.id)));
                  } else {
                    setSelected(new Set());
                  }
                }}
                disabled={eligibleForBulk.length === 0}
              />
              Select all eligible ({eligibleForBulk.length})
              {selected.size > 0 && <span className="text-muted-foreground">· {selected.size} selected</span>}
            </label>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="h-7 px-2 rounded-md border border-line bg-white text-[11px] font-sans hover:bg-off">Clear</button>
              )}
              <button onClick={bulkReset} disabled={bulkBusy || selected.size === 0} className="h-7 px-3 rounded-md bg-black text-white text-[11px] font-sans disabled:opacity-40">
                {bulkBusy ? "Sending…" : `Send Password Reset${selected.size > 0 ? ` (${selected.size})` : ""}`}
              </button>
            </div>
          </div>
        );
      })()}
      {visible.length === 0 && <div className="font-sans text-sm text-muted-foreground">No members in this view.</div>}
      <div className="grid grid-cols-2 gap-3">
        {visible.map((m, i) => {
          const alt = i % 2 === 1;
          const today = m.last_login && new Date(m.last_login).toDateString() === new Date().toDateString();
          const isDeact = !!m.deactivated_at;
          const auth = getAuthFor(m);
          const stateMeta: Record<AuthState, { label: string; cls: string }> = {
            active: { label: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
            confirmed: { label: "Confirmed", cls: "bg-blue-50 text-blue-700 border-blue-200" },
            invited: { label: "Invite Sent", cls: "bg-amber-50 text-amber-800 border-amber-200" },
            unconfirmed: { label: "Unconfirmed", cls: "bg-orange-50 text-orange-700 border-orange-200" },
            no_auth: { label: "Not Invited", cls: "bg-muted text-muted-foreground border-line" },
            unknown: { label: "—", cls: "bg-muted text-muted-foreground border-line" },
          };
          const sm = stateMeta[auth.state];
          const busy = authBusy === m.id;
          return (
            <div key={m.id} className={`border border-line rounded-xl py-5 px-[22px] flex items-start gap-3.5 transition-colors relative ${isDeact ? "bg-off/60 opacity-75" : "hover:bg-off"}`}>
              {isAdmin && !isDeact && m.email && (
                <input
                  type="checkbox"
                  className="mt-1.5 w-4 h-4"
                  checked={selected.has(m.id)}
                  onChange={() => toggleSelected(m.id)}
                  title="Select for bulk action"
                />
              )}
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-serif text-sm font-medium flex-shrink-0
                ${isDeact ? "bg-muted text-muted-foreground" : alt ? "bg-gold-pale border border-gold-mid text-gold-deep" : "bg-black text-gold"}`}>
                {initials(m.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[17px] font-medium text-black mb-0.5 truncate flex items-center gap-2">
                  {m.full_name}
                  {isDeact && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-amber-50 text-amber-800 border border-amber-200 uppercase tracking-wider">Deactivated</span>}
                </div>
                <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{m.role}</div>
                <div className="font-sans text-[11px] text-muted-foreground truncate mt-0.5" title={m.email || undefined}>
                  {m.email || <span className="italic">Email not available</span>}
                  {m.email && members.filter((x) => (x.email || "").toLowerCase() === m.email!.toLowerCase()).length > 1 && (
                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-red-50 text-red-700 border border-red-200">Duplicate email</span>
                  )}
                </div>
                {isAdmin && m.email && !isDeact && (
                  <div className="mt-1.5 flex items-center flex-wrap gap-1.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${sm.cls}`} title={auth.last_sign_in_at ? `Last sign-in: ${formatDateShort(auth.last_sign_in_at)}` : undefined}>
                      Login: {sm.label}
                    </span>
                    {(auth.state === "no_auth" || auth.state === "invited" || auth.state === "unconfirmed") && (
                      <button onClick={() => sendInvite(m)} disabled={busy} className="h-6 px-2 rounded-md border border-line bg-white hover:bg-off font-sans text-[10px] disabled:opacity-50">
                        {auth.state === "invited" ? "Resend Invite" : "Send Invite"}
                      </button>
                    )}
                    {(auth.state === "active" || auth.state === "confirmed") && (
                      <button onClick={() => sendReset(m)} disabled={busy} className="h-6 px-2 rounded-md border border-line bg-white hover:bg-off font-sans text-[10px] disabled:opacity-50">
                        Send Reset
                      </button>
                    )}
                  </div>
                )}
                {isDeact && (
                  <div className="font-sans text-[10px] text-amber-700 mt-1">
                    Deactivated {m.deactivated_at ? formatDateShort(m.deactivated_at) : ""}{m.deactivation_reason ? ` · ${m.deactivation_reason}` : ""}
                  </div>
                )}
              </div>
              {m.last_login && !isDeact && (
                <div className="font-sans text-[10px] text-muted-foreground whitespace-nowrap text-right mr-7">
                  {today ? `Today ${formatTime(m.last_login)}` : formatDateShort(m.last_login)}
                </div>
              )}
              {isAdmin && (
                <MemberActionMenu
                  isAdmin={isAdmin}
                  isDeactivated={isDeact}
                  onManage={() => openEdit(m)}
                  onAssignedLeads={() => setAssignedLeadsMember(m)}
                  onDeactivate={() => setActionModal({ action: "deactivate", member: m })}
                  onRemoveAccess={() => setActionModal({ action: "remove_access", member: m })}
                  onRestore={() => setActionModal({ action: "restore", member: m })}
                  onDelete={() => setActionModal({ action: "delete", member: m })}
                />
              )}
            </div>
          );
        })}
      </div>

      {actionModal && user && (
        <MemberActionModal
          action={actionModal.action}
          member={actionModal.member}
          actorId={user.id}
          onClose={() => setActionModal(null)}
          onDone={load}
        />
      )}
      {assignedLeadsMember && (
        <MemberAssignedLeadsModal
          memberId={assignedLeadsMember.id}
          memberName={assignedLeadsMember.full_name || "Member"}
          onClose={() => setAssignedLeadsMember(null)}
        />
      )}


      {editing && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-6" onClick={() => !saving && setEditing(null)}>
          <div className="bg-white rounded-xl w-full max-w-[860px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-7 pt-6 pb-4 border-b border-line sticky top-0 bg-white z-10">
              <div>
                <div className="font-serif text-[22px] font-medium text-black">Manage member</div>
                <div className="font-sans text-[12px] text-muted-foreground mt-0.5">{editing.full_name} · {editing.role}</div>
              </div>
              <button onClick={() => setEditing(null)} disabled={saving} className="text-muted-foreground hover:text-black"><X className="w-4 h-4" /></button>
            </div>

            <div className="px-7 py-5 border-b border-line space-y-3">
              <div className="font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Profile</div>
              <div>
                <label className="font-sans text-[11px] text-muted-foreground block mb-1">Login email</label>
                <div className="flex items-center gap-2">
                  <input
                    value={editing.email || ""}
                    readOnly
                    placeholder="Email not available"
                    className="flex-1 h-9 px-3 rounded-md border border-line bg-off font-sans text-sm text-muted-foreground cursor-not-allowed"
                    title="Login email is read-only"
                  />
                  {isAdmin && editing.email && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!editing?.email) return;
                        if (!confirm(`Send a password reset link to ${editing.email}?`)) return;
                        try {
                          const { error } = await supabase.auth.resetPasswordForEmail(editing.email, {
                            redirectTo: `${window.location.origin}/reset-password`,
                          });
                          if (error) throw error;
                          await logActivity({
                            module_key: "team_directory",
                            action_type: "password_reset_link_sent",
                            entity_type: "team_member",
                            entity_id: editing.id,
                            entity_label: editing.full_name,
                            target_user_id: editing.id,
                            target_name: editing.full_name,
                            summary: `Password reset link sent to ${editing.email} for ${editing.full_name}.`,
                            severity: "warning",
                          });
                          toast.success(`Password reset link sent to ${editing.email}`);
                        } catch (e: any) {
                          toast.error(e.message ?? "Failed to send reset link");
                        }
                      }}
                      className="h-9 px-3 rounded-md border border-line bg-white hover:bg-off font-sans text-[12px] whitespace-nowrap"
                      title="Send password reset email to this member"
                    >
                      Send reset link
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="font-sans text-[11px] text-muted-foreground block mb-1">Full name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full h-9 px-3 rounded-md border border-line bg-white font-sans text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-sans text-[11px] text-muted-foreground block mb-1">Position / Role</label>
                  <QuickSaveInput
                    fieldKey="team_role"
                    value={editRole}
                    onChange={setEditRole}
                    placeholder="Click to choose saved role or type new"
                  />
                </div>
                <div>
                  <label className="font-sans text-[11px] text-muted-foreground block mb-1">Department</label>
                  <QuickSaveInput
                    fieldKey="department"
                    value={editDepartment}
                    onChange={setEditDepartment}
                    placeholder="e.g. Marketing"
                  />
                </div>
              </div>
            </div>

            <div className="px-7 py-5 border-b border-line">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editAdmin} onChange={(e) => setEditAdmin(e.target.checked)} className="w-4 h-4" />
                <div>
                  <div className="font-serif text-[15px] text-black">Admin access</div>
                  <div className="font-sans text-[11px] text-muted-foreground">Full access to all modules, including Admin Panel. Admins can access everything, but will <span className="font-medium">not</span> receive leads unless assignment eligibility is enabled below.</div>
                </div>
              </label>
            </div>

            <div className="px-7 py-5 border-b border-line">
              <div className="font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">Assignment eligibility</div>
              <div className="font-sans text-[11px] text-muted-foreground mb-3 leading-relaxed">
                Module access controls what this member can <span className="font-medium">open</span>. Assignment eligibility controls whether this member can <span className="font-medium">receive</span> leads, tasks, or round-robin assignments.
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["active_for_assignment", "Active for assignments"],
                  ["can_receive_calling_crm_leads", "Can receive Calling CRM leads"],
                  ["can_receive_paid_pipeline_leads", "Can receive Paid Pipeline leads"],
                  ["can_receive_follow_up_tasks", "Can receive Follow-Up tasks"],
                  ["can_receive_payment_recovery_leads", "Can receive Payment Recovery leads"],
                  ["can_receive_media_buyer_cases", "Can receive Media Buyer cases"],
                  ["can_receive_operations_leads", "Can receive Operations CRM leads"],
                  ["include_in_round_robin", "Include in Round Robin"],
                ] as [keyof EligibilityFlags, string][]).map(([key, label]) => (
                  <label key={key} className={`flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer transition-colors ${editEligibility[key] ? "bg-off border-line" : "border-line hover:bg-off"}`}>
                    <input
                      type="checkbox"
                      checked={!!editEligibility[key]}
                      onChange={() => toggleEligibility(key)}
                      className="w-4 h-4"
                    />
                    <span className="font-serif text-[14px] text-black">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="px-7 py-5">
              <div className="font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3 flex items-center justify-between">
                <span>Module access</span>
                {accessLoading && <span className="text-[10px] normal-case tracking-normal">Loading…</span>}
              </div>
              {accessError && (
                <div className="mb-3 p-3 rounded-md border border-line bg-off flex items-center justify-between">
                  <span className="font-sans text-[12px] text-black">{accessError}</span>
                  <button onClick={() => editing && fetchMemberAccess(editing)} className="h-7 px-2 rounded-md border border-line bg-white text-[11px] font-sans hover:bg-off">Retry</button>
                </div>
              )}
              {Array.from(new Set(MODULES.map(m => m.group))).map(group => (
                <div key={group} className="mb-4">
                  <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{group}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {MODULES.filter(m => m.group === group).map(mod => {
                      const checked = hasModuleChecked(mod.key);
                      return (
                      <label key={mod.key} className={`flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer transition-colors ${editAdmin ? "opacity-50 bg-off border-line" : checked ? "bg-off border-line" : "border-line hover:bg-off"}`}>
                        <input
                          type="checkbox"
                          checked={editAdmin || checked}
                          disabled={editAdmin}
                          onChange={() => toggleModule(mod.key)}
                          className="w-4 h-4"
                        />
                        <span className="font-serif text-[14px] text-black">{mod.label}</span>
                      </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {isAdmin && (
              <div className="px-7 py-5 border-t border-line">
                <div className="font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">Payroll</div>
                <PayrollFieldsSection value={editPayroll} onChange={setEditPayroll} />
              </div>
            )}

            <div className="px-7 pb-5 pt-3 flex justify-end gap-2 border-t border-line sticky bottom-0 bg-white z-10">
              <button onClick={() => setEditing(null)} disabled={saving} className="ipc-btn">Cancel</button>
              <button onClick={save} disabled={saving} className="ipc-btn ipc-btn-black">{saving ? "Saving…" : "Save changes"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
