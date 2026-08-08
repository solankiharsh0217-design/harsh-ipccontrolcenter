import { useEffect, useState } from "react";
import { PageHead, SectionLabel, EmptyRow, EmptyState } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { formatTime, formatDateShort } from "@/lib/format";
import QuickSaveInput from "@/components/QuickSaveInput";
import PayrollFieldsSection, { emptyPayroll, PayrollFormState, payrollToDb } from "@/components/PayrollFieldsSection";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { logActivity } from "@/lib/auditLog";
import { listRoles, ensureRoleLabel, type RoleCatalogRow } from "@/lib/roleCategory";

const ROLE_PRESETS: Record<string, ModuleKey[]> = {
  "Admin": MODULES.map(m => m.key),
  "Media Buyer": ["dashboard","roas","daily-reporting","reports"],
  "Backend Operations": ["dashboard","search","daily-reporting","reports","calling_crm"],
  "Telecaller": ["dashboard","calling_crm","search","lead-qualifier"],
  "Sales Executive": ["dashboard","calling_crm","paid_pipeline","follow_up_command_center","payment_recovery","lead-qualifier","reports"],
  "Sales Agent": ["dashboard","calling_crm","lead-qualifier"],
  "Sales Manager": ["dashboard","calling_crm","paid_pipeline","follow_up_command_center","payment_recovery","lead-qualifier","reports","search"],
  "Content Creator": ["dashboard","announcements"],
  "Community Manager": ["dashboard","announcements","search","calling_crm"],
  "Operations Lead": ["dashboard","reports","daily-reporting","team","master-data"],
  "Finance Executive": ["dashboard","reports","profit-statement","master-data","follow_up_command_center","payment_recovery"],
  "Support Executive": ["dashboard","calling_crm","search"],
  "Photography Lead": ["dashboard","announcements"],
};

export default function Admin() {
  const { user } = useAuth();
  const [pending, setPending] = useState<any[]>([]);
  const [stats, setStats] = useState({ active:0, today:0, pending:0, anns:0 });
  const [logs, setLogs] = useState<any[]>([]);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [roleCatalog, setRoleCatalog] = useState<RoleCatalogRow[]>([]);
  const [newRoleLabel, setNewRoleLabel] = useState("");

  const syncStudents = async () => {
    setSyncBusy(true);
    const { data, error } = await supabase.functions.invoke("import-students");
    setSyncBusy(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error || error!.message);
    const r = (data as any).results || {};
    const parts = Object.entries(r).map(([k, v]: any) => `${k}: ${v.imported}`).join(" · ");
    toast.success(`Student database synced — ${parts}`);
    load();
  };

  // announcement form
  const [aTitle, setATitle] = useState("");
  const [aBody, setABody] = useState("");
  const [aTag, setATag] = useState<"info"|"update"|"urgent">("info");
  const [busy, setBusy] = useState(false);

  // add member form
  const [mName, setMName] = useState("");
  const [mEmail, setMEmail] = useState("");
  const [mPass, setMPass] = useState("");
  const [mRole, setMRole] = useState("Media Buyer");
  const [mDept, setMDept] = useState("");
  const [mPayroll, setMPayroll] = useState<PayrollFormState>(emptyPayroll());
  const [mIsAdmin, setMIsAdmin] = useState(false);
  const [mModules, setMModules] = useState<Set<ModuleKey>>(new Set(["dashboard","announcements"]));
  const [mBusy, setMBusy] = useState(false);

  const toggleMModule = (k: ModuleKey) =>
    setMModules(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const applyRolePreset = () => {
    const preset = ROLE_PRESETS[mRole.trim()];
    if (!preset) {
      toast.message("No preset for this role — please select modules manually.");
      return;
    }
    setMModules(new Set(preset));
    if (mRole.trim() === "Admin") setMIsAdmin(true);
    toast.success(`Applied ${mRole} preset (${preset.length} modules).`);
  };

  const addMember = async () => {
    if (!mName.trim()) return toast.error("Full name is required.");
    const email = mEmail.trim().toLowerCase();
    if (!email) return toast.error("Email is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Please enter a valid email.");
    if (!mPass || mPass.length < 6) return toast.error("Temporary password must be at least 6 characters.");
    if (!mRole.trim()) return toast.error("Please select or add a role.");
    if (mPayroll.payroll_applicable && !mPayroll.joining_date) return toast.error("Joining date is required for payroll-applicable members.");
    if (mPayroll.payroll_applicable) {
      const pt = mPayroll.pay_type;
      if (["Monthly Salary","Retainer","Internship / Stipend"].includes(pt) && !Number(mPayroll.monthly_salary)) return toast.error("Monthly salary amount is required.");
      if (["One-Time / Outsourced","Project-Based","Event-Based"].includes(pt) && !Number(mPayroll.one_time_pay)) return toast.error("One-time / project / event pay amount is required.");
      if (pt === "Daily Wage" && !Number(mPayroll.daily_wage)) return toast.error("Daily wage amount is required.");
      if (pt === "Hourly Pay" && !Number(mPayroll.hourly_rate)) return toast.error("Hourly rate is required.");
    }
    if (!mIsAdmin && mModules.size === 0) return toast.error("Select at least one module or enable Admin access.");
    if (mModules.has("admin") && !mIsAdmin) {
      if (!confirm("Admin Panel access gives sensitive system access. Are you sure?")) return;
    }
    setMBusy(true);
    logActivity({ module_key: "team_directory", action_type: "team_member_create_attempted", entity_type: "team_member", entity_label: mName, summary: `Add-member attempted for ${email}.`, new_values: { role: mRole, is_admin: mIsAdmin, module_count: mModules.size } });
    const { data, error } = await supabase.functions.invoke("admin-create-member", {
      body: {
        full_name: mName.trim(),
        email,
        password: mPass,
        role: mRole.trim(),
        department: mDept || null,
        is_admin: mIsAdmin,
        modules: mIsAdmin ? [] : Array.from(mModules),
        payroll: payrollToDb(mPayroll),
      },
    });
    // Structured response: function always returns 200 with `ok:false` on failure
    // so the message is visible to the admin.
    let payload: any = data;
    if (error) {
      // Try to recover the JSON body from FunctionsHttpError.
      try {
        const resp = (error as any).context;
        if (resp && typeof resp.text === "function") payload = JSON.parse(await resp.text());
      } catch { /* ignore */ }
    }
    if (!payload?.ok) {
      setMBusy(false);
      const msg = payload?.message || payload?.error || error?.message || "Failed to add team member.";
      logActivity({ module_key: "team_directory", action_type: "team_member_create_failed", entity_type: "team_member", entity_label: mName, summary: `Add-member failed: ${msg}`, severity: "warning", new_values: { error_code: payload?.error_code || null, details: payload?.details || null } });
      return toast.error(msg);
    }
    const newId = payload.user_id || payload.id;
    setMBusy(false);
    if (payload.warning) {
      toast.warning(payload.message || "Team member added with warnings.");
    } else {
      toast.success(payload.message || `${mName} added and activated.`);
    }
    logActivity({ module_key: "team_directory", action_type: "team_member_created", entity_type: "team_member", entity_id: newId, entity_label: mName, target_user_id: newId, target_name: mName, new_values: { full_name: mName, role: mRole, department: mDept || null, is_admin: mIsAdmin, modules: Array.from(mModules), module_access_count: payload.module_access_count ?? 0 }, summary: `Team member '${mName}' created (${mRole}).` });
    if (mIsAdmin) {
      logActivity({ module_key: "team_directory", action_type: "admin_role_assigned", entity_type: "team_member", entity_id: newId, entity_label: mName, target_user_id: newId, target_name: mName, summary: `${mName} granted admin access.`, severity: "warning" });
    } else {
      logActivity({ module_key: "team_directory", action_type: "module_access_assigned", entity_type: "team_member", entity_id: newId, entity_label: mName, target_user_id: newId, target_name: mName, summary: `${mName} granted ${payload.module_access_count ?? mModules.size} module(s).`, new_values: { modules: Array.from(mModules) } });
    }
    setMName(""); setMEmail(""); setMPass(""); setMDept(""); setMPayroll(emptyPayroll());
    setMIsAdmin(false); setMModules(new Set(["dashboard","announcements"]));
    load();
  };

  const load = async () => {
    const { data: p } = await supabase.from("profiles").select("*").eq("status","pending").order("created_at");
    setPending(p ?? []);
    const { count: active } = await supabase.from("profiles").select("id",{count:"exact",head:true}).eq("status","active");
    const { count: pendingC } = await supabase.from("profiles").select("id",{count:"exact",head:true}).eq("status","pending");
    const { count: annC } = await supabase.from("announcements").select("id",{count:"exact",head:true});
    const today = new Date().toISOString().slice(0,10);
    const { data: todayLogs, count: todayC } = await supabase.from("attendance_logs")
      .select("*", { count: "exact" }).eq("login_date", today).order("login_time",{ascending:true});
    setStats({ active: active??0, today: todayC??0, pending: pendingC??0, anns: annC??0 });
    setLogs(todayLogs ?? []);
    const { count: sC } = await supabase.from("students").select("id",{count:"exact",head:true});
    setStudentCount(sC ?? 0);
    try {
      const rows = await listRoles(true);
      setRoleCatalog(rows);
    } catch (e: any) {
      console.error("role catalog load failed", e);
    }
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: string) => {
    const target = pending.find((p: any) => p.id === id);
    const { error } = await supabase.from("profiles").update({ status: "active" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Member approved.");
    logActivity({ module_key: "team_directory", action_type: "team_member_updated", entity_type: "team_member", entity_id: id, entity_label: target?.full_name, target_user_id: id, target_name: target?.full_name, old_values: { status: "pending" }, new_values: { status: "active" }, summary: `${target?.full_name ?? "Member"} approved and activated.` });
    load();
  };

  const reject = async (id: string) => {
    const target = pending.find((p: any) => p.id === id);
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Request rejected.");
    logActivity({ module_key: "team_directory", action_type: "member_deactivated", entity_type: "team_member", entity_id: id, entity_label: target?.full_name, target_user_id: id, target_name: target?.full_name, summary: `Membership request rejected for ${target?.full_name ?? id}.`, severity: "warning" });
    load();
  };

  const post = async () => {
    if (!aTitle || !aBody) return toast.error("Title and body required.");
    setBusy(true);
    const { error } = await supabase.from("announcements").insert({
      title: aTitle, body: aBody, tag_type: aTag, created_by: user!.id,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setATitle(""); setABody(""); setATag("info");
    toast.success("Announcement posted.");
    load();
  };

  return (
    <div className="max-w-[820px]">
      <PageHead title="Admin Panel" sub="Manage team access, announcements, and attendance records." back />

      <SectionLabel>Overview</SectionLabel>
      <div className="grid grid-cols-2 gap-3.5 mb-8">
        <Stat label="Active team members" value={stats.active} />
        <Stat label="Logins today" value={stats.today} />
        <Stat label="Pending approvals" value={stats.pending} />
        <Stat label="Announcements posted" value={stats.anns} />
      </div>

      <SectionLabel>Add team member directly</SectionLabel>
      <div className="bg-off rounded-xl py-[22px] px-6 mb-7">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="form-label">Full name</label>
            <input className="ipc-input" value={mName} onChange={(e)=>setMName(e.target.value)} placeholder="Full name" /></div>
          <div><label className="form-label">Email</label>
            <input className="ipc-input" type="email" value={mEmail} onChange={(e)=>setMEmail(e.target.value)} placeholder="name@ipc.in" /></div>
          <div><label className="form-label">Temporary password</label>
            <input className="ipc-input" type="text" value={mPass} onChange={(e)=>setMPass(e.target.value)} placeholder="Set a password" /></div>
          <div>
            <label className="form-label">Role / Position</label>
            <select className="ipc-input cursor-pointer" value={mRole} onChange={(e)=>setMRole(e.target.value)}>
              <option value="">— Select a role —</option>
              {roleCatalog.map(r => (
                <option key={r.id} value={r.role_label}>{r.role_label}</option>
              ))}
            </select>
            <div className="mt-2 flex gap-2 items-center">
              <input
                className="ipc-input flex-1 !h-[28px] !text-[11px]"
                value={newRoleLabel}
                onChange={(e)=>setNewRoleLabel(e.target.value)}
                placeholder="Add a new role (e.g. Video Editor)"
              />
              <button
                type="button"
                onClick={async ()=>{
                  const label = newRoleLabel.trim();
                  if (!label) return;
                  try {
                    await ensureRoleLabel(label);
                    const rows = await listRoles(true);
                    setRoleCatalog(rows);
                    setMRole(label);
                    setNewRoleLabel("");
                    toast.success(`Role "${label}" added.`);
                    logActivity({ module_key: "team_directory", action_type: "role_catalog_role_created", entity_type: "role", entity_label: label, summary: `Role catalog entry '${label}' created.` });
                  } catch (e: any) {
                    toast.error(e?.message || "Failed to add role.");
                  }
                }}
                className="h-[28px] px-3 rounded-md border border-line bg-off hover:bg-white text-[11px] font-sans"
              >Add role</button>
            </div>
          </div>
          <div>
            <label className="form-label">Department (optional)</label>
            <QuickSaveInput
              fieldKey="department"
              value={mDept}
              onChange={setMDept}
              placeholder="e.g. Marketing"
            />
          </div>
        </div>
        <div className="mt-4">
          <PayrollFieldsSection value={mPayroll} onChange={setMPayroll} />
        </div>

        {/* Access Control */}
        <div className="mt-4 bg-white border border-line rounded-xl py-[18px] px-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-serif text-[15px] font-medium text-black">Access Control</div>
              <div className="font-sans text-[11px] text-muted-foreground">Choose which modules this team member can access.</div>
            </div>
            <button type="button" onClick={applyRolePreset} className="h-[28px] px-3 rounded-md border border-line bg-off hover:bg-white text-[11px] font-sans">
              Apply Role Preset
            </button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input type="checkbox" checked={mIsAdmin} onChange={(e)=>setMIsAdmin(e.target.checked)} className="w-4 h-4" />
            <span className="font-sans text-[12px] text-black">Admin access (full access to all modules including Admin Panel)</span>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {MODULES.map(mod => (
              <label key={mod.key} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors ${mIsAdmin ? "opacity-50 bg-off border-line" : (mModules.has(mod.key) ? "bg-off border-line" : "border-line hover:bg-off")}`}>
                <input
                  type="checkbox"
                  checked={mIsAdmin || mModules.has(mod.key)}
                  disabled={mIsAdmin}
                  onChange={() => toggleMModule(mod.key)}
                  className="w-4 h-4"
                />
                <span className="font-serif text-[13px] text-black">{mod.label}</span>
                <span className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground ml-auto">{mod.group}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button disabled={mBusy} onClick={addMember} className="ipc-btn ipc-btn-black">{mBusy ? "Adding…" : "Add member"}</button>
        </div>
        <p className="font-sans text-[11px] text-muted-foreground mt-2.5">Member is created as <strong>active</strong> immediately — payroll, role, and module access are saved together.</p>
      </div>

      <SectionLabel>Student database</SectionLabel>
      <div className="bg-off rounded-xl py-[22px] px-6 mb-7 flex items-center gap-5">
        <div className="flex-1">
          <div className="font-serif text-[30px] font-medium text-black leading-none mb-1.5">{studentCount === null ? "—" : studentCount.toLocaleString()}</div>
          <div className="font-sans text-[11px] text-muted-foreground">Premium members imported from the source sheets.</div>
        </div>
        <button disabled={syncBusy} onClick={syncStudents} className="ipc-btn ipc-btn-black">{syncBusy ? "Syncing…" : "Sync from sheets"}</button>
      </div>

      <SectionLabel>Pending access requests</SectionLabel>
      <div className="border border-line rounded-xl bg-white mb-7 overflow-hidden">
        {pending.length === 0 && <EmptyState title="No pending requests." />}
        {pending.map(p => (
          <div key={p.id} className="flex items-center gap-3 py-3.5 px-5 border-b border-line last:border-b-0">
            <div className="flex-1">
              <div className="font-serif text-base font-medium text-black">{p.full_name}</div>
              <div className="font-sans text-[11px] text-muted-foreground">{p.role}{p.department ? ` · ${p.department}`:""}</div>
            </div>
            <button onClick={()=>approve(p.id)} className="h-[30px] px-3.5 bg-black text-white border-none rounded-md font-sans text-[11px] hover:opacity-80 transition-opacity">Approve</button>
            <button onClick={()=>reject(p.id)} className="h-[30px] px-3.5 bg-white text-[#DC2626] border border-[#FECACA] rounded-md font-sans text-[11px] hover:bg-[#FEF2F2] transition-colors">Reject</button>
          </div>
        ))}
      </div>

      <SectionLabel>Post announcement</SectionLabel>
      <div className="bg-off rounded-xl py-[22px] px-6 mb-7">
        <div className="mb-3"><label className="form-label">Title</label>
          <input className="ipc-input" value={aTitle} onChange={(e)=>setATitle(e.target.value)} placeholder="Announcement title" /></div>
        <textarea
          value={aBody} onChange={(e)=>setABody(e.target.value)}
          className="w-full min-h-[80px] border border-line rounded-md py-3 px-4 font-sans text-[13px] text-black bg-white outline-none focus:border-gold transition-colors resize-y leading-[1.6]"
          placeholder="Write the full announcement body here…" />
        <div className="grid grid-cols-[1fr_auto] gap-2.5 mt-2.5 items-end">
          <select className="ipc-input cursor-pointer" value={aTag} onChange={(e)=>setATag(e.target.value as any)}>
            <option value="info">Info</option>
            <option value="update">Update</option>
            <option value="urgent">Urgent</option>
          </select>
          <button disabled={busy} onClick={post} className="ipc-btn ipc-btn-black">Post announcement</button>
        </div>
      </div>

      <SectionLabel>Today's attendance log</SectionLabel>
      <div className="border border-line rounded-xl bg-white overflow-hidden">
        <table className="w-full border-collapse font-sans text-[13px]">
          <thead>
            <tr>
              {["Name","Role","Login time","Date"].map(h => (
                <th key={h} className="text-left text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground py-2.5 px-3.5 border-b border-line">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && <EmptyRow colSpan={4} title="No logins recorded today yet." />}
            {logs.map(l => (
              <tr key={l.id} className="hover:bg-off transition-colors">
                <td className="py-3 px-3.5 border-b border-line last:border-b-0 font-serif text-base font-medium">{l.full_name}</td>
                <td className="py-3 px-3.5 border-b border-line last:border-b-0">{l.role}</td>
                <td className="py-3 px-3.5 border-b border-line last:border-b-0">{formatTime(l.login_time)}</td>
                <td className="py-3 px-3.5 border-b border-line last:border-b-0">{formatDateShort(l.login_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="bg-off rounded-[10px] py-[18px] px-5">
    <div className="font-sans text-[9px] uppercase tracking-[0.12em] text-muted-foreground mb-2">{label}</div>
    <div className="font-serif text-[30px] font-medium text-black">{value}</div>
  </div>
);
