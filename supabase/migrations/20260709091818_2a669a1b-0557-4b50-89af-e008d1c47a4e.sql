
-- Allow authenticated active users to insert/update their own attendance_sessions
CREATE POLICY "attendance_sessions insert own"
ON public.attendance_sessions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_active(auth.uid()));

CREATE POLICY "attendance_sessions update own"
ON public.attendance_sessions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND public.is_active(auth.uid()))
WITH CHECK (user_id = auth.uid());

-- Unique attendance row per user per work_date (idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_user_workdate_key
  ON public.attendance_sessions(user_id, work_date);

-- SECURITY DEFINER function so a non-admin can generate their own KPI entries for today
CREATE OR REPLACE FUNCTION public.generate_my_kpi_entries_for_date(_target_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  a record;
  it record;
  kpi record;
  v_period_start date;
  v_period_end date;
  v_due_at timestamptz;
  v_target numeric;
  v_created int := 0;
  v_skipped int := 0;
  v_unsupported int := 0;
  v_dow int;
  v_dom int;
  v_maxdom int;
  v_due_day date;
  v_time time;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_active(v_uid) THEN RAISE EXCEPTION 'not authorized'; END IF;

  FOR a IN
    SELECT * FROM public.kpi_assignments
    WHERE user_id = v_uid
      AND is_active = true
      AND (start_date IS NULL OR start_date <= _target_date)
      AND (end_date IS NULL OR end_date >= _target_date)
  LOOP
    -- Build KPI list based on assignment_type
    FOR it IN
      SELECT k.*, NULL::numeric AS target_override
      FROM public.kpi_definitions k
      WHERE a.assignment_type = 'individual' AND a.kpi_id IS NOT NULL AND k.id = a.kpi_id AND k.is_active = true
      UNION ALL
      SELECT k.*, ti.target_override
      FROM public.kpi_template_items ti
      JOIN public.kpi_definitions k ON k.id = ti.kpi_id
      WHERE a.assignment_type = 'template' AND a.template_id IS NOT NULL AND ti.template_id = a.template_id AND k.is_active = true
    LOOP
      kpi := it;
      v_time := kpi.due_time;

      IF kpi.cadence = 'daily' OR (kpi.cadence = 'recurring' AND (kpi.recurrence_rule IS NULL OR kpi.recurrence_rule = '' OR lower(kpi.recurrence_rule) = 'daily')) THEN
        v_period_start := _target_date;
        v_period_end := _target_date;
        v_due_day := _target_date;
      ELSIF kpi.cadence = 'weekly' THEN
        v_period_start := date_trunc('week', _target_date)::date; -- Monday
        v_period_end := v_period_start + 6;
        v_dow := COALESCE(kpi.due_day_of_week, 7);
        v_due_day := v_period_start + (LEAST(GREATEST(v_dow,1),7) - 1);
      ELSIF kpi.cadence = 'monthly' THEN
        v_period_start := date_trunc('month', _target_date)::date;
        v_period_end := (v_period_start + interval '1 month - 1 day')::date;
        v_maxdom := EXTRACT(DAY FROM v_period_end)::int;
        v_dom := COALESCE(kpi.due_day_of_month, v_maxdom);
        v_due_day := v_period_start + (LEAST(v_dom, v_maxdom) - 1);
      ELSE
        v_unsupported := v_unsupported + 1;
        CONTINUE;
      END IF;

      IF v_time IS NOT NULL THEN
        v_due_at := (v_due_day::timestamp + v_time)::timestamptz;
      ELSE
        v_due_at := NULL;
      END IF;

      v_target := COALESCE(a.custom_target, it.target_override, kpi.target_default);

      BEGIN
        INSERT INTO public.kpi_entries (assignment_id, user_id, kpi_id, period_type, period_start, period_end, due_at, target_value, status)
        VALUES (a.id, v_uid, kpi.id, kpi.cadence, v_period_start, v_period_end, v_due_at, v_target, 'pending');
        v_created := v_created + 1;
      EXCEPTION WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped_duplicates', v_skipped, 'unsupported', v_unsupported, 'target_date', _target_date);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_my_kpi_entries_for_date(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_my_kpi_entries_for_date(date) TO authenticated;
