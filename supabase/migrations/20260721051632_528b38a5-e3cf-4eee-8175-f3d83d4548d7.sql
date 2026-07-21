
CREATE TABLE IF NOT EXISTS public.member_access_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  paid_pipeline_lead_id uuid REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE,
  user_id uuid,
  whatsapp_group_status text NOT NULL DEFAULT 'unknown'
    CHECK (whatsapp_group_status IN ('unknown','invite_sent','not_joined','joined_verified','link_issue')),
  whatsapp_verified_at timestamptz,
  whatsapp_verified_by uuid,
  app_login_status text NOT NULL DEFAULT 'unknown'
    CHECK (app_login_status IN ('unknown','never_logged_in','logged_in','access_issue')),
  app_last_login_at timestamptz,
  app_login_verified_at timestamptz,
  app_login_verified_by uuid,
  call_status text NOT NULL DEFAULT 'not_called'
    CHECK (call_status IN ('not_called','no_answer','connected','follow_up_needed','resolved')),
  call_attempt_count integer NOT NULL DEFAULT 0,
  last_called_at timestamptz,
  last_called_by uuid,
  next_follow_up_at timestamptz,
  contact_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mav_has_link CHECK (
    crm_lead_id IS NOT NULL OR paid_pipeline_lead_id IS NOT NULL OR user_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS mav_paid_uniq ON public.member_access_verifications(paid_pipeline_lead_id) WHERE paid_pipeline_lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mav_crm_uniq ON public.member_access_verifications(crm_lead_id) WHERE crm_lead_id IS NOT NULL AND paid_pipeline_lead_id IS NULL;
CREATE INDEX IF NOT EXISTS mav_next_follow_up_idx ON public.member_access_verifications(next_follow_up_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_access_verifications TO authenticated;
GRANT ALL ON public.member_access_verifications TO service_role;

ALTER TABLE public.member_access_verifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_member_verification(_crm_lead_id uuid, _paid_pipeline_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (_crm_lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = _crm_lead_id
        AND l.assigned_agent_id = auth.uid()
    ))
    OR (_paid_pipeline_lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.paid_pipeline_leads p
      WHERE p.id = _paid_pipeline_lead_id
        AND (p.assigned_sales_executive = auth.uid() OR p.created_by = auth.uid())
    ))
$$;

CREATE POLICY mav_select ON public.member_access_verifications FOR SELECT TO authenticated
USING (public.can_access_member_verification(crm_lead_id, paid_pipeline_lead_id));

CREATE POLICY mav_insert ON public.member_access_verifications FOR INSERT TO authenticated
WITH CHECK (public.can_access_member_verification(crm_lead_id, paid_pipeline_lead_id));

CREATE POLICY mav_update ON public.member_access_verifications FOR UPDATE TO authenticated
USING (public.can_access_member_verification(crm_lead_id, paid_pipeline_lead_id))
WITH CHECK (public.can_access_member_verification(crm_lead_id, paid_pipeline_lead_id));

CREATE POLICY mav_delete ON public.member_access_verifications FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.mav_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_mav_updated_at ON public.member_access_verifications;
CREATE TRIGGER trg_mav_updated_at BEFORE UPDATE ON public.member_access_verifications
FOR EACH ROW EXECUTE FUNCTION public.mav_touch_updated_at();
