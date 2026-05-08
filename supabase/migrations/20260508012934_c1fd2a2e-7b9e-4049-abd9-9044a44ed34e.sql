
ALTER TABLE public.attribution_sessions
  ADD COLUMN IF NOT EXISTS calculation_id text,
  ADD COLUMN IF NOT EXISTS input_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS output_hash text,
  ADD COLUMN IF NOT EXISTS media_buyer_order jsonb,
  ADD COLUMN IF NOT EXISTS column_mappings_used jsonb,
  ADD COLUMN IF NOT EXISTS duplicate_conflicts_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attribution_engine_version text DEFAULT 'deterministic_v1';

ALTER TABLE public.attribution_sales_detail
  ADD COLUMN IF NOT EXISTS sale_id text,
  ADD COLUMN IF NOT EXISTS matched_lead_id text,
  ADD COLUMN IF NOT EXISTS matched_lead_name text,
  ADD COLUMN IF NOT EXISTS matched_lead_email text,
  ADD COLUMN IF NOT EXISTS matched_lead_phone text,
  ADD COLUMN IF NOT EXISTS source_media_buyer text,
  ADD COLUMN IF NOT EXISTS source_row_index integer,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS competing_matches jsonb,
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.roas_attribution_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_session_id uuid REFERENCES public.attribution_sessions(id) ON DELETE CASCADE,
  calculation_id text NOT NULL,
  input_snapshot_hash text,
  output_hash text,
  media_buyer_order jsonb,
  column_mappings_used jsonb,
  audit_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  duplicate_conflicts jsonb DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roas_attribution_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raal_admin" ON public.roas_attribution_audit_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "raal_read" ON public.roas_attribution_audit_logs
  FOR SELECT TO authenticated
  USING (is_active(auth.uid()));

CREATE POLICY "raal_insert" ON public.roas_attribution_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    is_active(auth.uid()) AND (
      attribution_session_id IS NULL OR EXISTS (
        SELECT 1 FROM public.attribution_sessions s
        WHERE s.id = attribution_session_id AND s.created_by = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS raal_session_idx ON public.roas_attribution_audit_logs (attribution_session_id);
