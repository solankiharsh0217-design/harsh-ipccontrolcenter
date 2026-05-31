-- Universal Lead Search: additive indexes only (no schema, no policy, no data changes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_leads_email_lower
  ON public.leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_leads_phone_last10
  ON public.leads (right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS idx_leads_full_name_trgm
  ON public.leads USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_paid_pipeline_leads_email_lower
  ON public.paid_pipeline_leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_paid_pipeline_leads_phone_last10
  ON public.paid_pipeline_leads (right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS idx_paid_pipeline_leads_name_trgm
  ON public.paid_pipeline_leads USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_operations_leads_email_lower
  ON public.operations_leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_operations_leads_phone_last10
  ON public.operations_leads (right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS idx_operations_leads_name_trgm
  ON public.operations_leads USING gin (name gin_trgm_ops);