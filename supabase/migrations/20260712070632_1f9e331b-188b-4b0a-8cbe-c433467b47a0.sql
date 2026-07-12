
-- === Fix: profiles self-update privilege escalation ===
-- Prevent non-admins from changing sensitive columns on their own profile row.
CREATE OR REPLACE FUNCTION public.prevent_profile_self_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins may change anything
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  -- For self-updates, block changes to sensitive/permission-bearing columns
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
$$;

DROP TRIGGER IF EXISTS trg_profiles_prevent_self_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_prevent_self_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_self_privilege_escalation();

-- === Fix: media_buyer_service_periods update ownership ===
DROP POLICY IF EXISTS mbsp_update_active ON public.media_buyer_service_periods;
CREATE POLICY mbsp_update_active ON public.media_buyer_service_periods
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.media_buyer_cases c
    WHERE c.id = media_buyer_service_periods.case_id
      AND (c.assigned_media_buyer_id = auth.uid() OR c.created_by = auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.media_buyer_cases c
    WHERE c.id = media_buyer_service_periods.case_id
      AND (c.assigned_media_buyer_id = auth.uid() OR c.created_by = auth.uid())
  )
);

-- === Fix: operations_lead_checklist_state write ownership ===
DROP POLICY IF EXISTS ops_lcs_write ON public.operations_lead_checklist_state;
CREATE POLICY ops_lcs_write ON public.operations_lead_checklist_state
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.operations_leads ol
    WHERE ol.id = operations_lead_checklist_state.operations_lead_id
      AND (ol.assigned_media_buyer_id = auth.uid() OR ol.created_by = auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.operations_leads ol
    WHERE ol.id = operations_lead_checklist_state.operations_lead_id
      AND (ol.assigned_media_buyer_id = auth.uid() OR ol.created_by = auth.uid())
  )
);

-- === Fix: operations_lead_custom_values write ownership ===
DROP POLICY IF EXISTS ops_lcv_write ON public.operations_lead_custom_values;
CREATE POLICY ops_lcv_write ON public.operations_lead_custom_values
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.operations_leads ol
    WHERE ol.id = operations_lead_custom_values.operations_lead_id
      AND (ol.assigned_media_buyer_id = auth.uid() OR ol.created_by = auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.operations_leads ol
    WHERE ol.id = operations_lead_custom_values.operations_lead_id
      AND (ol.assigned_media_buyer_id = auth.uid() OR ol.created_by = auth.uid())
  )
);

-- === Fix: paid_pipeline_batches update ownership ===
DROP POLICY IF EXISTS ppb_update ON public.paid_pipeline_batches;
CREATE POLICY ppb_update ON public.paid_pipeline_batches
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR created_by = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR created_by = auth.uid()
);

-- === Fix: pipelines update — admins or creator only ===
DROP POLICY IF EXISTS "members update pipelines" ON public.pipelines;
CREATE POLICY "members update pipelines" ON public.pipelines
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR created_by = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR created_by = auth.uid()
);

-- === Fix: stages update — admins only (structural config) ===
DROP POLICY IF EXISTS "members update stages" ON public.stages;
CREATE POLICY "admins update stages" ON public.stages
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
