-- Remove public SELECT on code-of-conduct bucket; restrict to admins
DROP POLICY IF EXISTS "coc_storage_public_read" ON storage.objects;

CREATE POLICY "coc_storage_admin_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'code-of-conduct'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);