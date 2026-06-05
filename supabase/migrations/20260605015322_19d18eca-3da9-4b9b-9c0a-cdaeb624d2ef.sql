DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;

CREATE POLICY notifications_insert_authenticated
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_active(auth.uid())
  AND triggered_by_user_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
  AND recipient_user_id <> auth.uid()
);