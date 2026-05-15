ALTER TABLE public.webinar_batches ADD COLUMN IF NOT EXISTS source_attribution_report_id uuid;
ALTER TABLE public.webinar_batches ADD COLUMN IF NOT EXISTS source_attribution_session_id uuid;
ALTER TABLE public.webinar_batches ADD COLUMN IF NOT EXISTS source_report_type text;
ALTER TABLE public.webinar_batches ADD COLUMN IF NOT EXISTS source_created_from text;