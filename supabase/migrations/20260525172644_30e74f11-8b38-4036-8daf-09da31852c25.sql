-- Templates
CREATE TABLE public.code_of_conduct_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  program_name text,
  document_title text NOT NULL DEFAULT 'Code of Conduct',
  party_a_name text NOT NULL DEFAULT 'India Photographers'' Club',
  template_pdf_url text,
  html_content text,
  version text NOT NULL DEFAULT '1.0',
  is_active boolean NOT NULL DEFAULT true,
  whatsapp_redirect_url text,
  success_page_message text,
  from_email text,
  from_name text,
  email_subject text,
  email_body text,
  expiry_days integer NOT NULL DEFAULT 7,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.code_of_conduct_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.code_of_conduct_templates(id) ON DELETE SET NULL,
  template_version text,
  crm_lead_id uuid,
  paid_pipeline_lead_id uuid,
  member_name text NOT NULL,
  member_email text NOT NULL,
  member_phone text,
  program_name text,
  deal_value numeric,
  status text NOT NULL DEFAULT 'draft',
  token_hash text UNIQUE,
  token_expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  signed_pdf_url text,
  signature_name text,
  signature_data_url text,
  acknowledgement_ip text,
  acknowledgement_user_agent text,
  acknowledgement_email text,
  acknowledgement_checkbox boolean NOT NULL DEFAULT false,
  whatsapp_redirect_opened_at timestamptz,
  email_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coc_requests_paid_lead ON public.code_of_conduct_requests(paid_pipeline_lead_id);
CREATE INDEX idx_coc_requests_crm_lead  ON public.code_of_conduct_requests(crm_lead_id);
CREATE INDEX idx_coc_requests_status    ON public.code_of_conduct_requests(status);

CREATE TABLE public.code_of_conduct_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.code_of_conduct_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_coc_events_request ON public.code_of_conduct_events(request_id);

-- Additive columns
ALTER TABLE public.paid_pipeline_leads
  ADD COLUMN IF NOT EXISTS code_of_conduct_status text,
  ADD COLUMN IF NOT EXISTS code_of_conduct_request_id uuid,
  ADD COLUMN IF NOT EXISTS code_of_conduct_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS code_of_conduct_signed_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS code_of_conduct_status text,
  ADD COLUMN IF NOT EXISTS code_of_conduct_request_id uuid,
  ADD COLUMN IF NOT EXISTS code_of_conduct_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS code_of_conduct_signed_at timestamptz;

-- updated_at triggers
CREATE TRIGGER trg_coc_templates_updated BEFORE UPDATE ON public.code_of_conduct_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_coc_requests_updated  BEFORE UPDATE ON public.code_of_conduct_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.code_of_conduct_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_of_conduct_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_of_conduct_events    ENABLE ROW LEVEL SECURITY;

-- Templates: active members read; admins write
CREATE POLICY "coc_templates_select" ON public.code_of_conduct_templates
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "coc_templates_admin_all" ON public.code_of_conduct_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Requests: active members read & write (admins can delete)
CREATE POLICY "coc_requests_select" ON public.code_of_conduct_requests
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "coc_requests_insert" ON public.code_of_conduct_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));
CREATE POLICY "coc_requests_update" ON public.code_of_conduct_requests
  FOR UPDATE TO authenticated USING (public.is_active(auth.uid()))
  WITH CHECK (public.is_active(auth.uid()));
CREATE POLICY "coc_requests_admin_delete" ON public.code_of_conduct_requests
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Events: active members read; insert via authenticated (mostly service role from edge fn)
CREATE POLICY "coc_events_select" ON public.code_of_conduct_events
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "coc_events_insert" ON public.code_of_conduct_events
  FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));

-- Storage bucket for template PDFs and signed receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('code-of-conduct', 'code-of-conduct', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "coc_storage_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'code-of-conduct');
CREATE POLICY "coc_storage_admin_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'code-of-conduct' AND public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY "coc_storage_admin_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'code-of-conduct' AND public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY "coc_storage_admin_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'code-of-conduct' AND public.has_role(auth.uid(), 'admin'::app_role)
  );
