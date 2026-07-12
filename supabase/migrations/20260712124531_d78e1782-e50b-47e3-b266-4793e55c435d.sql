
-- 1) invoice_events INSERT: scope to admin OR invoice ownership/assignment
DROP POLICY IF EXISTS invoice_events_insert ON public.invoice_events;
CREATE POLICY invoice_events_insert ON public.invoice_events
FOR INSERT TO authenticated
WITH CHECK (
  is_active(auth.uid())
  AND ((created_by IS NULL) OR (created_by = auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_events.invoice_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR i.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.paid_pipeline_leads p
          WHERE p.id = i.paid_pipeline_lead_id
            AND p.assigned_sales_executive = auth.uid()
        )
      )
  )
);

-- 2) profiles self-update: defense-in-depth WITH CHECK preserving sensitive fields
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles old
      WHERE old.id = profiles.id
        AND (
          old.role IS DISTINCT FROM profiles.role
          OR old.status IS DISTINCT FROM profiles.status
          OR old.email IS DISTINCT FROM profiles.email
          OR old.department IS DISTINCT FROM profiles.department
          OR old.active_for_assignment IS DISTINCT FROM profiles.active_for_assignment
          OR old.can_receive_calling_crm_leads IS DISTINCT FROM profiles.can_receive_calling_crm_leads
          OR old.can_receive_paid_pipeline_leads IS DISTINCT FROM profiles.can_receive_paid_pipeline_leads
          OR old.can_receive_operations_leads IS DISTINCT FROM profiles.can_receive_operations_leads
          OR old.can_receive_follow_up_tasks IS DISTINCT FROM profiles.can_receive_follow_up_tasks
          OR old.can_receive_payment_recovery_leads IS DISTINCT FROM profiles.can_receive_payment_recovery_leads
          OR old.can_receive_media_buyer_cases IS DISTINCT FROM profiles.can_receive_media_buyer_cases
          OR old.include_in_round_robin IS DISTINCT FROM profiles.include_in_round_robin
          OR old.deactivated_at IS DISTINCT FROM profiles.deactivated_at
          OR old.deactivated_by IS DISTINCT FROM profiles.deactivated_by
          OR old.deactivation_reason IS DISTINCT FROM profiles.deactivation_reason
        )
    )
  )
);

-- 3) roas_ad_spends INSERT: require entered_by = auth.uid() (or admin)
DROP POLICY IF EXISTS roas_spend_insert ON public.roas_ad_spends;
CREATE POLICY roas_spend_insert ON public.roas_ad_spends
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (is_active(auth.uid()) AND entered_by = auth.uid())
);
