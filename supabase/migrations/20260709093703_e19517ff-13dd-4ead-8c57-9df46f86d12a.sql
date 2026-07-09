
CREATE TABLE public.kpi_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.kpi_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  submitted_value numeric,
  proof_url text,
  notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_submissions_entry_unique UNIQUE (entry_id)
);

CREATE INDEX idx_kpi_submissions_user ON public.kpi_submissions(user_id);
CREATE INDEX idx_kpi_submissions_status ON public.kpi_submissions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_submissions TO authenticated;
GRANT ALL ON public.kpi_submissions TO service_role;

ALTER TABLE public.kpi_submissions ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY "kpi_submissions admin manage"
  ON public.kpi_submissions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Users read own submissions
CREATE POLICY "kpi_submissions read own"
  ON public.kpi_submissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users insert only own submissions and only for their own entries
CREATE POLICY "kpi_submissions insert own"
  ON public.kpi_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.kpi_entries e
      WHERE e.id = entry_id AND e.user_id = auth.uid()
    )
  );

-- Users update only own submissions and only if not yet reviewed
CREATE POLICY "kpi_submissions update own before review"
  ON public.kpi_submissions
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND status = 'submitted'
    AND reviewed_at IS NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'submitted'
    AND reviewed_at IS NULL
  );

CREATE TRIGGER trg_kpi_submissions_updated
  BEFORE UPDATE ON public.kpi_submissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
