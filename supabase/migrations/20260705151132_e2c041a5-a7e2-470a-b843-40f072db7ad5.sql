
ALTER TABLE public.code_of_conduct_requests
  ADD COLUMN IF NOT EXISTS previous_token_hash text,
  ADD COLUMN IF NOT EXISTS previous_token_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS code_of_conduct_requests_previous_token_hash_idx
  ON public.code_of_conduct_requests (previous_token_hash)
  WHERE previous_token_hash IS NOT NULL;
