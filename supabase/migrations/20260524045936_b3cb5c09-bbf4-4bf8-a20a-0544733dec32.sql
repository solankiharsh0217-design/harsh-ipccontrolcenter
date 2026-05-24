
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS paid_pipeline_lead_id uuid;
ALTER TABLE public.paid_pipeline_leads ADD COLUMN IF NOT EXISTS crm_lead_id uuid;
CREATE INDEX IF NOT EXISTS idx_leads_paid_pipeline_lead_id ON public.leads(paid_pipeline_lead_id);
CREATE INDEX IF NOT EXISTS idx_paid_pipeline_leads_crm_lead_id ON public.paid_pipeline_leads(crm_lead_id);

CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  module_scope text NOT NULL DEFAULT 'all',
  created_by uuid,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_name_scope ON public.tags (lower(name), module_scope);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tags_select_active" ON public.tags;
CREATE POLICY "tags_select_active" ON public.tags FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()) AND is_deleted = false);
DROP POLICY IF EXISTS "tags_insert_active" ON public.tags;
CREATE POLICY "tags_insert_active" ON public.tags FOR INSERT TO authenticated
  WITH CHECK (public.is_active(auth.uid()) AND created_by = auth.uid());
DROP POLICY IF EXISTS "tags_update_owner_or_admin" ON public.tags;
CREATE POLICY "tags_update_owner_or_admin" ON public.tags FOR UPDATE TO authenticated
  USING (public.is_active(auth.uid()) AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')));

DROP TRIGGER IF EXISTS trg_tags_updated_at ON public.tags;
CREATE TRIGGER trg_tags_updated_at BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.lead_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  crm_lead_id uuid,
  paid_pipeline_lead_id uuid,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (crm_lead_id IS NOT NULL OR paid_pipeline_lead_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_crm_lead ON public.lead_tag_assignments(tag_id, crm_lead_id) WHERE crm_lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_paid_lead ON public.lead_tag_assignments(tag_id, paid_pipeline_lead_id) WHERE paid_pipeline_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lta_crm_lead ON public.lead_tag_assignments(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_lta_paid_lead ON public.lead_tag_assignments(paid_pipeline_lead_id);

ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lta_select_active" ON public.lead_tag_assignments;
CREATE POLICY "lta_select_active" ON public.lead_tag_assignments FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));
DROP POLICY IF EXISTS "lta_insert_active" ON public.lead_tag_assignments;
CREATE POLICY "lta_insert_active" ON public.lead_tag_assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_active(auth.uid()) AND assigned_by = auth.uid());
DROP POLICY IF EXISTS "lta_delete_active" ON public.lead_tag_assignments;
CREATE POLICY "lta_delete_active" ON public.lead_tag_assignments FOR DELETE TO authenticated
  USING (public.is_active(auth.uid()));
