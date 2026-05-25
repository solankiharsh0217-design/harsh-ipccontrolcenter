
UPDATE storage.buckets SET public = false WHERE id = 'code-of-conduct';

DROP POLICY IF EXISTS "code_of_conduct_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "code_of_conduct_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "code_of_conduct_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "code_of_conduct_admin_delete" ON storage.objects;

CREATE POLICY "code_of_conduct_admin_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'code-of-conduct' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "code_of_conduct_admin_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'code-of-conduct' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "code_of_conduct_admin_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'code-of-conduct' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "code_of_conduct_admin_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'code-of-conduct' AND public.has_role(auth.uid(), 'admin'::public.app_role));
