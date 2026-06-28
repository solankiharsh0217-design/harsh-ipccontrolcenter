
-- 1. Guide video settings on company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS guide_video_provider text NOT NULL DEFAULT 'wistia',
  ADD COLUMN IF NOT EXISTS guide_video_id text,
  ADD COLUMN IF NOT EXISTS guide_video_title text,
  ADD COLUMN IF NOT EXISTS guide_video_required_percent integer NOT NULL DEFAULT 95,
  ADD COLUMN IF NOT EXISTS guide_video_is_active boolean NOT NULL DEFAULT true;

-- 2. Progress tracking table
CREATE TABLE IF NOT EXISTS public.code_of_conduct_guide_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.code_of_conduct_requests(id) ON DELETE CASCADE,
  video_id text,
  percent_watched numeric(5,2) NOT NULL DEFAULT 0,
  completed_at timestamptz,
  last_event_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id)
);

GRANT SELECT ON public.code_of_conduct_guide_progress TO authenticated;
GRANT ALL ON public.code_of_conduct_guide_progress TO service_role;

ALTER TABLE public.code_of_conduct_guide_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coc_guide_progress_admin_read"
  ON public.code_of_conduct_guide_progress
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_coc_guide_progress_updated_at
  BEFORE UPDATE ON public.code_of_conduct_guide_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
