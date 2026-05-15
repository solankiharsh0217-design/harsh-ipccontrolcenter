CREATE TABLE IF NOT EXISTS public.paid_pipeline_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name text NOT NULL,
  business_unit text,
  source_webinar_batch_id uuid,
  source_webinar_name text,
  source_webinar_date date,
  product_id uuid,
  product_name_snapshot text,
  description text,
  batch_status text NOT NULL DEFAULT 'Active',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paid_pipeline_batches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ppb_admin ON public.paid_pipeline_batches FOR ALL TO authenticated
    USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY ppb_read ON public.paid_pipeline_batches FOR SELECT TO authenticated
    USING (is_active(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY ppb_insert ON public.paid_pipeline_batches FOR INSERT TO authenticated
    WITH CHECK (is_active(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY ppb_update ON public.paid_pipeline_batches FOR UPDATE TO authenticated
    USING (is_active(auth.uid()))
    WITH CHECK (is_active(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at_ppb()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_ppb_updated_at
  BEFORE UPDATE ON public.paid_pipeline_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ppb();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.paid_pipeline_leads
  ADD COLUMN IF NOT EXISTS paid_batch_id uuid,
  ADD COLUMN IF NOT EXISTS source_webinar_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_ppl_paid_batch_id ON public.paid_pipeline_leads(paid_batch_id);
CREATE INDEX IF NOT EXISTS idx_ppl_source_webinar_batch_id ON public.paid_pipeline_leads(source_webinar_batch_id);
CREATE INDEX IF NOT EXISTS idx_ppb_status ON public.paid_pipeline_batches(batch_status) WHERE is_deleted = false;