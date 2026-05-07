
CREATE TABLE IF NOT EXISTS public.roas_master_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  master_sheet_url text NOT NULL,
  spreadsheet_id text,
  fetch_method text NOT NULL DEFAULT 'gid_mapping',
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.roas_master_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY rms_read ON public.roas_master_sheets FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY rms_insert ON public.roas_master_sheets FOR INSERT TO authenticated WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY rms_update_own ON public.roas_master_sheets FOR UPDATE TO authenticated USING (is_active(auth.uid()) AND created_by = auth.uid()) WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY rms_admin ON public.roas_master_sheets FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER rms_touch BEFORE UPDATE ON public.roas_master_sheets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.roas_master_sheet_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_sheet_id uuid NOT NULL REFERENCES public.roas_master_sheets(id) ON DELETE CASCADE,
  tab_role text NOT NULL CHECK (tab_role IN ('media_buyer_leads','sales','ad_spends')),
  media_buyer_name text,
  tab_name text,
  tab_gid text,
  tab_url text,
  csv_url text,
  column_mapping jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rmst_master ON public.roas_master_sheet_tabs(master_sheet_id);
ALTER TABLE public.roas_master_sheet_tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY rmst_read ON public.roas_master_sheet_tabs FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY rmst_insert ON public.roas_master_sheet_tabs FOR INSERT TO authenticated WITH CHECK (is_active(auth.uid()) AND EXISTS (SELECT 1 FROM public.roas_master_sheets m WHERE m.id = master_sheet_id AND (m.created_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role))));
CREATE POLICY rmst_update ON public.roas_master_sheet_tabs FOR UPDATE TO authenticated USING (is_active(auth.uid()) AND EXISTS (SELECT 1 FROM public.roas_master_sheets m WHERE m.id = master_sheet_id AND (m.created_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role)))) WITH CHECK (is_active(auth.uid()));
CREATE POLICY rmst_admin ON public.roas_master_sheet_tabs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER rmst_touch BEFORE UPDATE ON public.roas_master_sheet_tabs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.roas_fetch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_session_id uuid,
  master_sheet_id uuid REFERENCES public.roas_master_sheets(id) ON DELETE SET NULL,
  fetch_status text NOT NULL CHECK (fetch_status IN ('success','partial_success','failed')),
  fetched_tabs_count integer NOT NULL DEFAULT 0,
  failed_tabs_count integer NOT NULL DEFAULT 0,
  error_summary text,
  fetched_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.roas_fetch_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY rfl_read ON public.roas_fetch_logs FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY rfl_insert ON public.roas_fetch_logs FOR INSERT TO authenticated WITH CHECK (is_active(auth.uid()) AND fetched_by = auth.uid());
CREATE POLICY rfl_admin ON public.roas_fetch_logs FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

ALTER TABLE public.attribution_sessions ADD COLUMN IF NOT EXISTS calculation_method text NOT NULL DEFAULT 'manual';
ALTER TABLE public.attribution_sessions ADD COLUMN IF NOT EXISTS master_sheet_id uuid REFERENCES public.roas_master_sheets(id) ON DELETE SET NULL;
ALTER TABLE public.attribution_sessions ADD COLUMN IF NOT EXISTS fetch_log_id uuid REFERENCES public.roas_fetch_logs(id) ON DELETE SET NULL;

ALTER TABLE public.attribution_media_buyers ADD COLUMN IF NOT EXISTS source_tab_name text;
ALTER TABLE public.attribution_media_buyers ADD COLUMN IF NOT EXISTS source_tab_gid text;
ALTER TABLE public.attribution_media_buyers ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual_upload';

ALTER TABLE public.attribution_sales_detail ADD COLUMN IF NOT EXISTS source_sales_tab_name text;
ALTER TABLE public.attribution_sales_detail ADD COLUMN IF NOT EXISTS source_sales_tab_gid text;
ALTER TABLE public.attribution_sales_detail ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual_upload';
