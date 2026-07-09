
-- ============ kpi_definitions ============
CREATE TABLE IF NOT EXISTS public.kpi_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  department text,
  owner_role text,
  measurement_type text NOT NULL CHECK (measurement_type IN ('number','yes_no','percentage','currency','time','checklist','quality_score','manual_proof','auto_source')),
  target_default numeric,
  target_unit text,
  cadence text NOT NULL CHECK (cadence IN ('daily','weekly','monthly','recurring','custom')),
  due_time time,
  due_day_of_week integer,
  due_day_of_month integer,
  recurrence_rule text,
  weight numeric NOT NULL DEFAULT 1,
  proof_required boolean NOT NULL DEFAULT false,
  approval_required boolean NOT NULL DEFAULT false,
  reward_points numeric NOT NULL DEFAULT 0,
  auto_source_key text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_definitions TO authenticated;
GRANT ALL ON public.kpi_definitions TO service_role;
ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_defs admin manage" ON public.kpi_definitions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "kpi_defs read active for active users" ON public.kpi_definitions
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_kpi_defs_active ON public.kpi_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_kpi_defs_cadence ON public.kpi_definitions(cadence);

-- ============ kpi_templates ============
CREATE TABLE IF NOT EXISTS public.kpi_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  role_label text,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_templates TO authenticated;
GRANT ALL ON public.kpi_templates TO service_role;
ALTER TABLE public.kpi_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_templates admin manage" ON public.kpi_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "kpi_templates read for active users" ON public.kpi_templates
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

-- ============ kpi_template_items ============
CREATE TABLE IF NOT EXISTS public.kpi_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.kpi_templates(id) ON DELETE CASCADE,
  kpi_id uuid NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  target_override numeric,
  weight_override numeric,
  reward_points_override numeric,
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, kpi_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_template_items TO authenticated;
GRANT ALL ON public.kpi_template_items TO service_role;
ALTER TABLE public.kpi_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_template_items admin manage" ON public.kpi_template_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "kpi_template_items read for active users" ON public.kpi_template_items
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_kpi_template_items_template ON public.kpi_template_items(template_id);

-- ============ kpi_assignments ============
CREATE TABLE IF NOT EXISTS public.kpi_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_id uuid REFERENCES public.kpi_templates(id) ON DELETE SET NULL,
  kpi_id uuid REFERENCES public.kpi_definitions(id) ON DELETE SET NULL,
  assignment_type text NOT NULL DEFAULT 'template' CHECK (assignment_type IN ('template','individual')),
  assigned_by uuid,
  start_date date NOT NULL DEFAULT current_date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  custom_target numeric,
  custom_weight numeric,
  custom_reward_points numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((assignment_type='template' AND template_id IS NOT NULL AND kpi_id IS NULL)
      OR (assignment_type='individual' AND kpi_id IS NOT NULL AND template_id IS NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_assignments TO authenticated;
GRANT ALL ON public.kpi_assignments TO service_role;
ALTER TABLE public.kpi_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_assignments admin manage" ON public.kpi_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "kpi_assignments read own" ON public.kpi_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_kpi_assignments_user ON public.kpi_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_kpi_assignments_active ON public.kpi_assignments(is_active);

-- ============ kpi_entries ============
CREATE TABLE IF NOT EXISTS public.kpi_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.kpi_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kpi_id uuid NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('daily','weekly','monthly','recurring','custom')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_at timestamptz,
  target_value numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','approved','rejected','missed','waived')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, kpi_id, user_id, period_start, period_end)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_entries TO authenticated;
GRANT ALL ON public.kpi_entries TO service_role;
ALTER TABLE public.kpi_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_entries admin manage" ON public.kpi_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "kpi_entries read own" ON public.kpi_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_kpi_entries_user_period ON public.kpi_entries(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_kpi_entries_status ON public.kpi_entries(status);

-- ============ attendance_sessions ============
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  work_date date NOT NULL,
  check_in_at timestamptz,
  check_out_at timestamptz,
  total_minutes integer,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','login','admin','system')),
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','half_day','leave')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sessions TO authenticated;
GRANT ALL ON public.attendance_sessions TO service_role;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_sessions admin manage" ON public.attendance_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "attendance_sessions read own" ON public.attendance_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_date ON public.attendance_sessions(user_id, work_date);

-- ============ updated_at triggers ============
CREATE TRIGGER trg_kpi_defs_updated BEFORE UPDATE ON public.kpi_definitions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_kpi_templates_updated BEFORE UPDATE ON public.kpi_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_kpi_assignments_updated BEFORE UPDATE ON public.kpi_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_kpi_entries_updated BEFORE UPDATE ON public.kpi_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_attendance_sessions_updated BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
