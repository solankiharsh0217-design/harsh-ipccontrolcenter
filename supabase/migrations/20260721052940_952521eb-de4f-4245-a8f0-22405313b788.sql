
-- Restrict access to sensitive profile fields (deactivation_reason, deactivated_by) to admins only.
REVOKE SELECT (deactivation_reason, deactivated_by) ON public.profiles FROM authenticated;
REVOKE SELECT (deactivation_reason, deactivated_by) ON public.profiles FROM anon;

-- Admin-only helper for reading deactivation metadata
CREATE OR REPLACE FUNCTION public.get_profile_deactivation_details(_user_ids uuid[])
RETURNS TABLE (id uuid, deactivation_reason text, deactivated_by uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.deactivation_reason, p.deactivated_by
  FROM public.profiles p
  WHERE p.id = ANY(_user_ids)
    AND public.has_role(auth.uid(), 'admin'::app_role)
$$;

REVOKE ALL ON FUNCTION public.get_profile_deactivation_details(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_deactivation_details(uuid[]) TO authenticated;
