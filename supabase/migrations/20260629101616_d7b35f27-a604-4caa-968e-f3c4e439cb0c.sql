CREATE OR REPLACE FUNCTION public.protect_paid_onboarding_crm_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_pipeline_type text := NULL;
  v_new_pipeline_type text := NULL;
  v_intent_archive boolean := false;
  v_intent_soft_delete boolean := false;
BEGIN
  IF NEW.pipeline_id IS NOT NULL THEN
    SELECT type INTO v_new_pipeline_type FROM public.pipelines WHERE id = NEW.pipeline_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.pipeline_id IS NOT NULL THEN
    SELECT type INTO v_old_pipeline_type FROM public.pipelines WHERE id = OLD.pipeline_id;
  END IF;

  -- Detect an intentional archive/soft-delete request from the caller.
  -- When the UPDATE explicitly sets archived_at / deleted_at to a non-null value,
  -- we treat it as a deliberate Paid-Onboarding cleanup and allow it through.
  IF TG_OP = 'UPDATE' THEN
    v_intent_archive := (NEW.archived_at IS NOT NULL AND NEW.archived_at IS DISTINCT FROM OLD.archived_at);
    v_intent_soft_delete := (NEW.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at);
  END IF;

  -- Once a CRM row is a paid onboarding card, normal CRM imports/updates must not
  -- demote it back to Sales or hide it from the Paid — Onboarding dashboard —
  -- UNLESS the caller is explicitly archiving/soft-deleting it (wrong-batch cleanup).
  IF TG_OP = 'UPDATE'
     AND OLD.paid_pipeline_lead_id IS NOT NULL
     AND (OLD.lead_type = 'paid' OR v_old_pipeline_type = 'paid') THEN
    NEW.pipeline_id := OLD.pipeline_id;
    NEW.stage_id := COALESCE(NEW.stage_id, OLD.stage_id);
    NEW.lead_type := 'paid';
    NEW.paid_pipeline_lead_id := OLD.paid_pipeline_lead_id;

    IF v_intent_archive OR v_intent_soft_delete THEN
      -- Allow the caller's archived_at / deleted_at / hide_from_sales_workload values
      -- to persist. This is the only path Finance Success / Paid Onboarding cleanup uses.
      NULL;
    ELSE
      NEW.hide_from_sales_workload := false;
      NEW.deleted_at := NULL;
      NEW.archived_at := NULL;
    END IF;
  END IF;

  -- Any row currently being saved into Paid — Onboarding must remain visible there —
  -- unless the same UPDATE is the explicit archive/soft-delete cleanup path.
  IF NEW.lead_type = 'paid' OR v_new_pipeline_type = 'paid' THEN
    NEW.lead_type := 'paid';
    IF v_intent_archive OR v_intent_soft_delete THEN
      NULL;
    ELSE
      NEW.hide_from_sales_workload := false;
      NEW.deleted_at := NULL;
      NEW.archived_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;