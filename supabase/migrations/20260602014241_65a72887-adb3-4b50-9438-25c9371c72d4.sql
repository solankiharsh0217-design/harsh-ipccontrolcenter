ALTER PUBLICATION supabase_realtime ADD TABLE public.paid_pipeline_followups;
ALTER TABLE public.paid_pipeline_followups REPLICA IDENTITY FULL;