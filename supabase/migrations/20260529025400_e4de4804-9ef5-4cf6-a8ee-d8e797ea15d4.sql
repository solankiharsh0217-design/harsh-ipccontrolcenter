
ALTER TABLE public.webinars
  ADD COLUMN IF NOT EXISTS normalized_name text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

UPDATE public.webinars SET normalized_name = lower(btrim(name)) WHERE normalized_name IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS webinars_active_norm_uq
  ON public.webinars (normalized_name) WHERE is_active = true;

-- Grants (previously missing)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinars TO authenticated;
GRANT ALL ON public.webinars TO service_role;

-- Replace policies: any active user can read/insert; admins can update/delete.
DROP POLICY IF EXISTS "admins manage webinars" ON public.webinars;
DROP POLICY IF EXISTS "members insert webinars" ON public.webinars;
DROP POLICY IF EXISTS "members read webinars" ON public.webinars;

CREATE POLICY "webinars_read_all_active"
  ON public.webinars FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

CREATE POLICY "webinars_insert_active"
  ON public.webinars FOR INSERT TO authenticated
  WITH CHECK (public.is_active(auth.uid()));

CREATE POLICY "webinars_update_admin"
  ON public.webinars FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "webinars_delete_admin"
  ON public.webinars FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS trg_webinars_updated ON public.webinars;
CREATE TRIGGER trg_webinars_updated BEFORE UPDATE ON public.webinars
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
