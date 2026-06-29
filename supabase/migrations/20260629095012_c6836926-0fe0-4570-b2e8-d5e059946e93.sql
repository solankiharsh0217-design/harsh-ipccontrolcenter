DROP POLICY IF EXISTS ppp_insert ON public.paid_pipeline_payments;

CREATE POLICY ppp_insert ON public.paid_pipeline_payments
FOR INSERT TO authenticated
WITH CHECK (
  is_active(auth.uid())
  AND created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.paid_pipeline_leads l WHERE l.id = paid_pipeline_payments.paid_pipeline_lead_id)
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_module_access(auth.uid(), 'paid_pipeline'::text)
    OR has_module_access(auth.uid(), 'payment_recovery'::text)
    OR EXISTS (
      SELECT 1 FROM public.paid_pipeline_leads l
      WHERE l.id = paid_pipeline_payments.paid_pipeline_lead_id
        AND (
          l.created_by = auth.uid()
          OR l.assigned_sales_executive = auth.uid()
          OR l.finance_owner = auth.uid()::text
        )
    )
  )
);