
-- =========================================
-- ROAS DASHBOARD TABLES (namespaced roas_*)
-- =========================================

-- MEDIA BUYERS
CREATE TABLE public.roas_media_buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.roas_media_buyers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_roas_mb_updated BEFORE UPDATE ON public.roas_media_buyers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- WEBINARS (separate from existing public.webinars)
CREATE TABLE public.roas_webinars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_name TEXT NOT NULL,
  webinar_start_date DATE,
  webinar_end_date DATE,
  landing_page_url TEXT,
  offer_name TEXT,
  program_price NUMERIC NOT NULL DEFAULT 100000,
  gst_rate NUMERIC NOT NULL DEFAULT 18,
  status TEXT NOT NULL DEFAULT 'Upcoming',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.roas_webinars ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_roas_web_updated BEFORE UPDATE ON public.roas_webinars
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- DATA SOURCES
CREATE TABLE public.roas_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('lead_sheet','enrollment_sheet')),
  media_buyer_id UUID REFERENCES public.roas_media_buyers(id) ON DELETE SET NULL,
  published_sheet_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  column_mapping_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  last_rows_fetched INTEGER DEFAULT 0,
  last_rows_imported INTEGER DEFAULT 0,
  last_duplicates_skipped INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.roas_data_sources ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_roas_ds_updated BEFORE UPDATE ON public.roas_data_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- LEADS
CREATE TABLE public.roas_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_buyer_id UUID REFERENCES public.roas_media_buyers(id) ON DELETE SET NULL,
  data_source_id UUID REFERENCES public.roas_data_sources(id) ON DELETE CASCADE,
  lead_name TEXT,
  raw_phone TEXT,
  clean_phone TEXT,
  raw_email TEXT,
  clean_email TEXT,
  created_at_from_sheet TIMESTAMPTZ,
  webinar_date DATE,
  landing_page TEXT,
  campaign_name TEXT,
  adset_name TEXT,
  ad_name TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  city TEXT,
  state TEXT,
  lead_status TEXT,
  notes TEXT,
  source_row_hash TEXT NOT NULL,
  duplicate_status TEXT DEFAULT 'unique',
  data_flags JSONB DEFAULT '[]'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (data_source_id, source_row_hash)
);
ALTER TABLE public.roas_leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_roas_leads_clean_phone ON public.roas_leads(clean_phone);
CREATE INDEX idx_roas_leads_clean_email ON public.roas_leads(clean_email);
CREATE INDEX idx_roas_leads_media_buyer ON public.roas_leads(media_buyer_id);
CREATE INDEX idx_roas_leads_created ON public.roas_leads(created_at_from_sheet);
CREATE TRIGGER trg_roas_leads_updated BEFORE UPDATE ON public.roas_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ENROLLMENTS
CREATE TABLE public.roas_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id UUID REFERENCES public.roas_data_sources(id) ON DELETE CASCADE,
  buyer_name TEXT,
  raw_phone TEXT,
  clean_phone TEXT,
  raw_email TEXT,
  clean_email TEXT,
  amount_paid NUMERIC DEFAULT 0,
  program_price NUMERIC,
  gst_amount NUMERIC,
  total_invoice_value NUMERIC,
  net_revenue NUMERIC,
  payment_date TIMESTAMPTZ,
  payment_gateway TEXT,
  transaction_id TEXT,
  webinar_date DATE,
  payment_status TEXT,
  salesperson TEXT,
  remarks TEXT,
  attributed_media_buyer_id UUID REFERENCES public.roas_media_buyers(id) ON DELETE SET NULL,
  attributed_webinar_id UUID REFERENCES public.roas_webinars(id) ON DELETE SET NULL,
  cycle_window_start TIMESTAMPTZ,
  cycle_window_end TIMESTAMPTZ,
  cycle_attribution_flag TEXT,
  attribution_status TEXT DEFAULT 'Unattributed',
  attribution_confidence TEXT,
  attribution_method TEXT,
  matched_lead_id UUID REFERENCES public.roas_leads(id) ON DELETE SET NULL,
  manual_override BOOLEAN DEFAULT FALSE,
  manual_override_by UUID,
  manual_override_at TIMESTAMPTZ,
  manual_override_reason TEXT,
  source_row_hash TEXT NOT NULL,
  data_flags JSONB DEFAULT '[]'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (data_source_id, source_row_hash)
);
ALTER TABLE public.roas_enrollments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_roas_enr_phone ON public.roas_enrollments(clean_phone);
CREATE INDEX idx_roas_enr_email ON public.roas_enrollments(clean_email);
CREATE INDEX idx_roas_enr_buyer ON public.roas_enrollments(attributed_media_buyer_id);
CREATE INDEX idx_roas_enr_status ON public.roas_enrollments(attribution_status);
CREATE INDEX idx_roas_enr_webinar ON public.roas_enrollments(attributed_webinar_id);
CREATE TRIGGER trg_roas_enr_updated BEFORE UPDATE ON public.roas_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- AD SPENDS
CREATE TABLE public.roas_ad_spends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_buyer_id UUID NOT NULL REFERENCES public.roas_media_buyers(id) ON DELETE CASCADE,
  webinar_id UUID REFERENCES public.roas_webinars(id) ON DELETE SET NULL,
  webinar_date DATE,
  spend_date DATE NOT NULL,
  spend_amount NUMERIC NOT NULL DEFAULT 0,
  entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.roas_ad_spends ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_roas_spend_buyer ON public.roas_ad_spends(media_buyer_id);
CREATE INDEX idx_roas_spend_date ON public.roas_ad_spends(spend_date);
CREATE TRIGGER trg_roas_spend_updated BEFORE UPDATE ON public.roas_ad_spends
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SYNC LOGS
CREATE TABLE public.roas_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id UUID REFERENCES public.roas_data_sources(id) ON DELETE CASCADE,
  sync_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_completed_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'running',
  rows_fetched INTEGER DEFAULT 0,
  rows_imported INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  duplicate_rows_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  triggered_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.roas_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_roas_sync_source ON public.roas_sync_logs(data_source_id);
CREATE INDEX idx_roas_sync_started ON public.roas_sync_logs(sync_started_at DESC);

-- ATTRIBUTION LOGS
CREATE TABLE public.roas_attribution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES public.roas_enrollments(id) ON DELETE CASCADE,
  old_media_buyer_id UUID,
  new_media_buyer_id UUID,
  old_status TEXT,
  new_status TEXT,
  change_reason TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.roas_attribution_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_roas_attr_enr ON public.roas_attribution_logs(enrollment_id);

-- =========================================
-- RLS POLICIES (reuse Hub's is_active + has_role)
-- =========================================
-- read: any active member; write/delete: admin; ad_spends + enrollment overrides allowed by active members

CREATE POLICY "roas_mb_read" ON public.roas_media_buyers FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "roas_mb_admin" ON public.roas_media_buyers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "roas_web_read" ON public.roas_webinars FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "roas_web_admin" ON public.roas_webinars FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "roas_ds_read" ON public.roas_data_sources FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "roas_ds_admin" ON public.roas_data_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "roas_leads_read" ON public.roas_leads FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "roas_leads_admin" ON public.roas_leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "roas_enr_read" ON public.roas_enrollments FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "roas_enr_member_update" ON public.roas_enrollments FOR UPDATE TO authenticated
  USING (public.is_active(auth.uid())) WITH CHECK (public.is_active(auth.uid()));
CREATE POLICY "roas_enr_admin" ON public.roas_enrollments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "roas_spend_read" ON public.roas_ad_spends FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "roas_spend_insert" ON public.roas_ad_spends FOR INSERT TO authenticated
  WITH CHECK (public.is_active(auth.uid()));
CREATE POLICY "roas_spend_update_own" ON public.roas_ad_spends FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR (public.is_active(auth.uid()) AND entered_by = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR (public.is_active(auth.uid()) AND entered_by = auth.uid()));
CREATE POLICY "roas_spend_delete_admin" ON public.roas_ad_spends FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "roas_synclog_read" ON public.roas_sync_logs FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "roas_attrlog_read" ON public.roas_attribution_logs FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "roas_attrlog_member_insert" ON public.roas_attribution_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_active(auth.uid()));

-- =========================================
-- SEED
-- =========================================
INSERT INTO public.roas_media_buyers (name) VALUES ('Hemant'), ('Akhil');
INSERT INTO public.roas_webinars (webinar_name, status, program_price, gst_rate, offer_name)
VALUES ('Default Webinar', 'Upcoming', 100000, 18, 'Flagship Program');
