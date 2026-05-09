DROP FUNCTION IF EXISTS public.search_students(text, integer);

CREATE OR REPLACE FUNCTION public.search_students(_q text, _limit integer DEFAULT 50)
 RETURNS TABLE(full_name text, email text, phone text, source text, tier text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WITH matches AS (
    SELECT s.full_name, s.email, s.phone, s.source
    FROM public.students s
    WHERE s.search_text ILIKE '%' || term || '%'
  ),
  grouped AS (
    SELECT
      COALESCE(NULLIF(m.email,''), '') AS email_k,
      COALESCE(NULLIF(m.phone,''), '') AS phone_k,
      MAX(m.full_name) AS full_name,
      MAX(m.email) AS email,
      MAX(m.phone) AS phone,
      bool_or(m.source = 'diamond') AS is_diamond,
      string_agg(DISTINCT m.source, ',') AS sources
    FROM matches m
    GROUP BY COALESCE(NULLIF(m.email,''), ''), COALESCE(NULLIF(m.phone,''), '')
  ),
  enriched AS (
    SELECT
      g.full_name,
      g.email,
      g.phone,
      g.sources AS source,
      CASE
        WHEN g.is_diamond THEN 'diamond'
        WHEN EXISTS (
          SELECT 1 FROM public.students d
          WHERE d.source = 'diamond'
            AND (
              (g.email_k <> '' AND lower(d.email) = lower(g.email_k))
              OR (g.phone_k <> '' AND d.phone = g.phone_k)
            )
        ) THEN 'diamond'
        ELSE 'silver'
      END AS tier
    FROM grouped g
  )
  SELECT e.full_name, e.email, e.phone, e.source, e.tier
  FROM enriched e
  ORDER BY (e.tier = 'diamond') DESC, e.full_name NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $function$;