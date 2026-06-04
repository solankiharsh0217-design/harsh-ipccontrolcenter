
-- Offer / Entitlements V1
CREATE TABLE IF NOT EXISTS public.offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  default_duration_value numeric,
  default_duration_unit text,
  default_quantity numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS offer_items_name_lower_idx ON public.offer_items (lower(name)) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_items TO authenticated;
GRANT ALL ON public.offer_items TO service_role;
ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offer_items_select_active" ON public.offer_items FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "offer_items_admin_insert" ON public.offer_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "offer_items_admin_update" ON public.offer_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "offer_items_admin_delete" ON public.offer_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER trg_offer_items_updated BEFORE UPDATE ON public.offer_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.offer_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_presets TO authenticated;
GRANT ALL ON public.offer_presets TO service_role;
ALTER TABLE public.offer_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offer_presets_select_active" ON public.offer_presets FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "offer_presets_active_write" ON public.offer_presets FOR ALL TO authenticated USING (public.is_active(auth.uid())) WITH CHECK (public.is_active(auth.uid()));

CREATE TRIGGER trg_offer_presets_updated BEFORE UPDATE ON public.offer_presets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.offer_preset_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES public.offer_presets(id) ON DELETE CASCADE,
  offer_item_id uuid REFERENCES public.offer_items(id) ON DELETE SET NULL,
  title text,
  duration_value numeric,
  duration_unit text,
  quantity numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_preset_items TO authenticated;
GRANT ALL ON public.offer_preset_items TO service_role;
ALTER TABLE public.offer_preset_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offer_preset_items_active" ON public.offer_preset_items FOR ALL TO authenticated USING (public.is_active(auth.uid())) WITH CHECK (public.is_active(auth.uid()));

CREATE TABLE IF NOT EXISTS public.paid_lead_offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paid_pipeline_lead_id uuid REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE,
  crm_lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  operations_lead_id uuid REFERENCES public.operations_leads(id) ON DELETE CASCADE,
  offer_item_id uuid REFERENCES public.offer_items(id) ON DELETE SET NULL,
  source_preset_id uuid REFERENCES public.offer_presets(id) ON DELETE SET NULL,
  title text NOT NULL,
  duration_value numeric,
  duration_unit text,
  quantity numeric,
  notes text,
  source_context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS plo_paid_idx ON public.paid_lead_offer_items(paid_pipeline_lead_id);
CREATE INDEX IF NOT EXISTS plo_crm_idx ON public.paid_lead_offer_items(crm_lead_id);
CREATE INDEX IF NOT EXISTS plo_ops_idx ON public.paid_lead_offer_items(operations_lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS plo_dedup_paid ON public.paid_lead_offer_items(paid_pipeline_lead_id, offer_item_id, source_context)
  WHERE paid_pipeline_lead_id IS NOT NULL AND offer_item_id IS NOT NULL AND source_context IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paid_lead_offer_items TO authenticated;
GRANT ALL ON public.paid_lead_offer_items TO service_role;
ALTER TABLE public.paid_lead_offer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plo_select_active" ON public.paid_lead_offer_items FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "plo_insert_active" ON public.paid_lead_offer_items FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));
CREATE POLICY "plo_update_active" ON public.paid_lead_offer_items FOR UPDATE TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "plo_delete_admin" ON public.paid_lead_offer_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));

-- Helper: can_delete_offer_item — only if never attached
CREATE OR REPLACE FUNCTION public.can_delete_offer_item(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.paid_lead_offer_items WHERE offer_item_id = _id
    UNION ALL
    SELECT 1 FROM public.offer_preset_items WHERE offer_item_id = _id
  );
$$;
