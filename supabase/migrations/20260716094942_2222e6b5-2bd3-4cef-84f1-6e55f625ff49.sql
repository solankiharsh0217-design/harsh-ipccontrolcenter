
CREATE OR REPLACE FUNCTION public.get_operations_linked_record_summary(_ops_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ops record;
  is_admin boolean;
  allowed boolean;
  crm jsonb := NULL;
  paid jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  SELECT id, assigned_media_buyer_id, created_by, crm_lead_id, paid_pipeline_lead_id
    INTO ops
  FROM public.operations_leads
  WHERE id = _ops_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','not_found');
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  allowed := is_admin
          OR ops.assigned_media_buyer_id = auth.uid()
          OR ops.created_by = auth.uid();

  IF NOT allowed THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  IF ops.crm_lead_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', l.id,
      'full_name', l.full_name,
      'email', l.email,
      'phone', l.phone,
      'pipeline_name', p.name,
      'stage_name', s.name
    )
    INTO crm
    FROM public.leads l
    LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
    LEFT JOIN public.stages s ON s.id = l.stage_id
    WHERE l.id = ops.crm_lead_id;
  END IF;

  IF ops.paid_pipeline_lead_id IS NOT NULL THEN
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
    )
    INTO paid
    FROM public.paid_pipeline_leads ppl
    WHERE ppl.id = ops.paid_pipeline_lead_id;
  END IF;

  RETURN jsonb_build_object(
    'crm_lead_id', ops.crm_lead_id,
    'paid_pipeline_lead_id', ops.paid_pipeline_lead_id,
    'crm', crm,
    'paid', paid
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_operations_linked_record_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operations_linked_record_summary(uuid) TO authenticated;

-- Seed / upsert "Media Buyer" access template (no unique constraint on name; use manual upsert)
DO $mb$
DECLARE
  v_id uuid;
  v_keys text[] := ARRAY[
    'dashboard',
    'notifications',
    'team_performance',
    'tasks',
    'operations_crm',
    'media_buyer_operations',
    'follow_up_command_center',
    'daily-reporting',
    'reports',
    'calling_crm',
    'paid_pipeline',
    'announcements'
  ];
  v_desc text := 'For media buying and operations support team members. Grants operations CRM, tasks, team performance, resource library, and read access to related CRM/Paid records.';
BEGIN
  SELECT id INTO v_id FROM public.access_templates WHERE name = 'Media Buyer' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.access_templates (name, description, module_keys, grants_admin, is_active)
    VALUES ('Media Buyer', v_desc, v_keys, false, true);
  ELSE
    UPDATE public.access_templates
       SET description = v_desc,
           module_keys = v_keys,
           grants_admin = false,
           is_active = true,
           updated_at = now()
     WHERE id = v_id;
  END IF;
END
$mb$;
