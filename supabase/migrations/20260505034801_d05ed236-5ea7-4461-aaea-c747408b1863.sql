
CREATE OR REPLACE FUNCTION public.search_students(_q text, _limit int DEFAULT 50)
RETURNS TABLE (full_name text, email text, phone text, source text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  term text := lower(coalesce(_q,''));
BEGIN
  IF NOT public.is_active(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF length(trim(term)) = 0 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT s.full_name, s.email, s.phone, s.source
    FROM public.students s
    WHERE s.search_text ILIKE '%' || term || '%'
    ORDER BY s.full_name NULLS LAST
    LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;

CREATE OR REPLACE FUNCTION public.students_count()
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c bigint;
BEGIN
  IF NOT public.is_active(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT count(*) INTO c FROM public.students;
  RETURN c;
END $$;

REVOKE EXECUTE ON FUNCTION public.search_students(text,int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.students_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_students(text,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.students_count() TO authenticated;
