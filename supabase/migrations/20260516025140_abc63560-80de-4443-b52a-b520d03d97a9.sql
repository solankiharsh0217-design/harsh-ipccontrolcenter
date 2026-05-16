ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_receive_calling_crm_leads boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_receive_paid_pipeline_leads boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_receive_follow_up_tasks boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_receive_payment_recovery_leads boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_in_round_robin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active_for_assignment boolean NOT NULL DEFAULT true;