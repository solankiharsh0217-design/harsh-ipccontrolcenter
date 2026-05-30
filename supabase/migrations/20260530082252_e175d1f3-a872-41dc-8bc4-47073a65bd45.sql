
-- Phase 1: Unpaid → Paid conversion workflow

-- 1. Add conversion fields to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS conversion_status text NOT NULL DEFAULT 'not_converted',
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by uuid,
  ADD COLUMN IF NOT EXISTS hide_from_sales_workload boolean NOT NULL DEFAULT false;

-- Backfill: leads already linked to a paid buyer are 'linked_to_paid'
UPDATE public.leads
   SET conversion_status = 'linked_to_paid'
 WHERE paid_pipeline_lead_id IS NOT NULL
   AND conversion_status = 'not_converted';

-- 2. Conversion history audit table
CREATE TABLE IF NOT EXISTS public.crm_lead_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  destination_crm_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  paid_pipeline_lead_id uuid REFERENCES public.paid_pipeline_leads(id) ON DELETE SET NULL,
  conversion_type text NOT NULL,  -- created_new_paid | linked_existing_paid | moved_existing_lead
  source_pipeline_id uuid,
  source_stage_id uuid,
  destination_pipeline_id uuid,
  destination_stage_id uuid,
  program_name text,
  deal_value numeric,
  token_amount numeric,
  total_collected numeric,
  balance_pending numeric,
  assigned_owner_id uuid,
  status text NOT NULL DEFAULT 'success',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata_json jsonb
);

GRANT SELECT, INSERT, UPDATE ON public.crm_lead_conversions TO authenticated;
GRANT ALL ON public.crm_lead_conversions TO service_role;

ALTER TABLE public.crm_lead_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can read conversions"
  ON public.crm_lead_conversions FOR SELECT
  TO authenticated
  USING (public.is_active(auth.uid()));

CREATE POLICY "Active users can insert conversions"
  ON public.crm_lead_conversions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active(auth.uid()) AND (created_by IS NULL OR created_by = auth.uid()));

CREATE POLICY "Admins can update conversions"
  ON public.crm_lead_conversions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_crm_conv_source ON public.crm_lead_conversions(source_lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_conv_paid ON public.crm_lead_conversions(paid_pipeline_lead_id);
