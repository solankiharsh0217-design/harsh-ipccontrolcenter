CREATE TABLE public.webinar_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webinar_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wt_read" ON public.webinar_templates FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY "wt_insert" ON public.webinar_templates FOR INSERT TO authenticated WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "wt_admin" ON public.webinar_templates FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_wt_name ON public.webinar_templates (lower(name));