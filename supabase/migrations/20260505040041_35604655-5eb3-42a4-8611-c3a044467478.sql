-- Replace fragile unique index that treats blank email+phone as duplicates
DROP INDEX IF EXISTS public.students_unique_src_email_phone;

-- Partial unique index: only enforce uniqueness when there is real contact data
CREATE UNIQUE INDEX students_unique_src_email_phone
  ON public.students (source, COALESCE(email,''), COALESCE(phone,''))
  WHERE COALESCE(email,'') <> '' OR COALESCE(phone,'') <> '';