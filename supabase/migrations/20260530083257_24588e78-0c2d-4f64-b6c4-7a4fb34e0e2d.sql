
CREATE TABLE public.crm_conversion_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL DEFAULT 'Default rule',
  source_pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE,
  trigger_stage_names text[] NOT NULL DEFAULT ARRAY['Conversion Successful','Payment Confirmed','Closed Won']::text[],
  trigger_stage_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  destination_pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  destination_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  create_paid_buyer boolean NOT NULL DEFAULT true,
  hide_from_sales_workload boolean NOT NULL DEFAULT true,
  deassign_original boolean NOT NULL DEFAULT false,
  owner_policy text NOT NULL DEFAULT 'same' CHECK (owner_policy IN ('same','selected','unassigned')),
  default_owner_id uuid,
  tag_after_conversion text,
  followup_default text NOT NULL DEFAULT 'keep' CHECK (followup_default IN ('keep','copy','move','done')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.crm_conversion_rules TO authenticated;
GRANT ALL ON public.crm_conversion_rules TO service_role;

ALTER TABLE public.crm_conversion_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can read conversion rules" ON public.crm_conversion_rules
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));

CREATE POLICY "Admins can insert conversion rules" ON public.crm_conversion_rules
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update conversion rules" ON public.crm_conversion_rules
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete conversion rules" ON public.crm_conversion_rules
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER crm_conversion_rules_touch_updated_at
  BEFORE UPDATE ON public.crm_conversion_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
