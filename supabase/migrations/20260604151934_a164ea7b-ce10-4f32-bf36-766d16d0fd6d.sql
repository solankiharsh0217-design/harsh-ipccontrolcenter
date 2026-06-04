
-- follow_up_reminders SELECT
DROP POLICY IF EXISTS "members read reminders" ON public.follow_up_reminders;
CREATE POLICY "scoped read reminders" ON public.follow_up_reminders FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR agent_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = follow_up_reminders.lead_id AND l.assigned_agent_id = auth.uid())
);

-- lead_notes SELECT
DROP POLICY IF EXISTS "active users can read lead notes" ON public.lead_notes;
CREATE POLICY "scoped read lead notes" ON public.lead_notes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_notes.lead_id AND l.assigned_agent_id = auth.uid())
  OR (paid_pipeline_lead_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.paid_pipeline_leads p
    WHERE p.id = lead_notes.paid_pipeline_lead_id
      AND (p.created_by = auth.uid() OR p.assigned_sales_executive = auth.uid())
  ))
);

-- paid_pipeline_followups SELECT
DROP POLICY IF EXISTS "ppfu_read" ON public.paid_pipeline_followups;
CREATE POLICY "ppfu_read" ON public.paid_pipeline_followups FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.paid_pipeline_leads p
             WHERE p.id = paid_pipeline_followups.paid_pipeline_lead_id
               AND (p.created_by = auth.uid() OR p.assigned_sales_executive = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.leads l
             WHERE l.id = paid_pipeline_followups.related_crm_lead_id
               AND l.assigned_agent_id = auth.uid())
);

-- paid_pipeline_payments SELECT
DROP POLICY IF EXISTS "ppp_read" ON public.paid_pipeline_payments;
CREATE POLICY "ppp_read" ON public.paid_pipeline_payments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.paid_pipeline_leads p
             WHERE p.id = paid_pipeline_payments.paid_pipeline_lead_id
               AND (p.created_by = auth.uid() OR p.assigned_sales_executive = auth.uid()))
);

-- paid_pipeline_finance_details SELECT
DROP POLICY IF EXISTS "ppfd_read" ON public.paid_pipeline_finance_details;
CREATE POLICY "ppfd_read" ON public.paid_pipeline_finance_details FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.paid_pipeline_leads p
             WHERE p.id = paid_pipeline_finance_details.paid_pipeline_lead_id
               AND (p.created_by = auth.uid() OR p.assigned_sales_executive = auth.uid()))
);
