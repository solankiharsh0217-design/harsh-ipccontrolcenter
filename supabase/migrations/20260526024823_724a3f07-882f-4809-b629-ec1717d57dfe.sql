
-- Code of Conduct: signed evidence + email correction + archive recipients

ALTER TABLE public.code_of_conduct_templates
  ADD COLUMN IF NOT EXISTS signed_copy_recipient_emails text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS send_signed_copy_to_member boolean NOT NULL DEFAULT true;

ALTER TABLE public.code_of_conduct_requests
  ADD COLUMN IF NOT EXISTS signed_receipt_url text,
  ADD COLUMN IF NOT EXISTS signed_html_url text,
  ADD COLUMN IF NOT EXISTS signed_receipt_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_copy_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS member_copy_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS corrected_contact_email text,
  ADD COLUMN IF NOT EXISTS email_change_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS signed_member_email text,
  ADD COLUMN IF NOT EXISTS signed_member_name text,
  ADD COLUMN IF NOT EXISTS acknowledgement_checklist jsonb;

-- Storage bucket for signed copies (private; access via signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('signed-code-of-conduct', 'signed-code-of-conduct', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket RLS: admins can list/manage; service-role bypasses RLS for uploads
DROP POLICY IF EXISTS "signed_coc_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "signed_coc_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "signed_coc_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "signed_coc_admin_delete" ON storage.objects;

CREATE POLICY "signed_coc_admin_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'signed-code-of-conduct' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "signed_coc_admin_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'signed-code-of-conduct' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "signed_coc_admin_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'signed-code-of-conduct' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "signed_coc_admin_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'signed-code-of-conduct' AND public.has_role(auth.uid(), 'admin'::app_role));
