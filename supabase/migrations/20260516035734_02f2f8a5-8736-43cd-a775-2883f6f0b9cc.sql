CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text,
  module_label text,
  action_type text NOT NULL,
  action_label text,
  entity_type text,
  entity_id uuid,
  entity_label text,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  target_user_id uuid,
  target_name text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb,
  severity text NOT NULL DEFAULT 'info',
  source text NOT NULL DEFAULT 'app',
  summary text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module_key ON public.audit_logs (module_key);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON public.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON public.audit_logs (severity);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS al_admin ON public.audit_logs;
CREATE POLICY al_admin ON public.audit_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS al_insert ON public.audit_logs;
CREATE POLICY al_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active(auth.uid()));

DROP POLICY IF EXISTS al_read_admin_only ON public.audit_logs;
CREATE POLICY al_read_admin_only ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));