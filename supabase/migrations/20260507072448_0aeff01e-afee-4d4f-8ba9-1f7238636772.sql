
CREATE TABLE public.attribution_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_name text NOT NULL,
  webinar_date date,
  webinar_type text,
  total_leads integer NOT NULL DEFAULT 0,
  total_sales integer NOT NULL DEFAULT 0,
  total_ad_spend numeric NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  overall_roas numeric NOT NULL DEFAULT 0,
  unmatched_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.attribution_media_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.attribution_sessions(id) ON DELETE CASCADE,
  media_buyer_name text NOT NULL,
  ad_spend numeric NOT NULL DEFAULT 0,
  total_leads integer NOT NULL DEFAULT 0,
  matched_sales integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  roas_value numeric NOT NULL DEFAULT 0,
  cpl numeric NOT NULL DEFAULT 0,
  conversion_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.attribution_sales_detail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.attribution_sessions(id) ON DELETE CASCADE,
  buyer_name text,
  email text,
  phone text,
  attributed_to text,
  match_method text,
  revenue numeric NOT NULL DEFAULT 0,
  webinar_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attr_mb_session ON public.attribution_media_buyers(session_id);
CREATE INDEX idx_attr_sales_session ON public.attribution_sales_detail(session_id);
CREATE INDEX idx_attr_sessions_date ON public.attribution_sessions(webinar_date DESC);

ALTER TABLE public.attribution_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution_media_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution_sales_detail ENABLE ROW LEVEL SECURITY;

-- attribution_sessions
CREATE POLICY "as_admin" ON public.attribution_sessions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "as_read" ON public.attribution_sessions FOR SELECT TO authenticated
  USING (is_active(auth.uid()));
CREATE POLICY "as_insert" ON public.attribution_sessions FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());

-- attribution_media_buyers
CREATE POLICY "amb_admin" ON public.attribution_media_buyers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "amb_read" ON public.attribution_media_buyers FOR SELECT TO authenticated
  USING (is_active(auth.uid()));
CREATE POLICY "amb_insert" ON public.attribution_media_buyers FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.attribution_sessions s
    WHERE s.id = session_id AND s.created_by = auth.uid()
  ));

-- attribution_sales_detail
CREATE POLICY "asd_admin" ON public.attribution_sales_detail FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "asd_read" ON public.attribution_sales_detail FOR SELECT TO authenticated
  USING (is_active(auth.uid()));
CREATE POLICY "asd_insert" ON public.attribution_sales_detail FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.attribution_sessions s
    WHERE s.id = session_id AND s.created_by = auth.uid()
  ));
