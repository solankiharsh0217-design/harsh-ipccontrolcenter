import { useEffect, useMemo, useState } from "react";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  calcPayrollEntry,
  inr,
  monthBounds,
  PAY_TYPES,
  PNL_CLASSIFICATIONS,
} from "@/lib/payroll";
import QuickSaveInput from "@/components/QuickSaveInput";

type TabKey = "payroll" | "incentives" | "recurring" | "summary" | "saved";
const TABS: { key: TabKey; label: string }[] = [
  { key: "payroll", label: "Team Payroll" },
  { key: "incentives", label: "Incentives" },
  { key: "recurring", label: "Recurring Expenses" },
  { key: "summary", label: "Statement Summary" },
  { key: "saved", label: "Saved Statements" },
];

// ───────── Helpers ─────────
const todayMonthIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

interface PayrollProfileRow {
  id: string;
  team_member_id: string;
  full_name_snapshot: string | null;
  role_snapshot: string | null;
  department_snapshot: string | null;
  payroll_applicable: boolean;
  pay_type: string;
  monthly_salary: number;
  one_time_pay: number;
  daily_wage: number;
  hourly_rate: number;
  joining_date: string | null;
  exit_date: string | null;
  salary_expense_category: string | null;
  pnl_cost_classification: string | null;
  is_active: boolean;
}

interface ProfileLite {
  id: string;
  full_name: string;
  role: string;
  department: string | null;
}

interface PreviewEntry {
  team_member_id: string;
  team_member_name_snapshot: string;
  role_snapshot: string | null;
  pay_type: string;
  joining_date: string | null;
  exit_date: string | null;
  base_monthly_salary: number;
  one_time_pay: number;
  daily_wage: number;
  hourly_rate: number;
  hours_worked: number;
  total_period_days: number;
  payable_days: number;
  calculated_amount: number;
  manual_adjustment_amount: number;
  reason: string;
  cost_classification: string;
  expense_category: string;
  excluded: boolean;
}

export default function ProfitStatement() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<TabKey>("payroll");

  if (!isAdmin) {
    return (
      <div className="max-w-[820px]">
        <PageHead title="Profit Statement" sub="Restricted module." />
        <div className="border border-line rounded-xl p-6 font-sans text-sm text-muted-foreground">
          Salary and payroll data is admin-only. Ask an admin to grant access.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px]">
      <PageHead title="Profit Statement" sub="Auto-fetch team members, calculate payroll, and post monthly P&L." back />

      <div className="flex gap-1 border-b border-line mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 font-sans text-[12px] uppercase tracking-[0.1em] border-b-2 -mb-px transition-colors ${tab === t.key ? "border-black text-black" : "border-transparent text-muted-foreground hover:text-black"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "payroll" && <TeamPayrollTab />}
      {tab === "incentives" && <IncentivesTab />}
      {tab === "recurring" && <RecurringTab />}
      {tab === "summary" && <SummaryTab />}
      {tab === "saved" && <SavedStatementsTab />}
    </div>
  );
}

// ═══════════════ Team Payroll Tab ═══════════════
function TeamPayrollTab() {
  const { user } = useAuth();
  const [businessUnit, setBusinessUnit] = useState("IPC");
  const [statementMonth, setStatementMonth] = useState(todayMonthIso());
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [disbursementDate, setDisbursementDate] = useState("");
  const [basis, setBasis] = useState<"Accrual Basis" | "Cash Basis">("Accrual Basis");
  const [profiles, setProfiles] = useState<PayrollProfileRow[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, ProfileLite>>(new Map());
  const [hoursMap, setHoursMap] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<PreviewEntry[] | null>(null);
  const [posting, setPosting] = useState(false);
  const [businessUnits, setBusinessUnits] = useState<string[]>(["IPC"]);

  // sync period from month
  useEffect(() => {
    const { start, end } = monthBounds(statementMonth);
    setPeriodStart(start);
    setPeriodEnd(end);
    // default disbursement = day 7 of next month
    const d = new Date(end);
    const nm = new Date(d.getFullYear(), d.getMonth() + 1, 7);
    setDisbursementDate(nm.toISOString().slice(0, 10));
  }, [statementMonth]);

  const load = async () => {
    const [{ data: ps }, { data: pm }, { data: bus }] = await Promise.all([
      supabase.from("team_payroll_profiles").select("*").eq("is_active", true),
      supabase.from("profiles").select("id, full_name, role, department").eq("status", "active"),
      supabase.from("business_units").select("name").eq("is_active", true).order("name"),
    ]);
    setProfiles((ps as PayrollProfileRow[]) ?? []);
    const map = new Map<string, ProfileLite>();
    (pm ?? []).forEach((p: any) => map.set(p.id, p));
    setMemberMap(map);
    if (bus?.length) setBusinessUnits(bus.map((b: any) => b.name));
  };
  useEffect(() => { load(); }, []);

  // Members shown = active profiles. Show payroll status from profile (if exists).
  const memberRows = useMemo(() => {
    const profileById = new Map(profiles.map((p) => [p.team_member_id, p]));
    const rows: { member: ProfileLite; payroll: PayrollProfileRow | null }[] = [];
    memberMap.forEach((m) => {
      rows.push({ member: m, payroll: profileById.get(m.id) ?? null });
    });
    return rows.sort((a, b) => a.member.full_name.localeCompare(b.member.full_name));
  }, [memberMap, profiles]);

  const generate = async () => {
    if (!periodStart || !periodEnd) return toast.error("Period dates are required.");
    if (new Date(periodEnd) < new Date(periodStart)) return toast.error("Period end cannot be before period start.");

    // Duplicate check
    const { data: existing } = await supabase
      .from("payroll_runs")
      .select("id, status")
      .eq("business_unit", businessUnit)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .limit(1);
    if (existing && existing.length) {
      const ok = confirm("Payroll already exists for this period. Generate a new draft anyway?");
      if (!ok) return;
    }

    const entries: PreviewEntry[] = profiles
      .filter((p) => p.payroll_applicable)
      .map((p) => {
        const m = memberMap.get(p.team_member_id);
        const r = calcPayrollEntry({
          profile: p,
          periodStart,
          periodEnd,
          hoursWorked: hoursMap[p.team_member_id] ?? 0,
        });
        return {
          team_member_id: p.team_member_id,
          team_member_name_snapshot: m?.full_name ?? p.full_name_snapshot ?? "—",
          role_snapshot: m?.role ?? p.role_snapshot,
          pay_type: p.pay_type,
          joining_date: p.joining_date,
          exit_date: p.exit_date,
          base_monthly_salary: p.monthly_salary,
          one_time_pay: p.one_time_pay,
          daily_wage: p.daily_wage,
          hourly_rate: p.hourly_rate,
          hours_worked: hoursMap[p.team_member_id] ?? 0,
          total_period_days: r.totalPeriodDays,
          payable_days: r.payableDays,
          calculated_amount: r.calculatedAmount,
          manual_adjustment_amount: 0,
          reason: r.reason,
          cost_classification: p.pnl_cost_classification ?? "Operating Expense",
          expense_category: p.salary_expense_category ?? "Salaries",
          excluded: r.excluded,
        };
      });
    setPreview(entries);
    toast.success(`Generated ${entries.length} payroll rows.`);
  };

  const updateRow = (idx: number, patch: Partial<PreviewEntry>) => {
    if (!preview) return;
    const next = [...preview];
    next[idx] = { ...next[idx], ...patch };
    setPreview(next);
  };

  const total = useMemo(
    () => (preview ?? []).filter((r) => !r.excluded).reduce((s, r) => s + r.calculated_amount + r.manual_adjustment_amount, 0),
    [preview],
  );

  const saveDraft = async () => {
    if (!preview) return toast.error("Generate payroll first.");
    setPosting(true);
    try {
      const { data: run, error } = await supabase
        .from("payroll_runs")
        .insert({
          business_unit: businessUnit,
          statement_month: statementMonth,
          period_start: periodStart,
          period_end: periodEnd,
          disbursement_date: disbursementDate || null,
          statement_basis: basis,
          total_payroll_amount: total,
          status: "draft",
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      const rows = preview.map((r) => ({
        payroll_run_id: run.id,
        team_member_id: r.team_member_id,
        team_member_name_snapshot: r.team_member_name_snapshot,
        role_snapshot: r.role_snapshot,
        pay_type: r.pay_type,
        joining_date: r.joining_date,
        exit_date: r.exit_date,
        base_monthly_salary: r.base_monthly_salary,
        one_time_pay: r.one_time_pay,
        daily_wage: r.daily_wage,
        hourly_rate: r.hourly_rate,
        hours_worked: r.hours_worked,
        period_start: periodStart,
        period_end: periodEnd,
        total_period_days: r.total_period_days,
        payable_days: r.payable_days,
        calculated_amount: r.calculated_amount,
        manual_adjustment_amount: r.manual_adjustment_amount,
        final_payable_amount: r.calculated_amount + r.manual_adjustment_amount,
        reason: r.reason,
        cost_classification: r.cost_classification,
        expense_category: r.expense_category,
        excluded: r.excluded,
      }));
      const { error: e2 } = await supabase.from("payroll_run_entries").insert(rows);
      if (e2) throw e2;
      toast.success("Payroll snapshot saved as draft.");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setPosting(false);
    }
  };

  const postToStatement = async () => {
    if (!preview) return toast.error("Generate payroll first.");
    setPosting(true);
    try {
      // 1. Save run as posted
      const { data: run, error: rErr } = await supabase
        .from("payroll_runs")
        .insert({
          business_unit: businessUnit,
          statement_month: statementMonth,
          period_start: periodStart,
          period_end: periodEnd,
          disbursement_date: disbursementDate || null,
          statement_basis: basis,
          total_payroll_amount: total,
          status: "posted",
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (rErr) throw rErr;

      const entryRows = preview.map((r) => ({
        payroll_run_id: run.id,
        team_member_id: r.team_member_id,
        team_member_name_snapshot: r.team_member_name_snapshot,
        role_snapshot: r.role_snapshot,
        pay_type: r.pay_type,
        joining_date: r.joining_date,
        exit_date: r.exit_date,
        base_monthly_salary: r.base_monthly_salary,
        one_time_pay: r.one_time_pay,
        daily_wage: r.daily_wage,
        hourly_rate: r.hourly_rate,
        hours_worked: r.hours_worked,
        period_start: periodStart,
        period_end: periodEnd,
        total_period_days: r.total_period_days,
        payable_days: r.payable_days,
        calculated_amount: r.calculated_amount,
        manual_adjustment_amount: r.manual_adjustment_amount,
        final_payable_amount: r.calculated_amount + r.manual_adjustment_amount,
        reason: r.reason,
        cost_classification: r.cost_classification,
        expense_category: r.expense_category,
        excluded: r.excluded,
        status: "posted",
      }));
      const { data: insertedEntries, error: eErr } = await supabase.from("payroll_run_entries").insert(entryRows).select();
      if (eErr) throw eErr;

      // 2. Find or create profit_statement for (business_unit, statement_month)
      const { data: existingStmt } = await supabase
        .from("profit_statements")
        .select("*")
        .eq("business_unit", businessUnit)
        .eq("statement_month", statementMonth)
        .eq("is_deleted", false)
        .maybeSingle();

      let stmtId: string;
      if (existingStmt) {
        stmtId = existingStmt.id;
      } else {
        const { data: created, error: sErr } = await supabase
          .from("profit_statements")
          .insert({
            business_unit: businessUnit,
            statement_month: statementMonth,
            statement_basis: basis,
            status: "draft",
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (sErr) throw sErr;
        stmtId = created.id;
      }

      // 3. Insert lines
      const lines = (insertedEntries ?? [])
        .filter((e: any) => !e.excluded)
        .map((e: any) => ({
          profit_statement_id: stmtId,
          bucket: e.cost_classification ?? "Operating Expense",
          category: e.expense_category ?? "Salaries",
          label: `${e.team_member_name_snapshot} — ${e.pay_type}`,
          amount: e.final_payable_amount,
          source_type: "payroll_run_entry",
          source_id: e.id,
          notes: e.reason,
        }));
      if (lines.length) {
        const { error: lErr } = await supabase.from("profit_statement_lines").insert(lines);
        if (lErr) throw lErr;
      }

      // 4. Recompute statement totals
      await recomputeStatement(stmtId);

      toast.success("Payroll posted to Profit Statement.");
      setPreview(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <SectionLabel>Payroll Settings</SectionLabel>
      <div className="bg-off rounded-xl p-5 mb-6">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="form-label">Business Unit</label>
            <select className="ipc-input cursor-pointer" value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)}>
              {businessUnits.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Statement Month</label>
            <input type="month" className="ipc-input" value={statementMonth.slice(0,7)} onChange={(e) => setStatementMonth(`${e.target.value}-01`)} />
          </div>
          <div>
            <label className="form-label">Statement Basis</label>
            <select className="ipc-input cursor-pointer" value={basis} onChange={(e) => setBasis(e.target.value as any)}>
              <option>Accrual Basis</option>
              <option>Cash Basis</option>
            </select>
          </div>
          <div>
            <label className="form-label">Period Start</label>
            <input type="date" className="ipc-input" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Period End</label>
            <input type="date" className="ipc-input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Disbursement Date</label>
            <input type="date" className="ipc-input" value={disbursementDate} onChange={(e) => setDisbursementDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end mt-4 gap-2">
          <button className="ipc-btn ipc-btn-black" onClick={generate}>Generate Payroll From Team Directory</button>
        </div>
      </div>

      <SectionLabel>Backend Team Directory ({memberRows.length})</SectionLabel>
      <div className="border border-line rounded-xl bg-white mb-6 overflow-hidden">
        <table className="w-full border-collapse font-sans text-[12px]">
          <thead className="bg-off">
            <tr>
              {["Name","Role","Pay Type","Joining","Pay Amount","Payroll","Hours (if hourly)"].map(h => (
                <th key={h} className="text-left text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground py-2.5 px-3 border-b border-line">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {memberRows.length === 0 && <tr><td colSpan={7} className="py-6 px-3 text-center text-muted-foreground">No active members yet.</td></tr>}
            {memberRows.map(({ member, payroll }) => {
              const amount = payroll
                ? payroll.pay_type === "Monthly Salary" || payroll.pay_type === "Retainer" || payroll.pay_type === "Internship / Stipend"
                  ? inr(payroll.monthly_salary)
                  : payroll.pay_type === "Daily Wage" ? `${inr(payroll.daily_wage)}/day`
                  : payroll.pay_type === "Hourly Pay" ? `${inr(payroll.hourly_rate)}/hr`
                  : inr(payroll.one_time_pay)
                : "—";
              return (
                <tr key={member.id} className="border-b border-line last:border-b-0">
                  <td className="py-2.5 px-3 font-serif text-[13px]">{member.full_name}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{member.role}</td>
                  <td className="py-2.5 px-3">{payroll?.pay_type ?? <span className="text-[#DC2626]">No payroll profile</span>}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{payroll?.joining_date ?? "—"}</td>
                  <td className="py-2.5 px-3">{amount}</td>
                  <td className="py-2.5 px-3">
                    {payroll?.payroll_applicable === false
                      ? <span className="text-muted-foreground">Not applicable</span>
                      : payroll
                        ? <span className="text-[#0d7a5f]">Active</span>
                        : <span className="text-[#DC2626]">Missing</span>}
                  </td>
                  <td className="py-2.5 px-3">
                    {payroll?.pay_type === "Hourly Pay" ? (
                      <input type="number" className="h-7 w-20 px-2 border border-line rounded text-xs"
                        value={hoursMap[member.id] ?? ""}
                        onChange={(e) => setHoursMap({ ...hoursMap, [member.id]: Number(e.target.value) })}
                        placeholder="hrs"
                      />
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview && (
        <>
          <SectionLabel>Generated Payroll Preview — Total: {inr(total)}</SectionLabel>
          <div className="border border-line rounded-xl bg-white mb-4 overflow-x-auto">
            <table className="w-full border-collapse font-sans text-[12px] min-w-[900px]">
              <thead className="bg-off">
                <tr>
                  {["Member","Pay Type","Period","Days","Base","Calculated","Adjustment","Final","Classification","Action"].map(h => (
                    <th key={h} className="text-left text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground py-2.5 px-2.5 border-b border-line">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={r.team_member_id + i} className={`border-b border-line last:border-b-0 ${r.excluded ? "opacity-50" : ""}`}>
                    <td className="py-2 px-2.5 font-serif text-[13px]">{r.team_member_name_snapshot}<div className="text-[10px] text-muted-foreground">{r.reason}</div></td>
                    <td className="py-2 px-2.5">{r.pay_type}</td>
                    <td className="py-2 px-2.5 text-muted-foreground">{periodStart} → {periodEnd}</td>
                    <td className="py-2 px-2.5">{r.payable_days}/{r.total_period_days}</td>
                    <td className="py-2 px-2.5">{inr(r.base_monthly_salary || r.one_time_pay || r.daily_wage || r.hourly_rate)}</td>
                    <td className="py-2 px-2.5">{inr(r.calculated_amount)}</td>
                    <td className="py-2 px-2.5">
                      <input type="number" className="h-7 w-24 px-2 border border-line rounded text-xs" value={r.manual_adjustment_amount}
                        onChange={(e) => updateRow(i, { manual_adjustment_amount: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="py-2 px-2.5 font-medium">{inr(r.calculated_amount + r.manual_adjustment_amount)}</td>
                    <td className="py-2 px-2.5">
                      <select className="h-7 px-1 border border-line rounded text-xs" value={r.cost_classification}
                        onChange={(e) => updateRow(i, { cost_classification: e.target.value })}>
                        {PNL_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-2.5">
                      <button className="text-[10px] text-muted-foreground hover:text-black underline" onClick={() => updateRow(i, { excluded: !r.excluded })}>
                        {r.excluded ? "Include" : "Exclude"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 mb-8">
            <button className="ipc-btn" onClick={() => setPreview(null)} disabled={posting}>Discard</button>
            <button className="ipc-btn" onClick={saveDraft} disabled={posting}>Save as Draft</button>
            <button className="ipc-btn ipc-btn-black" onClick={postToStatement} disabled={posting}>{posting ? "Posting…" : "Post to Profit Statement"}</button>
          </div>
        </>
      )}
    </>
  );
}

// ═══════════════ Incentives Tab ═══════════════
function IncentivesTab() {
  const { user } = useAuth();
  const [members, setMembers] = useState<ProfileLite[]>([]);
  const [memberId, setMemberId] = useState("");
  const [incType, setIncType] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cadence, setCadence] = useState("one-time");
  const [list, setList] = useState<any[]>([]);

  const load = async () => {
    const [{ data: pm }, { data: inc }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role, department").eq("status", "active").order("full_name"),
      supabase.from("incentives").select("*").order("incentive_date", { ascending: false }).limit(50),
    ]);
    setMembers((pm as ProfileLite[]) ?? []);
    setList(inc ?? []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!memberId || !amount) return toast.error("Member and amount are required.");
    const m = members.find((x) => x.id === memberId);
    const { error } = await supabase.from("incentives").insert({
      team_member_id: memberId,
      team_member_name_snapshot: m?.full_name ?? null,
      incentive_type: incType || null,
      reason: reason || null,
      amount: Number(amount) || 0,
      incentive_date: date,
      cadence,
      created_by: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Incentive added");
    setAmount(""); setReason(""); setIncType("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this incentive?")) return;
    await supabase.from("incentives").delete().eq("id", id);
    load();
  };

  return (
    <>
      <SectionLabel>Add Incentive</SectionLabel>
      <div className="bg-off rounded-xl p-5 mb-6">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="form-label">Team Member</label>
            <select className="ipc-input cursor-pointer" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">Select…</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name} — {m.role}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Incentive Type</label>
            <QuickSaveInput fieldKey="incentive_type" value={incType} onChange={setIncType} placeholder="e.g. Sales bonus" />
          </div>
          <div>
            <label className="form-label">Reason</label>
            <QuickSaveInput fieldKey="incentive_reason" value={reason} onChange={setReason} placeholder="e.g. Target achievement" />
          </div>
          <div>
            <label className="form-label">Amount (₹)</label>
            <input type="number" className="ipc-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Date</label>
            <input type="date" className="ipc-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Cadence</label>
            <select className="ipc-input cursor-pointer" value={cadence} onChange={(e) => setCadence(e.target.value)}>
              <option value="one-time">One-time</option>
              <option value="monthly-variable">Monthly Variable</option>
              <option value="recurring">Recurring</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button className="ipc-btn ipc-btn-black" onClick={add}>Add incentive</button>
        </div>
      </div>

      <SectionLabel>Recent Incentives</SectionLabel>
      <div className="border border-line rounded-xl bg-white overflow-hidden">
        <table className="w-full border-collapse font-sans text-[12px]">
          <thead className="bg-off">
            <tr>{["Date","Member","Type","Reason","Amount","Cadence",""].map(h => <th key={h} className="text-left text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground py-2.5 px-3 border-b border-line">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="py-5 text-center text-muted-foreground">No incentives yet.</td></tr>}
            {list.map((i) => (
              <tr key={i.id} className="border-b border-line last:border-b-0">
                <td className="py-2.5 px-3 text-muted-foreground">{i.incentive_date}</td>
                <td className="py-2.5 px-3 font-serif text-[13px]">{i.team_member_name_snapshot}</td>
                <td className="py-2.5 px-3">{i.incentive_type}</td>
                <td className="py-2.5 px-3 text-muted-foreground">{i.reason}</td>
                <td className="py-2.5 px-3 font-medium">{inr(i.amount)}</td>
                <td className="py-2.5 px-3">{i.cadence}</td>
                <td className="py-2.5 px-3 text-right"><button onClick={() => remove(i.id)} className="text-[10px] text-[#DC2626] hover:underline">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ═══════════════ Recurring Tab ═══════════════
function RecurringTab() {
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [classification, setClassification] = useState("Fixed Expense");
  const [statementMonth, setStatementMonth] = useState(todayMonthIso());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("recurring_expense_templates").select("*").eq("is_active", true).order("expense_name");
    setList(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name || !amount) return toast.error("Name and amount required.");
    const { error } = await supabase.from("recurring_expense_templates").insert({
      expense_name: name,
      category: category || null,
      amount: Number(amount) || 0,
      frequency,
      cost_classification: classification,
      created_by: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Recurring expense saved");
    setName(""); setCategory(""); setAmount("");
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("recurring_expense_templates").update({ is_active: false }).eq("id", id);
    load();
  };

  const generateForMonth = async () => {
    if (!list.length) return toast.error("No active templates.");
    setBusy(true);
    try {
      // Find or create statement
      let { data: stmt } = await supabase
        .from("profit_statements")
        .select("*")
        .eq("business_unit", "IPC")
        .eq("statement_month", statementMonth)
        .eq("is_deleted", false)
        .maybeSingle();
      if (!stmt) {
        const { data: created, error } = await supabase
          .from("profit_statements")
          .insert({ business_unit: "IPC", statement_month: statementMonth, status: "draft", created_by: user?.id ?? null })
          .select()
          .single();
        if (error) throw error;
        stmt = created;
      }
      // Avoid duplicates: skip templates that already have a line in this statement
      const { data: existing } = await supabase
        .from("profit_statement_lines")
        .select("source_id")
        .eq("profit_statement_id", stmt.id)
        .eq("source_type", "recurring_template");
      const existingIds = new Set((existing ?? []).map((x: any) => x.source_id));
      const lines = list
        .filter((t) => !existingIds.has(t.id))
        .map((t) => ({
          profit_statement_id: stmt.id,
          bucket: t.cost_classification ?? "Fixed Expense",
          category: t.category ?? "Recurring",
          label: t.expense_name,
          amount: t.amount,
          source_type: "recurring_template",
          source_id: t.id,
          notes: t.frequency,
        }));
      if (!lines.length) {
        toast.success("All recurring expenses already in this month's statement.");
        return;
      }
      const { error } = await supabase.from("profit_statement_lines").insert(lines);
      if (error) throw error;
      await recomputeStatement(stmt.id);
      toast.success(`Added ${lines.length} recurring lines to ${statementMonth.slice(0,7)}.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionLabel>Add Recurring Expense Template</SectionLabel>
      <div className="bg-off rounded-xl p-5 mb-6">
        <div className="grid grid-cols-3 gap-3">
          <div><label className="form-label">Name</label><input className="ipc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Zoom subscription" /></div>
          <div><label className="form-label">Category</label><QuickSaveInput fieldKey="expense_category" value={category} onChange={setCategory} placeholder="Software" /></div>
          <div><label className="form-label">Amount (₹)</label><input type="number" className="ipc-input" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><label className="form-label">Frequency</label>
            <select className="ipc-input cursor-pointer" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
            </select>
          </div>
          <div><label className="form-label">Classification</label>
            <select className="ipc-input cursor-pointer" value={classification} onChange={(e) => setClassification(e.target.value)}>
              {PNL_CLASSIFICATIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-3"><button className="ipc-btn ipc-btn-black" onClick={add}>Save template</button></div>
      </div>

      <SectionLabel>Active Templates</SectionLabel>
      <div className="border border-line rounded-xl bg-white mb-6 overflow-hidden">
        <table className="w-full border-collapse font-sans text-[12px]">
          <thead className="bg-off"><tr>{["Name","Category","Amount","Frequency","Classification",""].map(h => <th key={h} className="text-left text-[9px] uppercase tracking-[0.12em] text-muted-foreground py-2.5 px-3 border-b border-line">{h}</th>)}</tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="py-5 text-center text-muted-foreground">No templates yet.</td></tr>}
            {list.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-b-0">
                <td className="py-2.5 px-3 font-serif">{t.expense_name}</td>
                <td className="py-2.5 px-3 text-muted-foreground">{t.category}</td>
                <td className="py-2.5 px-3 font-medium">{inr(t.amount)}</td>
                <td className="py-2.5 px-3">{t.frequency}</td>
                <td className="py-2.5 px-3">{t.cost_classification}</td>
                <td className="py-2.5 px-3 text-right"><button onClick={() => remove(t.id)} className="text-[10px] text-[#DC2626] hover:underline">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionLabel>Generate For Month</SectionLabel>
      <div className="bg-off rounded-xl p-5 flex items-end gap-3">
        <div><label className="form-label">Statement Month</label>
          <input type="month" className="ipc-input" value={statementMonth.slice(0,7)} onChange={(e) => setStatementMonth(`${e.target.value}-01`)} />
        </div>
        <button className="ipc-btn ipc-btn-black" onClick={generateForMonth} disabled={busy}>{busy ? "Generating…" : "Push recurring into statement"}</button>
      </div>
    </>
  );
}

// ═══════════════ Summary Tab ═══════════════
function SummaryTab() {
  const { user } = useAuth();
  const [businessUnit, setBusinessUnit] = useState("IPC");
  const [statementMonth, setStatementMonth] = useState(todayMonthIso());
  const [statement, setStatement] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [revLabel, setRevLabel] = useState("");
  const [revAmount, setRevAmount] = useState("");
  const [revCategory, setRevCategory] = useState("");
  const [bucket, setBucket] = useState("Operating Expense");
  const [expLabel, setExpLabel] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expCategory, setExpCategory] = useState("");

  const loadStmt = async () => {
    const { data } = await supabase
      .from("profit_statements")
      .select("*")
      .eq("business_unit", businessUnit)
      .eq("statement_month", statementMonth)
      .eq("is_deleted", false)
      .maybeSingle();
    setStatement(data);
    if (data) {
      const { data: l } = await supabase.from("profit_statement_lines").select("*").eq("profit_statement_id", data.id).order("bucket");
      setLines(l ?? []);
    } else setLines([]);
  };
  useEffect(() => { loadStmt(); }, [businessUnit, statementMonth]);

  const ensureStatement = async () => {
    if (statement) return statement.id;
    const { data, error } = await supabase
      .from("profit_statements")
      .insert({ business_unit: businessUnit, statement_month: statementMonth, status: "draft", created_by: user?.id ?? null })
      .select().single();
    if (error) throw error;
    setStatement(data);
    return data.id;
  };

  const addRevenue = async () => {
    if (!revLabel || !revAmount) return toast.error("Label and amount required.");
    const id = await ensureStatement();
    await supabase.from("profit_statement_lines").insert({
      profit_statement_id: id, bucket: "Revenue", category: revCategory || null,
      label: revLabel, amount: Number(revAmount), source_type: "manual",
    });
    setRevLabel(""); setRevAmount(""); setRevCategory("");
    await recomputeStatement(id);
    loadStmt();
  };

  const addExpense = async () => {
    if (!expLabel || !expAmount) return toast.error("Label and amount required.");
    const id = await ensureStatement();
    await supabase.from("profit_statement_lines").insert({
      profit_statement_id: id, bucket, category: expCategory || null,
      label: expLabel, amount: Number(expAmount), source_type: "manual",
    });
    setExpLabel(""); setExpAmount(""); setExpCategory("");
    await recomputeStatement(id);
    loadStmt();
  };

  const removeLine = async (id: string) => {
    await supabase.from("profit_statement_lines").delete().eq("id", id);
    if (statement) await recomputeStatement(statement.id);
    loadStmt();
  };

  const post = async () => {
    if (!statement) return;
    await supabase.from("profit_statements").update({ status: "posted" }).eq("id", statement.id);
    toast.success("Statement posted. Visible in Reports & History.");
    loadStmt();
  };

  const buckets = ["Revenue", "COGS / Direct Cost", "Operating Expense", "Fixed Expense", "Variable Expense", "One-Time Expense"];
  const grouped = buckets.map((b) => ({ bucket: b, items: lines.filter((l) => l.bucket === b) }));
  const sumOf = (b: string) => lines.filter((l) => l.bucket === b).reduce((s, l) => s + Number(l.amount), 0);
  const revenue = sumOf("Revenue");
  const cogs = sumOf("COGS / Direct Cost");
  const gp = revenue - cogs;
  const opex = sumOf("Operating Expense");
  const fixed = sumOf("Fixed Expense");
  const variable = sumOf("Variable Expense");
  const onetime = sumOf("One-Time Expense");
  const net = gp - opex - fixed - variable - onetime;
  const margin = revenue > 0 ? (net / revenue) * 100 : 0;

  return (
    <>
      <div className="bg-off rounded-xl p-5 mb-5 flex items-end gap-3">
        <div>
          <label className="form-label">Business Unit</label>
          <input className="ipc-input" value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Statement Month</label>
          <input type="month" className="ipc-input" value={statementMonth.slice(0,7)} onChange={(e) => setStatementMonth(`${e.target.value}-01`)} />
        </div>
        <div className="ml-auto">
          {statement?.status === "posted" ? <span className="px-2 py-1 rounded bg-[#0d7a5f]/10 text-[#0d7a5f] text-[11px]">Posted</span>
            : statement ? <span className="px-2 py-1 rounded bg-off border border-line text-[11px]">Draft</span>
            : <span className="text-[11px] text-muted-foreground">No statement yet</span>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <Stat label="Revenue" value={inr(revenue)} />
        <Stat label="Gross Profit" value={inr(gp)} />
        <Stat label="Net Profit" value={inr(net)} />
        <Stat label="Net Margin" value={`${margin.toFixed(1)}%`} />
      </div>

      <SectionLabel>Add Revenue Line</SectionLabel>
      <div className="bg-off rounded-xl p-4 mb-5 grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
        <div><label className="form-label">Label</label><input className="ipc-input" value={revLabel} onChange={(e) => setRevLabel(e.target.value)} placeholder="Diamond program — June" /></div>
        <div><label className="form-label">Category</label><QuickSaveInput fieldKey="revenue_category" value={revCategory} onChange={setRevCategory} placeholder="Program revenue" /></div>
        <div><label className="form-label">Amount (₹)</label><input type="number" className="ipc-input" value={revAmount} onChange={(e) => setRevAmount(e.target.value)} /></div>
        <button className="ipc-btn ipc-btn-black" onClick={addRevenue}>Add</button>
      </div>

      <SectionLabel>Add Expense Line</SectionLabel>
      <div className="bg-off rounded-xl p-4 mb-6 grid grid-cols-[1fr_2fr_1fr_1fr_auto] gap-2 items-end">
        <div><label className="form-label">Bucket</label>
          <select className="ipc-input cursor-pointer" value={bucket} onChange={(e) => setBucket(e.target.value)}>
            {buckets.filter(b => b !== "Revenue").map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div><label className="form-label">Label</label><input className="ipc-input" value={expLabel} onChange={(e) => setExpLabel(e.target.value)} placeholder="Office rent" /></div>
        <div><label className="form-label">Category</label><QuickSaveInput fieldKey="expense_category" value={expCategory} onChange={setExpCategory} placeholder="Rent" /></div>
        <div><label className="form-label">Amount (₹)</label><input type="number" className="ipc-input" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} /></div>
        <button className="ipc-btn ipc-btn-black" onClick={addExpense}>Add</button>
      </div>

      <SectionLabel>Statement Lines</SectionLabel>
      <div className="space-y-4 mb-6">
        {grouped.filter(g => g.items.length > 0).map((g) => (
          <div key={g.bucket} className="border border-line rounded-xl bg-white overflow-hidden">
            <div className="px-4 py-2 bg-off border-b border-line flex justify-between text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>{g.bucket}</span><span className="font-medium text-black">{inr(sumOf(g.bucket))}</span>
            </div>
            <table className="w-full border-collapse font-sans text-[12px]">
              <tbody>
                {g.items.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-b-0">
                    <td className="py-2 px-4 font-serif">{l.label}</td>
                    <td className="py-2 px-4 text-muted-foreground">{l.category}</td>
                    <td className="py-2 px-4 text-muted-foreground text-[10px]">{l.source_type}</td>
                    <td className="py-2 px-4 font-medium text-right">{inr(l.amount)}</td>
                    <td className="py-2 px-4 text-right w-16"><button onClick={() => removeLine(l.id)} className="text-[10px] text-[#DC2626] hover:underline">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {lines.length === 0 && <div className="border border-line rounded-xl p-6 text-center text-muted-foreground">No lines yet — push payroll, recurring expenses, or add manual lines above.</div>}
      </div>

      {statement && statement.status !== "posted" && (
        <div className="flex justify-end gap-2"><button className="ipc-btn ipc-btn-black" onClick={post}>Post Statement</button></div>
      )}
    </>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-off rounded-[10px] py-[18px] px-5">
    <div className="font-sans text-[9px] uppercase tracking-[0.12em] text-muted-foreground mb-2">{label}</div>
    <div className="font-serif text-[24px] font-medium text-black">{value}</div>
  </div>
);

// ═══════════════ Saved Statements Tab ═══════════════
function SavedStatementsTab() {
  const [list, setList] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase
      .from("profit_statements")
      .select("*")
      .eq("is_deleted", false)
      .order("statement_month", { ascending: false });
    setList(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const softDelete = async (id: string) => {
    if (!confirm("Move statement to deleted?")) return;
    await supabase.from("profit_statements").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", id);
    load();
  };

  return (
    <div className="border border-line rounded-xl bg-white overflow-hidden">
      <table className="w-full border-collapse font-sans text-[12px]">
        <thead className="bg-off">
          <tr>{["Month","Business Unit","Revenue","Gross Profit","Payroll","Net Profit","Margin","Status",""].map(h => <th key={h} className="text-left text-[9px] uppercase tracking-[0.12em] text-muted-foreground py-2.5 px-3 border-b border-line">{h}</th>)}</tr>
        </thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No saved statements yet.</td></tr>}
          {list.map((s) => (
            <tr key={s.id} className="border-b border-line last:border-b-0">
              <td className="py-2.5 px-3 font-serif">{s.statement_month?.slice(0,7)}</td>
              <td className="py-2.5 px-3">{s.business_unit}</td>
              <td className="py-2.5 px-3">{inr(s.total_revenue)}</td>
              <td className="py-2.5 px-3">{inr(s.gross_profit)}</td>
              <td className="py-2.5 px-3">{inr(s.total_payroll)}</td>
              <td className="py-2.5 px-3 font-medium">{inr(s.net_profit)}</td>
              <td className="py-2.5 px-3">{Number(s.net_margin).toFixed(1)}%</td>
              <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded text-[10px] ${s.status === "posted" ? "bg-[#0d7a5f]/10 text-[#0d7a5f]" : "bg-off border border-line"}`}>{s.status}</span></td>
              <td className="py-2.5 px-3 text-right"><button onClick={() => softDelete(s.id)} className="text-[10px] text-[#DC2626] hover:underline">Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════ Shared: recompute statement totals ═══════════════
async function recomputeStatement(stmtId: string) {
  const { data: lines } = await supabase
    .from("profit_statement_lines")
    .select("bucket, category, amount, source_type")
    .eq("profit_statement_id", stmtId);
  const ls = lines ?? [];
  const sum = (b: string) => ls.filter((l: any) => l.bucket === b).reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
  const revenue = sum("Revenue");
  const cogs = sum("COGS / Direct Cost");
  const gp = revenue - cogs;
  const opex = sum("Operating Expense");
  const fixed = sum("Fixed Expense");
  const variable = sum("Variable Expense");
  const onetime = sum("One-Time Expense");
  const payroll = ls.filter((l: any) => l.source_type === "payroll_run_entry").reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
  const incentives = ls.filter((l: any) => l.source_type === "incentive").reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
  const net = gp - opex - fixed - variable - onetime;
  const margin = revenue > 0 ? (net / revenue) * 100 : 0;
  await supabase.from("profit_statements").update({
    total_revenue: revenue, total_cogs: cogs, gross_profit: gp,
    total_operating_expense: opex, total_fixed_expense: fixed,
    total_variable_expense: variable, total_one_time_expense: onetime,
    total_payroll: payroll, total_incentives: incentives,
    net_profit: net, net_margin: margin,
  }).eq("id", stmtId);
}
