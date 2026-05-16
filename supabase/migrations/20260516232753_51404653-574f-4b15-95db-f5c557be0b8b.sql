
CREATE TABLE IF NOT EXISTS public.system_refinement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  module_key text,
  module_label text,
  checklist_item text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'not_checked',
  issue_type text,
  severity text,
  owner_user_id uuid,
  owner_name text,
  route text,
  evidence_notes text,
  fix_notes text,
  screenshot_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  fixed_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false
);

ALTER TABLE public.system_refinement_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view refinement items" ON public.system_refinement_items;
CREATE POLICY "Admins can view refinement items" ON public.system_refinement_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert refinement items" ON public.system_refinement_items;
CREATE POLICY "Admins can insert refinement items" ON public.system_refinement_items
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update refinement items" ON public.system_refinement_items;
CREATE POLICY "Admins can update refinement items" ON public.system_refinement_items
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete refinement items" ON public.system_refinement_items;
CREATE POLICY "Admins can delete refinement items" ON public.system_refinement_items
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_srefi_section ON public.system_refinement_items(section);
CREATE INDEX IF NOT EXISTS idx_srefi_status ON public.system_refinement_items(status);
CREATE INDEX IF NOT EXISTS idx_srefi_priority ON public.system_refinement_items(priority);

DROP TRIGGER IF EXISTS trg_srefi_updated_at ON public.system_refinement_items;
CREATE TRIGGER trg_srefi_updated_at
  BEFORE UPDATE ON public.system_refinement_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
