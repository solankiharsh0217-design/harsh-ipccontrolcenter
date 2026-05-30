
DROP INDEX IF EXISTS public.leads_unique_email;
CREATE UNIQUE INDEX leads_unique_email_per_pipeline
  ON public.leads (lower(email), pipeline_id)
  WHERE email IS NOT NULL AND email <> '' AND archived_at IS NULL AND deleted_at IS NULL;
