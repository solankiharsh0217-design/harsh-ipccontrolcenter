-- Grant Data API access to invoice catalog + tax code tables. Policies already exist; without these grants PostgREST returns a permission error.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_item_categories TO authenticated;
GRANT ALL ON public.invoice_item_categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_code_master TO authenticated;
GRANT ALL ON public.tax_code_master TO service_role;