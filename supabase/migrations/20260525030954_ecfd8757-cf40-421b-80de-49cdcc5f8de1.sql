
-- Operations CRM handoff rules
CREATE TABLE IF NOT EXISTS public.operations_handoff_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  eligible_stage_ids uuid[] NOT NULL DEFAULT '{}',
  mode text NOT NULL DEFAULT 'suggest' CHECK (mode IN ('manual','suggest','auto')),
  default_service_package text,
  default_service_days integer,
  default_assignment_method text NOT NULL DEFAULT 'unassigned' CHECK (default_assignment_method IN ('unassigned','single','round_robin')),
  default_single_buyer_id uuid,
  eligible_buyer_ids uuid[] NOT NULL DEFAULT '{}',
  duplicate_behavior text NOT NULL DEFAULT 'skip' CHECK (duplicate_behavior IN ('skip','update')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_handoff_rules_pipeline ON public.operations_handoff_rules(source_pipeline_id);
CREATE INDEX IF NOT EXISTS idx_ops_handoff_rules_active ON public.operations_handoff_rules(is_active) WHERE is_active = true;

ALTER TABLE public.operations_handoff_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active members can view handoff rules"
  ON public.operations_handoff_rules FOR SELECT
  USING (public.is_active(auth.uid()));

CREATE POLICY "Admins can insert handoff rules"
  ON public.operations_handoff_rules FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update handoff rules"
  ON public.operations_handoff_rules FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete handoff rules"
  ON public.operations_handoff_rules FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ops_handoff_rules_updated
  BEFORE UPDATE ON public.operations_handoff_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
