
ALTER TABLE public.seminar_roas_reports
  ADD COLUMN IF NOT EXISTS roas_revenue_basis text;

ALTER TABLE public.seminar_roas_report_products
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.program_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_name_snapshot text,
  ADD COLUMN IF NOT EXISTS programme_snapshot text,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS gst_mode text,
  ADD COLUMN IF NOT EXISTS gst_percent numeric,
  ADD COLUMN IF NOT EXISTS gross_per_sale numeric,
  ADD COLUMN IF NOT EXISTS net_per_sale numeric,
  ADD COLUMN IF NOT EXISTS gst_per_sale numeric,
  ADD COLUMN IF NOT EXISTS is_price_tier boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_srrp_product_id ON public.seminar_roas_report_products(product_id);
