
-- 1) Fix broken join in access_readiness_logs policies
DROP POLICY IF EXISTS "Access readiness logs: insert by admin or related" ON public.access_readiness_logs;
DROP POLICY IF EXISTS "Access readiness logs: read by admin or related" ON public.access_readiness_logs;

CREATE POLICY "Access readiness logs: read by admin or related"
ON public.access_readiness_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.paid_pipeline_leads p
    LEFT JOIN public.leads l ON l.id = p.crm_lead_id
    WHERE p.id = access_readiness_logs.paid_pipeline_lead_id
      AND (
        p.assigned_sales_executive = auth.uid()
        OR p.created_by = auth.uid()
        OR l.assigned_agent_id = auth.uid()
      )
  )
);

CREATE POLICY "Access readiness logs: insert by admin or related"
ON public.access_readiness_logs
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.paid_pipeline_leads p
    LEFT JOIN public.leads l ON l.id = p.crm_lead_id
    WHERE p.id = access_readiness_logs.paid_pipeline_lead_id
      AND (
        p.assigned_sales_executive = auth.uid()
        OR p.created_by = auth.uid()
        OR l.assigned_agent_id = auth.uid()
      )
  )
);

-- 2) Tighten coc automation event INSERT
DROP POLICY IF EXISTS coc_auto_events_auth_insert ON public.code_of_conduct_automation_events;

CREATE POLICY coc_auto_events_active_insert
ON public.code_of_conduct_automation_events
FOR INSERT
TO authenticated
WITH CHECK (is_active(auth.uid()));

-- 3) Tighten invoice-assets storage SELECT
DROP POLICY IF EXISTS invoice_assets_invoice_read ON storage.objects;

CREATE POLICY invoice_assets_invoice_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoice-assets'
  AND is_active(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR can_manage_invoice_settings(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      LEFT JOIN public.paid_pipeline_leads p ON p.id = i.paid_pipeline_lead_id
      WHERE i.created_by = auth.uid()
         OR p.assigned_sales_executive = auth.uid()
    )
  )
);
