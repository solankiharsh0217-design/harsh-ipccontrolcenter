
-- Phase 1.2: Diamond Access Readiness

ALTER TABLE public.paid_pipeline_leads
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'not_ready',
  ADD COLUMN IF NOT EXISTS access_given_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_given_by uuid,
  ADD COLUMN IF NOT EXISTS access_channel text,
  ADD COLUMN IF NOT EXISTS access_note text,
  ADD COLUMN IF NOT EXISTS access_blocker_reason text,
  ADD COLUMN IF NOT EXISTS access_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_blocked_by uuid;

CREATE INDEX IF NOT EXISTS idx_paid_pipeline_leads_access_status
  ON public.paid_pipeline_leads(access_status);

CREATE TABLE IF NOT EXISTS public.access_readiness_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paid_pipeline_lead_id uuid NOT NULL REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_status text,
  new_status text,
  channel text,
  note text,
  blocker_reason text,
  performed_by uuid,
  performed_by_name text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.access_readiness_logs TO authenticated;
GRANT ALL ON public.access_readiness_logs TO service_role;

ALTER TABLE public.access_readiness_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access readiness logs: read by admin or related"
  ON public.access_readiness_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.paid_pipeline_leads p
      LEFT JOIN public.leads l ON l.id = p.crm_lead_id
      WHERE p.id = paid_pipeline_lead_id
        AND (
          p.assigned_sales_executive = auth.uid()
          OR p.created_by = auth.uid()
          OR l.assigned_agent_id = auth.uid()
        )
    )
  );

CREATE POLICY "Access readiness logs: insert by admin or related"
  ON public.access_readiness_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.paid_pipeline_leads p
      LEFT JOIN public.leads l ON l.id = p.crm_lead_id
      WHERE p.id = paid_pipeline_lead_id
        AND (
          p.assigned_sales_executive = auth.uid()
          OR p.created_by = auth.uid()
          OR l.assigned_agent_id = auth.uid()
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_access_readiness_logs_lead
  ON public.access_readiness_logs(paid_pipeline_lead_id, created_at DESC);
