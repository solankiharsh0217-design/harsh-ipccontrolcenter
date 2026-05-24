
CREATE TABLE IF NOT EXISTS public.stage_sync_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  trigger_module text NOT NULL,
  trigger_field text NOT NULL,
  trigger_value text NOT NULL,
  suggested_module text NOT NULL,
  suggested_field text NOT NULL,
  suggested_value text NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stage_sync_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active users can view stage sync rules"
ON public.stage_sync_rules FOR SELECT
TO authenticated
USING (public.is_active(auth.uid()));

CREATE POLICY "admins can insert stage sync rules"
ON public.stage_sync_rules FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can update stage sync rules"
ON public.stage_sync_rules FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete stage sync rules"
ON public.stage_sync_rules FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER stage_sync_rules_touch_updated_at
BEFORE UPDATE ON public.stage_sync_rules
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
