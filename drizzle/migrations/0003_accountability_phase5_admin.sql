-- KPI definition versioning: editing a target or weight creates a new version
ALTER TABLE public.kpi_definitions
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_definition_id uuid REFERENCES public.kpi_definitions(id),
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.kpi_definitions(id),
  ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS kpi_definitions_parent_idx ON public.kpi_definitions (parent_definition_id);

-- Access: Phase 5 admin screens, granted to admins the same way the board was granted
INSERT INTO public.user_module_access (user_id, module_key)
SELECT ur.user_id, m.key
FROM public.user_roles ur
CROSS JOIN (VALUES
  ('kra_kpi_settings'),
  ('kpi_review_queue'),
  ('points_rules'),
  ('appraisal_bands'),
  ('recognition')
) AS m(key)
WHERE ur.role = 'admin'
ON CONFLICT DO NOTHING;