
ALTER TABLE public.code_of_conduct_templates
  ADD COLUMN IF NOT EXISTS reply_to_email text,
  ADD COLUMN IF NOT EXISTS test_recipient_email text;
