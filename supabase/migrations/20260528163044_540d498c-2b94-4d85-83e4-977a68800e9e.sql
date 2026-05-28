ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS require_authorized_signature boolean NOT NULL DEFAULT false;