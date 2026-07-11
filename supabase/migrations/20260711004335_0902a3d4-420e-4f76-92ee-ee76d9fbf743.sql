
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS team_performance_reminder_morning_time time NOT NULL DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS team_performance_reminder_due_soon_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS team_performance_reminder_overdue_enabled boolean NOT NULL DEFAULT true;

DROP FUNCTION IF EXISTS public.get_team_performance_settings();
CREATE FUNCTION public.get_team_performance_settings()
RETURNS TABLE (
  auto_checkin_on_login boolean,
  daily_reminder_enabled boolean,
  reminder_morning_time time,
  reminder_due_soon_minutes integer,
  reminder_overdue_enabled boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(team_performance_auto_checkin_on_login, false),
    COALESCE(team_performance_daily_reminder_enabled, false),
    COALESCE(team_performance_reminder_morning_time, '10:00'::time),
    COALESCE(team_performance_reminder_due_soon_minutes, 60),
    COALESCE(team_performance_reminder_overdue_enabled, true)
  FROM public.company_settings WHERE workspace = 'default' LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_team_performance_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_performance_settings() TO authenticated;

CREATE TABLE IF NOT EXISTS public.team_performance_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kpi_entry_id uuid REFERENCES public.kpi_entries(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('morning_summary','due_soon','overdue','rejected_feedback')),
  title text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','dismissed')),
  reminder_for_date date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_performance_reminders TO authenticated;
GRANT ALL ON public.team_performance_reminders TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS tpr_uniq_kpi
  ON public.team_performance_reminders (user_id, kpi_entry_id, reminder_type, reminder_for_date)
  WHERE kpi_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tpr_uniq_summary
  ON public.team_performance_reminders (user_id, reminder_type, reminder_for_date)
  WHERE kpi_entry_id IS NULL;
CREATE INDEX IF NOT EXISTS tpr_user_status_date
  ON public.team_performance_reminders (user_id, status, reminder_for_date DESC);

ALTER TABLE public.team_performance_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tpr_select_own ON public.team_performance_reminders
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY tpr_select_admin ON public.team_performance_reminders
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY tpr_update_own ON public.team_performance_reminders
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY tpr_admin_all ON public.team_performance_reminders
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.tpr_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS tpr_touch_updated ON public.team_performance_reminders;
CREATE TRIGGER tpr_touch_updated BEFORE UPDATE ON public.team_performance_reminders
  FOR EACH ROW EXECUTE FUNCTION public.tpr_touch_updated_at();

CREATE OR REPLACE FUNCTION public.generate_tp_reminders_for_user(_user_id uuid, _target_date date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_enabled boolean;
  s_due_soon int;
  s_overdue_on boolean;
  v_pending int;
  v_created int := 0;
  v_dupes int := 0;
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
  r record;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT has_role(v_caller, 'admin'::app_role) INTO v_is_admin;
  IF v_caller <> _user_id AND NOT v_is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COALESCE(team_performance_daily_reminder_enabled, false),
         COALESCE(team_performance_reminder_due_soon_minutes, 60),
         COALESCE(team_performance_reminder_overdue_enabled, true)
    INTO s_enabled, s_due_soon, s_overdue_on
    FROM public.company_settings WHERE workspace = 'default' LIMIT 1;

  IF NOT s_enabled THEN
    RETURN jsonb_build_object('created',0,'skipped_duplicates',0,'skipped_disabled',true);
  END IF;

  SELECT count(*) INTO v_pending FROM public.kpi_entries e
    WHERE e.user_id = _user_id AND e.status = 'pending'
      AND _target_date BETWEEN e.period_start AND e.period_end;

  IF v_pending > 0 THEN
    BEGIN
      INSERT INTO public.team_performance_reminders(user_id, reminder_type, title, message, reminder_for_date)
      VALUES (_user_id, 'morning_summary', 'Today''s KPIs',
              'You have ' || v_pending || ' KPI' || CASE WHEN v_pending=1 THEN '' ELSE 's' END || ' due today.',
              _target_date);
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN v_dupes := v_dupes + 1; END;
  END IF;

  FOR r IN
    SELECT e.id, k.name FROM public.kpi_entries e
    JOIN public.kpi_definitions k ON k.id = e.kpi_id
    WHERE e.user_id = _user_id AND e.status = 'pending'
      AND e.due_at IS NOT NULL AND e.due_at > now()
      AND e.due_at <= now() + make_interval(mins => s_due_soon)
      AND _target_date BETWEEN e.period_start AND e.period_end
  LOOP
    BEGIN
      INSERT INTO public.team_performance_reminders(user_id, kpi_entry_id, reminder_type, title, message, reminder_for_date)
      VALUES (_user_id, r.id, 'due_soon', 'KPI due soon', 'KPI due soon: ' || r.name, _target_date);
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN v_dupes := v_dupes + 1; END;
  END LOOP;

  IF s_overdue_on THEN
    FOR r IN
      SELECT e.id, k.name FROM public.kpi_entries e
      JOIN public.kpi_definitions k ON k.id = e.kpi_id
      WHERE e.user_id = _user_id AND e.status = 'pending'
        AND e.due_at IS NOT NULL AND e.due_at < now()
    LOOP
      BEGIN
        INSERT INTO public.team_performance_reminders(user_id, kpi_entry_id, reminder_type, title, message, reminder_for_date)
        VALUES (_user_id, r.id, 'overdue', 'KPI overdue', 'KPI overdue: ' || r.name, _target_date);
        v_created := v_created + 1;
      EXCEPTION WHEN unique_violation THEN v_dupes := v_dupes + 1; END;
    END LOOP;
  END IF;

  FOR r IN
    SELECT e.id, k.name FROM public.kpi_entries e
    JOIN public.kpi_definitions k ON k.id = e.kpi_id
    WHERE e.user_id = _user_id AND e.status = 'rejected'
      AND EXISTS (
        SELECT 1 FROM public.kpi_submissions s
        WHERE s.entry_id = e.id AND s.reviewed_at IS NOT NULL
          AND s.reviewed_at::date = _target_date
      )
  LOOP
    BEGIN
      INSERT INTO public.team_performance_reminders(user_id, kpi_entry_id, reminder_type, title, message, reminder_for_date)
      VALUES (_user_id, r.id, 'rejected_feedback', 'KPI rejected', 'KPI rejected: ' || r.name || '. Please check feedback.', _target_date);
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN v_dupes := v_dupes + 1; END;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped_duplicates', v_dupes, 'skipped_disabled', false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_tp_reminders_for_user(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_tp_reminders_for_user(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_tp_reminders_for_date(_target_date date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_enabled boolean;
  r record;
  total_created int := 0;
  total_dupes int := 0;
  users_checked int := 0;
  res jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin only'; END IF;

  SELECT COALESCE(team_performance_daily_reminder_enabled, false) INTO s_enabled
    FROM public.company_settings WHERE workspace = 'default' LIMIT 1;
  IF NOT s_enabled THEN
    RETURN jsonb_build_object('users_checked',0,'created',0,'skipped_duplicates',0,'skipped_disabled',true);
  END IF;

  FOR r IN
    SELECT DISTINCT user_id FROM public.kpi_entries
     WHERE (status = 'pending' AND _target_date BETWEEN period_start AND period_end)
        OR (status = 'rejected')
  LOOP
    users_checked := users_checked + 1;
    res := public.generate_tp_reminders_for_user(r.user_id, _target_date);
    total_created := total_created + COALESCE((res->>'created')::int, 0);
    total_dupes := total_dupes + COALESCE((res->>'skipped_duplicates')::int, 0);
  END LOOP;

  RETURN jsonb_build_object('users_checked', users_checked, 'created', total_created, 'skipped_duplicates', total_dupes, 'skipped_disabled', false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_tp_reminders_for_date(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_tp_reminders_for_date(date) TO authenticated;
