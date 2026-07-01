
-- Resource Library tables
CREATE TABLE public.resource_library_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.resource_library_categories TO authenticated;
GRANT ALL ON public.resource_library_categories TO service_role;

ALTER TABLE public.resource_library_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rlc_select_active_users" ON public.resource_library_categories
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

CREATE POLICY "rlc_admin_write" ON public.resource_library_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.resource_library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  resource_type text NOT NULL,
  resource_url text,
  storage_path text,
  file_name text,
  file_size bigint,
  mime_type text,
  thumbnail_url text,
  visibility text NOT NULL DEFAULT 'all_team',
  allowed_role_keys text[] NOT NULL DEFAULT '{}',
  allowed_module_keys text[] NOT NULL DEFAULT '{}',
  is_published boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rli_visibility_idx ON public.resource_library_items(visibility);
CREATE INDEX rli_category_idx ON public.resource_library_items(category);
CREATE INDEX rli_archived_idx ON public.resource_library_items(archived_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_library_items TO authenticated;
GRANT ALL ON public.resource_library_items TO service_role;

ALTER TABLE public.resource_library_items ENABLE ROW LEVEL SECURITY;

-- Helper: can current user see the resource based on visibility
CREATE OR REPLACE FUNCTION public.can_view_resource_library_item(
  _visibility text,
  _allowed_role_keys text[],
  _allowed_module_keys text[]
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_admin_flag boolean;
  is_active_flag boolean;
  user_role text;
  user_modules text[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  is_admin_flag := public.has_role(auth.uid(), 'admin'::public.app_role);
  IF is_admin_flag THEN RETURN true; END IF;
  is_active_flag := public.is_active(auth.uid());
  IF NOT is_active_flag THEN RETURN false; END IF;

  IF _visibility = 'admin_only' THEN RETURN false; END IF;
  IF _visibility = 'all_team' THEN RETURN true; END IF;

  SELECT lower(coalesce(role,'')) INTO user_role FROM public.profiles WHERE id = auth.uid();
  SELECT coalesce(array_agg(module_key), '{}') INTO user_modules FROM public.user_module_access WHERE user_id = auth.uid();

  IF _visibility = 'sales' THEN
    RETURN user_role ILIKE '%sales%'
      OR 'crm' = ANY(user_modules)
      OR 'calling_crm' = ANY(user_modules);
  ELSIF _visibility = 'operations' THEN
    RETURN user_role ILIKE '%operations%' OR 'operations_crm' = ANY(user_modules);
  ELSIF _visibility = 'finance' THEN
    RETURN user_role ILIKE '%finance%' OR 'payment_recovery' = ANY(user_modules);
  ELSIF _visibility = 'media_buyer' THEN
    RETURN user_role ILIKE '%media%buyer%' OR 'media_buyer_operations' = ANY(user_modules);
  ELSIF _visibility = 'custom' THEN
    RETURN (
      (_allowed_role_keys IS NOT NULL AND array_length(_allowed_role_keys,1) > 0
        AND EXISTS (SELECT 1 FROM unnest(_allowed_role_keys) rk WHERE user_role ILIKE '%'||lower(rk)||'%'))
      OR
      (_allowed_module_keys IS NOT NULL AND array_length(_allowed_module_keys,1) > 0
        AND user_modules && _allowed_module_keys)
    );
  END IF;
  RETURN false;
END $$;

CREATE POLICY "rli_select_visible" ON public.resource_library_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      is_published = true
      AND archived_at IS NULL
      AND public.can_view_resource_library_item(visibility, allowed_role_keys, allowed_module_keys)
    )
  );

CREATE POLICY "rli_admin_write" ON public.resource_library_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_rli_touch BEFORE UPDATE ON public.resource_library_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed categories
INSERT INTO public.resource_library_categories (name, sort_order) VALUES
  ('Sales Scripts', 10),
  ('WhatsApp Templates', 20),
  ('Email Templates', 30),
  ('Ad Copies', 40),
  ('Ad Creatives', 50),
  ('Coach Photos', 60),
  ('Event Assets', 70),
  ('Training Links', 80),
  ('Bonus Resources', 90),
  ('SOPs', 100),
  ('Payment & Finance', 110),
  ('Code of Conduct', 120),
  ('Operations', 130),
  ('Design Templates', 140),
  ('Client Documents', 150),
  ('Internal Docs', 160);

-- Storage policies for resource-library bucket (created via storage tool)
CREATE POLICY "rl_bucket_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'resource-library' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'resource-library' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "rl_bucket_active_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'resource-library'
    AND public.is_active(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.resource_library_items r
      WHERE r.storage_path = storage.objects.name
        AND r.archived_at IS NULL
        AND r.is_published = true
        AND (public.has_role(auth.uid(),'admin'::public.app_role)
             OR public.can_view_resource_library_item(r.visibility, r.allowed_role_keys, r.allowed_module_keys))
    )
  );
