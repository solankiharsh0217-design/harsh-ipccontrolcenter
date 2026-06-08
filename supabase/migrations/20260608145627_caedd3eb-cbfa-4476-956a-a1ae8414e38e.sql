REVOKE ALL ON FUNCTION public.protect_paid_onboarding_crm_lead() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_paid_onboarding_crm_lead() FROM anon;
REVOKE ALL ON FUNCTION public.protect_paid_onboarding_crm_lead() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.protect_paid_onboarding_crm_lead() TO service_role;