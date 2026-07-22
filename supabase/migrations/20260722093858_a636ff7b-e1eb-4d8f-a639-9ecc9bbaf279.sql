
DROP POLICY IF EXISTS roas_enr_read ON public.roas_enrollments;
CREATE POLICY roas_enr_read ON public.roas_enrollments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS roas_leads_read ON public.roas_leads;
CREATE POLICY roas_leads_read ON public.roas_leads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read students" ON public.students;
CREATE POLICY "Admins read students" ON public.students FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
