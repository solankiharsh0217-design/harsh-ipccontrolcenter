
-- 1) Rules table
CREATE TABLE public.code_of_conduct_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_type text NOT NULL DEFAULT 'email_sent',
  template_id uuid NULL,
  source_type text NOT NULL DEFAULT 'both' CHECK (source_type IN ('crm','paid_pipeline','both')),
  current_pipeline_id uuid NULL,
  current_stage_id uuid NULL,
  destination_pipeline_id uuid NOT NULL,
  destination_stage_id uuid NOT NULL,
  also_update_paid_pipeline_stage boolean NOT NULL DEFAULT false,
  destination_paid_pipeline_stage text NULL,
  allow_repeat boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.code_of_conduct_automation_rules TO authenticated;
GRANT ALL ON public.code_of_conduct_automation_rules TO service_role;

ALTER TABLE public.code_of_conduct_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coc_auto_rules_read_auth"
  ON public.code_of_conduct_automation_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "coc_auto_rules_admin_insert"
  ON public.code_of_conduct_automation_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "coc_auto_rules_admin_update"
  ON public.code_of_conduct_automation_rules
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "coc_auto_rules_admin_delete"
  ON public.code_of_conduct_automation_rules
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_coc_auto_rules_updated_at
  BEFORE UPDATE ON public.code_of_conduct_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Events table
CREATE TABLE public.code_of_conduct_automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NULL,
  rule_id uuid NULL,
  event_type text NOT NULL,
  crm_lead_id uuid NULL,
  paid_pipeline_lead_id uuid NULL,
  old_pipeline_id uuid NULL,
  old_stage_id uuid NULL,
  new_pipeline_id uuid NULL,
  new_stage_id uuid NULL,
  status text NOT NULL CHECK (status IN ('applied','skipped','failed')),
  skip_reason text NULL,
  error_message text NULL,
  metadata jsonb NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coc_auto_events_request ON public.code_of_conduct_automation_events(request_id);
CREATE INDEX idx_coc_auto_events_rule ON public.code_of_conduct_automation_events(rule_id);

GRANT SELECT, INSERT ON public.code_of_conduct_automation_events TO authenticated;
GRANT ALL ON public.code_of_conduct_automation_events TO service_role;

ALTER TABLE public.code_of_conduct_automation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coc_auto_events_admin_read"
  ON public.code_of_conduct_automation_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "coc_auto_events_auth_insert"
  ON public.code_of_conduct_automation_events
  FOR INSERT TO authenticated WITH CHECK (true);
