-- Helper: can this user pick up unassigned CRM/paid leads?
CREATE OR REPLACE FUNCTION public.can_access_unassigned_leads(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.status = 'active'
      AND (
        COALESCE(p.can_receive_calling_crm_leads, false)
        OR COALESCE(p.can_receive_paid_pipeline_leads, false)
        OR COALESCE(p.can_receive_follow_up_tasks, false)
        OR COALESCE(p.can_receive_payment_recovery_leads, false)
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.user_module_access uma
    WHERE uma.user_id = _user_id
      AND uma.module_key IN ('crm','calling_crm','paid_pipeline','paid-pipeline','payment_recovery')
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_unassigned_leads(uuid) TO authenticated, service_role;

-- Tighten SELECT policy on leads
DROP POLICY IF EXISTS "members read leads" ON public.leads;
CREATE POLICY "members read leads"
ON public.leads
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.is_active(auth.uid())
    AND (
      assigned_agent_id = auth.uid()
      OR (assigned_agent_id IS NULL AND public.can_access_unassigned_leads(auth.uid()))
    )
  )
);

-- Match tightening on UPDATE for unassigned leads
DROP POLICY IF EXISTS "agents update assigned leads" ON public.leads;
CREATE POLICY "agents update assigned leads"
ON public.leads
FOR UPDATE
USING (
  public.is_active(auth.uid())
  AND (
    assigned_agent_id = auth.uid()
    OR (assigned_agent_id IS NULL AND public.can_access_unassigned_leads(auth.uid()))
  )
);