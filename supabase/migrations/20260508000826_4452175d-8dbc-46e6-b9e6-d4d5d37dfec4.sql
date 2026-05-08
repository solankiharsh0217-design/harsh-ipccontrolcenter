
-- =========================================================
-- roas_master_sheet_mappings
-- =========================================================
CREATE TABLE IF NOT EXISTS public.roas_master_sheet_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id text NOT NULL,
  master_sheet_url text NOT NULL,
  spreadsheet_title text,
  mapping_name text,
  sales_sheet_id text,
  sales_tab_name text,
  media_buyer_mappings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ignored_tabs jsonb DEFAULT '[]'::jsonb,
  column_mappings jsonb,
  last_confirmed_by uuid,
  last_confirmed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_rmsm_spreadsheet_id ON public.roas_master_sheet_mappings(spreadsheet_id);

ALTER TABLE public.roas_master_sheet_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmsm_admin ON public.roas_master_sheet_mappings;
CREATE POLICY rmsm_admin ON public.roas_master_sheet_mappings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS rmsm_read ON public.roas_master_sheet_mappings;
CREATE POLICY rmsm_read ON public.roas_master_sheet_mappings
  FOR SELECT TO authenticated
  USING (is_active(auth.uid()));

DROP POLICY IF EXISTS rmsm_insert ON public.roas_master_sheet_mappings;
CREATE POLICY rmsm_insert ON public.roas_master_sheet_mappings
  FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS rmsm_update_own ON public.roas_master_sheet_mappings;
CREATE POLICY rmsm_update_own ON public.roas_master_sheet_mappings
  FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND created_by = auth.uid())
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());

DROP TRIGGER IF EXISTS trg_rmsm_touch ON public.roas_master_sheet_mappings;
CREATE TRIGGER trg_rmsm_touch BEFORE UPDATE ON public.roas_master_sheet_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- roas_calculation_drafts
-- =========================================================
CREATE TABLE IF NOT EXISTS public.roas_calculation_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  calculation_method text NOT NULL,
  draft_name text,
  active_step text,
  webinar_details jsonb,
  master_sheet_url text,
  master_sheet_title text,
  spreadsheet_id text,
  detected_tabs jsonb,
  tab_roles jsonb,
  column_mappings jsonb,
  ad_spend_data jsonb,
  result_snapshot jsonb,
  result_status text DEFAULT 'fresh',
  saved_attribution_session_id uuid,
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rcd_user ON public.roas_calculation_drafts(user_id);

ALTER TABLE public.roas_calculation_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rcd_admin ON public.roas_calculation_drafts;
CREATE POLICY rcd_admin ON public.roas_calculation_drafts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS rcd_owner_select ON public.roas_calculation_drafts;
CREATE POLICY rcd_owner_select ON public.roas_calculation_drafts
  FOR SELECT TO authenticated
  USING (is_active(auth.uid()) AND user_id = auth.uid());

DROP POLICY IF EXISTS rcd_owner_insert ON public.roas_calculation_drafts;
CREATE POLICY rcd_owner_insert ON public.roas_calculation_drafts
  FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND user_id = auth.uid());

DROP POLICY IF EXISTS rcd_owner_update ON public.roas_calculation_drafts;
CREATE POLICY rcd_owner_update ON public.roas_calculation_drafts
  FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND user_id = auth.uid())
  WITH CHECK (is_active(auth.uid()) AND user_id = auth.uid());

DROP POLICY IF EXISTS rcd_owner_delete ON public.roas_calculation_drafts;
CREATE POLICY rcd_owner_delete ON public.roas_calculation_drafts
  FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_rcd_touch ON public.roas_calculation_drafts;
CREATE TRIGGER trg_rcd_touch BEFORE UPDATE ON public.roas_calculation_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- attribution_sessions: extra optional context columns
-- =========================================================
ALTER TABLE public.attribution_sessions
  ADD COLUMN IF NOT EXISTS master_sheet_url text,
  ADD COLUMN IF NOT EXISTS master_sheet_title text,
  ADD COLUMN IF NOT EXISTS webinar_type text,
  ADD COLUMN IF NOT EXISTS webinar_date_mode text,
  ADD COLUMN IF NOT EXISTS webinar_single_date date,
  ADD COLUMN IF NOT EXISTS webinar_start_date date,
  ADD COLUMN IF NOT EXISTS webinar_end_date date,
  ADD COLUMN IF NOT EXISTS webinar_dates jsonb,
  ADD COLUMN IF NOT EXISTS webinar_timing jsonb,
  ADD COLUMN IF NOT EXISTS webinar_format text,
  ADD COLUMN IF NOT EXISTS webinar_operator text,
  ADD COLUMN IF NOT EXISTS session_slot text,
  ADD COLUMN IF NOT EXISTS webinar_platform text,
  ADD COLUMN IF NOT EXISTS zoom_account_used text,
  ADD COLUMN IF NOT EXISTS webinar_notes text,
  ADD COLUMN IF NOT EXISTS tab_role_mapping jsonb,
  ADD COLUMN IF NOT EXISTS column_mapping jsonb,
  ADD COLUMN IF NOT EXISTS result_status text DEFAULT 'fresh';

-- =========================================================
-- per-row source identifier columns
-- =========================================================
ALTER TABLE public.attribution_media_buyers
  ADD COLUMN IF NOT EXISTS source_sheet_id text;

ALTER TABLE public.attribution_sales_detail
  ADD COLUMN IF NOT EXISTS source_sales_sheet_id text;
