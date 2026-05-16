
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_group text NOT NULL,
  setting_key text NOT NULL,
  setting_value jsonb,
  business_unit text,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_group_key_bu
  ON public.app_settings (setting_group, setting_key, COALESCE(business_unit, ''))
  WHERE is_deleted = false;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS as_read ON public.app_settings;
CREATE POLICY as_read ON public.app_settings FOR SELECT TO authenticated
  USING (is_active(auth.uid()));

DROP POLICY IF EXISTS as_admin ON public.app_settings;
CREATE POLICY as_admin ON public.app_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_app_settings_updated ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
