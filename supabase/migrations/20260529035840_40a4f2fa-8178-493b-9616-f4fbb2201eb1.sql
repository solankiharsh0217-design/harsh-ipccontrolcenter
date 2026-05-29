UPDATE public.leads
SET pipeline_id = '7629660f-13d9-4b95-8eab-38a0071bd4fb',
    stage_id    = 'ec731076-08c7-431f-a81b-62399454dccf',
    updated_at  = now()
WHERE webinar_date = '2026-05-27'
  AND webinar_name = '6 Secrets'
  AND pipeline_id  = '10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c'
  AND created_at   = '2026-05-27 12:42:41.777466+00'
  AND archived_at IS NULL
  AND deleted_at  IS NULL;