
-- ===== Business Units =====
CREATE TABLE public.business_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY bu_read ON public.business_units FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY bu_admin ON public.business_units FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.business_units (name) VALUES ('IPC');

-- ===== Team Payroll Profiles =====
CREATE TABLE public.team_payroll_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL UNIQUE,
  full_name_snapshot text,
  role_snapshot text,
  department_snapshot text,
  business_unit text,
  payroll_applicable boolean NOT NULL DEFAULT true,
  pay_type text NOT NULL DEFAULT 'Monthly Salary',
  monthly_salary numeric NOT NULL DEFAULT 0,
  one_time_pay numeric NOT NULL DEFAULT 0,
  daily_wage numeric NOT NULL DEFAULT 0,
  hourly_rate numeric NOT NULL DEFAULT 0,
  joining_date date,
  exit_date date,
  salary_expense_category text DEFAULT 'Salaries',
  pnl_cost_classification text DEFAULT 'Operating Expense',
  salary_cycle text DEFAULT 'Calendar Month: 1st to Last Day',
  custom_cycle_start_day int,
  custom_cycle_end_day int,
  disbursement_start_day int DEFAULT 7,
  disbursement_end_day int DEFAULT 10,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
ALTER TABLE public.team_payroll_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tpp_admin ON public.team_payroll_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tpp_touch BEFORE UPDATE ON public.team_payroll_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== Team Salary History =====
CREATE TABLE public.team_salary_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL,
  old_pay_type text,
  new_pay_type text,
  old_amount numeric,
  new_amount numeric,
  effective_from date,
  effective_to date,
  change_reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_salary_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY tsh_admin ON public.team_salary_history FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ===== Payroll Runs =====
CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit text NOT NULL DEFAULT 'IPC',
  statement_month date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  disbursement_date date,
  salary_cycle text,
  statement_basis text NOT NULL DEFAULT 'Accrual Basis',
  total_payroll_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY pr_admin ON public.payroll_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER pr_touch BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX pr_period_idx ON public.payroll_runs(business_unit, period_start, period_end);

-- ===== Payroll Run Entries =====
CREATE TABLE public.payroll_run_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  team_member_id uuid,
  team_member_name_snapshot text,
  role_snapshot text,
  pay_type text,
  joining_date date,
  exit_date date,
  base_monthly_salary numeric DEFAULT 0,
  one_time_pay numeric DEFAULT 0,
  daily_wage numeric DEFAULT 0,
  hourly_rate numeric DEFAULT 0,
  hours_worked numeric DEFAULT 0,
  period_start date,
  period_end date,
  total_period_days int DEFAULT 0,
  payable_days int DEFAULT 0,
  calculated_amount numeric NOT NULL DEFAULT 0,
  manual_adjustment_amount numeric NOT NULL DEFAULT 0,
  final_payable_amount numeric NOT NULL DEFAULT 0,
  reason text,
  cost_classification text,
  expense_category text,
  status text NOT NULL DEFAULT 'pending',
  excluded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_run_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY pre_admin ON public.payroll_run_entries FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER pre_touch BEFORE UPDATE ON public.payroll_run_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX pre_run_idx ON public.payroll_run_entries(payroll_run_id);

-- ===== Profit Statements =====
CREATE TABLE public.profit_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit text NOT NULL DEFAULT 'IPC',
  statement_month date NOT NULL,
  statement_basis text NOT NULL DEFAULT 'Accrual Basis',
  total_revenue numeric NOT NULL DEFAULT 0,
  total_cogs numeric NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0,
  total_operating_expense numeric NOT NULL DEFAULT 0,
  total_payroll numeric NOT NULL DEFAULT 0,
  total_incentives numeric NOT NULL DEFAULT 0,
  total_fixed_expense numeric NOT NULL DEFAULT 0,
  total_variable_expense numeric NOT NULL DEFAULT 0,
  total_one_time_expense numeric NOT NULL DEFAULT 0,
  net_profit numeric NOT NULL DEFAULT 0,
  net_margin numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profit_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY ps_admin ON public.profit_statements FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ps_touch BEFORE UPDATE ON public.profit_statements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX ps_month_idx ON public.profit_statements(business_unit, statement_month);

-- ===== Profit Statement Lines =====
CREATE TABLE public.profit_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_statement_id uuid NOT NULL REFERENCES public.profit_statements(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  category text,
  label text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  source_type text,
  source_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profit_statement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY psl_admin ON public.profit_statement_lines FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX psl_stmt_idx ON public.profit_statement_lines(profit_statement_id);

-- ===== Incentives =====
CREATE TABLE public.incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid,
  team_member_name_snapshot text,
  business_unit text DEFAULT 'IPC',
  incentive_type text,
  reason text,
  amount numeric NOT NULL DEFAULT 0,
  incentive_date date,
  cadence text DEFAULT 'one-time',
  notes text,
  cost_classification text DEFAULT 'Operating Expense',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.incentives ENABLE ROW LEVEL SECURITY;
CREATE POLICY inc_admin ON public.incentives FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER inc_touch BEFORE UPDATE ON public.incentives FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== Recurring Expense Templates =====
CREATE TABLE public.recurring_expense_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_name text NOT NULL,
  category text,
  amount numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly',
  start_date date,
  end_date date,
  business_unit text DEFAULT 'IPC',
  cost_classification text DEFAULT 'Fixed Expense',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recurring_expense_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY ret_admin ON public.recurring_expense_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ret_touch BEFORE UPDATE ON public.recurring_expense_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
