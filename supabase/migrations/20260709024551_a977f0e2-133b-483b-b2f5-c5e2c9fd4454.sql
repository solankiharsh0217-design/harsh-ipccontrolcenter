
-- Delivery tracking for promised offers/services
CREATE TABLE IF NOT EXISTS public.operations_offer_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operations_lead_id uuid NOT NULL REFERENCES public.operations_leads(id) ON DELETE CASCADE,
  crm_lead_id uuid,
  paid_pipeline_lead_id uuid,
  paid_lead_offer_item_id uuid REFERENCES public.paid_lead_offer_items(id) ON DELETE SET NULL,
  offer_item_id uuid,
  title text NOT NULL,
  description text,
  delivery_status text NOT NULL DEFAULT 'pending',
  assigned_to uuid,
  due_date date,
  delivered_at timestamptz,
  delivered_by uuid,
  proof_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operations_offer_deliveries_status_chk
    CHECK (delivery_status IN ('pending','in_progress','delivered','blocked','cancelled'))
);

-- Idempotency: at most one delivery row per operations lead + promised-offer link
CREATE UNIQUE INDEX IF NOT EXISTS operations_offer_deliveries_lead_offer_uk
  ON public.operations_offer_deliveries (operations_lead_id, paid_lead_offer_item_id)
  WHERE paid_lead_offer_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS operations_offer_deliveries_lead_idx
  ON public.operations_offer_deliveries (operations_lead_id);
CREATE INDEX IF NOT EXISTS operations_offer_deliveries_status_idx
  ON public.operations_offer_deliveries (delivery_status);
CREATE INDEX IF NOT EXISTS operations_offer_deliveries_due_idx
  ON public.operations_offer_deliveries (due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_offer_deliveries TO authenticated;
GRANT ALL ON public.operations_offer_deliveries TO service_role;

ALTER TABLE public.operations_offer_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_deliveries_admin_all"
  ON public.operations_offer_deliveries
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "ops_deliveries_member_select"
  ON public.operations_offer_deliveries
  FOR SELECT
  USING (
    public.is_active(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.operations_leads ol
      WHERE ol.id = operations_offer_deliveries.operations_lead_id
        AND ol.assigned_media_buyer_id = auth.uid()
    )
  );

CREATE POLICY "ops_deliveries_member_insert"
  ON public.operations_offer_deliveries
  FOR INSERT
  WITH CHECK (
    public.is_active(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.operations_leads ol
      WHERE ol.id = operations_offer_deliveries.operations_lead_id
        AND ol.assigned_media_buyer_id = auth.uid()
    )
  );

CREATE POLICY "ops_deliveries_member_update"
  ON public.operations_offer_deliveries
  FOR UPDATE
  USING (
    public.is_active(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.operations_leads ol
      WHERE ol.id = operations_offer_deliveries.operations_lead_id
        AND ol.assigned_media_buyer_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_active(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.operations_leads ol
      WHERE ol.id = operations_offer_deliveries.operations_lead_id
        AND ol.assigned_media_buyer_id = auth.uid()
    )
  );

CREATE TRIGGER trg_operations_offer_deliveries_updated_at
  BEFORE UPDATE ON public.operations_offer_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
