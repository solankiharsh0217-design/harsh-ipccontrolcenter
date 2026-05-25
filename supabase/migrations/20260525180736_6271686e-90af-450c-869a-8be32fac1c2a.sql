
CREATE TABLE IF NOT EXISTS public.code_of_conduct_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source text NOT NULL CHECK (source IN ('crm','paid_pipeline')),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.code_of_conduct_templates(id) ON DELETE RESTRICT,
  mode text NOT NULL DEFAULT 'suggest_only' CHECK (mode IN ('suggest_only','auto_send')),
  link_expiry_days integer NOT NULL DEFAULT 7,
  tag_id_after_signed uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  stage_id_after_signed uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  notify_admin boolean NOT NULL DEFAULT true,
  notify_owner boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coc_rules_active_stage
  ON public.code_of_conduct_rules (source, pipeline_id, stage_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_coc_rules_stage ON public.code_of_conduct_rules (stage_id, is_active);

ALTER TABLE public.code_of_conduct_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coc_rules_select" ON public.code_of_conduct_rules
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));

CREATE POLICY "coc_rules_admin_all" ON public.code_of_conduct_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_coc_rules_updated
  BEFORE UPDATE ON public.code_of_conduct_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
