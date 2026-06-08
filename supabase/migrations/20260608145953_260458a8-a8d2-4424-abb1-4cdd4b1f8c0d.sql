CREATE OR REPLACE FUNCTION public.ensure_paid_buyer_has_paid_crm_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid_pipeline_id uuid;
  v_paid_stage_id uuid;
  v_linked_pipeline_type text := NULL;
  v_existing_paid_crm_id uuid := NULL;
  v_source_lead_id uuid := NULL;
  v_batch_label text := NULL;
  v_batch_date date := NULL;
BEGIN
  IF COALESCE(NEW.is_deleted, false) OR NEW.deleted_at IS NOT NULL OR NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_paid_pipeline_id
  FROM public.pipelines
  WHERE type = 'paid'
  ORDER BY position
  LIMIT 1;

  IF v_paid_pipeline_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_paid_stage_id
  FROM public.stages
  WHERE pipeline_id = v_paid_pipeline_id
  ORDER BY CASE WHEN name = 'Payment Confirmed' THEN 0 ELSE 1 END, position
  LIMIT 1;

  v_batch_label := NULLIF(btrim(COALESCE(NEW.paid_batch_name, NEW.source_webinar, NEW.onboarding_batch_name, '')), '');
  v_batch_date := NEW.source_report_date;

  IF NEW.crm_lead_id IS NOT NULL THEN
    SELECT p.type INTO v_linked_pipeline_type
    FROM public.leads l
    LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
    WHERE l.id = NEW.crm_lead_id;
  END IF;

  IF NEW.crm_lead_id IS NOT NULL AND v_linked_pipeline_type = 'paid' THEN
    UPDATE public.leads
    SET pipeline_id = v_paid_pipeline_id,
        stage_id = COALESCE(stage_id, v_paid_stage_id),
        lead_type = 'paid',
        paid_pipeline_lead_id = NEW.id,
        hide_from_sales_workload = false,
        archived_at = NULL,
        deleted_at = NULL,
        webinar_source = COALESCE(v_batch_label, webinar_source),
        webinar_name = COALESCE(v_batch_label, webinar_name),
        webinar_date = COALESCE(v_batch_date, webinar_date)
    WHERE id = NEW.crm_lead_id;
    RETURN NEW;
  END IF;

  IF NEW.crm_lead_id IS NOT NULL AND v_linked_pipeline_type IS DISTINCT FROM 'paid' THEN
    v_source_lead_id := NEW.crm_lead_id;
    NEW.source_unpaid_lead_id := COALESCE(NEW.source_unpaid_lead_id, v_source_lead_id);
  ELSE
    v_source_lead_id := NEW.source_unpaid_lead_id;
  END IF;

  SELECT l.id INTO v_existing_paid_crm_id
  FROM public.leads l
  WHERE l.paid_pipeline_lead_id = NEW.id
    AND l.pipeline_id = v_paid_pipeline_id
    AND l.deleted_at IS NULL
  ORDER BY l.created_at DESC
  LIMIT 1;

  IF v_existing_paid_crm_id IS NULL THEN
    INSERT INTO public.leads (
      full_name,
      email,
      phone,
      pipeline_id,
      stage_id,
      lead_type,
      paid_pipeline_lead_id,
      conversion_status,
      hide_from_sales_workload,
      assigned_agent_id,
      program_name,
      webinar_source,
      webinar_name,
      webinar_date,
      deal_value
    ) VALUES (
      COALESCE(NULLIF(NEW.name, ''), 'Unnamed Buyer'),
      NULLIF(NEW.email, ''),
      NULLIF(NEW.phone, ''),
      v_paid_pipeline_id,
      v_paid_stage_id,
      'paid',
      NEW.id,
      'converted',
      false,
      NEW.assigned_sales_executive,
      COALESCE(NEW.product_name_snapshot, ''),
      v_batch_label,
      v_batch_label,
      v_batch_date,
      COALESCE(NEW.deal_value_including_gst, 0)
    ) RETURNING id INTO v_existing_paid_crm_id;
  ELSE
    UPDATE public.leads
    SET pipeline_id = v_paid_pipeline_id,
        stage_id = COALESCE(stage_id, v_paid_stage_id),
        lead_type = 'paid',
        paid_pipeline_lead_id = NEW.id,
        hide_from_sales_workload = false,
        archived_at = NULL,
        deleted_at = NULL,
        webinar_source = COALESCE(v_batch_label, webinar_source),
        webinar_name = COALESCE(v_batch_label, webinar_name),
        webinar_date = COALESCE(v_batch_date, webinar_date)
    WHERE id = v_existing_paid_crm_id;
  END IF;

  NEW.crm_lead_id := v_existing_paid_crm_id;

  IF v_source_lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET conversion_status = 'converted',
        paid_pipeline_lead_id = NEW.id,
        converted_to_crm_lead_id = v_existing_paid_crm_id,
        converted_at = COALESCE(converted_at, now())
    WHERE id = v_source_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_paid_buyer_has_paid_crm_card ON public.paid_pipeline_leads;
CREATE TRIGGER trg_ensure_paid_buyer_has_paid_crm_card
BEFORE INSERT OR UPDATE OF crm_lead_id, source_unpaid_lead_id, paid_batch_name, source_webinar, onboarding_batch_name, source_report_date, archived_at, deleted_at, is_deleted ON public.paid_pipeline_leads
FOR EACH ROW
EXECUTE FUNCTION public.ensure_paid_buyer_has_paid_crm_card();

REVOKE ALL ON FUNCTION public.ensure_paid_buyer_has_paid_crm_card() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_paid_buyer_has_paid_crm_card() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_paid_buyer_has_paid_crm_card() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_paid_buyer_has_paid_crm_card() TO service_role;