CREATE TABLE IF NOT EXISTS public.code_of_conduct_email_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_key text UNIQUE NOT NULL,
  condition_name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  html_body text NOT NULL DEFAULT '',
  text_body text,
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.code_of_conduct_email_variants TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.code_of_conduct_email_variants TO authenticated;
GRANT ALL ON public.code_of_conduct_email_variants TO service_role;

ALTER TABLE public.code_of_conduct_email_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coc_variants_select_authenticated" ON public.code_of_conduct_email_variants;
CREATE POLICY "coc_variants_select_authenticated"
  ON public.code_of_conduct_email_variants FOR SELECT TO authenticated
  USING (is_active OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coc_variants_insert_admin" ON public.code_of_conduct_email_variants;
CREATE POLICY "coc_variants_insert_admin"
  ON public.code_of_conduct_email_variants FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coc_variants_update_admin" ON public.code_of_conduct_email_variants;
CREATE POLICY "coc_variants_update_admin"
  ON public.code_of_conduct_email_variants FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coc_variants_delete_admin" ON public.code_of_conduct_email_variants;
CREATE POLICY "coc_variants_delete_admin"
  ON public.code_of_conduct_email_variants FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_coc_variants_updated_at ON public.code_of_conduct_email_variants;
CREATE TRIGGER trg_coc_variants_updated_at
  BEFORE UPDATE ON public.code_of_conduct_email_variants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.code_of_conduct_requests
  ADD COLUMN IF NOT EXISTS process_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS process_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_duration_hours numeric,
  ADD COLUMN IF NOT EXISTS completion_duration_days integer,
  ADD COLUMN IF NOT EXISTS completion_selection text,
  ADD COLUMN IF NOT EXISTS completion_condition_key text,
  ADD COLUMN IF NOT EXISTS email_variant_id uuid REFERENCES public.code_of_conduct_email_variants(id),
  ADD COLUMN IF NOT EXISTS email_variant_version integer,
  ADD COLUMN IF NOT EXISTS email_subject_snapshot text,
  ADD COLUMN IF NOT EXISTS email_body_snapshot text,
  ADD COLUMN IF NOT EXISTS timing_override_reason text;