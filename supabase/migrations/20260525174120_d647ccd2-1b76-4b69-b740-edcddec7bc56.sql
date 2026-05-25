
ALTER TABLE public.code_of_conduct_requests
  ADD COLUMN IF NOT EXISTS last_email_error text,
  ADD COLUMN IF NOT EXISTS last_email_error_code text,
  ADD COLUMN IF NOT EXISTS last_email_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id text;
