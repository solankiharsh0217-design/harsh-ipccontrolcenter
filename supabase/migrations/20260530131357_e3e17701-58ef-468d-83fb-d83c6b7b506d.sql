
CREATE TABLE public.lead_session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  batch_id uuid NULL,
  webinar_id text NULL,
  webinar_name text NULL,
  session_name text NULL,
  session_date date NULL,
  session_day int NULL,
  session_duration_minutes int NOT NULL DEFAULT 60,
  attended_minutes_raw int NOT NULL DEFAULT 0,
  attended_minutes_capped int NOT NULL DEFAULT 0,
  attendance_percentage numeric(5,2) NOT NULL DEFAULT 0,
  join_count int NOT NULL DEFAULT 1,
  first_joined_at timestamptz NULL,
  last_left_at timestamptz NULL,
  attendance_grade text NOT NULL DEFAULT 'absent'
    CHECK (attendance_grade IN ('hot','warm','cold','absent')),
  source text NOT NULL DEFAULT 'csv'
    CHECK (source IN ('zoom','csv','google_sheet','manual')),
  raw_identity_key text NULL,
  normalized_email text NULL,
  normalized_phone text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_key text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_session_attendance TO authenticated;
GRANT ALL ON public.lead_session_attendance TO service_role;

ALTER TABLE public.lead_session_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active users read attendance" ON public.lead_session_attendance
FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "active users insert attendance" ON public.lead_session_attendance
FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));
CREATE POLICY "active users update attendance" ON public.lead_session_attendance
FOR UPDATE TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "admins delete attendance" ON public.lead_session_attendance
FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE OR REPLACE FUNCTION public.lead_session_attendance_set_key()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.session_key := coalesce(NEW.webinar_id,'') || '|' ||
                     coalesce(NEW.session_date::text,'') || '|' ||
                     coalesce(NEW.session_day::text,'0');
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER lead_session_attendance_key_trg
BEFORE INSERT OR UPDATE ON public.lead_session_attendance
FOR EACH ROW EXECUTE FUNCTION public.lead_session_attendance_set_key();

CREATE UNIQUE INDEX lead_session_attendance_unique
  ON public.lead_session_attendance (lead_id, session_key);
CREATE INDEX lead_session_attendance_lead_idx ON public.lead_session_attendance(lead_id);
CREATE INDEX lead_session_attendance_batch_idx ON public.lead_session_attendance(batch_id);
CREATE INDEX lead_session_attendance_email_idx ON public.lead_session_attendance(normalized_email);
CREATE INDEX lead_session_attendance_phone_idx ON public.lead_session_attendance(normalized_phone);

CREATE TABLE public.lead_hotness_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  total_sessions_attended int NOT NULL DEFAULT 0,
  total_webinars_attended int NOT NULL DEFAULT 0,
  total_attended_minutes int NOT NULL DEFAULT 0,
  avg_attendance_percentage numeric(5,2) NOT NULL DEFAULT 0,
  highest_attendance_percentage numeric(5,2) NOT NULL DEFAULT 0,
  last_attended_at timestamptz NULL,
  current_hotness text NOT NULL DEFAULT 'inactive'
    CHECK (current_hotness IN ('super_hot','hot','warm','cold','inactive')),
  score_numeric int NOT NULL DEFAULT 0,
  score_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_override boolean NOT NULL DEFAULT false,
  manual_grade text NULL CHECK (manual_grade IS NULL OR manual_grade IN ('super_hot','hot','warm','cold','inactive')),
  override_reason text NULL,
  overridden_by uuid NULL,
  overridden_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_hotness_scores TO authenticated;
GRANT ALL ON public.lead_hotness_scores TO service_role;

ALTER TABLE public.lead_hotness_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active users read hotness" ON public.lead_hotness_scores
FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "active users insert hotness" ON public.lead_hotness_scores
FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));
CREATE POLICY "active users update hotness" ON public.lead_hotness_scores
FOR UPDATE TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "admins delete hotness" ON public.lead_hotness_scores
FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER lead_hotness_scores_touch
BEFORE UPDATE ON public.lead_hotness_scores
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.recalculate_lead_hotness(_lead_id uuid)
RETURNS public.lead_hotness_scores
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_total_sessions int := 0; v_total_webinars int := 0; v_total_minutes int := 0;
  v_avg_pct numeric(5,2) := 0; v_max_pct numeric(5,2) := 0; v_last_at timestamptz := NULL;
  v_score int := 0; v_grade text := 'inactive';
  v_existing public.lead_hotness_scores%ROWTYPE; v_old_grade text := 'inactive';
  v_reason jsonb := '{}'::jsonb;
  v_extra int := 0; v_recent int := 0; v_repeat int := 0; v_base int := 0;
  v_row public.lead_hotness_scores%ROWTYPE;
BEGIN
  SELECT count(*),
         count(DISTINCT coalesce(webinar_id, webinar_name, id::text)),
         coalesce(sum(attended_minutes_capped),0),
         coalesce(round(avg(nullif(attendance_percentage,0))::numeric,2),0),
         coalesce(max(attendance_percentage),0),
         max(coalesce(last_left_at, first_joined_at, created_at))
  INTO v_total_sessions, v_total_webinars, v_total_minutes, v_avg_pct, v_max_pct, v_last_at
  FROM public.lead_session_attendance WHERE lead_id = _lead_id;

  SELECT coalesce(sum(CASE
    WHEN attendance_percentage >= 80 THEN 40
    WHEN attendance_percentage >= 50 THEN 25
    WHEN attendance_percentage >= 20 THEN 10
    WHEN attendance_percentage >= 1  THEN 3
    ELSE 0 END),0)
  INTO v_base FROM public.lead_session_attendance WHERE lead_id = _lead_id;

  v_extra := GREATEST(0, v_total_sessions - 1) * 10;
  IF v_last_at IS NOT NULL AND v_last_at >= now() - interval '7 days' THEN v_recent := 10; END IF;
  IF v_total_webinars >= 2 THEN v_repeat := 15; END IF;
  v_score := v_base + v_extra + v_recent + v_repeat;
  v_grade := CASE
    WHEN v_score >= 80 THEN 'super_hot'
    WHEN v_score >= 50 THEN 'hot'
    WHEN v_score >= 25 THEN 'warm'
    WHEN v_score >= 1  THEN 'cold'
    ELSE 'inactive' END;
  v_reason := jsonb_build_object('base',v_base,'extra_sessions',v_extra,'recent',v_recent,'repeat_webinar',v_repeat,'total',v_score,'computed_at',now());

  SELECT * INTO v_existing FROM public.lead_hotness_scores WHERE lead_id = _lead_id;
  IF FOUND THEN v_old_grade := v_existing.current_hotness; END IF;

  INSERT INTO public.lead_hotness_scores (
    lead_id,total_sessions_attended,total_webinars_attended,total_attended_minutes,
    avg_attendance_percentage,highest_attendance_percentage,last_attended_at,
    current_hotness,score_numeric,score_reason,updated_at
  ) VALUES (
    _lead_id,v_total_sessions,v_total_webinars,v_total_minutes,
    v_avg_pct,v_max_pct,v_last_at,v_grade,v_score,v_reason,now()
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    total_sessions_attended = EXCLUDED.total_sessions_attended,
    total_webinars_attended = EXCLUDED.total_webinars_attended,
    total_attended_minutes  = EXCLUDED.total_attended_minutes,
    avg_attendance_percentage = EXCLUDED.avg_attendance_percentage,
    highest_attendance_percentage = EXCLUDED.highest_attendance_percentage,
    last_attended_at = EXCLUDED.last_attended_at,
    current_hotness = CASE WHEN public.lead_hotness_scores.manual_override THEN public.lead_hotness_scores.current_hotness ELSE EXCLUDED.current_hotness END,
    score_numeric = EXCLUDED.score_numeric,
    score_reason = EXCLUDED.score_reason,
    updated_at = now()
  RETURNING * INTO v_row;

  BEGIN
    INSERT INTO public.activity_logs (lead_id, action_type, details)
    VALUES (_lead_id, 'lead_hotness_recalculated',
      jsonb_build_object('old',v_old_grade,'new',v_grade,'score',v_score,'reason',v_reason));
    IF v_old_grade IS DISTINCT FROM v_grade AND v_grade IN ('warm','hot','super_hot') THEN
      INSERT INTO public.activity_logs (lead_id, action_type, details)
      VALUES (_lead_id, 'lead_hotness_upgraded',
        jsonb_build_object('old',v_old_grade,'new',v_grade,'score',v_score));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_lead_session_attendance(
  _lead_id uuid, _batch_id uuid, _webinar_id text, _webinar_name text, _session_name text,
  _session_date date, _session_day int, _session_duration_minutes int,
  _attended_minutes_raw int, _join_count int,
  _first_joined_at timestamptz, _last_left_at timestamptz,
  _source text, _normalized_email text, _normalized_phone text,
  _raw_identity_key text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS public.lead_session_attendance
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_existing public.lead_session_attendance%ROWTYPE;
  v_row public.lead_session_attendance%ROWTYPE;
  v_key text;
  v_duration int := GREATEST(1, coalesce(_session_duration_minutes, 60));
  v_capped int; v_pct numeric(5,2); v_grade text;
BEGIN
  v_key := coalesce(_webinar_id,'') || '|' ||
           coalesce(_session_date::text,'') || '|' ||
           coalesce(_session_day::text,'0');

  SELECT * INTO v_existing FROM public.lead_session_attendance
   WHERE lead_id = _lead_id AND session_key = v_key;

  IF FOUND THEN
    v_existing.attended_minutes_raw := v_existing.attended_minutes_raw + coalesce(_attended_minutes_raw,0);
    v_existing.join_count := v_existing.join_count + GREATEST(1, coalesce(_join_count,1));
    IF _first_joined_at IS NOT NULL AND (v_existing.first_joined_at IS NULL OR _first_joined_at < v_existing.first_joined_at) THEN
      v_existing.first_joined_at := _first_joined_at;
    END IF;
    IF _last_left_at IS NOT NULL AND (v_existing.last_left_at IS NULL OR _last_left_at > v_existing.last_left_at) THEN
      v_existing.last_left_at := _last_left_at;
    END IF;
    v_capped := LEAST(v_existing.attended_minutes_raw, v_duration);
    v_pct := round((v_capped::numeric / v_duration::numeric) * 100, 2);
    v_grade := CASE WHEN v_pct >= 60 THEN 'hot' WHEN v_pct >= 30 THEN 'warm' WHEN v_pct >= 1 THEN 'cold' ELSE 'absent' END;

    UPDATE public.lead_session_attendance SET
      attended_minutes_raw = v_existing.attended_minutes_raw,
      attended_minutes_capped = v_capped,
      attendance_percentage = v_pct,
      join_count = v_existing.join_count,
      first_joined_at = v_existing.first_joined_at,
      last_left_at = v_existing.last_left_at,
      attendance_grade = v_grade,
      session_duration_minutes = v_duration,
      webinar_name = coalesce(_webinar_name, webinar_name),
      session_name = coalesce(_session_name, session_name),
      normalized_email = coalesce(_normalized_email, normalized_email),
      normalized_phone = coalesce(_normalized_phone, normalized_phone),
      raw_identity_key = coalesce(_raw_identity_key, raw_identity_key),
      source = coalesce(_source, source),
      metadata_json = metadata_json || coalesce(_metadata,'{}'::jsonb)
    WHERE id = v_existing.id RETURNING * INTO v_row;

    BEGIN
      INSERT INTO public.activity_logs (lead_id, action_type, details)
      VALUES (_lead_id, 'duplicate_session_rows_merged',
        jsonb_build_object('attendance_id',v_row.id,'join_count',v_row.join_count,'attended_minutes',v_capped,'percentage',v_pct));
      INSERT INTO public.activity_logs (lead_id, action_type, details)
      VALUES (_lead_id, 'lead_attendance_timeline_updated',
        jsonb_build_object('attendance_id',v_row.id,'webinar',coalesce(_webinar_name,_webinar_id),'grade',v_grade));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSE
    v_capped := LEAST(coalesce(_attended_minutes_raw,0), v_duration);
    v_pct := round((v_capped::numeric / v_duration::numeric) * 100, 2);
    v_grade := CASE WHEN v_pct >= 60 THEN 'hot' WHEN v_pct >= 30 THEN 'warm' WHEN v_pct >= 1 THEN 'cold' ELSE 'absent' END;

    INSERT INTO public.lead_session_attendance (
      lead_id,batch_id,webinar_id,webinar_name,session_name,session_date,session_day,
      session_duration_minutes,attended_minutes_raw,attended_minutes_capped,attendance_percentage,
      join_count,first_joined_at,last_left_at,attendance_grade,source,
      raw_identity_key,normalized_email,normalized_phone,metadata_json
    ) VALUES (
      _lead_id,_batch_id,_webinar_id,_webinar_name,_session_name,_session_date,_session_day,
      v_duration,coalesce(_attended_minutes_raw,0),v_capped,v_pct,
      GREATEST(1, coalesce(_join_count,1)),_first_joined_at,_last_left_at,v_grade,coalesce(_source,'csv'),
      _raw_identity_key,_normalized_email,_normalized_phone,coalesce(_metadata,'{}'::jsonb)
    ) RETURNING * INTO v_row;

    BEGIN
      INSERT INTO public.activity_logs (lead_id, action_type, details)
      VALUES (_lead_id, 'lead_attendance_timeline_created',
        jsonb_build_object('attendance_id',v_row.id,'webinar',coalesce(_webinar_name,_webinar_id),
                           'attended_minutes',v_capped,'percentage',v_pct,'grade',v_grade));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  PERFORM public.recalculate_lead_hotness(_lead_id);
  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.recalculate_lead_hotness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_lead_session_attendance(
  uuid,uuid,text,text,text,date,int,int,int,int,timestamptz,timestamptz,text,text,text,text,jsonb
) TO authenticated;
