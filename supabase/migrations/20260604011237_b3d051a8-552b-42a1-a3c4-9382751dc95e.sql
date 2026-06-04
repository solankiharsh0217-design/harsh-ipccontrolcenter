
CREATE TABLE public.task_assignee_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  hidden_by uuid NOT NULL,
  is_hidden boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, hidden_by)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_assignee_visibility TO authenticated;
GRANT ALL ON public.task_assignee_visibility TO service_role;

ALTER TABLE public.task_assignee_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tav_select_own" ON public.task_assignee_visibility
  FOR SELECT TO authenticated
  USING (hidden_by = auth.uid());

CREATE POLICY "tav_insert_own" ON public.task_assignee_visibility
  FOR INSERT TO authenticated
  WITH CHECK (hidden_by = auth.uid());

CREATE POLICY "tav_update_own" ON public.task_assignee_visibility
  FOR UPDATE TO authenticated
  USING (hidden_by = auth.uid())
  WITH CHECK (hidden_by = auth.uid());

CREATE POLICY "tav_delete_own" ON public.task_assignee_visibility
  FOR DELETE TO authenticated
  USING (hidden_by = auth.uid());
