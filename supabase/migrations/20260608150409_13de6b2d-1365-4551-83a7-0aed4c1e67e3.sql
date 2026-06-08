
-- Restrict attribution_sales_detail SELECT to admins only (PII protection)
DROP POLICY IF EXISTS asd_read ON public.attribution_sales_detail;

-- Restrict paid_pipeline_settings INSERT to admins only
DROP POLICY IF EXISTS pps_insert ON public.paid_pipeline_settings;
CREATE POLICY pps_insert ON public.paid_pipeline_settings
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
