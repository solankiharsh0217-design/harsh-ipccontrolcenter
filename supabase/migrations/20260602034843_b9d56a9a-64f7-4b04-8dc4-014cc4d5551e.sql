
-- ============================================================
-- Configurable Operations Intake V1
-- ============================================================

-- 1. Process Templates
CREATE TABLE public.operations_process_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  default_owner_rule text NOT NULL DEFAULT 'unassigned',
  default_owner_id uuid,
  default_service_duration_days integer DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  is_seed boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operations_process_templates_owner_rule_chk
    CHECK (default_owner_rule IN ('unassigned','single','round_robin'))
);
GRANT SELECT ON public.operations_process_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.operations_process_templates TO authenticated;
GRANT ALL ON public.operations_process_templates TO service_role;
ALTER TABLE public.operations_process_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_tpl_read_active" ON public.operations_process_templates FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "ops_tpl_admin_all" ON public.operations_process_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- 2. Checklist items
CREATE TABLE public.operations_template_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.operations_process_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_template_checklist_items TO authenticated;
GRANT ALL ON public.operations_template_checklist_items TO service_role;
ALTER TABLE public.operations_template_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_tpl_chk_read" ON public.operations_template_checklist_items FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "ops_tpl_chk_admin_all" ON public.operations_template_checklist_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- 3. Custom fields
CREATE TABLE public.operations_template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.operations_process_templates(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL,
  options jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operations_template_fields_type_chk
    CHECK (field_type IN ('text','number','date','dropdown','checkbox','link','textarea')),
  UNIQUE (template_id, field_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_template_fields TO authenticated;
GRANT ALL ON public.operations_template_fields TO service_role;
ALTER TABLE public.operations_template_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_tpl_fld_read" ON public.operations_template_fields FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "ops_tpl_fld_admin_all" ON public.operations_template_fields FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- 4. Communication templates
CREATE TABLE public.operations_communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text,
  body text NOT NULL,
  template_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_seed boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operations_comm_templates_type_chk
    CHECK (template_type IN ('email','form_link','call_link','instruction'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_communication_templates TO authenticated;
GRANT ALL ON public.operations_communication_templates TO service_role;
ALTER TABLE public.operations_communication_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_comm_read" ON public.operations_communication_templates FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "ops_comm_admin_all" ON public.operations_communication_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- 5. Lead checklist state
CREATE TABLE public.operations_lead_checklist_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operations_lead_id uuid NOT NULL REFERENCES public.operations_leads(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES public.operations_template_checklist_items(id) ON DELETE CASCADE,
  is_checked boolean NOT NULL DEFAULT false,
  checked_by uuid,
  checked_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operations_lead_id, checklist_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_lead_checklist_state TO authenticated;
GRANT ALL ON public.operations_lead_checklist_state TO service_role;
ALTER TABLE public.operations_lead_checklist_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_lcs_read" ON public.operations_lead_checklist_state FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "ops_lcs_write" ON public.operations_lead_checklist_state FOR ALL TO authenticated
  USING (public.is_active(auth.uid())) WITH CHECK (public.is_active(auth.uid()));

-- 6. Lead custom field values
CREATE TABLE public.operations_lead_custom_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operations_lead_id uuid NOT NULL REFERENCES public.operations_leads(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.operations_template_fields(id) ON DELETE CASCADE,
  value_text text,
  value_number numeric,
  value_date date,
  value_bool boolean,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operations_lead_id, field_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_lead_custom_values TO authenticated;
GRANT ALL ON public.operations_lead_custom_values TO service_role;
ALTER TABLE public.operations_lead_custom_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_lcv_read" ON public.operations_lead_custom_values FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "ops_lcv_write" ON public.operations_lead_custom_values FOR ALL TO authenticated
  USING (public.is_active(auth.uid())) WITH CHECK (public.is_active(auth.uid()));

-- 7. Intake imports log
CREATE TABLE public.operations_intake_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  file_name text,
  sheet_url text,
  imported_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  total_rows integer NOT NULL DEFAULT 0,
  raw_summary jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operations_intake_imports_source_chk
    CHECK (source IN ('csv','sheet_link','manual','crm_handoff','paid_handoff'))
);
GRANT SELECT, INSERT ON public.operations_intake_imports TO authenticated;
GRANT ALL ON public.operations_intake_imports TO service_role;
ALTER TABLE public.operations_intake_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_imp_read" ON public.operations_intake_imports FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "ops_imp_insert" ON public.operations_intake_imports FOR INSERT TO authenticated
  WITH CHECK (public.is_active(auth.uid()) AND created_by = auth.uid());

-- Add columns to operations_leads
ALTER TABLE public.operations_leads
  ADD COLUMN IF NOT EXISTS process_template_id uuid REFERENCES public.operations_process_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intake_status text NOT NULL DEFAULT 'intake',
  ADD COLUMN IF NOT EXISTS intake_source text,
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS program_name text,
  ADD COLUMN IF NOT EXISTS readiness_override_reason text,
  ADD COLUMN IF NOT EXISTS readiness_override_by uuid,
  ADD COLUMN IF NOT EXISTS readiness_override_at timestamptz;

-- Backfill: anything already through onboarding (i.e. has a service_status not 'not_started') -> intake_status='active' so it lands in existing Active tab.
UPDATE public.operations_leads
   SET intake_status = CASE
     WHEN service_status = 'completed' THEN 'completed'
     WHEN service_status = 'paused' THEN 'paused'
     WHEN service_status IN ('active','stopped') THEN 'active'
     ELSE 'active'  -- existing 'not_started' rows treated as active (already in Kanban) so we don't surprise users; new rows default to 'intake'
   END
 WHERE intake_status = 'intake';

CREATE INDEX IF NOT EXISTS operations_leads_intake_status_idx ON public.operations_leads(intake_status);

-- updated_at triggers
CREATE TRIGGER trg_ops_tpl_updated_at
  BEFORE UPDATE ON public.operations_process_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ops_comm_updated_at
  BEFORE UPDATE ON public.operations_communication_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ops_lcs_updated_at
  BEFORE UPDATE ON public.operations_lead_checklist_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ops_lcv_updated_at
  BEFORE UPDATE ON public.operations_lead_custom_values
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
