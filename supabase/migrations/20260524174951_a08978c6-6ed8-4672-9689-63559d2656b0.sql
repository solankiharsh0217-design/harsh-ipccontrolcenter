ALTER TABLE public.paid_pipeline_leads
  ADD COLUMN IF NOT EXISTS finance_amount_approved numeric,
  ADD COLUMN IF NOT EXISTS finance_amount_disbursed numeric,
  ADD COLUMN IF NOT EXISTS finance_disbursement_date date,
  ADD COLUMN IF NOT EXISTS finance_count_as_collected boolean NOT NULL DEFAULT false;

-- Seed default lead_priority settings if missing
INSERT INTO public.paid_pipeline_settings (setting_type, label, value, sort_order, is_active, is_deleted)
SELECT 'lead_priority', t.label, jsonb_build_object('color', t.color)::text, t.so, true, false
FROM (VALUES
  ('Urgent','#DC2626',10),
  ('Hot','#EA580C',20),
  ('Warm','#CA8A04',30),
  ('Cold','#2563EB',40),
  ('Not Interested','#6B7280',50),
  ('Dropped Risk','#991B1B',60)
) AS t(label,color,so)
WHERE NOT EXISTS (
  SELECT 1 FROM public.paid_pipeline_settings s
  WHERE s.setting_type = 'lead_priority' AND lower(s.label) = lower(t.label)
);