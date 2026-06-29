-- Automated test: paid-onboarding wrong-batch cleanup MUST be able to
-- archive a paid-linked CRM lead via the explicit archive path.
--
-- Run with:  psql -v ON_ERROR_STOP=1 -f scripts/db-tests/paid-archive-trigger.sql
--
-- The privileged UPDATE is performed inside the SECURITY DEFINER function
-- public.test_paid_archive_trigger(), which rolls back its own change in a
-- subtransaction. No real lead is mutated.

\set ON_ERROR_STOP on

SELECT public.test_paid_archive_trigger() AS test_result \gset

\echo Test result: :test_result

DO $assert$
DECLARE
  r jsonb := :'test_result'::jsonb;
BEGIN
  IF NOT COALESCE((r->>'passed')::boolean, false) THEN
    RAISE EXCEPTION 'paid-archive cleanup TEST FAILED: %', r->>'reason';
  END IF;
  RAISE NOTICE 'paid-archive cleanup TEST PASSED for lead %, archived_at=%',
    r->>'lead_id', r->>'archived_at_after_update';
END
$assert$;
