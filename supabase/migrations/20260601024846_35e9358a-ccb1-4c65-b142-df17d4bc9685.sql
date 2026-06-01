DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;

CREATE POLICY notifications_insert_authenticated ON public.notifications
FOR INSERT
WITH CHECK (
  is_active(auth.uid())
  AND triggered_by_user_id = auth.uid()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR recipient_user_id = auth.uid()
  )
);