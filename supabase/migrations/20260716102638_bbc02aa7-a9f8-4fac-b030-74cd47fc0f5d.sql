-- Tighten kpi_categories read to active users
DROP POLICY IF EXISTS kpi_categories_read_auth ON public.kpi_categories;
CREATE POLICY kpi_categories_read_auth ON public.kpi_categories
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

-- Tighten company_role_catalog read to active users
DROP POLICY IF EXISTS role_catalog_read_auth ON public.company_role_catalog;
CREATE POLICY role_catalog_read_auth ON public.company_role_catalog
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

-- Align notifications insert with documented rule:
-- admins may insert anything; non-admins may insert only when they are the triggering user.
DROP POLICY IF EXISTS notifications_insert_admin ON public.notifications;
CREATE POLICY notifications_insert_auth ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR triggered_by_user_id = auth.uid()
  );