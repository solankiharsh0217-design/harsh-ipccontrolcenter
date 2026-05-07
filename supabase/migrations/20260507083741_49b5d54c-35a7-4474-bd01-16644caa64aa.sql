CREATE TABLE public.quick_save_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL,
  value text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (field_key, value)
);

CREATE INDEX idx_qse_field_key ON public.quick_save_entries(field_key);
CREATE INDEX idx_qse_field_active ON public.quick_save_entries(field_key, is_active);

ALTER TABLE public.quick_save_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qse_read" ON public.quick_save_entries
  FOR SELECT TO authenticated
  USING (is_active(auth.uid()));

CREATE POLICY "qse_insert" ON public.quick_save_entries
  FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "qse_update_admin" ON public.quick_save_entries
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "qse_soft_delete_self" ON public.quick_save_entries
  FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND created_by = auth.uid())
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid() AND is_active = false);

CREATE POLICY "qse_delete_admin" ON public.quick_save_entries
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER qse_touch_updated
  BEFORE UPDATE ON public.quick_save_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();