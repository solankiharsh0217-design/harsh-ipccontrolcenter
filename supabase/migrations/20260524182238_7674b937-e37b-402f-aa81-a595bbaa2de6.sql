
-- Restrict audit_logs insert to authenticated users only
DROP POLICY IF EXISTS al_insert ON public.audit_logs;
CREATE POLICY al_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND (actor_user_id IS NULL OR actor_user_id = auth.uid()));

-- Add is_active check to notifications insert
DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
CREATE POLICY notifications_insert_authenticated ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    is_active(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR triggered_by_user_id = auth.uid())
  );

-- Restrict roas_enrollments updates to admins only (covered by roas_enr_admin already)
DROP POLICY IF EXISTS roas_enr_member_update ON public.roas_enrollments;
