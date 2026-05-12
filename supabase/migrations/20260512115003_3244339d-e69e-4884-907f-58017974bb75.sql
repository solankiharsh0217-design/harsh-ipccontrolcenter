
-- Per-user module access toggles
CREATE TABLE IF NOT EXISTS public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_key text NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_key)
);

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage module access"
  ON public.user_module_access FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users see own module access"
  ON public.user_module_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Active members read all module access"
  ON public.user_module_access FOR SELECT
  TO authenticated
  USING (public.is_active(auth.uid()));
