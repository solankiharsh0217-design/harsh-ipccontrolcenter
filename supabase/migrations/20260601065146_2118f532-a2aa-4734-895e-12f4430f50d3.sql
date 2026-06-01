
-- Phase 1: Attendance Intelligence — add cumulative rollup fields + grade by cumulative %
ALTER TABLE public.lead_hotness_scores
  ADD COLUMN IF NOT EXISTS total_possible_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cumulative_attendance_percentage numeric(5,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recalculate_lead_hotness(_lead_id uuid)
 RETURNS lead_hotness_scores
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_sessions int := 0; v_total_webinars int := 0;
  v_total_minutes int := 0; v_total_possible int := 0;
  v_avg_pct numeric(5,2) := 0; v_max_pct numeric(5,2) := 0;
  v_cum_pct numeric(5,2) := 0;
  v_last_at timestamptz := NULL;
  v_score int := 0; v_grade text := 'inactive';
  v_existing public.lead_hotness_scores%ROWTYPE; v_old_grade text := 'inactive';
  v_reason jsonb := '{}'::jsonb;
  v_row public.lead_hotness_scores%ROWTYPE;
BEGIN
  SELECT count(*),
         count(DISTINCT coalesce(webinar_id, webinar_name, id::text)),
         coalesce(sum(attended_minutes_capped),0),
         coalesce(sum(session_duration_minutes),0),
         coalesce(round(avg(nullif(attendance_percentage,0))::numeric,2),0),
         coalesce(max(attendance_percentage),0),
         max(coalesce(last_left_at, first_joined_at, created_at))
  INTO v_total_sessions, v_total_webinars, v_total_minutes, v_total_possible,
       v_avg_pct, v_max_pct, v_last_at
  FROM public.lead_session_attendance WHERE lead_id = _lead_id;

  IF v_total_possible > 0 THEN
    v_cum_pct := round((v_total_minutes::numeric / v_total_possible::numeric) * 100, 2);
  ELSE
    v_cum_pct := 0;
  END IF;

  v_score := round(v_cum_pct)::int;

  -- Spec grade rules based on cumulative %:
  v_grade := CASE
    WHEN v_cum_pct >= 70 THEN 'super_hot'
    WHEN v_cum_pct >= 50 THEN 'hot'
    WHEN v_cum_pct >= 25 THEN 'warm'
    WHEN v_cum_pct >= 1  THEN 'cold'
    ELSE 'inactive'  -- true absentee (0%)
  END;

  v_reason := jsonb_build_object(
    'cumulative_pct', v_cum_pct,
    'total_attended', v_total_minutes,
    'total_possible', v_total_possible,
    'sessions', v_total_sessions,
    'computed_at', now()
  );

  SELECT * INTO v_existing FROM public.lead_hotness_scores WHERE lead_id = _lead_id;
  IF FOUND THEN v_old_grade := v_existing.current_hotness; END IF;

  INSERT INTO public.lead_hotness_scores (
    lead_id,total_sessions_attended,total_webinars_attended,total_attended_minutes,
    total_possible_minutes, cumulative_attendance_percentage,
    avg_attendance_percentage,highest_attendance_percentage,last_attended_at,
    current_hotness,score_numeric,score_reason,updated_at
  ) VALUES (
    _lead_id,v_total_sessions,v_total_webinars,v_total_minutes,
    v_total_possible, v_cum_pct,
    v_avg_pct,v_max_pct,v_last_at,v_grade,v_score,v_reason,now()
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    total_sessions_attended = EXCLUDED.total_sessions_attended,
    total_webinars_attended = EXCLUDED.total_webinars_attended,
    total_attended_minutes  = EXCLUDED.total_attended_minutes,
    total_possible_minutes  = EXCLUDED.total_possible_minutes,
    cumulative_attendance_percentage = EXCLUDED.cumulative_attendance_percentage,
    avg_attendance_percentage = EXCLUDED.avg_attendance_percentage,
    highest_attendance_percentage = EXCLUDED.highest_attendance_percentage,
    last_attended_at = EXCLUDED.last_attended_at,
    current_hotness = CASE WHEN public.lead_hotness_scores.manual_override
                           THEN public.lead_hotness_scores.current_hotness
                           ELSE EXCLUDED.current_hotness END,
    score_numeric = EXCLUDED.score_numeric,
    score_reason = EXCLUDED.score_reason,
    updated_at = now()
  RETURNING * INTO v_row;

  BEGIN
    INSERT INTO public.activity_logs (lead_id, action_type, details)
    VALUES (_lead_id, 'lead_hotness_recalculated',
      jsonb_build_object('old',v_old_grade,'new',v_grade,'cumulative_pct',v_cum_pct,'reason',v_reason));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_row;
END $function$;

-- Backfill cumulative fields for any existing rows
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT lead_id FROM public.lead_session_attendance LOOP
    PERFORM public.recalculate_lead_hotness(r.lead_id);
  END LOOP;
END $$;
