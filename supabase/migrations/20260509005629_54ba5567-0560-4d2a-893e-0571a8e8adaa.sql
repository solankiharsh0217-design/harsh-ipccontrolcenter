
ALTER TABLE public.attribution_sessions
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NULL;

ALTER TABLE public.daily_lead_reports
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

CREATE INDEX IF NOT EXISTS attribution_sessions_is_deleted_idx
  ON public.attribution_sessions (is_deleted);

DROP POLICY IF EXISTS as_update_own ON public.attribution_sessions;
CREATE POLICY as_update_own
  ON public.attribution_sessions
  FOR UPDATE
  TO authenticated
  USING (is_active(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_active(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)));
