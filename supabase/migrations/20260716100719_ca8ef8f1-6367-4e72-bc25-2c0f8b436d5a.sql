
-- Tighten SELECT policies on sensitive attribution / ad spend tables

-- attribution_sales_detail: explicit admin-only SELECT (was implicit deny)
DROP POLICY IF EXISTS asd_read ON public.attribution_sales_detail;
CREATE POLICY asd_read ON public.attribution_sales_detail
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- attribution_sessions: restrict to admin or creator
DROP POLICY IF EXISTS as_read ON public.attribution_sessions;
CREATE POLICY as_read ON public.attribution_sessions
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid());

-- media_buyer_attribution: restrict to admin, creator, or creator of parent session
DROP POLICY IF EXISTS mba_read ON public.media_buyer_attribution;
CREATE POLICY mba_read ON public.media_buyer_attribution
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.attribution_sessions s
    WHERE s.id = media_buyer_attribution.session_id AND s.created_by = auth.uid()
  )
);

-- roas_ad_spends: restrict to admin or entered_by
DROP POLICY IF EXISTS roas_spend_read ON public.roas_ad_spends;
CREATE POLICY roas_spend_read ON public.roas_ad_spends
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR entered_by = auth.uid());
