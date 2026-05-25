CREATE OR REPLACE FUNCTION public.admin_wipe_demo_lead_data(_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c_crm_active int := 0;
  c_crm_archived int := 0;
  c_crm_total int := 0;
  c_batches int := 0;
  c_paid_buyers int := 0;
  c_paid_archived int := 0;
  c_payments int := 0;
  c_pp_followups int := 0;
  c_pp_finance int := 0;
  c_pp_activity int := 0;
  c_pp_links int := 0;
  c_ops_leads int := 0;
  c_ops_events int := 0;
  c_ops_conv int := 0;
  c_ops_reward int := 0;
  c_followups int := 0;
  c_tag_assign int := 0;
  c_activity int := 0;
  c_notif int := 0;
  c_batch_archives int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized: admin only';
  END IF;

  -- Count phase
  SELECT count(*) INTO c_crm_active FROM public.leads WHERE archived_at IS NULL;
  SELECT count(*) INTO c_crm_archived FROM public.leads WHERE archived_at IS NOT NULL;
  c_crm_total := c_crm_active + c_crm_archived;
  SELECT count(*) INTO c_batches FROM public.paid_pipeline_batches;
  SELECT count(*) INTO c_paid_buyers FROM public.paid_pipeline_leads WHERE archived_at IS NULL;
  SELECT count(*) INTO c_paid_archived FROM public.paid_pipeline_leads WHERE archived_at IS NOT NULL;
  SELECT count(*) INTO c_payments FROM public.paid_pipeline_payments;
  SELECT count(*) INTO c_pp_followups FROM public.paid_pipeline_followups;
  SELECT count(*) INTO c_pp_finance FROM public.paid_pipeline_finance_details;
  SELECT count(*) INTO c_pp_activity FROM public.paid_pipeline_activity_logs;
  SELECT count(*) INTO c_pp_links FROM public.paid_pipeline_to_crm_links;
  SELECT count(*) INTO c_ops_leads FROM public.operations_leads;
  SELECT count(*) INTO c_ops_events FROM public.operations_service_events;
  SELECT count(*) INTO c_ops_conv FROM public.operations_conversion_reports;
  SELECT count(*) INTO c_ops_reward FROM public.operations_reward_progress;
  SELECT count(*) INTO c_followups FROM public.follow_up_reminders;
  SELECT count(*) INTO c_tag_assign FROM public.lead_tag_assignments;
  SELECT count(*) INTO c_activity FROM public.activity_logs;
  SELECT count(*) INTO c_batch_archives FROM public.crm_batch_archives;
  SELECT count(*) INTO c_notif FROM public.notifications
    WHERE entity_type IN ('lead','crm_lead','paid_pipeline_lead','operations_lead','batch','paid_batch','follow_up','payment','conversion','reward','handoff');

  IF _dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'crm_leads_active', c_crm_active,
      'crm_leads_archived', c_crm_archived,
      'crm_leads_total', c_crm_total,
      'paid_batches', c_batches,
      'paid_buyers_active', c_paid_buyers,
      'paid_buyers_archived', c_paid_archived,
      'payments', c_payments,
      'paid_followups', c_pp_followups,
      'paid_finance', c_pp_finance,
      'paid_activity', c_pp_activity,
      'paid_to_crm_links', c_pp_links,
      'operations_leads', c_ops_leads,
      'operations_service_events', c_ops_events,
      'operations_conversions', c_ops_conv,
      'operations_reward_progress', c_ops_reward,
      'crm_followups', c_followups,
      'lead_tag_assignments', c_tag_assign,
      'lead_activity', c_activity,
      'batch_archives', c_batch_archives,
      'notifications', c_notif
    );
  END IF;

  -- Delete phase (FK-safe order). Many tables CASCADE from parents, but we delete explicitly for transparent counts.

  -- Operations CRM children → parent
  DELETE FROM public.operations_conversion_reports;
  DELETE FROM public.operations_service_events;
  DELETE FROM public.operations_leads;
  DELETE FROM public.operations_reward_progress;

  -- Paid Pipeline children → parent
  DELETE FROM public.paid_pipeline_payments;
  DELETE FROM public.paid_pipeline_followups;
  DELETE FROM public.paid_pipeline_finance_details;
  DELETE FROM public.paid_pipeline_activity_logs;
  DELETE FROM public.paid_pipeline_to_crm_links;
  DELETE FROM public.paid_pipeline_leads;
  DELETE FROM public.paid_pipeline_batches;

  -- Calling CRM children
  DELETE FROM public.follow_up_reminders;
  DELETE FROM public.lead_tag_assignments;
  DELETE FROM public.activity_logs;
  DELETE FROM public.crm_batch_archives;

  -- Leads (parent)
  DELETE FROM public.leads;

  -- Notifications linked to wiped entity types
  DELETE FROM public.notifications
    WHERE entity_type IN ('lead','crm_lead','paid_pipeline_lead','operations_lead','batch','paid_batch','follow_up','payment','conversion','reward','handoff');

  RETURN jsonb_build_object(
    'dry_run', false,
    'crm_leads_deleted', c_crm_total,
    'paid_batches_deleted', c_batches,
    'paid_buyers_deleted', c_paid_buyers + c_paid_archived,
    'payments_deleted', c_payments,
    'paid_followups_deleted', c_pp_followups,
    'paid_finance_deleted', c_pp_finance,
    'paid_activity_deleted', c_pp_activity,
    'paid_to_crm_links_deleted', c_pp_links,
    'operations_leads_deleted', c_ops_leads,
    'operations_service_events_deleted', c_ops_events,
    'operations_conversions_deleted', c_ops_conv,
    'operations_reward_progress_deleted', c_ops_reward,
    'followups_deleted', c_followups,
    'lead_tag_assignments_deleted', c_tag_assign,
    'lead_activity_deleted', c_activity,
    'batch_archives_deleted', c_batch_archives,
    'notifications_deleted', c_notif
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_wipe_demo_lead_data(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_wipe_demo_lead_data(boolean) TO authenticated;