ALTER TABLE public.code_of_conduct_requests
  ADD COLUMN IF NOT EXISTS bonus_email_last_error text,
  ADD COLUMN IF NOT EXISTS bonus_email_last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_terms_accepted_ip text,
  ADD COLUMN IF NOT EXISTS bonus_terms_accepted_user_agent text;