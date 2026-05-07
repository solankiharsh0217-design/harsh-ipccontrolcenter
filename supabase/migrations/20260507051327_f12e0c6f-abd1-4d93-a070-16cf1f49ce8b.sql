
-- ROAS Calculator v2 tables
CREATE TABLE IF NOT EXISTS public.roas_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name text NOT NULL,
  webinar_date date,
  total_ad_spend numeric NOT NULL DEFAULT 0,
  total_revenue numeric DEFAULT 0,
  total_sales integer DEFAULT 0,
  roas_value numeric DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.roas_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roas_history_read" ON public.roas_history FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY "roas_history_insert" ON public.roas_history FOR INSERT TO authenticated WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "roas_history_admin" ON public.roas_history FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.media_buyer_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  webinar_name text,
  webinar_date date,
  webinar_type text,
  media_buyer_name text NOT NULL,
  ad_spend numeric DEFAULT 0,
  total_leads integer DEFAULT 0,
  matched_sales integer DEFAULT 0,
  revenue numeric DEFAULT 0,
  roas_value numeric DEFAULT 0,
  cpl numeric DEFAULT 0,
  conversion_rate numeric DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_buyer_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mba_read" ON public.media_buyer_attribution FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY "mba_insert" ON public.media_buyer_attribution FOR INSERT TO authenticated WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "mba_admin" ON public.media_buyer_attribution FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_type text,
  sheet_url text,
  description text,
  status text DEFAULT 'manual',
  last_fetched timestamptz,
  row_count integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ds_read" ON public.data_sources FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY "ds_member_write" ON public.data_sources FOR INSERT TO authenticated WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "ds_member_update" ON public.data_sources FOR UPDATE TO authenticated USING (is_active(auth.uid()) AND created_by = auth.uid()) WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "ds_admin" ON public.data_sources FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_data_sources_updated BEFORE UPDATE ON public.data_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
