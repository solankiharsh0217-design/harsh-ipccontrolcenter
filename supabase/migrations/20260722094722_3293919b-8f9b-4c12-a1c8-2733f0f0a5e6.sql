
DROP POLICY IF EXISTS coc_requests_select ON public.code_of_conduct_requests;
CREATE POLICY coc_requests_select ON public.code_of_conduct_requests
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.paid_pipeline_leads p
    WHERE p.id = code_of_conduct_requests.paid_pipeline_lead_id
      AND p.created_by = auth.uid()
  )
);
