
-- ─────────────────────────────────────────────────────────────
-- kpi_reward_rules
CREATE TABLE public.kpi_reward_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  period_type text NOT NULL DEFAULT 'monthly',
  min_score numeric NOT NULL DEFAULT 90,
  reward_points numeric NOT NULL DEFAULT 0,
  cash_amount numeric NOT NULL DEFAULT 0,
  badge_name text,
  recognition_label text,
  applies_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applies_to_role text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_reward_rules_period_chk CHECK (period_type IN ('daily','weekly','monthly'))
);

GRANT SELECT ON public.kpi_reward_rules TO authenticated;
GRANT ALL ON public.kpi_reward_rules TO service_role;

ALTER TABLE public.kpi_reward_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_reward_rules read authenticated"
  ON public.kpi_reward_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "kpi_reward_rules admin manage"
  ON public.kpi_reward_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER kpi_reward_rules_touch
  BEFORE UPDATE ON public.kpi_reward_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- kpi_reward_earnings
CREATE TABLE public.kpi_reward_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reward_rule_id uuid REFERENCES public.kpi_reward_rules(id) ON DELETE SET NULL,
  period_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  score numeric NOT NULL,
  reward_points numeric NOT NULL DEFAULT 0,
  cash_amount numeric NOT NULL DEFAULT 0,
  badge_name text,
  recognition_label text,
  status text NOT NULL DEFAULT 'pending_approval',
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  paid_by uuid,
  paid_at timestamptz,
  payout_notes text,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_reward_earnings_period_chk CHECK (period_type IN ('daily','weekly','monthly')),
  CONSTRAINT kpi_reward_earnings_status_chk CHECK (status IN ('pending_approval','approved','rejected','paid','cancelled'))
);

CREATE UNIQUE INDEX kpi_reward_earnings_uq
  ON public.kpi_reward_earnings (user_id, reward_rule_id, period_type, period_start, period_end);

CREATE INDEX kpi_reward_earnings_user_idx ON public.kpi_reward_earnings (user_id, period_start DESC);
CREATE INDEX kpi_reward_earnings_status_idx ON public.kpi_reward_earnings (status);

GRANT SELECT ON public.kpi_reward_earnings TO authenticated;
GRANT ALL ON public.kpi_reward_earnings TO service_role;

ALTER TABLE public.kpi_reward_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_reward_earnings read own"
  ON public.kpi_reward_earnings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "kpi_reward_earnings admin manage"
  ON public.kpi_reward_earnings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER kpi_reward_earnings_touch
  BEFORE UPDATE ON public.kpi_reward_earnings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
