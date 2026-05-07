CREATE TABLE IF NOT EXISTS public.webinars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webinars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read webinars" ON public.webinars FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "members insert webinars" ON public.webinars FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));
CREATE POLICY "admins manage webinars" ON public.webinars FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));