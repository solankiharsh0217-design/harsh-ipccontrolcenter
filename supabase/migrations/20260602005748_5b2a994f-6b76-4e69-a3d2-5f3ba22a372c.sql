
CREATE TABLE public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  paid_pipeline_lead_id uuid REFERENCES public.paid_pipeline_leads(id) ON DELETE SET NULL,
  note_text text NOT NULL,
  note_type text NOT NULL DEFAULT 'general',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX idx_lead_notes_lead_id ON public.lead_notes(lead_id, created_at DESC);
CREATE INDEX idx_lead_notes_paid_id ON public.lead_notes(paid_pipeline_lead_id) WHERE paid_pipeline_lead_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active users can read lead notes"
  ON public.lead_notes FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

CREATE POLICY "active users can insert lead notes"
  ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_active(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "author can update own notes"
  ON public.lead_notes FOR UPDATE TO authenticated
  USING (public.is_active(auth.uid()) AND created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
