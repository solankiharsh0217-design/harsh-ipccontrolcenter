
-- Access Templates: admin-only reusable module access presets
CREATE TABLE IF NOT EXISTS public.access_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  module_keys text[] NOT NULL DEFAULT '{}',
  grants_admin boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_templates TO authenticated;
GRANT ALL ON public.access_templates TO service_role;

ALTER TABLE public.access_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage access templates"
  ON public.access_templates
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Active users can read active templates"
  ON public.access_templates
  FOR SELECT
  TO authenticated
  USING (public.is_active(auth.uid()) AND is_active = true);

CREATE OR REPLACE FUNCTION public.access_templates_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_access_templates_updated_at ON public.access_templates;
CREATE TRIGGER trg_access_templates_updated_at
  BEFORE UPDATE ON public.access_templates
  FOR EACH ROW EXECUTE FUNCTION public.access_templates_set_updated_at();

-- Seed default templates (idempotent by name)
INSERT INTO public.access_templates (name, description, module_keys, grants_admin)
SELECT * FROM (VALUES
  ('Media Buyer / Operations',
   'Task manager, follow-ups, operations CRM, rewards, and resource library.',
   ARRAY['dashboard','tasks','follow_up_command_center','operations_crm','media_buyer_operations','resource_library'],
   false),
  ('Sales Executive',
   'Calling CRM, lead qualifier, follow-up board, task manager, resource library.',
   ARRAY['dashboard','calling_crm','crm','lead-qualifier','follow_up_command_center','tasks','resource_library'],
   false),
  ('Backend Operations',
   'Access readiness, operations CRM, follow-up board, task manager, resource library.',
   ARRAY['dashboard','paid_pipeline','operations_crm','follow_up_command_center','tasks','resource_library'],
   false),
  ('Finance',
   'Revenue center, invoices, analytics, finance dashboards, resource library.',
   ARRAY['dashboard','reports','profit-statement','payment_recovery','resource_library'],
   false),
  ('Admin (Full Access)',
   'Grants admin role plus all modules.',
   ARRAY['dashboard','founder_dashboard','announcements','roas','search','daily-reporting','reports','lead-qualifier','calling_crm','crm','paid_pipeline','follow_up_command_center','payment_recovery','media_buyer_operations','operations_crm','offline_seminar_roas','webinar_performance','tasks','profit-statement','team','admin','master-data','master_settings','audit_log','notifications','resource_library'],
   true)
) AS t(name, description, module_keys, grants_admin)
WHERE NOT EXISTS (SELECT 1 FROM public.access_templates WHERE access_templates.name = t.name);
