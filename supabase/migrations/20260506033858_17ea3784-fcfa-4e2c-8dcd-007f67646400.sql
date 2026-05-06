ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sort_order double precision NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_leads_stage_sort ON public.leads(stage_id, sort_order);