-- 1. Add new columns to code_of_conduct_email_variants
ALTER TABLE public.code_of_conduct_email_variants ADD COLUMN IF NOT EXISTS from_email text;
ALTER TABLE public.code_of_conduct_email_variants ADD COLUMN IF NOT EXISTS from_name text;
ALTER TABLE public.code_of_conduct_email_variants ADD COLUMN IF NOT EXISTS reply_to_email text;
ALTER TABLE public.code_of_conduct_email_variants ADD COLUMN IF NOT EXISTS test_recipient_email text;

-- 2. Migrate existing production values from the active template to all variants
-- This preserves the "Next Day" behavior as the baseline for all variants.
UPDATE public.code_of_conduct_email_variants v
SET 
  from_email = t.from_email,
  from_name = t.from_name,
  reply_to_email = t.reply_to_email,
  test_recipient_email = t.test_recipient_email
FROM public.code_of_conduct_templates t
WHERE t.is_active = true;

-- 3. Add snapshot columns to code_of_conduct_requests for historical integrity
ALTER TABLE public.code_of_conduct_requests ADD COLUMN IF NOT EXISTS from_email_snapshot text;
ALTER TABLE public.code_of_conduct_requests ADD COLUMN IF NOT EXISTS from_name_snapshot text;
ALTER TABLE public.code_of_conduct_requests ADD COLUMN IF NOT EXISTS reply_to_email_snapshot text;

-- 4. Audit Log inserts for migration
INSERT INTO public.audit_logs (
    module_key, module_label, action_type, action_label, 
    entity_type, entity_id, entity_label, summary, metadata
)
SELECT 
    'code_of_conduct', 'Code of Conduct', 'coc_migration', 'Email Setup Migration',
    'code_of_conduct_email_variant', id, condition_name,
    'Migrated global email setup to ' || condition_name || ' variant.',
    jsonb_build_object('condition_key', condition_key)
FROM public.code_of_conduct_email_variants;
