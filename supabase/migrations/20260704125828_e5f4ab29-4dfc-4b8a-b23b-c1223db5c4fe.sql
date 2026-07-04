
ALTER TABLE public.code_of_conduct_requests
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_to text,
  ADD COLUMN IF NOT EXISTS email_last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_attempt_count integer NOT NULL DEFAULT 0;

-- Backfill best-effort from existing columns
UPDATE public.code_of_conduct_requests
SET email_status = CASE
    WHEN last_email_error_code IS NOT NULL AND (sent_at IS NULL OR (last_email_attempt_at IS NOT NULL AND last_email_attempt_at >= sent_at)) THEN 'failed'
    WHEN sent_at IS NOT NULL THEN 'sent'
    ELSE email_status
  END,
  email_sent_at = COALESCE(email_sent_at, sent_at),
  email_sent_to = COALESCE(email_sent_to, member_email)
WHERE email_status IS NULL OR email_sent_at IS NULL OR email_sent_to IS NULL;
