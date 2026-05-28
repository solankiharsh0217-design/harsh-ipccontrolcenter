CREATE OR REPLACE FUNCTION public.get_invoice_assets_storage_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  bucket_record record;
  current_user_id uuid := auth.uid();
BEGIN
  SELECT id, public, file_size_limit, allowed_mime_types
  INTO bucket_record
  FROM storage.buckets
  WHERE id = 'invoice-assets';

  RETURN jsonb_build_object(
    'bucket_exists', bucket_record.id IS NOT NULL,
    'bucket_public', COALESCE(bucket_record.public, false),
    'file_size_limit', bucket_record.file_size_limit,
    'allowed_mime_types', bucket_record.allowed_mime_types,
    'current_user_id', current_user_id,
    'can_manage_invoice_settings', public.can_manage_invoice_settings(current_user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_assets_storage_diagnostics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_assets_storage_diagnostics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_assets_storage_diagnostics() TO service_role;