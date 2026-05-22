
-- Add new assignment eligibility flag (idempotent)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_receive_media_buyer_cases boolean NOT NULL DEFAULT false;

-- ============================================================
-- media_buyer_cases
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_buyer_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  student_email text,
  student_phone text,
  program_name text,
  source_module text,
  source_lead_id uuid,
  source_paid_pipeline_lead_id uuid,
  source_crm_lead_id uuid,
  assigned_media_buyer_id uuid,
  assigned_media_buyer_name text,
  assigned_media_buyer_email text,
  assigned_at timestamptz,
  assigned_by uuid,
  assignment_method text NOT NULL DEFAULT 'manual',
  case_stage text NOT NULL DEFAULT 'assigned',
  call_status text NOT NULL DEFAULT 'not_called',
  first_call_due_at timestamptz,
  first_called_at timestamptz,
  last_called_at timestamptz,
  total_call_attempts integer NOT NULL DEFAULT 0,
  last_call_outcome text,
  email_followup_sent_at timestamptz,
  ad_access_status text NOT NULL DEFAULT 'not_requested',
  ad_account_access_received_at timestamptz,
  ad_account_name text,
  business_manager_access boolean NOT NULL DEFAULT false,
  page_access boolean NOT NULL DEFAULT false,
  ad_account_access boolean NOT NULL DEFAULT false,
  pixel_domain_access boolean NOT NULL DEFAULT false,
  access_notes text,
  creative_status text,
  campaign_setup_status text,
  ads_status text NOT NULL DEFAULT 'not_started',
  ads_launch_date date,
  ads_start_date date,
  ads_stop_date date,
  current_pause_started_at timestamptz,
  service_duration_type text NOT NULL DEFAULT 'custom',
  service_duration_months integer,
  service_duration_days integer,
  active_days_used integer NOT NULL DEFAULT 0,
  active_days_remaining integer,
  projected_service_end_date date,
  stop_reason text,
  pause_reason text,
  resume_reason text,
  priority text NOT NULL DEFAULT 'normal',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_mbc_assigned_buyer ON public.media_buyer_cases(assigned_media_buyer_id);
CREATE INDEX IF NOT EXISTS idx_mbc_stage ON public.media_buyer_cases(case_stage);
CREATE INDEX IF NOT EXISTS idx_mbc_ads_status ON public.media_buyer_cases(ads_status);
CREATE INDEX IF NOT EXISTS idx_mbc_first_call_due ON public.media_buyer_cases(first_call_due_at);

ALTER TABLE public.media_buyer_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mbc_select_active" ON public.media_buyer_cases;
CREATE POLICY "mbc_select_active" ON public.media_buyer_cases
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "mbc_insert_admin_or_assignee" ON public.media_buyer_cases;
CREATE POLICY "mbc_insert_admin_or_assignee" ON public.media_buyer_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = created_by
  );

DROP POLICY IF EXISTS "mbc_update_admin_or_buyer" ON public.media_buyer_cases;
CREATE POLICY "mbc_update_admin_or_buyer" ON public.media_buyer_cases
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = assigned_media_buyer_id
  );

DROP POLICY IF EXISTS "mbc_delete_admin" ON public.media_buyer_cases;
CREATE POLICY "mbc_delete_admin" ON public.media_buyer_cases
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_mbc_touch_updated_at ON public.media_buyer_cases;
CREATE TRIGGER trg_mbc_touch_updated_at
  BEFORE UPDATE ON public.media_buyer_cases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- media_buyer_case_events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_buyer_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.media_buyer_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_label text,
  event_date timestamptz NOT NULL DEFAULT now(),
  old_status text,
  new_status text,
  notes text,
  metadata jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_mbce_case ON public.media_buyer_case_events(case_id);

ALTER TABLE public.media_buyer_case_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mbce_select_active" ON public.media_buyer_case_events;
CREATE POLICY "mbce_select_active" ON public.media_buyer_case_events
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "mbce_insert_active" ON public.media_buyer_case_events;
CREATE POLICY "mbce_insert_active" ON public.media_buyer_case_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "mbce_update_admin" ON public.media_buyer_case_events;
CREATE POLICY "mbce_update_admin" ON public.media_buyer_case_events
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- media_buyer_service_periods
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_buyer_service_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.media_buyer_cases(id) ON DELETE CASCADE,
  period_type text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  total_days integer,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_mbsp_case ON public.media_buyer_service_periods(case_id);

ALTER TABLE public.media_buyer_service_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mbsp_select_active" ON public.media_buyer_service_periods;
CREATE POLICY "mbsp_select_active" ON public.media_buyer_service_periods
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "mbsp_insert_active" ON public.media_buyer_service_periods;
CREATE POLICY "mbsp_insert_active" ON public.media_buyer_service_periods
  FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "mbsp_update_active" ON public.media_buyer_service_periods;
CREATE POLICY "mbsp_update_active" ON public.media_buyer_service_periods
  FOR UPDATE TO authenticated USING (public.is_active(auth.uid()));

-- ============================================================
-- media_buyer_case_emails
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_buyer_case_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.media_buyer_cases(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  recipient_email text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  provider_message_id text,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_mbcm_case ON public.media_buyer_case_emails(case_id);

ALTER TABLE public.media_buyer_case_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mbcm_select_active" ON public.media_buyer_case_emails;
CREATE POLICY "mbcm_select_active" ON public.media_buyer_case_emails
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "mbcm_insert_active" ON public.media_buyer_case_emails;
CREATE POLICY "mbcm_insert_active" ON public.media_buyer_case_emails
  FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "mbcm_update_active" ON public.media_buyer_case_emails;
CREATE POLICY "mbcm_update_active" ON public.media_buyer_case_emails
  FOR UPDATE TO authenticated USING (public.is_active(auth.uid()));
