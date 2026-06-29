
-- Add link-open tracking columns to code_of_conduct_requests
ALTER TABLE public.code_of_conduct_requests
  ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;

-- Backfill from existing viewed_at
UPDATE public.code_of_conduct_requests
   SET first_opened_at = viewed_at,
       last_opened_at = COALESCE(last_opened_at, viewed_at),
       open_count = GREATEST(open_count, 1)
 WHERE viewed_at IS NOT NULL AND first_opened_at IS NULL;

-- Add Code of Conduct auto-stage settings to company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS coc_link_opened_stage_id uuid,
  ADD COLUMN IF NOT EXISTS coc_access_done_stage_id uuid,
  ADD COLUMN IF NOT EXISTS coc_auto_move_link_opened boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS coc_auto_move_access_done boolean NOT NULL DEFAULT false;

-- RPC for non-admin reads of these stage IDs (used by client when reading settings)
CREATE OR REPLACE FUNCTION public.get_coc_stage_settings()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
      'coc_link_opened_stage_id', coc_link_opened_stage_id,
      'coc_access_done_stage_id', coc_access_done_stage_id,
      'coc_auto_move_link_opened', coc_auto_move_link_opened,
      'coc_auto_move_access_done', coc_auto_move_access_done
    ) FROM public.company_settings WHERE workspace = 'default' LIMIT 1),
    '{}'::jsonb
  )
$$;

-- Helper: server-side stage advance with no-backward-move + paid-pipeline restriction
CREATE OR REPLACE FUNCTION public.coc_advance_lead_stage(_crm_lead_id uuid, _target_stage_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_target record;
  v_current record;
  v_old_name text;
BEGIN
  IF _crm_lead_id IS NULL OR _target_stage_id IS NULL THEN
    RETURN jsonb_build_object('moved', false, 'reason', 'missing_ids');
  END IF;

  SELECT id, pipeline_id, stage_id INTO v_lead FROM public.leads WHERE id = _crm_lead_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('moved', false, 'reason', 'lead_not_found'); END IF;

  SELECT id, pipeline_id, position, name INTO v_target FROM public.stages WHERE id = _target_stage_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('moved', false, 'reason', 'target_stage_not_found'); END IF;

  -- Only move within the same pipeline
  IF v_target.pipeline_id IS DISTINCT FROM v_lead.pipeline_id THEN
    RETURN jsonb_build_object('moved', false, 'reason', 'pipeline_mismatch');
  END IF;

  IF v_lead.stage_id = _target_stage_id THEN
    RETURN jsonb_build_object('moved', false, 'reason', 'already_at_target');
  END IF;

  -- No-backward-move: skip if current stage position is >= target position
  IF v_lead.stage_id IS NOT NULL THEN
    SELECT id, position, name INTO v_current FROM public.stages WHERE id = v_lead.stage_id;
    IF FOUND AND v_current.position >= v_target.position THEN
      RETURN jsonb_build_object('moved', false, 'reason', 'not_backward', 'current_stage', v_current.name);
    END IF;
    v_old_name := v_current.name;
  END IF;

  UPDATE public.leads SET stage_id = _target_stage_id WHERE id = _crm_lead_id;

  BEGIN
    INSERT INTO public.activity_logs (lead_id, action_type, details)
    VALUES (_crm_lead_id, 'coc_auto_stage_move',
      jsonb_build_object('from', v_old_name, 'to', v_target.name, 'reason', COALESCE(_reason, 'code_of_conduct_automation')));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('moved', true, 'from', v_old_name, 'to', v_target.name);
END;
$$;

-- Extend after-signed trigger: optionally auto-move to Access Done when signed AND (no guide active OR guide completed)
CREATE OR REPLACE FUNCTION public.coc_maybe_move_access_done(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  s record;
  gv_active boolean;
  gv_complete boolean := false;
  v_result jsonb;
BEGIN
  SELECT * INTO r FROM public.code_of_conduct_requests WHERE id = _request_id;
  IF NOT FOUND OR r.status <> 'signed' OR r.crm_lead_id IS NULL THEN
    RETURN jsonb_build_object('moved', false, 'reason', 'not_eligible');
  END IF;

  SELECT coc_access_done_stage_id, coc_auto_move_access_done, guide_video_is_active, guide_video_id
    INTO s FROM public.company_settings WHERE workspace = 'default' LIMIT 1;
  IF NOT FOUND OR NOT COALESCE(s.coc_auto_move_access_done, false) OR s.coc_access_done_stage_id IS NULL THEN
    RETURN jsonb_build_object('moved', false, 'reason', 'disabled');
  END IF;

  gv_active := COALESCE(s.guide_video_is_active, false) AND s.guide_video_id IS NOT NULL;
  IF gv_active THEN
    SELECT (completed_at IS NOT NULL) INTO gv_complete
      FROM public.code_of_conduct_guide_progress WHERE request_id = _request_id LIMIT 1;
    IF NOT COALESCE(gv_complete, false) THEN
      RETURN jsonb_build_object('moved', false, 'reason', 'guide_not_complete');
    END IF;
  END IF;

  v_result := public.coc_advance_lead_stage(r.crm_lead_id, s.coc_access_done_stage_id, 'code_of_conduct_access_done_auto');
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_coc_stage_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coc_advance_lead_stage(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.coc_maybe_move_access_done(uuid) TO service_role;
