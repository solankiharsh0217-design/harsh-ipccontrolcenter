
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid,
  recipient_team_member_id uuid,
  recipient_role text,
  module_key text,
  notification_type text,
  title text NOT NULL,
  message text,
  entity_type text,
  entity_id uuid,
  entity_label text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'unread',
  action_url text,
  action_label text,
  metadata jsonb,
  triggered_by_user_id uuid,
  triggered_by_name text,
  source text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_module ON public.notifications(module_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON public.notifications(recipient_user_id, notification_type, entity_type, entity_id, status);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own_or_admin"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    is_deleted = false AND (
      recipient_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "notifications_update_own_or_admin"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "notifications_delete_admin"
  ON public.notifications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


CREATE TABLE IF NOT EXISTS public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text UNIQUE NOT NULL,
  rule_name text NOT NULL,
  module_key text,
  trigger_type text,
  conditions jsonb,
  recipient_type text,
  recipient_config jsonb,
  priority text NOT NULL DEFAULT 'normal',
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rules_admin_all" ON public.notification_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_notification_rules_updated_at
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  team_member_id uuid,
  module_key text,
  notification_type text,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON public.notification_preferences(user_id, module_key, notification_type);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prefs_select_own_or_admin" ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "prefs_modify_own" ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "prefs_update_own" ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "prefs_delete_own" ON public.notification_preferences FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_notification_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- Default notification rules (idempotent)
INSERT INTO public.notification_rules (rule_key, rule_name, module_key, trigger_type, priority, recipient_type)
VALUES
  ('followup_due_today', 'Follow-up due today', 'follow_up_command_center', 'follow_up', 'high', 'owner'),
  ('followup_overdue', 'Follow-up overdue', 'follow_up_command_center', 'follow_up', 'urgent', 'owner'),
  ('followup_hot_overdue', 'Hot/Urgent follow-up overdue', 'follow_up_command_center', 'follow_up', 'urgent', 'owner'),
  ('followup_missed', 'Missed follow-up not rescheduled', 'follow_up_command_center', 'follow_up', 'high', 'owner'),
  ('recovery_high_value', 'High-value balance pending', 'payment_recovery', 'recovery', 'urgent', 'owner_or_admin'),
  ('recovery_no_next_date', 'Token paid but no next payment date', 'payment_recovery', 'recovery', 'high', 'owner_or_admin'),
  ('recovery_no_owner', 'Balance pending but no owner assigned', 'payment_recovery', 'recovery', 'high', 'admin'),
  ('recovery_overdue_3d', 'Recovery overdue more than 3 days', 'payment_recovery', 'recovery', 'urgent', 'owner_or_admin'),
  ('finance_docs_pending_2d', 'Finance documents pending more than 2 days', 'payment_recovery', 'finance', 'high', 'owner_or_admin'),
  ('finance_no_approval_3d', 'Application submitted but no approval after 3 days', 'payment_recovery', 'finance', 'high', 'owner_or_admin'),
  ('finance_approved_not_disbursed', 'Approved but not disbursed', 'payment_recovery', 'finance', 'high', 'owner_or_admin'),
  ('finance_rejected_no_alt', 'Rejected but no alternate partner selected', 'payment_recovery', 'finance', 'high', 'owner_or_admin'),
  ('finance_followup_overdue', 'Finance follow-up overdue', 'payment_recovery', 'finance', 'high', 'owner_or_admin'),
  ('crm_lead_assigned', 'New CRM lead assigned', 'calling_crm', 'crm', 'normal', 'owner'),
  ('crm_paid_onboarding', 'Paid lead sent to CRM / Paid Onboarding', 'paid_pipeline', 'crm', 'normal', 'owner_or_admin'),
  ('crm_welcome_pending', 'Welcome call pending', 'calling_crm', 'crm', 'normal', 'owner'),
  ('audit_access_changed', 'Access granted or removed', 'audit_log', 'audit', 'high', 'admin'),
  ('audit_payment_deleted', 'Payment deleted', 'audit_log', 'audit', 'urgent', 'admin'),
  ('audit_report_deleted', 'Report deleted', 'audit_log', 'audit', 'high', 'admin'),
  ('audit_critical_event', 'Critical audit event', 'audit_log', 'audit', 'urgent', 'admin'),
  ('webinar_high_cpl', 'High CPL webinar', 'webinar_performance', 'webinar', 'high', 'admin'),
  ('webinar_low_showup', 'Low show-up webinar', 'webinar_performance', 'webinar', 'normal', 'admin'),
  ('webinar_high_pending_revenue', 'High pending revenue webinar', 'webinar_performance', 'webinar', 'high', 'admin'),
  ('webinar_mb_no_sales', 'Media buyer has leads but no token sales', 'webinar_performance', 'webinar', 'high', 'admin')
ON CONFLICT (rule_key) DO NOTHING;
