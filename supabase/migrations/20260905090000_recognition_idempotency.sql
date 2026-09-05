-- Recognition idempotency.
--
-- Before this, giveRecognition() inserted a recognitions row unconditionally and
-- then awarded points keyed to that brand-new row id. awardPoints() is idempotent
-- per source row, but every call manufactured a fresh source row, so the guard
-- never engaged: a double-click, or a retry after a slow request, wrote two
-- recognitions and two ledger rows (+10 instead of +5).
--
-- The rule: same person, same giver, same reason, same day is ONE recognition.
-- A genuine repeat on a later day is still allowed.

-- 1. A stable day to key on. Backfill from created_at rather than defaulting
--    existing rows to today, so historic rows keep their real date.
ALTER TABLE public.recognitions ADD COLUMN IF NOT EXISTS recognized_on date;

UPDATE public.recognitions
   SET recognized_on = (created_at AT TIME ZONE 'UTC')::date
 WHERE recognized_on IS NULL;

ALTER TABLE public.recognitions ALTER COLUMN recognized_on SET DEFAULT CURRENT_DATE;
ALTER TABLE public.recognitions ALTER COLUMN recognized_on SET NOT NULL;

-- 2. A normalised form of the reason, so "Great work" and "  great   work "
--    collapse to the same key. Generated in the database so the client cannot
--    drift from it. All three functions are IMMUTABLE, so this is indexable.
ALTER TABLE public.recognitions
  ADD COLUMN IF NOT EXISTS reason_key text
  GENERATED ALWAYS AS (lower(btrim(regexp_replace(reason, '\s+', ' ', 'g')))) STORED;

-- 3. Collapse duplicates that already slipped through, keeping the earliest of
--    each group. Their ledger rows go first so no points are left dangling
--    against a recognition that no longer exists.
WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY user_id, given_by, reason_key, recognized_on
           ORDER BY created_at, id
         ) AS rn
    FROM public.recognitions
)
DELETE FROM public.points_ledger
 WHERE source_table = 'recognitions'
   AND source_row_id IN (SELECT id FROM ranked WHERE rn > 1);

WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY user_id, given_by, reason_key, recognized_on
           ORDER BY created_at, id
         ) AS rn
    FROM public.recognitions
)
DELETE FROM public.recognitions
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4. The actual guarantee. The client checks first for a friendly message, but
--    this is what makes a concurrent double-submit impossible.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recognitions_person_reason_day
  ON public.recognitions (user_id, given_by, reason_key, recognized_on);

-- 5. Backstop: awardPoints() treats unique-violation 23505 as "already paid for
--    this source event", which only holds if the ledger is actually unique on
--    (source_table, source_row_id). Create it if it is missing — but never
--    delete non-recognition ledger rows to force it through. If duplicates
--    exist elsewhere, say so and leave the data alone for a human to look at.
DO $$
DECLARE dupes bigint;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT 1 FROM public.points_ledger
     GROUP BY source_table, source_row_id
    HAVING count(*) > 1
  ) d;

  IF dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_points_ledger_source
      ON public.points_ledger (source_table, source_row_id);
  ELSE
    RAISE NOTICE
      'points_ledger has % duplicated (source_table, source_row_id) group(s); unique index not created. Review these before relying on awardPoints() idempotency.',
      dupes;
  END IF;
END $$;
