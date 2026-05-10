
CREATE TABLE public.seminar_roas_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid,
  report_name text,
  webinar_name text NOT NULL,
  webinar_mode text,
  total_webinar_days integer NOT NULL DEFAULT 1,
  watch_point_percent numeric NOT NULL DEFAULT 70,
  webinar_start_time text,
  webinar_end_time text,
  webinar_duration_minutes integer,
  watch_point_time text,
  sales_day integer,
  timing_note text,
  ad_cost_excluding_gst numeric NOT NULL DEFAULT 0,
  ad_gst numeric NOT NULL DEFAULT 0,
  total_ad_spend_including_gst numeric NOT NULL DEFAULT 0,
  total_revenue_including_gst numeric NOT NULL DEFAULT 0,
  net_gst_payable_to_govt numeric NOT NULL DEFAULT 0,
  profit_after_gst numeric NOT NULL DEFAULT 0,
  cpl numeric,
  cpa numeric,
  roas numeric,
  total_conversions integer NOT NULL DEFAULT 0,
  input_snapshot_json jsonb,
  output_snapshot_json jsonb,
  whatsapp_summary_text text
);

CREATE TABLE public.seminar_roas_report_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.seminar_roas_reports(id) ON DELETE CASCADE,
  day_number integer NOT NULL,
  date date,
  registrations integer NOT NULL DEFAULT 0,
  show_up integer NOT NULL DEFAULT 0,
  watch_or_offer_present integer NOT NULL DEFAULT 0,
  show_up_rate numeric,
  drop_rate numeric,
  is_sales_day boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_srrd_report ON public.seminar_roas_report_days(report_id);

CREATE TABLE public.seminar_roas_report_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.seminar_roas_reports(id) ON DELETE CASCADE,
  payment_type text NOT NULL,
  units_sold integer NOT NULL DEFAULT 0,
  deal_price_including_gst numeric NOT NULL DEFAULT 0,
  token_down_payment numeric,
  revenue_counted numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_srrp_report ON public.seminar_roas_report_products(report_id);

ALTER TABLE public.seminar_roas_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seminar_roas_report_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seminar_roas_report_products ENABLE ROW LEVEL SECURITY;

-- Reports
CREATE POLICY srr_admin ON public.seminar_roas_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY srr_read ON public.seminar_roas_reports FOR SELECT TO authenticated
  USING (is_active(auth.uid()));
CREATE POLICY srr_insert ON public.seminar_roas_reports FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY srr_update_own ON public.seminar_roas_reports FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role)))
  WITH CHECK (is_active(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role)));
CREATE POLICY srr_delete_own ON public.seminar_roas_reports FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND created_by = auth.uid());

-- Days
CREATE POLICY srrd_admin ON public.seminar_roas_report_days FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY srrd_read ON public.seminar_roas_report_days FOR SELECT TO authenticated
  USING (is_active(auth.uid()));
CREATE POLICY srrd_insert ON public.seminar_roas_report_days FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.seminar_roas_reports r WHERE r.id = report_id AND r.created_by = auth.uid()));
CREATE POLICY srrd_update ON public.seminar_roas_report_days FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.seminar_roas_reports r WHERE r.id = report_id AND r.created_by = auth.uid()))
  WITH CHECK (is_active(auth.uid()));
CREATE POLICY srrd_delete ON public.seminar_roas_report_days FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.seminar_roas_reports r WHERE r.id = report_id AND r.created_by = auth.uid()));

-- Products
CREATE POLICY srrp_admin ON public.seminar_roas_report_products FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY srrp_read ON public.seminar_roas_report_products FOR SELECT TO authenticated
  USING (is_active(auth.uid()));
CREATE POLICY srrp_insert ON public.seminar_roas_report_products FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.seminar_roas_reports r WHERE r.id = report_id AND r.created_by = auth.uid()));
CREATE POLICY srrp_update ON public.seminar_roas_report_products FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.seminar_roas_reports r WHERE r.id = report_id AND r.created_by = auth.uid()))
  WITH CHECK (is_active(auth.uid()));
CREATE POLICY srrp_delete ON public.seminar_roas_report_products FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.seminar_roas_reports r WHERE r.id = report_id AND r.created_by = auth.uid()));

CREATE TRIGGER trg_srr_updated_at BEFORE UPDATE ON public.seminar_roas_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
