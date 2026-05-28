-- Ensure invoice-assets bucket exists and has the expected public image settings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-assets',
  'invoice-assets',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Centralized permission check for invoice/company settings management.
-- Roles remain in user_roles; profile is only used to require an active account.
CREATE OR REPLACE FUNCTION public.can_manage_invoice_settings(user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = user_uuid
      AND ur.role = 'admin'::public.app_role
      AND p.status = 'active'
  )
$$;

REVOKE ALL ON FUNCTION public.can_manage_invoice_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_invoice_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_invoice_settings(uuid) TO service_role;

-- Replace older/inconsistent invoice-assets storage policies.
DROP POLICY IF EXISTS "invoice_assets_public_read" ON storage.objects;
DROP POLICY IF EXISTS "invoice_assets_public_select" ON storage.objects;
DROP POLICY IF EXISTS "invoice_assets_auth_select" ON storage.objects;
DROP POLICY IF EXISTS "invoice_assets_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "invoice_assets_invoice_read" ON storage.objects;
DROP POLICY IF EXISTS "invoice_assets_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "invoice_assets_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "invoice_assets_admin_delete" ON storage.objects;

CREATE POLICY "invoice_assets_admin_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoice-assets'
  AND public.can_manage_invoice_settings(auth.uid())
);

CREATE POLICY "invoice_assets_invoice_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoice-assets'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "invoice_assets_admin_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoice-assets'
  AND public.can_manage_invoice_settings(auth.uid())
);

CREATE POLICY "invoice_assets_admin_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'invoice-assets'
  AND public.can_manage_invoice_settings(auth.uid())
)
WITH CHECK (
  bucket_id = 'invoice-assets'
  AND public.can_manage_invoice_settings(auth.uid())
);

CREATE POLICY "invoice_assets_admin_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoice-assets'
  AND public.can_manage_invoice_settings(auth.uid())
);