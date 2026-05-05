CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  email text,
  phone text,
  source text NOT NULL,
  search_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX students_unique_src_email_phone
  ON public.students (source, COALESCE(email,''), COALESCE(phone,''));

CREATE INDEX students_search_text_trgm ON public.students USING gin (search_text gin_trgm_ops);
CREATE INDEX students_full_name_lower ON public.students (lower(full_name));

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active members read students"
ON public.students FOR SELECT TO authenticated
USING (is_active(auth.uid()));

CREATE POLICY "Admins manage students"
ON public.students FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));