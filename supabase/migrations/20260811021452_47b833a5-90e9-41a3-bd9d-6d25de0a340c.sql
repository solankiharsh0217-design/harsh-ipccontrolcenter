-- 1) Restrict attribution join tables containing lead PII to admins or session owners
DROP POLICY IF EXISTS "aal_read" ON public.attribution_attendee_lists;
CREATE POLICY "aal_read" ON public.attribution_attendee_lists
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.attribution_sessions s
    WHERE s.id = attribution_attendee_lists.session_id AND s.created_by = auth.uid()
  ))
);

DROP POLICY IF EXISTS "amb_read" ON public.attribution_media_buyers;
CREATE POLICY "amb_read" ON public.attribution_media_buyers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.attribution_sessions s
    WHERE s.id = attribution_media_buyers.session_id AND s.created_by = auth.uid()
  ))
);

-- 2) Scope public-role policies to authenticated
DROP POLICY IF EXISTS "mbsp_update_active" ON public.media_buyer_service_periods;
CREATE POLICY "mbsp_update_active" ON public.media_buyer_service_periods
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.media_buyer_cases c
    WHERE c.id = media_buyer_service_periods.case_id
      AND (c.assigned_media_buyer_id = auth.uid() OR c.created_by = auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.media_buyer_cases c
    WHERE c.id = media_buyer_service_periods.case_id
      AND (c.assigned_media_buyer_id = auth.uid() OR c.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "mbc_select_active" ON public.media_buyer_cases;
CREATE POLICY "mbc_select_active" ON public.media_buyer_cases
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = assigned_media_buyer_id
  OR auth.uid() = created_by
);

DROP POLICY IF EXISTS "mbc_update_admin_or_buyer" ON public.media_buyer_cases;
CREATE POLICY "mbc_update_admin_or_buyer" ON public.media_buyer_cases
FOR UPDATE TO authenticated
USING (
  is_active(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = assigned_media_buyer_id
  )
);

DROP POLICY IF EXISTS "ops_deliveries_admin_all" ON public.operations_offer_deliveries;
CREATE POLICY "ops_deliveries_admin_all" ON public.operations_offer_deliveries
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "ops_deliveries_member_select" ON public.operations_offer_deliveries;
CREATE POLICY "ops_deliveries_member_select" ON public.operations_offer_deliveries
FOR SELECT TO authenticated
USING (
  is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.operations_leads ol
    WHERE ol.id = operations_offer_deliveries.operations_lead_id
      AND ol.assigned_media_buyer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "ops_deliveries_member_insert" ON public.operations_offer_deliveries;
CREATE POLICY "ops_deliveries_member_insert" ON public.operations_offer_deliveries
FOR INSERT TO authenticated
WITH CHECK (
  is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.operations_leads ol
    WHERE ol.id = operations_offer_deliveries.operations_lead_id
      AND ol.assigned_media_buyer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "ops_deliveries_member_update" ON public.operations_offer_deliveries;
CREATE POLICY "ops_deliveries_member_update" ON public.operations_offer_deliveries
FOR UPDATE TO authenticated
USING (
  is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.operations_leads ol
    WHERE ol.id = operations_offer_deliveries.operations_lead_id
      AND ol.assigned_media_buyer_id = auth.uid()
  )
)
WITH CHECK (
  is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.operations_leads ol
    WHERE ol.id = operations_offer_deliveries.operations_lead_id
      AND ol.assigned_media_buyer_id = auth.uid()
  )
);

-- 3) Remove redundant admin-only read policy on roas_leads (roas_leads_admin already covers SELECT)
DROP POLICY IF EXISTS "roas_leads_read" ON public.roas_leads;