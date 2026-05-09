-- 1) Allow reading soft-deleted daily lead reports (so we can show a Deleted/Trash view).
DROP POLICY IF EXISTS dlr_read ON public.daily_lead_reports;
CREATE POLICY dlr_read ON public.daily_lead_reports
  FOR SELECT TO authenticated
  USING (is_active(auth.uid()));

-- 2) Permanent purge function for items in trash > 14 days.
CREATE OR REPLACE FUNCTION public.purge_old_deleted_reports()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz := now() - interval '14 days';
  attr_ids uuid[];
  daily_ids uuid[];
  mb_ids uuid[];
  attr_count int := 0;
  daily_count int := 0;
BEGIN
  IF NOT public.is_active(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Attribution sessions
  SELECT array_agg(id) INTO attr_ids
  FROM public.attribution_sessions
  WHERE is_deleted = true AND deleted_at IS NOT NULL AND deleted_at < cutoff;

  IF attr_ids IS NOT NULL AND array_length(attr_ids, 1) > 0 THEN
    DELETE FROM public.attribution_media_buyers WHERE session_id = ANY(attr_ids);
    DELETE FROM public.attribution_sales_detail WHERE session_id = ANY(attr_ids);
    DELETE FROM public.media_buyer_attribution WHERE session_id = ANY(attr_ids);
    DELETE FROM public.roas_attribution_audit_logs WHERE attribution_session_id = ANY(attr_ids);
    DELETE FROM public.attribution_sessions WHERE id = ANY(attr_ids);
    attr_count := array_length(attr_ids, 1);
  END IF;

  -- Daily lead reports
  SELECT array_agg(id) INTO daily_ids
  FROM public.daily_lead_reports
  WHERE is_deleted = true AND deleted_at IS NOT NULL AND deleted_at < cutoff;

  IF daily_ids IS NOT NULL AND array_length(daily_ids, 1) > 0 THEN
    SELECT array_agg(id) INTO mb_ids
    FROM public.daily_lead_report_media_buyers WHERE report_id = ANY(daily_ids);
    IF mb_ids IS NOT NULL AND array_length(mb_ids, 1) > 0 THEN
      DELETE FROM public.daily_lead_report_ad_accounts WHERE report_media_buyer_id = ANY(mb_ids);
    END IF;
    DELETE FROM public.daily_lead_report_media_buyers WHERE report_id = ANY(daily_ids);
    DELETE FROM public.daily_lead_reports WHERE id = ANY(daily_ids);
    daily_count := array_length(daily_ids, 1);
  END IF;

  RETURN jsonb_build_object(
    'attribution_purged', attr_count,
    'daily_purged', daily_count,
    'cutoff', cutoff
  );
END $$;

GRANT EXECUTE ON FUNCTION public.purge_old_deleted_reports() TO authenticated;