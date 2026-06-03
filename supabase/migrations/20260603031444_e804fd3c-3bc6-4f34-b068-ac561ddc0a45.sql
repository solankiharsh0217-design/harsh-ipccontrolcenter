
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  note text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_name text,
  assigned_initials text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','inprogress','review','blocked','done')),
  tag text NOT NULL DEFAULT 'Operations',
  due_date date,
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to) WHERE is_archived=false;
CREATE INDEX idx_tasks_status ON public.tasks(status) WHERE is_archived=false;
CREATE INDEX idx_tasks_due ON public.tasks(due_date) WHERE is_archived=false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (has_role(auth.uid(), 'admin'::app_role) OR assigned_to = auth.uid())
);

CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY "tasks_delete_admin" ON public.tasks FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.tasks_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_set_updated_at();

CREATE TABLE public.task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_activity_task ON public.task_activity(task_id, created_at DESC);

GRANT SELECT, INSERT ON public.task_activity TO authenticated;
GRANT ALL ON public.task_activity TO service_role;

ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_activity_select" ON public.task_activity FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id));

CREATE POLICY "task_activity_insert" ON public.task_activity FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
