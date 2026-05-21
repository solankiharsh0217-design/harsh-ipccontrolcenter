
CREATE TABLE IF NOT EXISTS public.media_buyer_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_name text NOT NULL,
  canonical_name text NOT NULL,
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS media_buyer_aliases_alias_key
  ON public.media_buyer_aliases (lower(trim(alias_name)))
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS media_buyer_aliases_canonical_idx
  ON public.media_buyer_aliases (lower(trim(canonical_name)));

ALTER TABLE public.media_buyer_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active_users_select_aliases"
  ON public.media_buyer_aliases FOR SELECT
  USING (public.is_active(auth.uid()));

CREATE POLICY "admins_insert_aliases"
  ON public.media_buyer_aliases FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins_update_aliases"
  ON public.media_buyer_aliases FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins_delete_aliases"
  ON public.media_buyer_aliases FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_media_buyer_aliases_updated_at
  BEFORE UPDATE ON public.media_buyer_aliases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
