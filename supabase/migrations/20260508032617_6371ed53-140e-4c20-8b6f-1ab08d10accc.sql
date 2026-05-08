
-- ============ daily_lead_reports ============
CREATE TABLE public.daily_lead_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_name text,
  report_date date NOT NULL,
  notes text,
  metric_template_id uuid,
  total_ad_spend numeric NOT NULL DEFAULT 0,
  total_leads integer NOT NULL DEFAULT 0,
  overall_cpl numeric NOT NULL DEFAULT 0,
  whatsapp_message text,
  input_hash text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_dlr_date ON public.daily_lead_reports(report_date);
CREATE INDEX idx_dlr_created_by ON public.daily_lead_reports(created_by);
CREATE INDEX idx_dlr_hash ON public.daily_lead_reports(input_hash);
ALTER TABLE public.daily_lead_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dlr_admin" ON public.daily_lead_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "dlr_read" ON public.daily_lead_reports FOR SELECT TO authenticated
  USING (is_active(auth.uid()) AND is_deleted = false);
CREATE POLICY "dlr_insert" ON public.daily_lead_reports FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "dlr_update_own" ON public.daily_lead_reports FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND created_by = auth.uid())
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "dlr_delete_own" ON public.daily_lead_reports FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND created_by = auth.uid());

-- ============ daily_lead_report_media_buyers ============
CREATE TABLE public.daily_lead_report_media_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_lead_reports(id) ON DELETE CASCADE,
  media_buyer_name text NOT NULL,
  media_buyer_key text,
  lead_source_url text,
  spreadsheet_id text,
  spreadsheet_title text,
  tab_name text,
  sheet_id text,
  date_column text,
  total_leads integer NOT NULL DEFAULT 0,
  lead_count_source text NOT NULL DEFAULT 'google_sheet',
  total_ad_spend numeric NOT NULL DEFAULT 0,
  cpl numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ready',
  fetch_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dlrmb_report ON public.daily_lead_report_media_buyers(report_id);
ALTER TABLE public.daily_lead_report_media_buyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dlrmb_admin" ON public.daily_lead_report_media_buyers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "dlrmb_read" ON public.daily_lead_report_media_buyers FOR SELECT TO authenticated
  USING (is_active(auth.uid()));
CREATE POLICY "dlrmb_insert" ON public.daily_lead_report_media_buyers FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.daily_lead_reports r WHERE r.id = report_id AND r.created_by = auth.uid()
  ));
CREATE POLICY "dlrmb_update" ON public.daily_lead_report_media_buyers FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.daily_lead_reports r WHERE r.id = report_id AND r.created_by = auth.uid()
  )) WITH CHECK (is_active(auth.uid()));
CREATE POLICY "dlrmb_delete" ON public.daily_lead_report_media_buyers FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.daily_lead_reports r WHERE r.id = report_id AND r.created_by = auth.uid()
  ));

-- ============ daily_lead_report_ad_accounts ============
CREATE TABLE public.daily_lead_report_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_media_buyer_id uuid NOT NULL REFERENCES public.daily_lead_report_media_buyers(id) ON DELETE CASCADE,
  ad_account_name text NOT NULL,
  ad_spend numeric NOT NULL DEFAULT 0,
  metrics jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dlraa_mb ON public.daily_lead_report_ad_accounts(report_media_buyer_id);
ALTER TABLE public.daily_lead_report_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dlraa_admin" ON public.daily_lead_report_ad_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "dlraa_read" ON public.daily_lead_report_ad_accounts FOR SELECT TO authenticated
  USING (is_active(auth.uid()));
CREATE POLICY "dlraa_insert" ON public.daily_lead_report_ad_accounts FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.daily_lead_report_media_buyers mb
    JOIN public.daily_lead_reports r ON r.id = mb.report_id
    WHERE mb.id = report_media_buyer_id AND r.created_by = auth.uid()
  ));
CREATE POLICY "dlraa_update" ON public.daily_lead_report_ad_accounts FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.daily_lead_report_media_buyers mb
    JOIN public.daily_lead_reports r ON r.id = mb.report_id
    WHERE mb.id = report_media_buyer_id AND r.created_by = auth.uid()
  )) WITH CHECK (is_active(auth.uid()));
CREATE POLICY "dlraa_delete" ON public.daily_lead_report_ad_accounts FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.daily_lead_report_media_buyers mb
    JOIN public.daily_lead_reports r ON r.id = mb.report_id
    WHERE mb.id = report_media_buyer_id AND r.created_by = auth.uid()
  ));

-- ============ daily_lead_source_mappings ============
CREATE TABLE public.daily_lead_source_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_buyer_name text NOT NULL,
  lead_source_name text,
  sheet_url text NOT NULL,
  spreadsheet_id text,
  spreadsheet_title text,
  tab_name text,
  sheet_id text,
  date_column text,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_dlsm_mb_name ON public.daily_lead_source_mappings(media_buyer_name);
ALTER TABLE public.daily_lead_source_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dlsm_admin" ON public.daily_lead_source_mappings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "dlsm_read" ON public.daily_lead_source_mappings FOR SELECT TO authenticated
  USING (is_active(auth.uid()) AND is_active = true);
CREATE POLICY "dlsm_insert" ON public.daily_lead_source_mappings FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "dlsm_update_own" ON public.daily_lead_source_mappings FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND created_by = auth.uid())
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "dlsm_delete_own" ON public.daily_lead_source_mappings FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND created_by = auth.uid());

-- ============ daily_metric_templates ============
CREATE TABLE public.daily_metric_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  description text,
  metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.daily_metric_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dmt_admin" ON public.daily_metric_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "dmt_read" ON public.daily_metric_templates FOR SELECT TO authenticated
  USING (is_active(auth.uid()) AND is_active = true);
CREATE POLICY "dmt_insert" ON public.daily_metric_templates FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND (created_by = auth.uid() OR created_by IS NULL));
CREATE POLICY "dmt_update_own" ON public.daily_metric_templates FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND created_by = auth.uid())
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "dmt_delete_own" ON public.daily_metric_templates FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND created_by = auth.uid());

-- ============ daily_custom_metrics ============
CREATE TABLE public.daily_custom_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  metric_key text NOT NULL,
  metric_type text NOT NULL,
  aggregation_method text NOT NULL DEFAULT 'display_only',
  show_in_whatsapp boolean NOT NULL DEFAULT true,
  show_in_exports boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX idx_dcm_key ON public.daily_custom_metrics(metric_key) WHERE is_active = true;
ALTER TABLE public.daily_custom_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dcm_admin" ON public.daily_custom_metrics FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "dcm_read" ON public.daily_custom_metrics FOR SELECT TO authenticated
  USING (is_active(auth.uid()) AND is_active = true);
CREATE POLICY "dcm_insert" ON public.daily_custom_metrics FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND (created_by = auth.uid() OR created_by IS NULL));
CREATE POLICY "dcm_update_own" ON public.daily_custom_metrics FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND created_by = auth.uid())
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER trg_dlr_updated BEFORE UPDATE ON public.daily_lead_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_dlrmb_updated BEFORE UPDATE ON public.daily_lead_report_media_buyers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_dlraa_updated BEFORE UPDATE ON public.daily_lead_report_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_dlsm_updated BEFORE UPDATE ON public.daily_lead_source_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_dmt_updated BEFORE UPDATE ON public.daily_metric_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_dcm_updated BEFORE UPDATE ON public.daily_custom_metrics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed default templates (no owner = visible to all)
INSERT INTO public.daily_metric_templates (template_name, description, metrics, is_default, created_by)
VALUES
('Basic Meta Daily Report', 'Standard Meta daily metrics (CPM, CTR, CPC, LP views)',
 '[{"key":"cpm","name":"CPM","type":"currency","aggregation":"average","whatsapp":true,"exports":true},
   {"key":"ctr","name":"CTR","type":"percentage","aggregation":"average","whatsapp":true,"exports":true},
   {"key":"cpc","name":"CPC","type":"currency","aggregation":"average","whatsapp":true,"exports":true},
   {"key":"link_clicks","name":"Link Clicks","type":"number","aggregation":"sum","whatsapp":false,"exports":true},
   {"key":"lp_views","name":"Landing Page Views","type":"number","aggregation":"sum","whatsapp":false,"exports":true},
   {"key":"lp_visit_rate","name":"Landing Page Visit Rate","type":"percentage","aggregation":"average","whatsapp":true,"exports":true}]'::jsonb,
 true, NULL),
('Advanced Meta Daily Report', 'Extended Meta metrics including reach, impressions, frequency',
 '[{"key":"cpm","name":"CPM","type":"currency","aggregation":"average","whatsapp":true,"exports":true},
   {"key":"ctr","name":"CTR","type":"percentage","aggregation":"average","whatsapp":true,"exports":true},
   {"key":"cpc","name":"CPC","type":"currency","aggregation":"average","whatsapp":true,"exports":true},
   {"key":"link_clicks","name":"Link Clicks","type":"number","aggregation":"sum","whatsapp":false,"exports":true},
   {"key":"lp_views","name":"Landing Page Views","type":"number","aggregation":"sum","whatsapp":false,"exports":true},
   {"key":"lp_visit_rate","name":"Landing Page Visit Rate","type":"percentage","aggregation":"average","whatsapp":true,"exports":true},
   {"key":"impressions","name":"Impressions","type":"number","aggregation":"sum","whatsapp":false,"exports":true},
   {"key":"reach","name":"Reach","type":"number","aggregation":"sum","whatsapp":false,"exports":true},
   {"key":"frequency","name":"Frequency","type":"number","aggregation":"average","whatsapp":false,"exports":true},
   {"key":"cost_per_lpv","name":"Cost Per LPV","type":"currency","aggregation":"average","whatsapp":true,"exports":true}]'::jsonb,
 false, NULL);
