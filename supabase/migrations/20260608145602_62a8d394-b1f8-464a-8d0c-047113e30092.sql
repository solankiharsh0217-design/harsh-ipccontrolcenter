CREATE OR REPLACE FUNCTION public.protect_paid_onboarding_crm_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_pipeline_type text := NULL;
  v_new_pipeline_type text := NULL;
BEGIN
  IF NEW.pipeline_id IS NOT NULL THEN
    SELECT type INTO v_new_pipeline_type
    FROM public.pipelines
    WHERE id = NEW.pipeline_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.pipeline_id IS NOT NULL THEN
    SELECT type INTO v_old_pipeline_type
    FROM public.pipelines
    WHERE id = OLD.pipeline_id;
  END IF;

  -- Once a CRM row is a paid onboarding card, normal CRM imports/updates must not
  -- demote it back to Sales or hide it from the Paid — Onboarding dashboard.
  IF TG_OP = 'UPDATE'
     AND OLD.paid_pipeline_lead_id IS NOT NULL
     AND (OLD.lead_type = 'paid' OR v_old_pipeline_type = 'paid') THEN
    NEW.pipeline_id := OLD.pipeline_id;
    NEW.stage_id := COALESCE(NEW.stage_id, OLD.stage_id);
    NEW.lead_type := 'paid';
    NEW.paid_pipeline_lead_id := OLD.paid_pipeline_lead_id;
    NEW.hide_from_sales_workload := false;
    NEW.deleted_at := NULL;
    NEW.archived_at := NULL;
  END IF;

  -- Any row currently being saved into Paid — Onboarding must remain visible there.
  IF NEW.lead_type = 'paid' OR v_new_pipeline_type = 'paid' THEN
    NEW.lead_type := 'paid';
    NEW.hide_from_sales_workload := false;
    NEW.deleted_at := NULL;
    NEW.archived_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_paid_onboarding_crm_lead ON public.leads;
CREATE TRIGGER trg_protect_paid_onboarding_crm_lead
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.protect_paid_onboarding_crm_lead();