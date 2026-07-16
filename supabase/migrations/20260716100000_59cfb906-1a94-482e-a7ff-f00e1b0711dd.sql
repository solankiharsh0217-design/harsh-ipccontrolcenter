DROP POLICY IF EXISTS coc_requests_select ON public.code_of_conduct_requests;
CREATE POLICY coc_requests_select
ON public.code_of_conduct_requests
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = code_of_conduct_requests.crm_lead_id
      AND l.assigned_agent_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.paid_pipeline_leads p
    WHERE p.id = code_of_conduct_requests.paid_pipeline_lead_id
      AND (p.assigned_sales_executive = auth.uid() OR p.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS mbsp_select_active ON public.media_buyer_service_periods;
CREATE POLICY mbsp_select_scoped
ON public.media_buyer_service_periods
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.media_buyer_cases c
    WHERE c.id = media_buyer_service_periods.case_id
      AND (c.assigned_media_buyer_id = auth.uid() OR c.created_by = auth.uid())
  )
);