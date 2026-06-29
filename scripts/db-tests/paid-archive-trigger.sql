-- Automated test: paid-onboarding wrong-batch cleanup MUST be able to
-- archive a paid-linked CRM lead via the explicit archive path.
--
-- Run with:  psql -v ON_ERROR_STOP=1 -f scripts/db-tests/paid-archive-trigger.sql
--   (exit code 0 = PASS, non-zero = FAIL)
--
-- The privileged UPDATE is performed inside the SECURITY DEFINER function
-- public.test_paid_archive_trigger(), which rolls back its own change in a
-- subtransaction. No real lead is mutated.

\set ON_ERROR_STOP on

SELECT public.test_paid_archive_trigger() AS result \gset
\echo Test result: :result

SELECT
  CASE WHEN ((:'result')::jsonb->>'passed')::boolean
    THEN 'PASS: paid-linked lead was archived through cleanup path'
    ELSE 'FAIL: ' || (((:'result')::jsonb)->>'reason')
  END AS verdict;

-- Force non-zero exit if the test failed.
SELECT 1 / CASE WHEN ((:'result')::jsonb->>'passed')::boolean THEN 1 ELSE 0 END
  AS assertion_must_be_one;
