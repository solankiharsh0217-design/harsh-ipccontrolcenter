-- 1) invoice_events: move is_active() to top-level AND for defense-in-depth
DROP POLICY IF EXISTS invoice_events_select ON public.invoice_events;
CREATE POLICY invoice_events_select ON public.invoice_events
  FOR SELECT TO authenticated
  USING (
    public.is_active(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_events.invoice_id
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR i.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.paid_pipeline_leads p
            WHERE p.id = i.paid_pipeline_lead_id
              AND p.assigned_sales_executive = auth.uid()
          )
        )
    )
  );

-- 2) operations_result_reward_rules: require is_active
DROP POLICY IF EXISTS "Authenticated read active reward rules" ON public.operations_result_reward_rules;
CREATE POLICY "Active users read reward rules"
  ON public.operations_result_reward_rules
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

-- 3) task_activity: restrict SELECT to admin, task creator, or assignee
DROP POLICY IF EXISTS task_activity_select ON public.task_activity;
CREATE POLICY task_activity_select ON public.task_activity
  FOR SELECT TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_activity.task_id
          AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
      )
    )
  );