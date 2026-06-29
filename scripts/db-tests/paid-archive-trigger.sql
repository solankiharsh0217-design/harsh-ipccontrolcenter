-- Automated test: protect_paid_onboarding_crm_lead must allow explicit
-- archive (cleanup path) on a paid-linked CRM lead.
--
-- Run with:  psql -v ON_ERROR_STOP=1 -f scripts/db-tests/paid-archive-trigger.sql
--
-- The whole test runs inside a single transaction that is ROLLED BACK at
-- the end, so no production data is mutated.

\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  v_lead_id uuid;
  v_old_archived timestamptz;
  v_new_archived timestamptz;
  v_paid_pipe_id uuid;
BEGIN
  SELECT id INTO v_paid_pipe_id
  FROM public.pipelines
  WHERE type = 'paid' AND name ILIKE '%onboarding%'
  ORDER BY position
  LIMIT 1;

  IF v_paid_pipe_id IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP FAILED: no Paid — Onboarding pipeline found';
  END IF;

  -- Pick an active paid-linked CRM lead in Paid — Onboarding.
  SELECT id, archived_at
    INTO v_lead_id, v_old_archived
  FROM public.leads
  WHERE pipeline_id = v_paid_pipe_id
    AND paid_pipeline_lead_id IS NOT NULL
    AND archived_at IS NULL
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP FAILED: no active paid-linked CRM lead to archive';
  END IF;

  RAISE NOTICE 'Test target lead_id = %', v_lead_id;

  -- Simulate the cleanup path: explicit archive.
  UPDATE public.leads
     SET archived_at = now()
   WHERE id = v_lead_id;

  SELECT archived_at INTO v_new_archived
  FROM public.leads WHERE id = v_lead_id;

  IF v_new_archived IS NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: protect_paid_onboarding_crm_lead reverted archived_at to NULL for paid-linked lead %',
      v_lead_id;
  END IF;

  RAISE NOTICE 'TEST PASSED: archived_at persisted as % for paid-linked lead %',
    v_new_archived, v_lead_id;

  -- Also assert the protective fields are still intact (lead_type=paid, link preserved).
  PERFORM 1 FROM public.leads
    WHERE id = v_lead_id
      AND lead_type = 'paid'
      AND paid_pipeline_lead_id IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEST FAILED: paid linkage was lost during archive';
  END IF;
END
$test$;

ROLLBACK;
