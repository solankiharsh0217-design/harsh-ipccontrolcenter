
-- Add service package metadata to webinar_batches (the Calling CRM import segment/batch table)
ALTER TABLE public.webinar_batches
  ADD COLUMN IF NOT EXISTS service_package_id uuid REFERENCES public.service_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_package_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS process_template_id uuid REFERENCES public.operations_process_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS deal_value numeric,
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_lead_count integer;

-- Unique index for upsert by (batch_name, webinar_date). Allow nulls properly.
CREATE UNIQUE INDEX IF NOT EXISTS webinar_batches_name_date_uidx
  ON public.webinar_batches (lower(coalesce(batch_name, webinar_name, '')), coalesce(webinar_date, '1900-01-01'::date))
  WHERE is_deleted = false;
