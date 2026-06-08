
CREATE TABLE public.task_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  submitted_by_name text,
  submission_url text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_submissions_task_id_idx ON public.task_submissions(task_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_submissions TO authenticated;
GRANT ALL ON public.task_submissions TO service_role;

ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_submissions_select ON public.task_submissions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR submitted_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_submissions.task_id
               AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid()))
  );

CREATE POLICY task_submissions_insert ON public.task_submissions FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_submissions.task_id
                AND (public.has_role(auth.uid(),'admin'::app_role)
                     OR t.assigned_to = auth.uid()
                     OR t.created_by = auth.uid()))
  );

CREATE POLICY task_submissions_update_own ON public.task_submissions FOR UPDATE
  USING (submitted_by = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY task_submissions_delete_admin ON public.task_submissions FOR DELETE
  USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER task_submissions_set_updated_at
  BEFORE UPDATE ON public.task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
