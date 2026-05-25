
CREATE OR REPLACE FUNCTION public.admin_hard_wipe_all_lead_data(_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  before_counts jsonb;
  after_counts jsonb;
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized: admin only';
  END IF;

  SELECT jsonb_build_object(
    'crm_leads',                (SELECT count(*) FROM public.leads),
    'crm_leads_active',         (SELECT count(*) FROM public.leads WHERE archived_at IS NULL AND deleted_at IS NULL),
    'crm_leads_archived',       (SELECT count(*) FROM public.leads WHERE archived_at IS NOT NULL),
    'crm_leads_soft_deleted',   (SELECT count(*) FROM public.leads WHERE deleted_at IS NOT NULL),
    'paid_batches',             (SELECT count(*) FROM public.paid_pipeline_batches),
    'paid_buyers',              (SELECT count(*) FROM public.paid_pipeline_leads),
    'paid_payments',            (SELECT count(*) FROM public.paid_pipeline_payments),
    'paid_followups',           (SELECT count(*) FROM public.paid_pipeline_followups),
    'paid_finance',             (SELECT count(*) FROM public.paid_pipeline_finance_details),
    'paid_activity',            (SELECT count(*) FROM public.paid_pipeline_activity_logs),
    'paid_to_crm_links',        (SELECT count(*) FROM public.paid_pipeline_to_crm_links),
    'operations_leads',         (SELECT count(*) FROM public.operations_leads),
    'operations_service_events',(SELECT count(*) FROM public.operations_service_events),
    'operations_conversions',   (SELECT count(*) FROM public.operations_conversion_reports),
    'operations_reward_progress',(SELECT count(*) FROM public.operations_reward_progress),
    'crm_followups',            (SELECT count(*) FROM public.follow_up_reminders),
    'lead_tag_assignments',     (SELECT count(*) FROM public.lead_tag_assignments),
    'lead_activity',            (SELECT count(*) FROM public.activity_logs),
    'batch_archives',           (SELECT count(*) FROM public.crm_batch_archives),
    'lead_entries',             (SELECT count(*) FROM public.lead_entries),
    'lead_qualifier_sessions',  (SELECT count(*) FROM public.lead_qualifier_sessions),
    'notifications',            (SELECT count(*) FROM public.notifications
      WHERE entity_type IN ('lead','crm_lead','paid_pipeline_lead','operations_lead','batch','paid_batch','follow_up','payment','conversion','reward','handoff','assignment'))
  ) INTO before_counts;

  IF _dry_run THEN
    RETURN jsonb_build_object('dry_run', true, 'before_counts', before_counts);
  END IF;

  -- Delete notifications linked to lead/work entities first (they reference entity_ids)
  DELETE FROM public.notifications
    WHERE entity_type IN ('lead','crm_lead','paid_pipeline_lead','operations_lead','batch','paid_batch','follow_up','payment','conversion','reward','handoff','assignment');

  -- Operations CRM children -> parent
  DELETE FROM public.operations_conversion_reports WHERE id IS NOT NULL;
  DELETE FROM public.operations_service_events    WHERE id IS NOT NULL;
  DELETE FROM public.operations_reward_progress   WHERE id IS NOT NULL;
  DELETE FROM public.operations_leads             WHERE id IS NOT NULL;

  -- Paid Pipeline children -> parent
  DELETE FROM public.paid_pipeline_payments         WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_followups        WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_finance_details  WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_activity_logs    WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_to_crm_links     WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_leads            WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_batches          WHERE id IS NOT NULL;

  -- Calling CRM children
  DELETE FROM public.follow_up_reminders     WHERE id IS NOT NULL;
  DELETE FROM public.lead_tag_assignments    WHERE id IS NOT NULL;
  DELETE FROM public.activity_logs           WHERE id IS NOT NULL;
  DELETE FROM public.crm_batch_archives      WHERE id IS NOT NULL;
  DELETE FROM public.lead_entries            WHERE id IS NOT NULL;
  DELETE FROM public.lead_qualifier_sessions WHERE id IS NOT NULL;

  -- Leads (parent)
  DELETE FROM public.leads WHERE id IS NOT NULL;

  SELECT jsonb_build_object(
    'crm_leads',                (SELECT count(*) FROM public.leads),
    'paid_batches',             (SELECT count(*) FROM public.paid_pipeline_batches),
    'paid_buyers',              (SELECT count(*) FROM public.paid_pipeline_leads),
    'paid_payments',            (SELECT count(*) FROM public.paid_pipeline_payments),
    'paid_followups',           (SELECT count(*) FROM public.paid_pipeline_followups),
    'paid_finance',             (SELECT count(*) FROM public.paid_pipeline_finance_details),
    'paid_activity',            (SELECT count(*) FROM public.paid_pipeline_activity_logs),
    'paid_to_crm_links',        (SELECT count(*) FROM public.paid_pipeline_to_crm_links),
    'operations_leads',         (SELECT count(*) FROM public.operations_leads),
    'operations_service_events',(SELECT count(*) FROM public.operations_service_events),
    'operations_conversions',   (SELECT count(*) FROM public.operations_conversion_reports),
    'operations_reward_progress',(SELECT count(*) FROM public.operations_reward_progress),
    'crm_followups',            (SELECT count(*) FROM public.follow_up_reminders),
    'lead_tag_assignments',     (SELECT count(*) FROM public.lead_tag_assignments),
    'lead_activity',            (SELECT count(*) FROM public.activity_logs),
    'batch_archives',           (SELECT count(*) FROM public.crm_batch_archives),
    'lead_entries',             (SELECT count(*) FROM public.lead_entries),
    'lead_qualifier_sessions',  (SELECT count(*) FROM public.lead_qualifier_sessions),
    'notifications',            (SELECT count(*) FROM public.notifications
      WHERE entity_type IN ('lead','crm_lead','paid_pipeline_lead','operations_lead','batch','paid_batch','follow_up','payment','conversion','reward','handoff','assignment'))
  ) INTO after_counts;

  result := jsonb_build_object(
    'dry_run', false,
    'wiped_at', now(),
    'wiped_by', auth.uid(),
    'before_counts', before_counts,
    'after_counts', after_counts
  );

  RETURN result;
END $function$;
