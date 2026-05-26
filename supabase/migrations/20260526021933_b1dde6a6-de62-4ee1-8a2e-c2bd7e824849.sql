ALTER TABLE public.code_of_conduct_events
  ALTER COLUMN request_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coc_events_type_created
  ON public.code_of_conduct_events(event_type, created_at DESC);