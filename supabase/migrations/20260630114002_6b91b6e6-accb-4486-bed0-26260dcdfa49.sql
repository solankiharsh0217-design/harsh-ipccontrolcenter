
-- Bonus Access Email settings on company_settings (admin-editable copy & links)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS bonus_email_auto_send boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bonus_email_subject text DEFAULT 'Your Special Bonuses Are Now Activated',
  ADD COLUMN IF NOT EXISTS bonus_email_body text DEFAULT $body$Hi {{member_name}},

Welcome aboard! Your IPC Diamond Membership bonuses are now active.

Activation date: {{activation_date}}
Subscription: {{subscription_duration}}

Your bonus resources are listed below. If you need any help, write to {{support_email}}.

Regards,
Team IPC$body$,
  ADD COLUMN IF NOT EXISTS bonus_email_support_email text DEFAULT 'support@ipcindiaacademy.in',
  ADD COLUMN IF NOT EXISTS bonus_email_subscription_duration text DEFAULT '2 years from the date of activation',
  ADD COLUMN IF NOT EXISTS bonus_resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bonus_terms_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS bonus_terms_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS bonus_terms_updated_at timestamptz;

-- Seed default bonus resources where empty
UPDATE public.company_settings
SET bonus_resources = '[
  {"id":"r1","title":"AI Ads Designing Training","description":"Step-by-step training to design ads using AI.","url":"","type":"Training","active":true},
  {"id":"r2","title":"Design Your Wedding Portfolio Using AI","description":"Build a stunning wedding portfolio with AI.","url":"","type":"Training","active":true},
  {"id":"r3","title":"Name & Logo Design Using AI","description":"Create a brand name and logo using AI tools.","url":"","type":"Training","active":true},
  {"id":"r4","title":"Prompt Sheet","description":"Curated prompts for photographers.","url":"","type":"Prompt Sheet","active":true},
  {"id":"r5","title":"₹5 Lacs Bonus Resources / Portfolio Support","description":"Access portfolio support and bonus resources worth ₹5 Lacs.","url":"","type":"Portfolio Support","active":true}
]'::jsonb
WHERE bonus_resources = '[]'::jsonb OR bonus_resources IS NULL;

-- Bonus tracking on each Code of Conduct request (per-member history)
ALTER TABLE public.code_of_conduct_requests
  ADD COLUMN IF NOT EXISTS bonus_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_bonus_email_resent_at timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_email_template_version integer,
  ADD COLUMN IF NOT EXISTS bonus_terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_terms_version_accepted integer,
  ADD COLUMN IF NOT EXISTS bonus_terms_text_snapshot text;
