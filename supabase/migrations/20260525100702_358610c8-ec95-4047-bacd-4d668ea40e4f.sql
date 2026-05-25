
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid NULL,
  ADD COLUMN IF NOT EXISTS deactivation_reason text NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_deactivated_at ON public.profiles(deactivated_at);
