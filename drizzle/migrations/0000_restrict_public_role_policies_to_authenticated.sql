-- media_buyer_case_emails: SELECT + UPDATE scoped to public -> authenticated
DROP POLICY IF EXISTS mbcm_select_active ON public.media_buyer_case_emails;
CREATE POLICY mbcm_select_active ON public.media_buyer_case_emails
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.media_buyer_cases c
      WHERE c.id = media_buyer_case_emails.case_id
        AND (c.assigned_media_buyer_id = auth.uid() OR c.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS mbcm_update_active ON public.media_buyer_case_emails;
CREATE POLICY mbcm_update_active ON public.media_buyer_case_emails
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.media_buyer_cases c
      WHERE c.id = media_buyer_case_emails.case_id
        AND (c.assigned_media_buyer_id = auth.uid() OR c.created_by = auth.uid())
    )
  );

-- offline_seminar_reports: all four CRUD policies scoped to public -> authenticated
DROP POLICY IF EXISTS "Active users can view offline seminar reports" ON public.offline_seminar_reports;
CREATE POLICY "Active users can view offline seminar reports" ON public.offline_seminar_reports
  FOR SELECT TO authenticated USING (is_active(auth.uid()));

DROP POLICY IF EXISTS "Active users can create offline seminar reports" ON public.offline_seminar_reports;
CREATE POLICY "Active users can create offline seminar reports" ON public.offline_seminar_reports
  FOR INSERT TO authenticated WITH CHECK (is_active(auth.uid()));

DROP POLICY IF EXISTS "Active users can update offline seminar reports" ON public.offline_seminar_reports;
CREATE POLICY "Active users can update offline seminar reports" ON public.offline_seminar_reports
  FOR UPDATE TO authenticated USING (is_active(auth.uid()));

DROP POLICY IF EXISTS "Active users can delete offline seminar reports" ON public.offline_seminar_reports;
CREATE POLICY "Active users can delete offline seminar reports" ON public.offline_seminar_reports
  FOR DELETE TO authenticated USING (is_active(auth.uid()));

-- tasks: insert/select/update scoped to public -> authenticated
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    is_active(auth.uid())
    AND created_by = auth.uid()
    AND (has_role(auth.uid(), 'admin'::app_role) OR assigned_to = auth.uid())
  );

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (
    is_active(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR assigned_to = auth.uid() OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    is_active(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR assigned_to = auth.uid() OR created_by = auth.uid())
  );

-- task_submissions: all policies scoped to public -> authenticated
DROP POLICY IF EXISTS task_submissions_insert ON public.task_submissions;
CREATE POLICY task_submissions_insert ON public.task_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_submissions.task_id
        AND (has_role(auth.uid(), 'admin'::app_role) OR t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS task_submissions_select ON public.task_submissions;
CREATE POLICY task_submissions_select ON public.task_submissions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_submissions.task_id
        AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS task_submissions_update_own ON public.task_submissions;
CREATE POLICY task_submissions_update_own ON public.task_submissions
  FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS task_submissions_delete_admin ON public.task_submissions;
CREATE POLICY task_submissions_delete_admin ON public.task_submissions
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- user_module_access: SELECT policies scoped to public -> authenticated
DROP POLICY IF EXISTS "Users read own module access" ON public.user_module_access;
CREATE POLICY "Users read own module access" ON public.user_module_access
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR (is_active(auth.uid()) AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Users see own module access" ON public.user_module_access;
CREATE POLICY "Users see own module access" ON public.user_module_access
  FOR SELECT TO authenticated
  USING (is_active(auth.uid()) AND user_id = auth.uid());