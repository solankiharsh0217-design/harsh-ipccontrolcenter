
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_source_type text;

ALTER TABLE public.lead_qualifier_sessions
  ADD COLUMN IF NOT EXISTS mode integer,
  ADD COLUMN IF NOT EXISTS registration_file_name text,
  ADD COLUMN IF NOT EXISTS zoom_file_name text,
  ADD COLUMN IF NOT EXISTS true_absentee_count integer;
