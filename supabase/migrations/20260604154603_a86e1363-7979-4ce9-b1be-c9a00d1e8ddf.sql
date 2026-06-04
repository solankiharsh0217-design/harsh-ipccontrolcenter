DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
CREATE POLICY notifications_insert_authenticated ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active(auth.uid())
    AND triggered_by_user_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR recipient_user_id = auth.uid())
  );

DROP POLICY IF EXISTS ppfd_read ON public.paid_pipeline_finance_details;
CREATE POLICY ppfd_read ON public.paid_pipeline_finance_details
  FOR SELECT TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.paid_pipeline_leads p
        WHERE p.id = paid_pipeline_finance_details.paid_pipeline_lead_id
          AND (p.created_by = auth.uid() OR p.assigned_sales_executive = auth.uid())
      )
    )
  );