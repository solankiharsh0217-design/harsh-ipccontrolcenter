
ALTER TABLE public.seminar_roas_reports
  ADD COLUMN IF NOT EXISTS conversion_rate_basis text,
  ADD COLUMN IF NOT EXISTS conversion_rate numeric;

ALTER TABLE public.seminar_roas_report_days
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS watch_point_time text;
