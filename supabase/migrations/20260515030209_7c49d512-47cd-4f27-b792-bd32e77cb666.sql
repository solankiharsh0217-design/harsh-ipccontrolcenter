
-- Phase 1: Paid Pipeline operational upgrade

-- paid_pipeline_leads new columns
ALTER TABLE public.paid_pipeline_leads
  ADD COLUMN IF NOT EXISTS balance_category text,
  ADD COLUMN IF NOT EXISTS balance_description text,
  ADD COLUMN IF NOT EXISTS next_balance_follow_up_date date,
  ADD COLUMN IF NOT EXISTS next_follow_up_date date,
  ADD COLUMN IF NOT EXISTS next_follow_up_time text,
  ADD COLUMN IF NOT EXISTS follow_up_reason text,
  ADD COLUMN IF NOT EXISTS follow_up_priority text,
  ADD COLUMN IF NOT EXISTS follow_up_status text,
  ADD COLUMN IF NOT EXISTS lead_temperature text,
  ADD COLUMN IF NOT EXISTS paid_batch_name text,
  ADD COLUMN IF NOT EXISTS onboarding_batch_name text,
  ADD COLUMN IF NOT EXISTS crm_pipeline_id uuid,
  ADD COLUMN IF NOT EXISTS crm_stage_id uuid,
  ADD COLUMN IF NOT EXISTS crm_lead_id uuid,
  ADD COLUMN IF NOT EXISTS sent_to_crm boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_to_crm_at timestamptz,
  ADD COLUMN IF NOT EXISTS revenue_to_be_realized numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finance_notes text,
  ADD COLUMN IF NOT EXISTS finance_follow_up_date date,
  ADD COLUMN IF NOT EXISTS finance_owner text,
  ADD COLUMN IF NOT EXISTS revenue_recognition_rule text;

-- paid_pipeline_payments new columns
ALTER TABLE public.paid_pipeline_payments
  ADD COLUMN IF NOT EXISTS payment_category text,
  ADD COLUMN IF NOT EXISTS next_payment_expected_date date,
  ADD COLUMN IF NOT EXISTS payment_description text,
  ADD COLUMN IF NOT EXISTS finance_linked boolean DEFAULT false;

-- paid_pipeline_followups
CREATE TABLE IF NOT EXISTS public.paid_pipeline_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paid_pipeline_lead_id uuid NOT NULL,
  follow_up_date date NOT NULL,
  follow_up_time text,
  follow_up_reason text,
  priority text,
  status text NOT NULL DEFAULT 'Pending',
  assigned_to text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  completed_at timestamptz
);
ALTER TABLE public.paid_pipeline_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppfu_admin ON public.paid_pipeline_followups;
DROP POLICY IF EXISTS ppfu_read ON public.paid_pipeline_followups;
DROP POLICY IF EXISTS ppfu_insert ON public.paid_pipeline_followups;
DROP POLICY IF EXISTS ppfu_update ON public.paid_pipeline_followups;
DROP POLICY IF EXISTS ppfu_delete ON public.paid_pipeline_followups;

CREATE POLICY ppfu_admin ON public.paid_pipeline_followups FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY ppfu_read ON public.paid_pipeline_followups FOR SELECT TO authenticated
  USING (is_active(auth.uid()));
CREATE POLICY ppfu_insert ON public.paid_pipeline_followups FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()));
CREATE POLICY ppfu_update ON public.paid_pipeline_followups FOR UPDATE TO authenticated
  USING (is_active(auth.uid())) WITH CHECK (is_active(auth.uid()));
CREATE POLICY ppfu_delete ON public.paid_pipeline_followups FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role)));

CREATE INDEX IF NOT EXISTS idx_ppfu_lead ON public.paid_pipeline_followups(paid_pipeline_lead_id);
CREATE INDEX IF NOT EXISTS idx_ppfu_date ON public.paid_pipeline_followups(follow_up_date);

DROP TRIGGER IF EXISTS trg_ppfu_updated_at ON public.paid_pipeline_followups;
CREATE TRIGGER trg_ppfu_updated_at BEFORE UPDATE ON public.paid_pipeline_followups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- paid_pipeline_to_crm_links
CREATE TABLE IF NOT EXISTS public.paid_pipeline_to_crm_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paid_pipeline_lead_id uuid NOT NULL,
  crm_lead_id uuid,
  crm_pipeline_id uuid,
  crm_stage_id uuid,
  onboarding_batch_name text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid,
  notes text
);
ALTER TABLE public.paid_pipeline_to_crm_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pptcl_admin ON public.paid_pipeline_to_crm_links;
DROP POLICY IF EXISTS pptcl_read ON public.paid_pipeline_to_crm_links;
DROP POLICY IF EXISTS pptcl_insert ON public.paid_pipeline_to_crm_links;

CREATE POLICY pptcl_admin ON public.paid_pipeline_to_crm_links FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY pptcl_read ON public.paid_pipeline_to_crm_links FOR SELECT TO authenticated
  USING (is_active(auth.uid()));
CREATE POLICY pptcl_insert ON public.paid_pipeline_to_crm_links FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pptcl_lead ON public.paid_pipeline_to_crm_links(paid_pipeline_lead_id);

-- Allow active members (not just admins) to create/edit pipelines and stages from the front
DROP POLICY IF EXISTS "members manage pipelines" ON public.pipelines;
CREATE POLICY "members manage pipelines" ON public.pipelines FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()));
DROP POLICY IF EXISTS "members update pipelines" ON public.pipelines;
CREATE POLICY "members update pipelines" ON public.pipelines FOR UPDATE TO authenticated
  USING (is_active(auth.uid())) WITH CHECK (is_active(auth.uid()));

DROP POLICY IF EXISTS "members manage stages" ON public.stages;
CREATE POLICY "members manage stages" ON public.stages FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()));
DROP POLICY IF EXISTS "members update stages" ON public.stages;
CREATE POLICY "members update stages" ON public.stages FOR UPDATE TO authenticated
  USING (is_active(auth.uid())) WITH CHECK (is_active(auth.uid()));
DROP POLICY IF EXISTS "members delete stages" ON public.stages;
CREATE POLICY "members delete stages" ON public.stages FOR DELETE TO authenticated
  USING (is_active(auth.uid()) AND NOT is_protected);

-- Seed Paid — Onboarding pipeline + default stages (idempotent)
DO $$
DECLARE
  p_id uuid;
  pos int := 0;
  stage_name text;
  stage_names text[] := ARRAY[
    'Payment Confirmed','Welcome Call Pending','Welcome Call Done',
    'Code of Conduct Signed','Bajaj / Finance Documents Received','Finance Approved',
    'Access Given','Active Member','Onboarding Completed','Issue / Escalation','Dropped / Refund'
  ];
BEGIN
  SELECT id INTO p_id FROM public.pipelines WHERE name = 'Paid — Onboarding' LIMIT 1;
  IF p_id IS NULL THEN
    INSERT INTO public.pipelines (name, type, position)
    VALUES ('Paid — Onboarding', 'custom', COALESCE((SELECT MAX(position)+1 FROM public.pipelines), 0))
    RETURNING id INTO p_id;
  END IF;

  FOREACH stage_name IN ARRAY stage_names LOOP
    IF NOT EXISTS (SELECT 1 FROM public.stages WHERE pipeline_id = p_id AND name = stage_name) THEN
      INSERT INTO public.stages (pipeline_id, name, color, position)
      VALUES (p_id, stage_name, 'gray', pos);
    END IF;
    pos := pos + 1;
  END LOOP;
END $$;
