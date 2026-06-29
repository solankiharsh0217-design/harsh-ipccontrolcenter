CREATE OR REPLACE FUNCTION public.test_paid_archive_trigger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id uuid;
  v_paid_pipe_id uuid;
  v_new_archived timestamptz;
  v_lead_type text;
  v_paid_link uuid;
  v_result jsonb;
BEGIN
  -- Allow when called from a server-side shell (no auth.uid()), otherwise admin only.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized: admin only';
  END IF;

  SELECT id INTO v_paid_pipe_id
  FROM public.pipelines
  WHERE type = 'paid' AND name ILIKE '%onboarding%'
  ORDER BY position
  LIMIT 1;

  IF v_paid_pipe_id IS NULL THEN
    RETURN jsonb_build_object('passed', false, 'reason', 'no Paid — Onboarding pipeline found');
  END IF;

  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE pipeline_id = v_paid_pipe_id
    AND paid_pipeline_lead_id IS NOT NULL
    AND archived_at IS NULL
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN jsonb_build_object('passed', false, 'reason', 'no active paid-linked CRM lead available to test');
  END IF;

  BEGIN
    UPDATE public.leads SET archived_at = now() WHERE id = v_lead_id;

    SELECT archived_at, lead_type, paid_pipeline_lead_id
      INTO v_new_archived, v_lead_type, v_paid_link
    FROM public.leads WHERE id = v_lead_id;

    v_result := jsonb_build_object(
      'passed', (v_new_archived IS NOT NULL AND v_lead_type = 'paid' AND v_paid_link IS NOT NULL),
      'lead_id', v_lead_id,
      'archived_at_after_update', v_new_archived,
      'lead_type_after_update', v_lead_type,
      'paid_link_preserved', v_paid_link IS NOT NULL,
      'reason', CASE
        WHEN v_new_archived IS NULL THEN 'trigger reverted archived_at to NULL'
        WHEN v_lead_type <> 'paid' THEN 'lead_type changed away from paid'
        WHEN v_paid_link IS NULL THEN 'paid_pipeline_lead_id was cleared'
        ELSE 'ok'
      END
    );

    RAISE EXCEPTION 'ROLLBACK_TEST' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    NULL;
  END;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.test_paid_archive_trigger() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.test_paid_archive_trigger() TO authenticated, service_role;