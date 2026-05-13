import { useEffect, useState } from "react";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { formatTime, formatDateShort } from "@/lib/format";
import QuickSaveInput from "@/components/QuickSaveInput";
import PayrollFieldsSection, { emptyPayroll, PayrollFormState, payrollToDb } from "@/components/PayrollFieldsSection";

export default function Admin() {
  const { user } = useAuth();
  const [pending, setPending] = useState<any[]>([]);
  const [stats, setStats] = useState({ active:0, today:0, pending:0, anns:0 });
  const [logs, setLogs] = useState<any[]>([]);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

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
  const ROLES = ["Media Buyer","Backend Operations","Community Manager","Content Creator","Operations Lead","Photography Lead","Admin"];
  const [mName, setMName] = useState("");
  const [mEmail, setMEmail] = useState("");
  const [mPass, setMPass] = useState("");
  const [mRole, setMRole] = useState("Media Buyer");
  const [mDept, setMDept] = useState("");
  const [mPayroll, setMPayroll] = useState<PayrollFormState>(emptyPayroll());
  const [mBusy, setMBusy] = useState(false);

  const addMember = async () => {
    if (!mName || !mEmail || !mPass) return toast.error("Name, email and password required.");
    if (!mRole.trim()) return toast.error("Please select or add a role.");
    if (mPayroll.payroll_applicable && !mPayroll.joining_date) return toast.error("Joining date is required for payroll-applicable members.");
    if (mPayroll.payroll_applicable) {
      const pt = mPayroll.pay_type;
      if (["Monthly Salary","Retainer","Internship / Stipend"].includes(pt) && !Number(mPayroll.monthly_salary)) return toast.error("Monthly salary amount is required.");
      if (["One-Time / Outsourced","Project-Based","Event-Based"].includes(pt) && !Number(mPayroll.one_time_pay)) return toast.error("One-time / project / event pay amount is required.");
      if (pt === "Daily Wage" && !Number(mPayroll.daily_wage)) return toast.error("Daily wage amount is required.");
      if (pt === "Hourly Pay" && !Number(mPayroll.hourly_rate)) return toast.error("Hourly rate is required.");
    }
    setMBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-create-member", {
      body: {
        full_name: mName, email: mEmail, password: mPass, role: mRole,
        department: mDept || null,
        payroll: payrollToDb(mPayroll),
      },
    });
    setMBusy(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error || error!.message);
    toast.success(`${mName} added and activated.`);
    setMName(""); setMEmail(""); setMPass(""); setMDept(""); setMPayroll(emptyPayroll());
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
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: string) => {
    const { error } = await supabase.from("profiles").update({ status: "active" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Member approved.");
    load();
  };

  const reject = async (id: string) => {
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Request rejected.");
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
          <div><label className="form-label">Role</label>
            <QuickSaveInput
              fieldKey="team_role"
              value={mRole}
              onChange={setMRole}
              placeholder="Click to choose saved role or type new"
            />
          </div>
          <div><label className="form-label">Department (optional)</label>
            <input className="ipc-input" value={mDept} onChange={(e)=>setMDept(e.target.value)} placeholder="e.g. Marketing" /></div>
        </div>
        <div className="flex justify-end">
          <button disabled={mBusy} onClick={addMember} className="ipc-btn ipc-btn-black">{mBusy ? "Adding…" : "Add member"}</button>
        </div>
        <p className="font-sans text-[11px] text-muted-foreground mt-2.5">Member is created as <strong>active</strong> immediately — share the credentials with them.</p>
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
        {pending.length === 0 && <div className="px-5 py-6 font-sans text-sm text-muted-foreground">No pending requests.</div>}
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
            {logs.length === 0 && <tr><td colSpan={4} className="py-6 px-3.5 font-sans text-sm text-muted-foreground text-center">No logins recorded today yet.</td></tr>}
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
