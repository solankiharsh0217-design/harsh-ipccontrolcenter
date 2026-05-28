REVOKE ALL ON FUNCTION public.can_manage_invoice_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_invoice_settings(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_invoice_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_invoice_settings(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_invoice_assets_storage_diagnostics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_invoice_assets_storage_diagnostics() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_invoice_assets_storage_diagnostics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_assets_storage_diagnostics() TO service_role;