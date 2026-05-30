
-- Add 3-way link columns for paid conversion
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS converted_to_crm_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE public.paid_pipeline_leads
  ADD COLUMN IF NOT EXISTS source_unpaid_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_converted_to_crm_lead_id ON public.leads(converted_to_crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_paid_pipeline_leads_source_unpaid_lead_id ON public.paid_pipeline_leads(source_unpaid_lead_id);
