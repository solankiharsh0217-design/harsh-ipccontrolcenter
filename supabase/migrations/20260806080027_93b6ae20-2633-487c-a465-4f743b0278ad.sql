DROP POLICY IF EXISTS "roas_attrlog_member_insert" ON public.roas_attribution_logs;
CREATE POLICY "roas_attrlog_member_insert" ON public.roas_attribution_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.is_active(auth.uid())
  AND changed_by = auth.uid()
  AND enrollment_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.roas_enrollments e WHERE e.id = enrollment_id)
);