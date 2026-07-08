
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS operations_readiness_target_stage_id uuid,
  ADD COLUMN IF NOT EXISTS operations_readiness_auto_move boolean NOT NULL DEFAULT false;
