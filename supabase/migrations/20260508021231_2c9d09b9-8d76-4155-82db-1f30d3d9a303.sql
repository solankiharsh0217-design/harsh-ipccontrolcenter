ALTER TABLE public.attribution_sessions
  ADD COLUMN IF NOT EXISTS saved_from_draft_id uuid,
  ADD COLUMN IF NOT EXISTS calculation_display_method text;

CREATE INDEX IF NOT EXISTS idx_attribution_sessions_calculation_id
  ON public.attribution_sessions (calculation_id) WHERE calculation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attribution_sessions_input_output_hash
  ON public.attribution_sessions (input_snapshot_hash, output_hash, created_by);
