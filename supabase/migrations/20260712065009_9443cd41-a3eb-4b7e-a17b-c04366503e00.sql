
ALTER TABLE public.attribution_sessions
  ADD COLUMN IF NOT EXISTS revenue_mode text,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS product_price numeric,
  ADD COLUMN IF NOT EXISTS product_gst_mode text,
  ADD COLUMN IF NOT EXISTS product_gst_percent numeric,
  ADD COLUMN IF NOT EXISTS roas_revenue_basis text,
  ADD COLUMN IF NOT EXISTS revenue_per_sale_gross numeric,
  ADD COLUMN IF NOT EXISTS revenue_per_sale_net numeric,
  ADD COLUMN IF NOT EXISTS total_gross_revenue numeric,
  ADD COLUMN IF NOT EXISTS total_net_revenue numeric,
  ADD COLUMN IF NOT EXISTS total_revenue_gst numeric,
  ADD COLUMN IF NOT EXISTS total_token_collected numeric;

ALTER TABLE public.attribution_media_buyers
  ADD COLUMN IF NOT EXISTS revenue_gross numeric,
  ADD COLUMN IF NOT EXISTS revenue_net numeric,
  ADD COLUMN IF NOT EXISTS revenue_gst numeric,
  ADD COLUMN IF NOT EXISTS token_collected numeric;

ALTER TABLE public.attribution_sales_detail
  ADD COLUMN IF NOT EXISTS revenue_gross numeric,
  ADD COLUMN IF NOT EXISTS revenue_net numeric,
  ADD COLUMN IF NOT EXISTS revenue_gst numeric,
  ADD COLUMN IF NOT EXISTS token_collected numeric;

ALTER TABLE public.roas_calculation_drafts
  ADD COLUMN IF NOT EXISTS revenue_config jsonb;
