ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS operations_sla_watch_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS operations_sla_overdue_days integer NOT NULL DEFAULT 6;