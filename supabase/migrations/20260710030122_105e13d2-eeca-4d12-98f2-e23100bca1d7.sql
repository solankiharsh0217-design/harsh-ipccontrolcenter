
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS team_performance_auto_checkin_on_login boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS team_performance_daily_reminder_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_team_performance_settings()
RETURNS TABLE (
  auto_checkin_on_login boolean,
  daily_reminder_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(team_performance_auto_checkin_on_login, false),
    COALESCE(team_performance_daily_reminder_enabled, false)
  FROM public.company_settings
  WHERE workspace = 'default'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_performance_settings() TO authenticated;
