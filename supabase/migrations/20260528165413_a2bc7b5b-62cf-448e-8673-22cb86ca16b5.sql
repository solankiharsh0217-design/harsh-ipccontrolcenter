
-- Harden invoice-assets storage policies: fully-qualified has_role, explicit SELECT,
-- restrict mime types and size on the bucket.

UPDATE storage.buckets
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/jpg','image/webp']
WHERE id = 'invoice-assets';

DROP POLICY IF EXISTS invoice_assets_admin_insert ON storage.objects;
DROP POLICY IF EXISTS invoice_assets_admin_update ON storage.objects;
DROP POLICY IF EXISTS invoice_assets_admin_delete ON storage.objects;
DROP POLICY IF EXISTS invoice_assets_public_select ON storage.objects;
DROP POLICY IF EXISTS invoice_assets_auth_select ON storage.objects;

CREATE POLICY invoice_assets_public_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'invoice-assets');

CREATE POLICY invoice_assets_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY invoice_assets_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'invoice-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'invoice-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY invoice_assets_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));
