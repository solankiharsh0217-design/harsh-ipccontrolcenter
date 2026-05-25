
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS idx_leads_archived_at ON public.leads(archived_at) WHERE archived_at IS NOT NULL;

ALTER TABLE public.paid_pipeline_leads
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS idx_ppl_archived_at ON public.paid_pipeline_leads(archived_at) WHERE archived_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_batch_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid,
  batch_name text NOT NULL,
  batch_date date,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_by uuid,
  archive_reason text,
  affected_lead_count integer NOT NULL DEFAULT 0,
  restored_at timestamptz,
  restored_by uuid
);

ALTER TABLE public.crm_batch_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage crm_batch_archives" ON public.crm_batch_archives;
CREATE POLICY "admins manage crm_batch_archives"
  ON public.crm_batch_archives
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "active users read crm_batch_archives" ON public.crm_batch_archives;
CREATE POLICY "active users read crm_batch_archives"
  ON public.crm_batch_archives FOR SELECT
  TO authenticated
  USING (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "active users insert crm_batch_archives" ON public.crm_batch_archives;
CREATE POLICY "active users insert crm_batch_archives"
  ON public.crm_batch_archives FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active(auth.uid()) AND archived_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_cba_pipeline_batch ON public.crm_batch_archives(pipeline_id, batch_name);
