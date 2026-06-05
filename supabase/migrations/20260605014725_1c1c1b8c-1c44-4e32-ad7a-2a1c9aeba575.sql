
-- Service Packages master + propagation columns

CREATE TABLE IF NOT EXISTS public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  description text,
  default_process_template_id uuid REFERENCES public.operations_process_templates(id) ON DELETE SET NULL,
  default_service_duration_days integer,
  included_services jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.service_packages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_packages TO authenticated;
GRANT ALL ON public.service_packages TO service_role;

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_packages_read_active" ON public.service_packages
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

CREATE POLICY "service_packages_admin_write" ON public.service_packages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_service_packages_updated
  BEFORE UPDATE ON public.service_packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add propagation columns (snapshot lives even if master changes)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS service_package_id uuid REFERENCES public.service_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_package_snapshot jsonb;

ALTER TABLE public.paid_pipeline_leads
  ADD COLUMN IF NOT EXISTS service_package_id uuid REFERENCES public.service_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_package_snapshot jsonb;

ALTER TABLE public.operations_leads
  ADD COLUMN IF NOT EXISTS service_package_id uuid REFERENCES public.service_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_package_snapshot jsonb;

ALTER TABLE public.paid_pipeline_batches
  ADD COLUMN IF NOT EXISTS service_package_id uuid REFERENCES public.service_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_package_snapshot jsonb;
