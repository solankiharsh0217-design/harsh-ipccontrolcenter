
-- Table
CREATE TABLE public.attribution_attendee_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  slot_type text NOT NULL CHECK (slot_type IN ('day','sales_pitch')),
  slot_label text NOT NULL,
  slot_date date,
  slot_order int NOT NULL DEFAULT 0,
  source_kind text NOT NULL CHECK (source_kind IN ('csv_upload','google_sheet')),
  file_path text,
  file_name text,
  file_size_bytes bigint,
  sheet_url text,
  sheet_id text,
  tab_name text,
  tab_gid text,
  headers jsonb,
  row_count int NOT NULL DEFAULT 0,
  parsed_rows jsonb,
  column_mapping jsonb,
  notes text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendee_lists_session ON public.attribution_attendee_lists(session_id);

ALTER TABLE public.attribution_attendee_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aal_admin" ON public.attribution_attendee_lists
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "aal_read" ON public.attribution_attendee_lists
  FOR SELECT TO authenticated
  USING (is_active(auth.uid()));

CREATE POLICY "aal_insert" ON public.attribution_attendee_lists
  FOR INSERT TO authenticated
  WITH CHECK (
    is_active(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.attribution_sessions s
      WHERE s.id = attribution_attendee_lists.session_id
        AND s.created_by = auth.uid()
    )
  );

CREATE POLICY "aal_update" ON public.attribution_attendee_lists
  FOR UPDATE TO authenticated
  USING (
    is_active(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.attribution_sessions s
      WHERE s.id = attribution_attendee_lists.session_id
        AND s.created_by = auth.uid()
    )
  )
  WITH CHECK (is_active(auth.uid()));

CREATE POLICY "aal_delete" ON public.attribution_attendee_lists
  FOR DELETE TO authenticated
  USING (
    is_active(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.attribution_sessions s
      WHERE s.id = attribution_attendee_lists.session_id
        AND s.created_by = auth.uid()
    )
  );

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('roas-attendees', 'roas-attendees', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (path layout: {session_id}/{filename})
CREATE POLICY "roas_attendees_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'roas-attendees' AND is_active(auth.uid()));

CREATE POLICY "roas_attendees_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'roas-attendees' AND is_active(auth.uid()) AND (
      has_role(auth.uid(),'admin'::app_role) OR EXISTS (
        SELECT 1 FROM public.attribution_sessions s
        WHERE s.id::text = (storage.foldername(name))[1]
          AND s.created_by = auth.uid()
      )
    )
  );

CREATE POLICY "roas_attendees_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'roas-attendees' AND is_active(auth.uid()) AND (
      has_role(auth.uid(),'admin'::app_role) OR EXISTS (
        SELECT 1 FROM public.attribution_sessions s
        WHERE s.id::text = (storage.foldername(name))[1]
          AND s.created_by = auth.uid()
      )
    )
  );

CREATE POLICY "roas_attendees_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'roas-attendees' AND (
      has_role(auth.uid(),'admin'::app_role) OR EXISTS (
        SELECT 1 FROM public.attribution_sessions s
        WHERE s.id::text = (storage.foldername(name))[1]
          AND s.created_by = auth.uid()
      )
    )
  );
