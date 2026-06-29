CREATE OR REPLACE FUNCTION public.get_finance_success_stage_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT finance_success_stage_ids FROM public.company_settings WHERE workspace = 'default' LIMIT 1),
    ARRAY[]::uuid[]
  )
$$;

REVOKE ALL ON FUNCTION public.get_finance_success_stage_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finance_success_stage_ids() TO authenticated;