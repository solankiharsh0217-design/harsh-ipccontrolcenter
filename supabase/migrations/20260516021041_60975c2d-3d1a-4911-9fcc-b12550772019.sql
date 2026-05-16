
ALTER TABLE public.paid_pipeline_followups
  ADD COLUMN IF NOT EXISTS follow_up_type text,
  ADD COLUMN IF NOT EXISTS source_module text DEFAULT 'paid_pipeline',
  ADD COLUMN IF NOT EXISTS related_payment_id uuid,
  ADD COLUMN IF NOT EXISTS related_crm_lead_id uuid,
  ADD COLUMN IF NOT EXISTS completed_by uuid,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE public.paid_pipeline_followups
  ALTER COLUMN paid_pipeline_lead_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ppf_follow_up_date ON public.paid_pipeline_followups(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_ppf_status ON public.paid_pipeline_followups(status);
CREATE INDEX IF NOT EXISTS idx_ppf_is_deleted ON public.paid_pipeline_followups(is_deleted);
