DROP POLICY IF EXISTS company_settings_read_privileged ON public.company_settings;
CREATE POLICY company_settings_admin_select ON public.company_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));