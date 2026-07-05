
-- 1) audit_logs: require actor_user_id = auth.uid() (no NULL) for non-admins
DROP POLICY IF EXISTS al_insert ON public.audit_logs;
CREATE POLICY al_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR actor_user_id = auth.uid()
    )
  );

-- 2) code_of_conduct_events: require relation to the request
DROP POLICY IF EXISTS coc_events_insert ON public.code_of_conduct_events;
CREATE POLICY coc_events_insert ON public.code_of_conduct_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR request_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.code_of_conduct_requests r
        LEFT JOIN public.leads l ON l.id = r.crm_lead_id
        WHERE r.id = code_of_conduct_events.request_id
          AND (
            r.created_by = auth.uid()
            OR l.assigned_agent_id = auth.uid()
          )
      )
    )
  );

-- 3) notifications: restrict INSERT to admins only (server/edge functions use service_role which bypasses RLS)
DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
CREATE POLICY notifications_insert_admin ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) task_activity: restrict INSERT to task assignee, creator, or admin
DROP POLICY IF EXISTS task_activity_insert ON public.task_activity;
CREATE POLICY task_activity_insert ON public.task_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_activity.task_id
          AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
      )
    )
  );
