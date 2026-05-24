-- Seed default tags (module_scope = 'all'), skip if exists
INSERT INTO public.tags (name, color, module_scope, created_by)
SELECT v.name, v.color, 'all', NULL
FROM (VALUES
  ('Balance Pending', '#CA8A04'),
  ('Second Token Pending', '#CA8A04'),
  ('Bajaj Pending', '#7C3AED'),
  ('Hot Payment', '#DC2626'),
  ('Urgent Follow-Up', '#DC2626'),
  ('Call Back Today', '#2563EB'),
  ('Documents Pending', '#CA8A04'),
  ('Finance Risk', '#BE185D'),
  ('Refund Risk', '#BE185D'),
  ('High Value', '#16A34A')
) AS v(name, color)
ON CONFLICT ((lower(name)), module_scope) DO NOTHING;

-- Seed default follow-up types into quick_save_entries (field_key = 'follow_up_type')
INSERT INTO public.quick_save_entries (field_key, value, sort_order, is_active, created_by)
SELECT 'follow_up_type', v.value, v.ord, true, NULL
FROM (VALUES
  ('Call', 10),
  ('WhatsApp', 20),
  ('Email', 30),
  ('SMS', 40),
  ('Payment Follow-Up', 50),
  ('Second Token Follow-Up', 60),
  ('Balance Follow-Up', 70),
  ('Finance Follow-Up', 80),
  ('Document Follow-Up', 90),
  ('Welcome Call', 100),
  ('Onboarding Call', 110),
  ('Other', 120)
) AS v(value, ord)
ON CONFLICT (field_key, value) DO NOTHING;