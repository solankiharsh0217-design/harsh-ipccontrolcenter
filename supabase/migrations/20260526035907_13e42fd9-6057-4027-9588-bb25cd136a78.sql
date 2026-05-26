
-- Suggestion ignores
CREATE TABLE IF NOT EXISTS public.code_of_conduct_suggestion_ignores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.code_of_conduct_rules(id) ON DELETE CASCADE,
  stage_id uuid,
  crm_lead_id uuid,
  paid_pipeline_lead_id uuid,
  ignored_by uuid,
  ignored_at timestamptz NOT NULL DEFAULT now(),
  CHECK (crm_lead_id IS NOT NULL OR paid_pipeline_lead_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coc_ignore_crm
  ON public.code_of_conduct_suggestion_ignores(rule_id, crm_lead_id)
  WHERE crm_lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_coc_ignore_paid
  ON public.code_of_conduct_suggestion_ignores(rule_id, paid_pipeline_lead_id)
  WHERE paid_pipeline_lead_id IS NOT NULL;

ALTER TABLE public.code_of_conduct_suggestion_ignores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coc_ignore_select" ON public.code_of_conduct_suggestion_ignores;
CREATE POLICY "coc_ignore_select" ON public.code_of_conduct_suggestion_ignores
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "coc_ignore_insert" ON public.code_of_conduct_suggestion_ignores;
CREATE POLICY "coc_ignore_insert" ON public.code_of_conduct_suggestion_ignores
  FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()) AND ignored_by = auth.uid());

DROP POLICY IF EXISTS "coc_ignore_delete" ON public.code_of_conduct_suggestion_ignores;
CREATE POLICY "coc_ignore_delete" ON public.code_of_conduct_suggestion_ignores
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Sync function: runs on transitions to 'signed'
CREATE OR REPLACE FUNCTION public.coc_after_signed_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule record;
  v_tag_id uuid;
  v_stage_after uuid;
  v_crm_lead_id uuid;
  v_paid_lead_id uuid;
  v_owner_id uuid;
  v_member_name text;
BEGIN
  IF NEW.status <> 'signed' THEN RETURN NEW; END IF;
  IF OLD.status = 'signed' THEN RETURN NEW; END IF;

  v_crm_lead_id := NEW.crm_lead_id;
  v_paid_lead_id := NEW.paid_pipeline_lead_id;
  v_member_name := COALESCE(NEW.member_name, 'Member');

  -- Mirror status to CRM lead
  IF v_crm_lead_id IS NOT NULL THEN
    UPDATE public.leads
      SET code_of_conduct_status = 'signed',
          code_of_conduct_request_id = NEW.id,
          code_of_conduct_signed_at = COALESCE(NEW.signed_at, now())
      WHERE id = v_crm_lead_id;
    SELECT assigned_agent_id INTO v_owner_id FROM public.leads WHERE id = v_crm_lead_id;
  END IF;

  -- Mirror status to Paid Pipeline lead
  IF v_paid_lead_id IS NOT NULL THEN
    UPDATE public.paid_pipeline_leads
      SET code_of_conduct_status = 'signed',
          code_of_conduct_request_id = NEW.id,
          code_of_conduct_signed_at = COALESCE(NEW.signed_at, now())
      WHERE id = v_paid_lead_id;
    IF v_crm_lead_id IS NULL THEN
      SELECT crm_lead_id INTO v_crm_lead_id FROM public.paid_pipeline_leads WHERE id = v_paid_lead_id;
    END IF;
  END IF;

  INSERT INTO public.code_of_conduct_events (request_id, event_type, metadata)
    VALUES (NEW.id, 'code_of_conduct_signed_status_synced',
      jsonb_build_object('crm_lead_id', v_crm_lead_id, 'paid_pipeline_lead_id', v_paid_lead_id));

  -- Find matching rule (most recent active rule using this template)
  SELECT * INTO rule FROM public.code_of_conduct_rules
    WHERE template_id = NEW.template_id AND is_active = true
    ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    v_tag_id := rule.tag_id_after_signed;
    v_stage_after := rule.stage_id_after_signed;

    -- Apply tag (idempotent via unique index)
    IF v_tag_id IS NOT NULL THEN
      IF v_crm_lead_id IS NOT NULL THEN
        INSERT INTO public.lead_tag_assignments (tag_id, crm_lead_id, assigned_by)
          VALUES (v_tag_id, v_crm_lead_id, NULL)
          ON CONFLICT DO NOTHING;
      END IF;
      IF v_paid_lead_id IS NOT NULL THEN
        INSERT INTO public.lead_tag_assignments (tag_id, paid_pipeline_lead_id, assigned_by)
          VALUES (v_tag_id, v_paid_lead_id, NULL)
          ON CONFLICT DO NOTHING;
      END IF;
      INSERT INTO public.code_of_conduct_events (request_id, event_type, metadata)
        VALUES (NEW.id, 'code_of_conduct_signed_tag_applied', jsonb_build_object('tag_id', v_tag_id));
    END IF;

    -- Optional CRM stage move
    IF v_stage_after IS NOT NULL AND v_crm_lead_id IS NOT NULL THEN
      UPDATE public.leads SET stage_id = v_stage_after WHERE id = v_crm_lead_id;
      INSERT INTO public.code_of_conduct_events (request_id, event_type, metadata)
        VALUES (NEW.id, 'code_of_conduct_signed_stage_updated',
          jsonb_build_object('crm_lead_id', v_crm_lead_id, 'stage_id', v_stage_after));
    END IF;

    -- Notify admin + owner if configured
    IF rule.notify_admin THEN
      INSERT INTO public.notifications (
        recipient_user_id, module_key, notification_type, title, message,
        priority, action_url, action_label, entity_type, entity_id, entity_label,
        triggered_by_user_id, metadata
      )
      SELECT ur.user_id, 'code_of_conduct', 'coc_signed',
        v_member_name || ' signed Code of Conduct',
        'Signed PDF is ready for review.',
        'normal',
        '/admin/code-of-conduct?request_id=' || NEW.id::text,
        'View signed PDF',
        'code_of_conduct_request', NEW.id, v_member_name,
        NULL,
        jsonb_build_object('request_id', NEW.id, 'rule_id', rule.id)
      FROM public.user_roles ur
      WHERE ur.role = 'admin'::app_role
      ON CONFLICT DO NOTHING;
    END IF;

    IF rule.notify_owner AND v_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_user_id, module_key, notification_type, title, message,
        priority, action_url, action_label, entity_type, entity_id, entity_label,
        triggered_by_user_id, metadata
      ) VALUES (
        v_owner_id, 'code_of_conduct', 'coc_signed',
        v_member_name || ' signed Code of Conduct',
        'Your assigned lead has signed the Code of Conduct.',
        'normal',
        '/crm',
        'Open lead',
        'crm_lead', v_crm_lead_id, v_member_name,
        NULL,
        jsonb_build_object('request_id', NEW.id, 'rule_id', rule.id)
      );
    END IF;

    INSERT INTO public.code_of_conduct_events (request_id, event_type, metadata)
      VALUES (NEW.id, 'code_of_conduct_signed_notification_sent',
        jsonb_build_object('notify_admin', rule.notify_admin, 'notify_owner', rule.notify_owner));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_coc_after_signed ON public.code_of_conduct_requests;
CREATE TRIGGER trg_coc_after_signed
  AFTER UPDATE ON public.code_of_conduct_requests
  FOR EACH ROW EXECUTE FUNCTION public.coc_after_signed_sync();

-- Also mirror to leads/paid_pipeline_leads on intermediate status changes (sent/viewed/expired/failed)
CREATE OR REPLACE FUNCTION public.coc_mirror_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status AND NEW.id = OLD.id THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('sent','viewed','expired','failed','cancelled') THEN RETURN NEW; END IF;

  IF NEW.crm_lead_id IS NOT NULL THEN
    UPDATE public.leads
      SET code_of_conduct_status = NEW.status,
          code_of_conduct_request_id = NEW.id,
          code_of_conduct_sent_at = COALESCE(code_of_conduct_sent_at, NEW.sent_at)
      WHERE id = NEW.crm_lead_id;
  END IF;
  IF NEW.paid_pipeline_lead_id IS NOT NULL THEN
    UPDATE public.paid_pipeline_leads
      SET code_of_conduct_status = NEW.status,
          code_of_conduct_request_id = NEW.id,
          code_of_conduct_sent_at = COALESCE(code_of_conduct_sent_at, NEW.sent_at)
      WHERE id = NEW.paid_pipeline_lead_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_coc_mirror_status ON public.code_of_conduct_requests;
CREATE TRIGGER trg_coc_mirror_status
  AFTER INSERT OR UPDATE ON public.code_of_conduct_requests
  FOR EACH ROW EXECUTE FUNCTION public.coc_mirror_status();
