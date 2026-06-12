DROP POLICY IF EXISTS pps_update_own ON public.paid_pipeline_settings;
CREATE POLICY pps_update_admin ON public.paid_pipeline_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));