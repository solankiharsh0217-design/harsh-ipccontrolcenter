ALTER TABLE public.code_of_conduct_requests
  ADD COLUMN IF NOT EXISTS re_signature_for_request_id uuid REFERENCES public.code_of_conduct_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS re_signature_reason text,
  ADD COLUMN IF NOT EXISTS re_signature_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS re_signature_requested_by uuid;

CREATE INDEX IF NOT EXISTS coc_requests_resign_for_idx ON public.code_of_conduct_requests(re_signature_for_request_id) WHERE re_signature_for_request_id IS NOT NULL;