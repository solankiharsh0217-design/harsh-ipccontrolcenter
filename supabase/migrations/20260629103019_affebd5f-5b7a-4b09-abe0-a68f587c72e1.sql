
DO $$
DECLARE
  v_pipe uuid := '7629660f-13d9-4b95-8eab-38a0071bd4fb';
  v_batch text := '24th June Diamond Sales';
  v_date date := '2026-06-24';
  v_ids uuid[];
  v_count int;
  v_payments int;
  v_pipe_type text;
BEGIN
  SELECT type INTO v_pipe_type FROM public.pipelines WHERE id = v_pipe;
  IF v_pipe_type IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Abort: target pipeline is not paid (got %)', v_pipe_type;
  END IF;

  SELECT array_agg(id), count(*) INTO v_ids, v_count
  FROM public.leads
  WHERE pipeline_id = v_pipe
    AND webinar_source = v_batch
    AND webinar_date = v_date
    AND archived_at IS NULL
    AND deleted_at IS NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Abort: expected exactly 1 active lead in wrong batch, found %', v_count;
  END IF;

  SELECT count(*) INTO v_payments
  FROM public.paid_pipeline_payments p
  JOIN public.leads l ON l.paid_pipeline_lead_id = p.paid_pipeline_lead_id
  WHERE l.id = ANY(v_ids);

  -- Archive through the trigger-allowed cleanup path (sets archived_at non-null)
  UPDATE public.leads
     SET archived_at = now(),
         archive_reason = '[RESET FOR RE-IMPORT] Wrong batch "24th June Diamond Sales" (2026-06-24) removed from Paid Onboarding — does not exist in source.'
   WHERE id = ANY(v_ids);

  -- Audit
  INSERT INTO public.crm_batch_archives
    (pipeline_id, batch_name, batch_date, archived_by, archive_reason, affected_lead_count)
  VALUES
    (v_pipe, v_batch, v_date, NULL,
     '[RESET FOR RE-IMPORT] Wrong batch removed via targeted cleanup migration. paid_pipeline_payments untouched ('|| v_payments ||' payments linked).',
     array_length(v_ids,1));

  RAISE NOTICE 'Cleanup complete. Archived % lead(s). Payments untouched: %', array_length(v_ids,1), v_payments;
END $$;
