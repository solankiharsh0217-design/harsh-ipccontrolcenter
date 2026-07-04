
-- Prevent non-admin users from escalating privileges via self-update on profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins bypass this check
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Block changes to sensitive/privilege columns for self-updates by non-admins
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
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
