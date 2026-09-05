-- ── 1.3 kras (new)
CREATE TABLE IF NOT EXISTS public.kras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_role text,
  assigned_user_id uuid REFERENCES auth.users(id),
  weight numeric NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kras TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.kras TO authenticated;
GRANT ALL ON public.kras TO service_role;
ALTER TABLE public.kras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kras readable by authenticated" ON public.kras FOR SELECT TO authenticated USING (true);
CREATE POLICY "kras admin write" ON public.kras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ── 1.1 extend kpi_definitions
ALTER TABLE public.kpi_definitions
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'higher_is_better',
  ADD COLUMN IF NOT EXISTS kra_id uuid REFERENCES public.kras(id),
  ADD COLUMN IF NOT EXISTS points_allocation integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_check_enabled boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE public.kpi_definitions ADD CONSTRAINT kpi_definitions_direction_chk
    CHECK (direction IN ('higher_is_better','lower_is_better'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1.2 extend kpi_entries
ALTER TABLE public.kpi_entries
  ADD COLUMN IF NOT EXISTS weight_snapshot numeric,
  ADD COLUMN IF NOT EXISTS direction_snapshot text,
  ADD COLUMN IF NOT EXISTS points_allocation_snapshot integer,
  ADD COLUMN IF NOT EXISTS grade text;
DO $$ BEGIN
  ALTER TABLE public.kpi_entries ADD CONSTRAINT kpi_entries_grade_chk
    CHECK (grade IS NULL OR grade IN ('green','yellow','red'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1.4 point_rules
CREATE TABLE IF NOT EXISTS public.point_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  points integer NOT NULL DEFAULT 0,
  is_penalty boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  has_emitter boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.point_rules TO authenticated;
GRANT INSERT, UPDATE ON public.point_rules TO authenticated;
GRANT ALL ON public.point_rules TO service_role;
ALTER TABLE public.point_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "point_rules readable" ON public.point_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "point_rules admin write" ON public.point_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.point_rules (rule_key,label,description,points,is_penalty,has_emitter) VALUES
 ('adhoc_complete_critical','Critical task completed','Intended: +12',12,false,true),
 ('daily_streak_7','7-day daily streak','Intended: +10. No emitter yet (no recurring checklist feature).',10,false,false),
 ('flow_complete_bonus','Process flow completed','Intended: +10. No emitter yet (no process-flow feature).',10,false,false),
 ('adhoc_complete_high','High priority task completed','Intended: +8',8,false,true),
 ('adhoc_complete_medium','Medium priority task completed','Intended: +5',5,false,true),
 ('daily_complete','Daily checklist completed','Intended: +5. No emitter yet.',5,false,false),
 ('kpi_green','KPI target met','Intended: +5',5,false,true),
 ('manager_recognition','Manager recognition','Intended: +5',5,false,true),
 ('flow_step_complete','Process flow step completed','Intended: +4. No emitter yet.',4,false,false),
 ('adhoc_complete_low','Low priority task completed','Intended: +3',3,false,true),
 ('adhoc_zero_revision_bonus','Task completed with zero revisions','Intended: +3',3,false,true),
 ('kpi_yellow','KPI close to target','Intended: +2',2,false,true),
 ('adhoc_missed','Task missed','Intended: -2. Seeded at 0 until enforcement is switched on.',0,true,true),
 ('adhoc_revision','Task sent back for revision','Intended: -2. Seeded at 0 until enforcement is switched on.',0,true,true),
 ('daily_missed','Daily checklist missed','Intended: -2. No emitter yet.',0,true,false),
 ('flow_step_late','Process flow step late','Intended: -2. No emitter yet.',0,true,false),
 ('kpi_missed','KPI missed','Intended: -2. Seeded at 0 until enforcement is switched on.',0,true,true),
 ('adhoc_late','Task completed late','Intended: -3. Seeded at 0 until enforcement is switched on.',0,true,true),
 ('adhoc_shifted','Task deadline shifted','Intended: -5. Seeded at 0 until enforcement is switched on.',0,true,true)
ON CONFLICT (rule_key) DO NOTHING;

-- ── 1.5 points_ledger
CREATE TABLE IF NOT EXISTS public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  rule_key text NOT NULL REFERENCES public.point_rules(rule_key),
  points integer NOT NULL,
  source_table text NOT NULL,
  source_row_id uuid NOT NULL,
  reason text,
  awarded_by uuid,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_key, source_table, source_row_id)
);
CREATE INDEX IF NOT EXISTS points_ledger_user_date_idx ON public.points_ledger (user_id, occurred_on DESC);
GRANT SELECT, INSERT ON public.points_ledger TO authenticated;
GRANT ALL ON public.points_ledger TO service_role;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger readable by authenticated" ON public.points_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "ledger insert own or admin" ON public.points_ledger FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- ── 1.6 appraisal_bands
CREATE TABLE IF NOT EXISTS public.appraisal_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_score integer NOT NULL,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.appraisal_bands TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.appraisal_bands TO authenticated;
GRANT ALL ON public.appraisal_bands TO service_role;
ALTER TABLE public.appraisal_bands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bands readable" ON public.appraisal_bands FOR SELECT TO authenticated USING (true);
CREATE POLICY "bands admin write" ON public.appraisal_bands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.appraisal_bands (min_score,label,description,sort_order)
SELECT * FROM (VALUES
 (900,'Excellent','Consistently meets or exceeds every measured target.',1),
 (750,'Good','Meets most measured targets most days.',2),
 (500,'Needs Attention','Frequently misses measured targets.',3),
 (0,'Critical','Rarely meets measured targets.',4)
) v WHERE NOT EXISTS (SELECT 1 FROM public.appraisal_bands);

-- ── 1.7 recognitions
CREATE TABLE IF NOT EXISTS public.recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  given_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.recognitions TO authenticated;
GRANT ALL ON public.recognitions TO service_role;
ALTER TABLE public.recognitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recognitions readable" ON public.recognitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "recognitions admin insert" ON public.recognitions FOR INSERT TO authenticated
  WITH CHECK (given_by = auth.uid() AND public.has_role(auth.uid(),'admin'));

-- ── 1.8 score_settings
CREATE TABLE IF NOT EXISTS public.score_settings (
  key text PRIMARY KEY,
  value numeric NOT NULL,
  label text,
  description text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.score_settings TO authenticated;
GRANT INSERT, UPDATE ON public.score_settings TO authenticated;
GRANT ALL ON public.score_settings TO service_role;
ALTER TABLE public.score_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "score_settings readable" ON public.score_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "score_settings admin write" ON public.score_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.score_settings (key,value,label,description) VALUES
 ('green_threshold',1.00,'Green threshold','Attainment at or above target counts green'),
 ('yellow_threshold',0.80,'Yellow threshold','Attainment at or above 80% counts yellow'),
 ('attainment_cap',1.20,'Attainment cap','Over-delivery stops counting at 120%'),
 ('yellow_credit',0.50,'Yellow credit','Yellow earns half its weight'),
 ('weight_kpi',45,'KPI weight','Accountability component weight'),
 ('weight_tasks',25,'Tasks weight','Accountability component weight'),
 ('weight_attendance',10,'Attendance weight','Accountability component weight'),
 ('enforcement_enabled',0,'Enforcement','Master switch for penalties (0 = off)')
ON CONFLICT (key) DO NOTHING;

-- ── 1.9 score_weight_overrides
CREATE TABLE IF NOT EXISTS public.score_weight_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  component text NOT NULL CHECK (component IN ('kpi','tasks','attendance')),
  weight numeric NOT NULL,
  UNIQUE (role, component)
);
GRANT SELECT ON public.score_weight_overrides TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.score_weight_overrides TO authenticated;
GRANT ALL ON public.score_weight_overrides TO service_role;
ALTER TABLE public.score_weight_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weight overrides readable" ON public.score_weight_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "weight overrides admin write" ON public.score_weight_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ── Access: everyone with an app profile can reach the Accountability Board
INSERT INTO public.user_module_access (user_id, module_key)
SELECT p.id, 'accountability_board' FROM public.profiles p
ON CONFLICT DO NOTHING;