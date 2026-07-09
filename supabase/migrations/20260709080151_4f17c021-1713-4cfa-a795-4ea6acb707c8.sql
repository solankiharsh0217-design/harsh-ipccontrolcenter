
-- media_buyer_cases update
DROP POLICY IF EXISTS mbc_update_admin_or_buyer ON public.media_buyer_cases;
CREATE POLICY mbc_update_admin_or_buyer ON public.media_buyer_cases FOR UPDATE
USING (is_active(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR auth.uid() = assigned_media_buyer_id));

-- notification_preferences
DROP POLICY IF EXISTS prefs_select_own_or_admin ON public.notification_preferences;
CREATE POLICY prefs_select_own_or_admin ON public.notification_preferences FOR SELECT
USING (is_active(auth.uid()) AND ((user_id = auth.uid()) OR has_role(auth.uid(),'admin'::app_role)));

DROP POLICY IF EXISTS prefs_modify_own ON public.notification_preferences;
CREATE POLICY prefs_modify_own ON public.notification_preferences FOR INSERT
WITH CHECK (is_active(auth.uid()) AND ((user_id = auth.uid()) OR has_role(auth.uid(),'admin'::app_role)));

DROP POLICY IF EXISTS prefs_update_own ON public.notification_preferences;
CREATE POLICY prefs_update_own ON public.notification_preferences FOR UPDATE
USING (is_active(auth.uid()) AND ((user_id = auth.uid()) OR has_role(auth.uid(),'admin'::app_role)));

DROP POLICY IF EXISTS prefs_delete_own ON public.notification_preferences;
CREATE POLICY prefs_delete_own ON public.notification_preferences FOR DELETE
USING (is_active(auth.uid()) AND ((user_id = auth.uid()) OR has_role(auth.uid(),'admin'::app_role)));

-- tasks
DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT
USING (is_active(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR assigned_to = auth.uid() OR created_by = auth.uid()));

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks FOR INSERT
WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid() AND (has_role(auth.uid(),'admin'::app_role) OR assigned_to = auth.uid()));

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks FOR UPDATE
USING (is_active(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR assigned_to = auth.uid() OR created_by = auth.uid()));

-- user_module_access
DROP POLICY IF EXISTS "Users see own module access" ON public.user_module_access;
CREATE POLICY "Users see own module access" ON public.user_module_access FOR SELECT
USING (is_active(auth.uid()) AND user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own module access" ON public.user_module_access;
CREATE POLICY "Users read own module access" ON public.user_module_access FOR SELECT
USING (has_role(auth.uid(),'admin'::app_role) OR (is_active(auth.uid()) AND user_id = auth.uid()));

-- user_roles
DROP POLICY IF EXISTS "Users see own roles" ON public.user_roles;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT
USING (is_active(auth.uid()) AND user_id = auth.uid());
