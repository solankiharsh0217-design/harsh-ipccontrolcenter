-- Extend operations_service_events to support communication logging
ALTER TABLE public.operations_service_events
  DROP CONSTRAINT IF EXISTS operations_service_events_event_type_check;

ALTER TABLE public.operations_service_events
  ADD CONSTRAINT operations_service_events_event_type_check
  CHECK (event_type IN (
    'start','pause','resume','stop','complete','restart',
    'communication_logged','communication_copied','communication_sent','communication_failed'
  ));

ALTER TABLE public.operations_service_events
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.operations_communication_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_title text,
  ADD COLUMN IF NOT EXISTS message_snapshot text,
  ADD COLUMN IF NOT EXISTS subject_snapshot text,
  ADD COLUMN IF NOT EXISTS send_status text;

CREATE INDEX IF NOT EXISTS idx_ops_events_lead_type
  ON public.operations_service_events(operations_lead_id, event_type);