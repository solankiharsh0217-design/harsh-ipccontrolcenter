
-- attribution_sales_detail: restrict reads to session owner + admin
DROP POLICY IF EXISTS asd_read ON public.attribution_sales_detail;
CREATE POLICY asd_read ON public.attribution_sales_detail
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.attribution_sessions s
    WHERE s.id = attribution_sales_detail.session_id
      AND s.created_by = auth.uid()
  )
);

-- leads: agents only see their own/unassigned
DROP POLICY IF EXISTS "members read leads" ON public.leads;
CREATE POLICY "members read leads" ON public.leads
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (is_active(auth.uid()) AND (assigned_agent_id = auth.uid() OR assigned_agent_id IS NULL))
);

-- media_buyer_cases: only admin, creator, assignee
DROP POLICY IF EXISTS mbc_select_active ON public.media_buyer_cases;
CREATE POLICY mbc_select_active ON public.media_buyer_cases
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = assigned_media_buyer_id
  OR auth.uid() = created_by
);

-- media_buyer_case_emails: only admin or assigned buyer of the parent case
DROP POLICY IF EXISTS mbcm_select_active ON public.media_buyer_case_emails;
CREATE POLICY mbcm_select_active ON public.media_buyer_case_emails
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.media_buyer_cases c
    WHERE c.id = media_buyer_case_emails.case_id
      AND (c.assigned_media_buyer_id = auth.uid() OR c.created_by = auth.uid())
  )
);
DROP POLICY IF EXISTS mbcm_update_active ON public.media_buyer_case_emails;
CREATE POLICY mbcm_update_active ON public.media_buyer_case_emails
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.media_buyer_cases c
    WHERE c.id = media_buyer_case_emails.case_id
      AND (c.assigned_media_buyer_id = auth.uid() OR c.created_by = auth.uid())
  )
);

-- paid_pipeline_leads: restrict reads
DROP POLICY IF EXISTS ppl_read ON public.paid_pipeline_leads;
CREATE POLICY ppl_read ON public.paid_pipeline_leads
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR assigned_sales_executive = auth.uid()
);

-- roas_enrollments: admin only
DROP POLICY IF EXISTS roas_enr_read ON public.roas_enrollments;
CREATE POLICY roas_enr_read ON public.roas_enrollments
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- roas_leads: admin only
DROP POLICY IF EXISTS roas_leads_read ON public.roas_leads;
CREATE POLICY roas_leads_read ON public.roas_leads
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- students: admin only (search_students RPC is SECURITY DEFINER and still works)
DROP POLICY IF EXISTS "Active members read students" ON public.students;
CREATE POLICY "Admins read students" ON public.students
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- audit_logs: prevent forging actor identity on insert
DROP POLICY IF EXISTS al_insert ON public.audit_logs;
CREATE POLICY al_insert ON public.audit_logs
FOR INSERT WITH CHECK (
  is_active(auth.uid())
  AND (actor_user_id IS NULL OR actor_user_id = auth.uid())
);

-- notifications: prevent spoofing triggered_by_user_id
DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
CREATE POLICY notifications_insert_authenticated ON public.notifications
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR triggered_by_user_id IS NULL
  OR triggered_by_user_id = auth.uid()
);

-- user_module_access: users see only their own grants
DROP POLICY IF EXISTS "Active members read all module access" ON public.user_module_access;
CREATE POLICY "Users read own module access" ON public.user_module_access
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
);
