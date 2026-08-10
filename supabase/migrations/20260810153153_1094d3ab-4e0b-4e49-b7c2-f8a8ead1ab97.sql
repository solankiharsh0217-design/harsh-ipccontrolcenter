-- Add entitlement columns to email variants
ALTER TABLE public.code_of_conduct_email_variants
ADD COLUMN IF NOT EXISTS access_link text,
ADD COLUMN IF NOT EXISTS access_duration_months integer,
ADD COLUMN IF NOT EXISTS support_duration_months integer;

-- Add entitlement snapshot columns to requests
ALTER TABLE public.code_of_conduct_requests
ADD COLUMN IF NOT EXISTS access_link_snapshot text,
ADD COLUMN IF NOT EXISTS access_duration_months integer,
ADD COLUMN IF NOT EXISTS support_duration_months integer;

-- Initialize default entitlements for existing variants
UPDATE public.code_of_conduct_email_variants
SET 
  access_link = 'https://ipccommunity.in/steps-1/',
  access_duration_months = 24,
  support_duration_months = 6
WHERE condition_key = 'completed_within_1_day';

UPDATE public.code_of_conduct_email_variants
SET 
  access_link = 'https://ipccommunity.in/steps/',
  access_duration_months = 12,
  support_duration_months = 3
WHERE condition_key = 'completed_after_1_day';

-- Standardize grants
GRANT SELECT, UPDATE ON public.code_of_conduct_email_variants TO authenticated;
GRANT SELECT, UPDATE, INSERT ON public.code_of_conduct_requests TO authenticated;
