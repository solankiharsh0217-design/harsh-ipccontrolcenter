
-- Local updated_at helper (idempotent)
CREATE OR REPLACE FUNCTION public.tp_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ─────────── Role catalog ───────────
CREATE TABLE IF NOT EXISTS public.company_role_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT NOT NULL UNIQUE,
  role_label TEXT NOT NULL,
  department TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.company_role_catalog TO authenticated;
GRANT ALL ON public.company_role_catalog TO service_role;
ALTER TABLE public.company_role_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_catalog_read_auth" ON public.company_role_catalog;
CREATE POLICY "role_catalog_read_auth" ON public.company_role_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "role_catalog_admin_write" ON public.company_role_catalog;
CREATE POLICY "role_catalog_admin_write" ON public.company_role_catalog FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "role_catalog_auth_insert" ON public.company_role_catalog;
CREATE POLICY "role_catalog_auth_insert" ON public.company_role_catalog FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.company_role_catalog (role_key, role_label, sort_order) VALUES
('admin_manager','Admin / Manager',10),
('sales_executive','Sales Executive',20),
('media_buyer','Media Buyer',30),
('backend_operations','Backend Operations',40),
('operations','Operations',50),
('finance','Finance',60),
('video_editor','Video Editor',70),
('designer','Designer',80),
('customer_support','Customer Support',90),
('community_manager','Community Manager',100)
ON CONFLICT (role_key) DO NOTHING;

-- ─────────── KPI category catalog ───────────
CREATE TABLE IF NOT EXISTS public.kpi_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key TEXT NOT NULL UNIQUE,
  category_label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.kpi_categories TO authenticated;
GRANT ALL ON public.kpi_categories TO service_role;
ALTER TABLE public.kpi_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kpi_categories_read_auth" ON public.kpi_categories;
CREATE POLICY "kpi_categories_read_auth" ON public.kpi_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "kpi_categories_admin_write" ON public.kpi_categories;
CREATE POLICY "kpi_categories_admin_write" ON public.kpi_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.kpi_categories (category_key, category_label, sort_order) VALUES
('sales','Sales',10),
('follow_ups','Follow-ups',20),
('media_buying','Media Buying',30),
('ads_reporting','Ads Reporting',40),
('operations','Operations',50),
('access_onboarding','Access / Onboarding',60),
('finance','Finance',70),
('editing','Editing',80),
('video_delivery','Video Delivery',90),
('content_production','Content Production',100),
('client_support','Client Support',110),
('quality','Quality',120),
('attendance_discipline','Attendance / Discipline',130),
('daily_reporting','Daily Reporting',140),
('admin_management','Admin / Management',150)
ON CONFLICT (category_key) DO NOTHING;

DROP TRIGGER IF EXISTS role_catalog_touch ON public.company_role_catalog;
CREATE TRIGGER role_catalog_touch BEFORE UPDATE ON public.company_role_catalog
  FOR EACH ROW EXECUTE FUNCTION public.tp_touch_updated_at();
DROP TRIGGER IF EXISTS kpi_categories_touch ON public.kpi_categories;
CREATE TRIGGER kpi_categories_touch BEFORE UPDATE ON public.kpi_categories
  FOR EACH ROW EXECUTE FUNCTION public.tp_touch_updated_at();

-- ─────────── Attendance sessions: active tracking columns ───────────
ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS active_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idle_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activity_source TEXT;

-- ─────────── Company settings: active tracking ───────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS team_performance_active_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS team_performance_active_minutes_daily_target INTEGER NOT NULL DEFAULT 360,
  ADD COLUMN IF NOT EXISTS team_performance_idle_timeout_minutes INTEGER NOT NULL DEFAULT 5;

-- ─────────── Refresh settings function ───────────
DROP FUNCTION IF EXISTS public.get_team_performance_settings();
CREATE FUNCTION public.get_team_performance_settings()
RETURNS TABLE(
  auto_checkin_on_login boolean,
  daily_reminder_enabled boolean,
  reminder_morning_time time,
  reminder_due_soon_minutes integer,
  reminder_overdue_enabled boolean,
  active_tracking_enabled boolean,
  active_minutes_daily_target integer,
  idle_timeout_minutes integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(team_performance_auto_checkin_on_login, false),
    COALESCE(team_performance_daily_reminder_enabled, false),
    COALESCE(team_performance_reminder_morning_time, '10:00'::time),
    COALESCE(team_performance_reminder_due_soon_minutes, 60),
    COALESCE(team_performance_reminder_overdue_enabled, true),
    COALESCE(team_performance_active_tracking_enabled, false),
    COALESCE(team_performance_active_minutes_daily_target, 360),
    COALESCE(team_performance_idle_timeout_minutes, 5)
  FROM public.company_settings WHERE workspace = 'default' LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_team_performance_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_performance_settings() TO authenticated;

-- ─────────── RPC: record active minute ───────────
CREATE OR REPLACE FUNCTION public.record_active_minute()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _enabled boolean;
  _work_date date := (now() AT TIME ZONE 'utc')::date;
  _sess_id uuid;
  _last timestamptz;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  SELECT COALESCE(team_performance_active_tracking_enabled, false)
    INTO _enabled
    FROM public.company_settings WHERE workspace = 'default' LIMIT 1;
  IF NOT COALESCE(_enabled, false) THEN RETURN; END IF;

  SELECT id, last_activity_at INTO _sess_id, _last
    FROM public.attendance_sessions
    WHERE user_id = _uid AND work_date = _work_date
    LIMIT 1;
  IF _sess_id IS NULL THEN RETURN; END IF;

  IF _last IS NULL OR now() - _last >= interval '55 seconds' THEN
    UPDATE public.attendance_sessions
      SET active_minutes = COALESCE(active_minutes, 0) + 1,
          last_activity_at = now(),
          activity_source = 'heartbeat'
      WHERE id = _sess_id;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_active_minute() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_active_minute() TO authenticated;
