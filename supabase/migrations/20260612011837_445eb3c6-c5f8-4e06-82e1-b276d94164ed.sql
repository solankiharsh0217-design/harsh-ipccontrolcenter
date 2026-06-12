-- Tighten paid_pipeline_followups UPDATE to ownership/assignment
DROP POLICY IF EXISTS ppfu_update ON public.paid_pipeline_followups;
CREATE POLICY ppfu_update ON public.paid_pipeline_followups
  FOR UPDATE TO authenticated
  USING (
    public.is_active(auth.uid()) AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.paid_pipeline_leads p
        WHERE p.id = paid_pipeline_followups.paid_pipeline_lead_id
          AND (p.created_by = auth.uid() OR p.assigned_sales_executive = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = paid_pipeline_followups.related_crm_lead_id
          AND l.assigned_agent_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_active(auth.uid()) AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.paid_pipeline_leads p
        WHERE p.id = paid_pipeline_followups.paid_pipeline_lead_id
          AND (p.created_by = auth.uid() OR p.assigned_sales_executive = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = paid_pipeline_followups.related_crm_lead_id
          AND l.assigned_agent_id = auth.uid()
      )
    )
  );

-- Tighten paid_pipeline_payments UPDATE WITH CHECK so the target lead stays owned by the user
DROP POLICY IF EXISTS ppp_update ON public.paid_pipeline_payments;
CREATE POLICY ppp_update ON public.paid_pipeline_payments
  FOR UPDATE TO authenticated
  USING (
    public.is_active(auth.uid()) AND (
      created_by = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_active(auth.uid()) AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (
        created_by = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.paid_pipeline_leads l
          WHERE l.id = paid_pipeline_payments.paid_pipeline_lead_id
            AND (l.created_by = auth.uid() OR l.assigned_sales_executive = auth.uid())
        )
      )
    )
  );