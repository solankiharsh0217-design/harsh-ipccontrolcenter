DROP POLICY IF EXISTS coc_auto_rules_read_auth ON public.code_of_conduct_automation_rules;
CREATE POLICY coc_auto_rules_read_auth ON public.code_of_conduct_automation_rules
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));

DROP POLICY IF EXISTS mbc_insert_admin_or_assignee ON public.media_buyer_cases;
CREATE POLICY mbc_insert_admin_or_assignee ON public.media_buyer_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR auth.uid() = created_by)
  );