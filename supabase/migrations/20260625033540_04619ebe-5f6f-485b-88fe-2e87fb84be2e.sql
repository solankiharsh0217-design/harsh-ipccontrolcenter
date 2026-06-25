
-- Helper to check module access (admins implicitly have all access)
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _module_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active(_user_id) AND (
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access
      WHERE user_id = _user_id AND module_key = _module_key
    )
  )
$$;

-- Broaden INSERT policy: any active user with paid_pipeline module access can
-- record a payment against an existing paid lead. Admins always allowed.
DROP POLICY IF EXISTS ppp_insert ON public.paid_pipeline_payments;
CREATE POLICY ppp_insert ON public.paid_pipeline_payments
FOR INSERT TO authenticated
WITH CHECK (
  public.is_active(auth.uid())
  AND EXISTS (SELECT 1 FROM public.paid_pipeline_leads l WHERE l.id = paid_pipeline_payments.paid_pipeline_lead_id)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_module_access(auth.uid(), 'paid_pipeline')
    OR EXISTS (
      SELECT 1 FROM public.paid_pipeline_leads l
      WHERE l.id = paid_pipeline_payments.paid_pipeline_lead_id
        AND (l.created_by = auth.uid() OR l.assigned_sales_executive = auth.uid())
    )
  )
);

-- Mirror broadened access for UPDATE so authorized users can edit their entries
DROP POLICY IF EXISTS ppp_update ON public.paid_pipeline_payments;
CREATE POLICY ppp_update ON public.paid_pipeline_payments
FOR UPDATE TO authenticated
USING (
  public.is_active(auth.uid()) AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR created_by = auth.uid()
    OR public.has_module_access(auth.uid(), 'paid_pipeline')
  )
)
WITH CHECK (
  public.is_active(auth.uid()) AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (created_by = auth.uid() AND public.has_module_access(auth.uid(), 'paid_pipeline'))
  )
);

-- Also broaden SELECT so paid pipeline users can read all payment rows they manage
DROP POLICY IF EXISTS ppp_read ON public.paid_pipeline_payments;
CREATE POLICY ppp_read ON public.paid_pipeline_payments
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR created_by = auth.uid()
  OR public.has_module_access(auth.uid(), 'paid_pipeline')
  OR EXISTS (
    SELECT 1 FROM public.paid_pipeline_leads p
    WHERE p.id = paid_pipeline_payments.paid_pipeline_lead_id
      AND (p.created_by = auth.uid() OR p.assigned_sales_executive = auth.uid())
  )
);
