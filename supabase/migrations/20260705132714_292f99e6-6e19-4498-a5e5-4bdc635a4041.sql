
-- =========================================================
-- operations_result_submissions
-- =========================================================
CREATE TABLE public.operations_result_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operations_lead_id uuid NULL,
  crm_lead_id uuid NULL,
  paid_pipeline_lead_id uuid NULL,
  member_name text NULL,
  submitted_by uuid NOT NULL,
  result_type text NOT NULL,
  title text NOT NULL,
  description text NULL,
  proof_url text NULL,
  proof_file_path text NULL,
  result_date date NULL,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  rejected_by uuid NULL,
  rejected_at timestamptz NULL,
  rejection_reason text NULL,
  reward_amount numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_result_submissions TO authenticated;
GRANT ALL ON public.operations_result_submissions TO service_role;

ALTER TABLE public.operations_result_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all result submissions"
  ON public.operations_result_submissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Submitters view own submissions"
  ON public.operations_result_submissions FOR SELECT
  TO authenticated
  USING (submitted_by = auth.uid());

CREATE POLICY "Submitters create own submissions"
  ON public.operations_result_submissions FOR INSERT
  TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "Submitters update own pending submissions"
  ON public.operations_result_submissions FOR UPDATE
  TO authenticated
  USING (submitted_by = auth.uid() AND status = 'pending')
  WITH CHECK (submitted_by = auth.uid() AND status = 'pending');

CREATE INDEX ors_status_idx ON public.operations_result_submissions(status);
CREATE INDEX ors_submitted_by_idx ON public.operations_result_submissions(submitted_by);
CREATE INDEX ors_ops_lead_idx ON public.operations_result_submissions(operations_lead_id);
CREATE INDEX ors_crm_lead_idx ON public.operations_result_submissions(crm_lead_id);
CREATE INDEX ors_paid_lead_idx ON public.operations_result_submissions(paid_pipeline_lead_id);
CREATE INDEX ors_approved_at_idx ON public.operations_result_submissions(approved_at);

CREATE TRIGGER ors_touch BEFORE UPDATE ON public.operations_result_submissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- operations_result_reward_rules
-- =========================================================
CREATE TABLE public.operations_result_reward_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  result_type text NULL,
  reward_amount numeric NOT NULL DEFAULT 500,
  min_approved_count integer NOT NULL DEFAULT 1,
  period text NOT NULL DEFAULT 'monthly',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.operations_result_reward_rules TO authenticated;
GRANT ALL ON public.operations_result_reward_rules TO service_role;

ALTER TABLE public.operations_result_reward_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read active reward rules"
  ON public.operations_result_reward_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage result reward rules"
  ON public.operations_result_reward_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER orrr_touch BEFORE UPDATE ON public.operations_result_reward_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.operations_result_reward_rules (name, result_type, reward_amount, min_approved_count, period, is_active)
VALUES ('Default ₹500 per approved result', NULL, 500, 1, 'monthly', true);

-- =========================================================
-- operations_result_reward_payouts
-- =========================================================
CREATE TABLE public.operations_result_reward_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  approved_count integer NOT NULL DEFAULT 0,
  reward_amount numeric NOT NULL DEFAULT 0,
  payout_status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz NULL,
  paid_by uuid NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_member_id, period_start, period_end)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_result_reward_payouts TO authenticated;
GRANT ALL ON public.operations_result_reward_payouts TO service_role;

ALTER TABLE public.operations_result_reward_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all payouts"
  ON public.operations_result_reward_payouts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Members view own payouts"
  ON public.operations_result_reward_payouts FOR SELECT
  TO authenticated
  USING (team_member_id = auth.uid());

CREATE INDEX orrp_member_idx ON public.operations_result_reward_payouts(team_member_id);
CREATE INDEX orrp_period_idx ON public.operations_result_reward_payouts(period_start, period_end);

CREATE TRIGGER orrp_touch BEFORE UPDATE ON public.operations_result_reward_payouts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
