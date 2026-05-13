import QuickSaveInput from "@/components/QuickSaveInput";
import {
  PAY_TYPES,
  SALARY_EXPENSE_CATEGORIES,
  PNL_CLASSIFICATIONS,
  SALARY_CYCLES,
  defaultExpenseCategory,
  defaultClassification,
} from "@/lib/payroll";

export interface PayrollFormState {
  payroll_applicable: boolean;
  pay_type: string;
  monthly_salary: string;
  one_time_pay: string;
  daily_wage: string;
  hourly_rate: string;
  joining_date: string;
  exit_date: string;
  salary_expense_category: string;
  pnl_cost_classification: string;
  salary_cycle: string;
  disbursement_start_day: string;
  disbursement_end_day: string;
  notes: string;
}

export const emptyPayroll = (): PayrollFormState => ({
  payroll_applicable: true,
  pay_type: "Monthly Salary",
  monthly_salary: "",
  one_time_pay: "",
  daily_wage: "",
  hourly_rate: "",
  joining_date: "",
  exit_date: "",
  salary_expense_category: "Salaries",
  pnl_cost_classification: "Operating Expense",
  salary_cycle: "Calendar Month: 1st to Last Day",
  disbursement_start_day: "7",
  disbursement_end_day: "10",
  notes: "",
});

export function payrollToDb(p: PayrollFormState) {
  return {
    payroll_applicable: p.payroll_applicable,
    pay_type: p.pay_type,
    monthly_salary: Number(p.monthly_salary) || 0,
    one_time_pay: Number(p.one_time_pay) || 0,
    daily_wage: Number(p.daily_wage) || 0,
    hourly_rate: Number(p.hourly_rate) || 0,
    joining_date: p.joining_date || null,
    exit_date: p.exit_date || null,
    salary_expense_category: p.salary_expense_category || null,
    pnl_cost_classification: p.pnl_cost_classification || null,
    salary_cycle: p.salary_cycle,
    disbursement_start_day: Number(p.disbursement_start_day) || 7,
    disbursement_end_day: Number(p.disbursement_end_day) || 10,
    notes: p.notes || null,
  };
}

export function dbToPayroll(row: any): PayrollFormState {
  if (!row) return emptyPayroll();
  return {
    payroll_applicable: !!row.payroll_applicable,
    pay_type: row.pay_type ?? "Monthly Salary",
    monthly_salary: row.monthly_salary?.toString() ?? "",
    one_time_pay: row.one_time_pay?.toString() ?? "",
    daily_wage: row.daily_wage?.toString() ?? "",
    hourly_rate: row.hourly_rate?.toString() ?? "",
    joining_date: row.joining_date ?? "",
    exit_date: row.exit_date ?? "",
    salary_expense_category: row.salary_expense_category ?? "Salaries",
    pnl_cost_classification: row.pnl_cost_classification ?? "Operating Expense",
    salary_cycle: row.salary_cycle ?? "Calendar Month: 1st to Last Day",
    disbursement_start_day: (row.disbursement_start_day ?? 7).toString(),
    disbursement_end_day: (row.disbursement_end_day ?? 10).toString(),
    notes: row.notes ?? "",
  };
}

interface Props {
  value: PayrollFormState;
  onChange: (next: PayrollFormState) => void;
}

export default function PayrollFieldsSection({ value: p, onChange }: Props) {
  const set = (patch: Partial<PayrollFormState>) => onChange({ ...p, ...patch });
  const setPayType = (pt: string) =>
    set({
      pay_type: pt,
      salary_expense_category: defaultExpenseCategory(pt),
      pnl_cost_classification: defaultClassification(pt),
    });

  const showMonthly = ["Monthly Salary", "Retainer", "Internship / Stipend"].includes(p.pay_type);
  const showOneTime = ["One-Time / Outsourced", "Project-Based", "Event-Based"].includes(p.pay_type);
  const showDaily = p.pay_type === "Daily Wage";
  const showHourly = p.pay_type === "Hourly Pay";
  const disabled = !p.payroll_applicable;

  return (
    <div className="bg-off rounded-xl py-[18px] px-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-serif text-[15px] font-medium text-black">Payroll Details</div>
          <div className="font-sans text-[11px] text-muted-foreground">Used by Profit Statement to calculate monthly salary expenses.</div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={p.payroll_applicable} onChange={(e) => set({ payroll_applicable: e.target.checked, pay_type: e.target.checked ? (p.pay_type === "Not Applicable" ? "Monthly Salary" : p.pay_type) : "Not Applicable" })} className="w-4 h-4" />
          <span className="font-sans text-[12px] text-black">Payroll applicable</span>
        </label>
      </div>

      {!disabled && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Pay Type</label>
              <QuickSaveInput
                fieldKey="team_pay_type"
                value={p.pay_type}
                onChange={setPayType}
                placeholder="Choose or add pay type"
              />
              <div className="mt-1 flex flex-wrap gap-1">
                {PAY_TYPES.filter(t => t !== "Not Applicable").map(t => (
                  <button type="button" key={t} onClick={() => setPayType(t)} className={`text-[10px] font-sans px-2 py-0.5 rounded border ${p.pay_type === t ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground hover:text-black"}`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="form-label">Joining Date *</label>
              <input type="date" value={p.joining_date} onChange={(e) => set({ joining_date: e.target.value })} className="ipc-input" />
              <label className="form-label mt-2">Exit Date (optional)</label>
              <input type="date" value={p.exit_date} onChange={(e) => set({ exit_date: e.target.value })} className="ipc-input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {showMonthly && (
              <div>
                <label className="form-label">Monthly Salary (₹)</label>
                <input type="number" value={p.monthly_salary} onChange={(e) => set({ monthly_salary: e.target.value })} placeholder="e.g. 35000" className="ipc-input" />
              </div>
            )}
            {showOneTime && (
              <div>
                <label className="form-label">One-Time / Project / Event Pay (₹)</label>
                <input type="number" value={p.one_time_pay} onChange={(e) => set({ one_time_pay: e.target.value })} placeholder="e.g. 12000" className="ipc-input" />
              </div>
            )}
            {showDaily && (
              <div>
                <label className="form-label">Daily Wage (₹)</label>
                <input type="number" value={p.daily_wage} onChange={(e) => set({ daily_wage: e.target.value })} className="ipc-input" />
              </div>
            )}
            {showHourly && (
              <div>
                <label className="form-label">Hourly Pay (₹)</label>
                <input type="number" value={p.hourly_rate} onChange={(e) => set({ hourly_rate: e.target.value })} className="ipc-input" />
              </div>
            )}
            <div>
              <label className="form-label">Salary Cycle</label>
              <select value={p.salary_cycle} onChange={(e) => set({ salary_cycle: e.target.value })} className="ipc-input cursor-pointer">
                {SALARY_CYCLES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Salary Expense Category</label>
              <QuickSaveInput
                fieldKey="salary_expense_category"
                value={p.salary_expense_category}
                onChange={(v) => set({ salary_expense_category: v })}
                placeholder="e.g. Salaries"
              />
              <div className="mt-1 flex flex-wrap gap-1">
                {SALARY_EXPENSE_CATEGORIES.map(c => (
                  <button type="button" key={c} onClick={() => set({ salary_expense_category: c })} className={`text-[10px] font-sans px-2 py-0.5 rounded border ${p.salary_expense_category === c ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground hover:text-black"}`}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="form-label">P&amp;L Cost Classification</label>
              <QuickSaveInput
                fieldKey="pnl_cost_classification"
                value={p.pnl_cost_classification}
                onChange={(v) => set({ pnl_cost_classification: v })}
                placeholder="e.g. Operating Expense"
              />
              <div className="mt-1 flex flex-wrap gap-1">
                {PNL_CLASSIFICATIONS.map(c => (
                  <button type="button" key={c} onClick={() => set({ pnl_cost_classification: c })} className={`text-[10px] font-sans px-2 py-0.5 rounded border ${p.pnl_cost_classification === c ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground hover:text-black"}`}>{c}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Disbursement start day</label>
              <input type="number" min={1} max={31} value={p.disbursement_start_day} onChange={(e) => set({ disbursement_start_day: e.target.value })} className="ipc-input" />
            </div>
            <div>
              <label className="form-label">Disbursement end day</label>
              <input type="number" min={1} max={31} value={p.disbursement_end_day} onChange={(e) => set({ disbursement_end_day: e.target.value })} className="ipc-input" />
            </div>
            <div>
              <label className="form-label">Notes</label>
              <input type="text" value={p.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. New joiner, outsourced editor…" className="ipc-input" />
            </div>
          </div>
        </>
      )}

      {disabled && (
        <div>
          <label className="form-label">Notes</label>
          <input type="text" value={p.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Reason for no payroll, e.g. founder, volunteer" className="ipc-input" />
        </div>
      )}
    </div>
  );
}
