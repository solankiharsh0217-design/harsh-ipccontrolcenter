
ALTER TABLE public.attribution_sessions
  ADD COLUMN IF NOT EXISTS ad_spend_tax_mode text,
  ADD COLUMN IF NOT EXISTS gst_rate numeric,
  ADD COLUMN IF NOT EXISTS roas_spend_basis text,
  ADD COLUMN IF NOT EXISTS total_net_ad_spend numeric,
  ADD COLUMN IF NOT EXISTS total_gst_amount numeric,
  ADD COLUMN IF NOT EXISTS total_gross_ad_spend numeric;

ALTER TABLE public.attribution_media_buyers
  ADD COLUMN IF NOT EXISTS entered_ad_spend numeric,
  ADD COLUMN IF NOT EXISTS net_ad_spend numeric,
  ADD COLUMN IF NOT EXISTS gst_amount numeric,
  ADD COLUMN IF NOT EXISTS gross_ad_spend numeric,
  ADD COLUMN IF NOT EXISTS ad_spend_tax_mode text,
  ADD COLUMN IF NOT EXISTS gst_rate numeric;
