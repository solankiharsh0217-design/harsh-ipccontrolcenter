-- Tighten company_settings SELECT: sensitive financial fields should not be readable by all active staff.
-- Restrict full-row SELECT to admins and users who legitimately need invoice data (paid_pipeline module).

DROP POLICY IF EXISTS company_settings_read_active ON public.company_settings;

CREATE POLICY company_settings_read_privileged ON public.company_settings
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access uma
      WHERE uma.user_id = auth.uid()
        AND uma.module_key IN ('paid_pipeline', 'paid-pipeline')
    )
  );