-- Media Buyer Desk: "start my ads" form intake, self-claim, booking.
--
-- Students fill the "Meta and Google Ads Confirmation Form" (Google Form). An Apps
-- Script on the response sheet posts each submission to the media-buyer-form-intake
-- edge function, which records it here and opens an UNASSIGNED media_buyer_case.
-- The student books a TidyCal call with Aman or Sneha; whoever they booked with
-- claims the case from the desk via claim_media_buyer_case().
--
-- Safe to re-run: every statement is IF NOT EXISTS / CREATE OR REPLACE.

-- 1. Request details on the case (latest submission wins; the full history lives
--    in media_buyer_form_submissions).
ALTER TABLE public.media_buyer_cases
  ADD COLUMN IF NOT EXISTS form_submitted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS form_raw              jsonb,
  ADD COLUMN IF NOT EXISTS brand_name            text,
  ADD COLUMN IF NOT EXISTS brand_website         text,
  ADD COLUMN IF NOT EXISTS brand_instagram       text,
  ADD COLUMN IF NOT EXISTS ad_platforms          text,
  ADD COLUMN IF NOT EXISTS preferred_start_text  text,
  ADD COLUMN IF NOT EXISTS annual_revenue_text   text,
  ADD COLUMN IF NOT EXISTS has_gmb               boolean,
  ADD COLUMN IF NOT EXISTS target_locations      text,
  ADD COLUMN IF NOT EXISTS bajaj_answer          text,
  ADD COLUMN IF NOT EXISTS finance_check         text,
  ADD COLUMN IF NOT EXISTS call_booked_with_id   uuid,
  ADD COLUMN IF NOT EXISTS call_booked_at        timestamptz,
  ADD COLUMN IF NOT EXISTS call_scheduled_for    timestamptz;

CREATE INDEX IF NOT EXISTS idx_mbc_unclaimed
  ON public.media_buyer_cases (form_submitted_at DESC)
  WHERE assigned_media_buyer_id IS NULL AND is_deleted = false AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_mbc_student_email ON public.media_buyer_cases (lower(student_email));
CREATE INDEX IF NOT EXISTS idx_mbc_student_phone ON public.media_buyer_cases (student_phone);

-- 2. One row per form submission. row_key is the idempotency guarantee: the same
--    submission re-sent (trigger retry, backfill run twice) is a no-op.
CREATE TABLE IF NOT EXISTS public.media_buyer_form_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_key       text NOT NULL,
  submitted_at  timestamptz NOT NULL,
  raw           jsonb NOT NULL,
  case_id       uuid REFERENCES public.media_buyer_cases(id) ON DELETE SET NULL,
  outcome       text,           -- created | attached | invalid
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mb_form_submissions_row_key
  ON public.media_buyer_form_submissions (row_key);

ALTER TABLE public.media_buyer_form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mbfs_admin_select" ON public.media_buyer_form_submissions;
CREATE POLICY "mbfs_admin_select" ON public.media_buyer_form_submissions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
-- Writes come only from the edge function (service role bypasses RLS).

-- 3. Who counts as a media buyer. SECURITY DEFINER so policies on
--    media_buyer_cases can ask without tripping RLS on profiles.
CREATE OR REPLACE FUNCTION public.is_media_buyer(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = _uid AND can_receive_media_buyer_cases = true AND deactivated_at IS NULL
  )
$$;

-- 4. Media buyers may now SEE unclaimed requests (previously only admin,
--    the assignee, or the creator could). They still cannot UPDATE them —
--    claiming goes through the RPC below.
DROP POLICY IF EXISTS "mbc_select_active" ON public.media_buyer_cases;
CREATE POLICY "mbc_select_active" ON public.media_buyer_cases
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = assigned_media_buyer_id
  OR auth.uid() = created_by
  OR (assigned_media_buyer_id IS NULL AND public.is_active(auth.uid()) AND public.is_media_buyer(auth.uid()))
);

-- 5. Claim. The UPDATE's "WHERE assigned_media_buyer_id IS NULL" is the lock:
--    if Aman and Sneha click at the same moment, exactly one row update succeeds.
CREATE OR REPLACE FUNCTION public.claim_media_buyer_case(
  p_case_id uuid,
  p_scheduled_for timestamptz DEFAULT NULL
)
RETURNS public.media_buyer_cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text;
  v_email  text;
  v_row    public.media_buyer_cases;
  v_holder text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_active(v_uid)
          AND (public.has_role(v_uid, 'admin'::app_role) OR public.is_media_buyer(v_uid))) THEN
    RAISE EXCEPTION 'Only media buyers can take requests.' USING ERRCODE = '42501';
  END IF;

  SELECT full_name, email INTO v_name, v_email FROM public.profiles WHERE id = v_uid;

  UPDATE public.media_buyer_cases SET
    assigned_media_buyer_id    = v_uid,
    assigned_media_buyer_name  = v_name,
    assigned_media_buyer_email = v_email,
    assigned_at                = now(),
    assigned_by                = v_uid,
    assignment_method          = 'self_claim',
    call_booked_with_id        = v_uid,
    call_booked_at             = now(),
    call_scheduled_for         = p_scheduled_for,
    -- The booked slot is the call deadline; no slot falls back to the 2-day SLA.
    first_call_due_at          = COALESCE(p_scheduled_for, now() + interval '2 days'),
    case_stage                 = 'call_booked'
  WHERE id = p_case_id
    AND assigned_media_buyer_id IS NULL
    AND is_deleted = false
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT assigned_media_buyer_name INTO v_holder
      FROM public.media_buyer_cases WHERE id = p_case_id AND is_deleted = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This request no longer exists.' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'Already taken by %.', COALESCE(v_holder, 'another media buyer') USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.media_buyer_case_events
    (case_id, event_type, event_label, old_status, new_status, metadata, created_by)
  VALUES
    (p_case_id, 'self_claimed', 'Call booked with ' || COALESCE(v_name, 'media buyer'),
     'form_submitted', 'call_booked',
     jsonb_build_object('call_scheduled_for', p_scheduled_for), v_uid);

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.claim_media_buyer_case(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_media_buyer_case(uuid, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.is_media_buyer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_media_buyer(uuid) TO authenticated;
