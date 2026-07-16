
CREATE OR REPLACE FUNCTION public.get_operations_linked_record_summary(_ops_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ops record;
  is_admin boolean;
  allowed boolean;
  has_crm_mod boolean;
  has_paid_mod boolean;
  crm_status text := 'not_linked';
  crm_reason text := NULL;
  crm_data jsonb := NULL;
  paid_status text := 'not_linked';
  paid_reason text := NULL;
  paid_data jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT id, assigned_media_buyer_id, created_by, crm_lead_id, paid_pipeline_lead_id
    INTO ops
  FROM public.operations_leads
  WHERE id = _ops_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  allowed := is_admin
          OR ops.assigned_media_buyer_id = auth.uid()
          OR ops.created_by = auth.uid();

  IF NOT allowed THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Module access checks (admins bypass)
  SELECT is_admin OR EXISTS (
    SELECT 1 FROM public.user_module_access
     WHERE user_id = auth.uid() AND module_key IN ('calling_crm','crm')
  ) INTO has_crm_mod;

  SELECT is_admin OR EXISTS (
    SELECT 1 FROM public.user_module_access
     WHERE user_id = auth.uid() AND module_key IN ('paid_pipeline','paid-pipeline')
  ) INTO has_paid_mod;

  -- CRM side
  IF ops.crm_lead_id IS NULL THEN
    crm_status := 'not_linked'; crm_reason := 'missing_id';
  ELSIF NOT has_crm_mod THEN
    crm_status := 'access_restricted'; crm_reason := 'module_missing';
  ELSE
    SELECT jsonb_build_object(
      'id', l.id,
      'full_name', l.full_name,
      'email', l.email,
      'phone', l.phone,
      'pipeline_name', p.name,
      'stage_name', s.name
    ) INTO crm_data
    FROM public.leads l
    LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
    LEFT JOIN public.stages s ON s.id = l.stage_id
    WHERE l.id = ops.crm_lead_id;
    IF crm_data IS NULL THEN
      crm_status := 'not_found'; crm_reason := 'not_found';
    ELSE
      crm_status := 'linked'; crm_reason := NULL;
    END IF;
  END IF;

  -- Paid side
  IF ops.paid_pipeline_lead_id IS NULL THEN
    paid_status := 'not_linked'; paid_reason := 'missing_id';
  ELSIF NOT has_paid_mod THEN
    paid_status := 'access_restricted'; paid_reason := 'module_missing';
  ELSE
    SELECT jsonb_build_object(
      'id', ppl.id,
      'name', ppl.name,
      'email', ppl.email,
      'phone', ppl.phone,
      'pipeline_stage', ppl.pipeline_stage,
      'deal_value_including_gst', ppl.deal_value_including_gst,
      'total_collected', ppl.total_collected,
      'balance', ppl.balance,
      'payment_status', CASE
        WHEN COALESCE(ppl.balance, 0) <= 0 AND COALESCE(ppl.total_collected, 0) > 0 THEN 'fully_paid'
        WHEN COALESCE(ppl.total_collected, 0) > 0 THEN 'partial'
        ELSE 'pending'
      END
    ) INTO paid_data
    FROM public.paid_pipeline_leads ppl
    WHERE ppl.id = ops.paid_pipeline_lead_id;
    IF paid_data IS NULL THEN
      paid_status := 'not_found'; paid_reason := 'not_found';
    ELSE
      paid_status := 'linked'; paid_reason := NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'crm_lead_id', ops.crm_lead_id,
    'paid_pipeline_lead_id', ops.paid_pipeline_lead_id,
    'has_calling_crm_module', has_crm_mod,
    'has_paid_pipeline_module', has_paid_mod,
    'crm',  jsonb_build_object('status', crm_status,  'reason_code', crm_reason,  'data', crm_data),
    'paid', jsonb_build_object('status', paid_status, 'reason_code', paid_reason, 'data', paid_data),
    -- Legacy top-level keys for older callers still consuming the previous shape
    'crm_legacy', crm_data,
    'paid_legacy', paid_data
  );
END;
$function$;
