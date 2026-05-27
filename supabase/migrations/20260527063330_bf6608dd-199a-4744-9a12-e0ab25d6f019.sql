
-- 1) Replace SELECT policy to include linked CRM owner
DROP POLICY IF EXISTS ppl_read ON public.paid_pipeline_leads;
CREATE POLICY ppl_read ON public.paid_pipeline_leads
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR assigned_sales_executive = auth.uid()
  OR (
    crm_lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = paid_pipeline_leads.crm_lead_id
        AND l.assigned_agent_id = auth.uid()
    )
  )
);

-- 2) Replace UPDATE policy similarly
DROP POLICY IF EXISTS ppl_update ON public.paid_pipeline_leads;
CREATE POLICY ppl_update ON public.paid_pipeline_leads
FOR UPDATE
USING (
  is_active(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR created_by = auth.uid()
    OR assigned_sales_executive = auth.uid()
    OR (
      crm_lead_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = paid_pipeline_leads.crm_lead_id
          AND l.assigned_agent_id = auth.uid()
      )
    )
  )
);

-- 3) Trigger to sync CRM assignment → Paid Pipeline owner
CREATE OR REPLACE FUNCTION public.sync_crm_owner_to_paid_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    UPDATE public.paid_pipeline_leads p
       SET assigned_sales_executive = NEW.assigned_agent_id
     WHERE p.crm_lead_id = NEW.id
       AND (
         p.assigned_sales_executive IS NULL
         OR p.assigned_sales_executive IS NOT DISTINCT FROM OLD.assigned_agent_id
       );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_crm_owner_to_paid_pipeline ON public.leads;
CREATE TRIGGER trg_sync_crm_owner_to_paid_pipeline
AFTER UPDATE OF assigned_agent_id ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.sync_crm_owner_to_paid_pipeline();

-- 4) Backfill existing data
UPDATE public.paid_pipeline_leads p
   SET assigned_sales_executive = l.assigned_agent_id
  FROM public.leads l
 WHERE p.crm_lead_id = l.id
   AND p.assigned_sales_executive IS NULL
   AND l.assigned_agent_id IS NOT NULL;
