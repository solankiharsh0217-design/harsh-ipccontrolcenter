
-- Add 'operations' to pipeline_type enum
ALTER TYPE public.pipeline_type ADD VALUE IF NOT EXISTS 'operations';

-- Add eligibility flag for media buyers / operations team
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_receive_operations_leads boolean NOT NULL DEFAULT false;

-- ============== operations_leads ==============
CREATE TABLE IF NOT EXISTS public.operations_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  paid_pipeline_lead_id uuid,
  name text NOT NULL,
  email text,
  phone text,
  product_name text,
  batch_name text,
  onboarding_batch text,
  source_stage text,
  service_package_id uuid,
  service_package_name text,
  service_months integer,
  service_days_committed integer,
  service_status text NOT NULL DEFAULT 'not_started',
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  current_stage text,
  assigned_media_buyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_media_buyer_name text,
  priority text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ad_launch_date date,
  current_active_start_date date,
  total_active_days integer NOT NULL DEFAULT 0,
  total_paused_days integer NOT NULL DEFAULT 0,
  last_paused_at date,
  last_resumed_at date,
  service_end_target_date date,
  notes text,
  deal_value numeric,
  sort_order double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_leads_stage ON public.operations_leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_ops_leads_pipeline ON public.operations_leads(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_ops_leads_buyer ON public.operations_leads(assigned_media_buyer_id);
CREATE INDEX IF NOT EXISTS idx_ops_leads_crm ON public.operations_leads(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_ops_leads_paid ON public.operations_leads(paid_pipeline_lead_id);

-- Prevent duplicate active operations record per source
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ops_leads_active_crm
  ON public.operations_leads(crm_lead_id)
  WHERE crm_lead_id IS NOT NULL AND service_status NOT IN ('stopped','completed');
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ops_leads_active_paid
  ON public.operations_leads(paid_pipeline_lead_id)
  WHERE paid_pipeline_lead_id IS NOT NULL AND service_status NOT IN ('stopped','completed');

CREATE TRIGGER trg_ops_leads_updated_at
  BEFORE UPDATE ON public.operations_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.operations_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_leads_admin_all" ON public.operations_leads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ops_leads_member_select_own" ON public.operations_leads
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()) AND assigned_media_buyer_id = auth.uid());

CREATE POLICY "ops_leads_member_update_own" ON public.operations_leads
  FOR UPDATE TO authenticated
  USING (public.is_active(auth.uid()) AND assigned_media_buyer_id = auth.uid())
  WITH CHECK (public.is_active(auth.uid()) AND assigned_media_buyer_id = auth.uid());

-- ============== operations_service_events ==============
CREATE TABLE IF NOT EXISTS public.operations_service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operations_lead_id uuid NOT NULL REFERENCES public.operations_leads(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('start','pause','resume','stop','complete','restart')),
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_events_lead ON public.operations_service_events(operations_lead_id);

ALTER TABLE public.operations_service_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_events_admin_all" ON public.operations_service_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ops_events_member_select" ON public.operations_service_events
  FOR SELECT TO authenticated
  USING (
    public.is_active(auth.uid()) AND
    EXISTS (SELECT 1 FROM public.operations_leads ol
            WHERE ol.id = operations_lead_id
              AND ol.assigned_media_buyer_id = auth.uid())
  );

CREATE POLICY "ops_events_member_insert" ON public.operations_service_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active(auth.uid()) AND
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM public.operations_leads ol
            WHERE ol.id = operations_lead_id
              AND ol.assigned_media_buyer_id = auth.uid())
  );

-- ============== operations_conversion_reports ==============
CREATE TABLE IF NOT EXISTS public.operations_conversion_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operations_lead_id uuid NOT NULL REFERENCES public.operations_leads(id) ON DELETE CASCADE,
  media_buyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_name text,
  conversion_count integer NOT NULL DEFAULT 1,
  conversion_value numeric,
  proof_url text,
  campaign_name text,
  notes text,
  conversion_date date NOT NULL DEFAULT CURRENT_DATE,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','approved','rejected')),
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_conv_lead ON public.operations_conversion_reports(operations_lead_id);
CREATE INDEX IF NOT EXISTS idx_ops_conv_buyer ON public.operations_conversion_reports(media_buyer_id);
CREATE INDEX IF NOT EXISTS idx_ops_conv_status ON public.operations_conversion_reports(verification_status);

CREATE TRIGGER trg_ops_conv_updated_at
  BEFORE UPDATE ON public.operations_conversion_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.operations_conversion_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_conv_admin_all" ON public.operations_conversion_reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ops_conv_member_select_own" ON public.operations_conversion_reports
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()) AND media_buyer_id = auth.uid());

CREATE POLICY "ops_conv_member_insert_own" ON public.operations_conversion_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active(auth.uid()) AND
    media_buyer_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.operations_leads ol
            WHERE ol.id = operations_lead_id
              AND ol.assigned_media_buyer_id = auth.uid())
  );

-- ============== operations_reward_rules ==============
CREATE TABLE IF NOT EXISTS public.operations_reward_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  role_scope text NOT NULL DEFAULT 'media_buyer',
  period text NOT NULL DEFAULT 'monthly' CHECK (period IN ('daily','weekly','monthly','custom')),
  target_metric text NOT NULL DEFAULT 'approved_conversions',
  target_count integer NOT NULL DEFAULT 10,
  reward_amount numeric NOT NULL DEFAULT 3000,
  currency text NOT NULL DEFAULT 'INR',
  verification_required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ops_reward_rules_updated_at
  BEFORE UPDATE ON public.operations_reward_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.operations_reward_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_reward_rules_select_active" ON public.operations_reward_rules
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

CREATE POLICY "ops_reward_rules_admin_write" ON public.operations_reward_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default reward rule
INSERT INTO public.operations_reward_rules (rule_name, role_scope, period, target_metric, target_count, reward_amount, currency, description)
SELECT 'Monthly Media Buyer Conversion Reward', 'media_buyer', 'monthly', 'approved_conversions', 10, 3000, 'INR',
  'Help your clients achieve 10 approved conversions in a calendar month to unlock ₹3,000.'
WHERE NOT EXISTS (SELECT 1 FROM public.operations_reward_rules);

-- ============== operations_reward_progress ==============
CREATE TABLE IF NOT EXISTS public.operations_reward_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.operations_reward_rules(id) ON DELETE SET NULL,
  month text NOT NULL,
  approved_conversion_count integer NOT NULL DEFAULT 0,
  target_count integer NOT NULL,
  reward_amount numeric NOT NULL,
  reward_status text NOT NULL DEFAULT 'in_progress'
    CHECK (reward_status IN ('in_progress','achieved','paid','expired')),
  achieved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_buyer_id, rule_id, month)
);

CREATE TRIGGER trg_ops_reward_progress_updated_at
  BEFORE UPDATE ON public.operations_reward_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.operations_reward_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_reward_progress_admin_all" ON public.operations_reward_progress
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ops_reward_progress_select_own" ON public.operations_reward_progress
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()) AND media_buyer_id = auth.uid());
