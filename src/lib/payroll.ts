// Payroll calculation helpers for IPC Control Center

export const PAY_TYPES = [
  "Monthly Salary",
  "One-Time / Outsourced",
  "Project-Based",
  "Event-Based",
  "Daily Wage",
  "Hourly Pay",
  "Retainer",
  "Internship / Stipend",
  "Not Applicable",
  "Custom",
] as const;
export type PayType = (typeof PAY_TYPES)[number];

export const SALARY_EXPENSE_CATEGORIES = [
  "Salaries",
  "Outsourced Cost",
  "Contractor Payment",
  "Intern Stipend",
  "Event Staff Cost",
  "Direct Fulfilment Cost",
  "Other",
] as const;

export const PNL_CLASSIFICATIONS = [
  "Operating Expense",
  "COGS / Direct Cost",
  "Fixed Expense",
  "Variable Expense",
  "One-Time Expense",
  "Not Applicable",
] as const;

export const SALARY_CYCLES = [
  "Calendar Month: 1st to Last Day",
  "Custom Cycle",
  "Weekly",
  "Bi-Weekly",
  "15th to 14th",
  "26th to 25th",
  "Not Applicable",
] as const;

export function defaultExpenseCategory(payType: string): string {
  switch (payType) {
    case "Monthly Salary":
    case "Retainer":
      return "Salaries";
    case "Internship / Stipend":
      return "Intern Stipend";
    case "One-Time / Outsourced":
      return "Outsourced Cost";
    case "Project-Based":
      return "Direct Fulfilment Cost";
    case "Event-Based":
      return "Event Staff Cost";
    case "Daily Wage":
    case "Hourly Pay":
      return "Contractor Payment";
    case "Not Applicable":
      return "Other";
    default:
      return "Other";
  }
}

export function defaultClassification(payType: string): string {
  switch (payType) {
    case "Monthly Salary":
    case "Retainer":
    case "Internship / Stipend":
      return "Operating Expense";
    case "One-Time / Outsourced":
    case "Project-Based":
      return "Variable Expense";
    case "Event-Based":
      return "Variable Expense";
    case "Daily Wage":
    case "Hourly Pay":
      return "Variable Expense";
    case "Not Applicable":
      return "Not Applicable";
    default:
      return "Operating Expense";
  }
}

const dayMs = 86400000;
function daysInclusive(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / dayMs) + 1;
}
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export interface PayrollProfile {
  team_member_id: string;
  full_name_snapshot?: string | null;
  role_snapshot?: string | null;
  payroll_applicable: boolean;
  pay_type: string;
  monthly_salary: number;
  one_time_pay: number;
  daily_wage: number;
  hourly_rate: number;
  joining_date?: string | null;
  exit_date?: string | null;
  salary_expense_category?: string | null;
  pnl_cost_classification?: string | null;
}

export interface PayrollCalcInput {
  profile: PayrollProfile;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  hoursWorked?: number;
  customAmount?: number;
}

export interface PayrollCalcResult {
  totalPeriodDays: number;
  payableDays: number;
  calculatedAmount: number;
  reason: string;
  excluded: boolean;
}

export function calcPayrollEntry({
  profile,
  periodStart,
  periodEnd,
  hoursWorked = 0,
  customAmount,
}: PayrollCalcInput): PayrollCalcResult {
  const ps = parseDate(periodStart)!;
  const pe = parseDate(periodEnd)!;
  const totalPeriodDays = Math.max(1, daysInclusive(ps, pe));

  if (!profile.payroll_applicable || profile.pay_type === "Not Applicable") {
    return {
      totalPeriodDays,
      payableDays: 0,
      calculatedAmount: 0,
      reason: "Not applicable",
      excluded: true,
    };
  }

  const join = parseDate(profile.joining_date);
  const exit = parseDate(profile.exit_date);
  const payableStart = join && join > ps ? join : ps;
  const payableEnd = exit && exit < pe ? exit : pe;
  const payableDays =
    payableStart > payableEnd ? 0 : daysInclusive(payableStart, payableEnd);

  if (payableDays === 0) {
    return {
      totalPeriodDays,
      payableDays: 0,
      calculatedAmount: 0,
      reason: "Outside payroll period",
      excluded: false,
    };
  }

  let calculated = 0;
  let reason = "";

  switch (profile.pay_type) {
    case "Monthly Salary":
    case "Retainer":
    case "Internship / Stipend": {
      const monthly = profile.monthly_salary || 0;
      if (payableDays === totalPeriodDays) {
        calculated = monthly;
        reason = "Full month salary";
      } else {
        calculated = Math.round((monthly / totalPeriodDays) * payableDays);
        const isJoiner = join && join > ps;
        const isExit = exit && exit < pe;
        reason = isJoiner
          ? `New joiner pro-rata from ${profile.joining_date}`
          : isExit
            ? `Exit pro-rata until ${profile.exit_date}`
            : `Pro-rata ${payableDays}/${totalPeriodDays} days`;
      }
      break;
    }
    case "One-Time / Outsourced":
    case "Project-Based":
    case "Event-Based": {
      calculated = profile.one_time_pay || 0;
      reason =
        profile.pay_type === "Event-Based"
          ? "Event-based payout"
          : profile.pay_type === "Project-Based"
            ? "Project-based payout"
            : "Outsourced / one-time payout";
      break;
    }
    case "Daily Wage": {
      calculated = Math.round((profile.daily_wage || 0) * payableDays);
      reason = `Daily wage × ${payableDays} days`;
      break;
    }
    case "Hourly Pay": {
      calculated = Math.round((profile.hourly_rate || 0) * (hoursWorked || 0));
      reason = `Hourly rate × ${hoursWorked} hours`;
      break;
    }
    case "Custom": {
      calculated = customAmount || 0;
      reason = "Custom amount";
      break;
    }
    default:
      reason = "Unknown pay type";
  }

  return {
    totalPeriodDays,
    payableDays,
    calculatedAmount: calculated,
    reason,
    excluded: false,
  };
}

export { inr } from "@/lib/format";

export function monthBounds(monthIso: string): { start: string; end: string } {
  // monthIso = "YYYY-MM-01" or any date in month
  const d = new Date(monthIso);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}
