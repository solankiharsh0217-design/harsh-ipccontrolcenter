DROP POLICY IF EXISTS coc_requests_update ON public.code_of_conduct_requests;
CREATE POLICY coc_requests_update ON public.code_of_conduct_requests
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR created_by = auth.uid()
  );