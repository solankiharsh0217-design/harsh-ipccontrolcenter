
-- 1) Business Units → Programme master upgrade
ALTER TABLE public.business_units
  ADD COLUMN IF NOT EXISTS program_key text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill program_key from name if null
UPDATE public.business_units
   SET program_key = upper(regexp_replace(name, '[^A-Za-z0-9]+', '_', 'g'))
 WHERE program_key IS NULL;

-- Enforce uniqueness of program_key going forward
CREATE UNIQUE INDEX IF NOT EXISTS ux_business_units_program_key
  ON public.business_units(program_key) WHERE program_key IS NOT NULL;

-- Seed IWC programme if missing
INSERT INTO public.business_units (name, program_key, sort_order, is_active)
SELECT 'IWC', 'IWC', 20, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_units
   WHERE upper(name) = 'IWC' OR program_key = 'IWC'
);

-- updated_at trigger for business_units
CREATE OR REPLACE FUNCTION public.tg_business_units_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_business_units_updated_at ON public.business_units;
CREATE TRIGGER trg_business_units_updated_at
BEFORE UPDATE ON public.business_units
FOR EACH ROW EXECUTE FUNCTION public.tg_business_units_updated_at();

-- 2) Program Products → Offer defaults
ALTER TABLE public.program_products
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_service_package_id uuid REFERENCES public.service_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_operations_template_id uuid REFERENCES public.operations_process_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_grade text,
  ADD COLUMN IF NOT EXISTS support_duration_months integer;

-- Backfill program_id from business_unit text
UPDATE public.program_products pp
   SET program_id = bu.id
  FROM public.business_units bu
 WHERE pp.program_id IS NULL
   AND upper(pp.business_unit) = upper(bu.name);

-- 3) Programme + Offer + Segment on downstream tables
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES public.program_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_segment_name text;

ALTER TABLE public.paid_pipeline_leads
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES public.program_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_segment_name text;

ALTER TABLE public.operations_leads
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES public.program_products(id) ON DELETE SET NULL;

ALTER TABLE public.webinar_templates
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL;

ALTER TABLE public.webinar_batches
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL;

-- Backfill webinar_batches.program_id from legacy business_unit text
UPDATE public.webinar_batches wb
   SET program_id = bu.id
  FROM public.business_units bu
 WHERE wb.program_id IS NULL
   AND upper(wb.business_unit) = upper(bu.name);

-- Backfill paid_pipeline_leads.offer_id from existing product_id FK
UPDATE public.paid_pipeline_leads ppl
   SET offer_id = ppl.product_id
 WHERE ppl.offer_id IS NULL AND ppl.product_id IS NOT NULL;

-- Backfill paid_pipeline_leads.program_id from linked offer
UPDATE public.paid_pipeline_leads ppl
   SET program_id = pp.program_id
  FROM public.program_products pp
 WHERE ppl.program_id IS NULL
   AND ppl.offer_id = pp.id
   AND pp.program_id IS NOT NULL;

-- Indexes to keep dropdown filters fast
CREATE INDEX IF NOT EXISTS idx_leads_program_id ON public.leads(program_id);
CREATE INDEX IF NOT EXISTS idx_ppl_program_id  ON public.paid_pipeline_leads(program_id);
CREATE INDEX IF NOT EXISTS idx_wb_program_id   ON public.webinar_batches(program_id);
CREATE INDEX IF NOT EXISTS idx_pp_program_id   ON public.program_products(program_id);

-- No new tables were created; existing RLS on all touched tables continues to apply.
