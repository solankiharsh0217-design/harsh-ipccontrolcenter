
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Server-side / service-role contexts have no auth.uid(); allow them.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins bypass this check
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.active_for_assignment IS DISTINCT FROM OLD.active_for_assignment
     OR NEW.include_in_round_robin IS DISTINCT FROM OLD.include_in_round_robin
     OR NEW.can_receive_calling_crm_leads IS DISTINCT FROM OLD.can_receive_calling_crm_leads
     OR NEW.can_receive_paid_pipeline_leads IS DISTINCT FROM OLD.can_receive_paid_pipeline_leads
     OR NEW.can_receive_follow_up_tasks IS DISTINCT FROM OLD.can_receive_follow_up_tasks
     OR NEW.can_receive_payment_recovery_leads IS DISTINCT FROM OLD.can_receive_payment_recovery_leads
     OR NEW.can_receive_media_buyer_cases IS DISTINCT FROM OLD.can_receive_media_buyer_cases
     OR NEW.can_receive_operations_leads IS DISTINCT FROM OLD.can_receive_operations_leads
     OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
     OR NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by
     OR NEW.deactivation_reason IS DISTINCT FROM OLD.deactivation_reason
  THEN
    RAISE EXCEPTION 'Not authorized to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_profile_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Server-side / service-role contexts have no auth.uid(); allow them.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.active_for_assignment IS DISTINCT FROM OLD.active_for_assignment
       OR NEW.can_receive_calling_crm_leads IS DISTINCT FROM OLD.can_receive_calling_crm_leads
       OR NEW.can_receive_paid_pipeline_leads IS DISTINCT FROM OLD.can_receive_paid_pipeline_leads
       OR NEW.can_receive_follow_up_tasks IS DISTINCT FROM OLD.can_receive_follow_up_tasks
       OR NEW.can_receive_payment_recovery_leads IS DISTINCT FROM OLD.can_receive_payment_recovery_leads
       OR NEW.can_receive_media_buyer_cases IS DISTINCT FROM OLD.can_receive_media_buyer_cases
       OR NEW.can_receive_operations_leads IS DISTINCT FROM OLD.can_receive_operations_leads
       OR NEW.include_in_round_robin IS DISTINCT FROM OLD.include_in_round_robin
       OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
       OR NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by
       OR NEW.deactivation_reason IS DISTINCT FROM OLD.deactivation_reason
       OR NEW.department IS DISTINCT FROM OLD.department
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.email IS DISTINCT FROM OLD.email
    THEN
      RAISE EXCEPTION 'Only admins can modify role, status, assignment eligibility, or contact-routing fields on a profile';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
