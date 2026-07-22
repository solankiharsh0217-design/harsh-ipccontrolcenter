
-- Restrict pipeline structural changes to admins
DROP POLICY IF EXISTS "members manage pipelines" ON public.pipelines;
DROP POLICY IF EXISTS "members update pipelines" ON public.pipelines;

-- Restrict stage structural writes to admins (SELECT still open to active members)
DROP POLICY IF EXISTS "members manage stages" ON public.stages;
DROP POLICY IF EXISTS "members delete stages" ON public.stages;

-- Notifications: prevent impersonation / targeting arbitrary users
DROP POLICY IF EXISTS notifications_insert_auth ON public.notifications;
CREATE POLICY notifications_insert_auth ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      triggered_by_user_id = auth.uid()
      AND (recipient_user_id IS NULL OR recipient_user_id = auth.uid())
    )
  );
