DO $$
DECLARE
  src public.code_of_conduct_templates%ROWTYPE;
  new_id uuid;
BEGIN
  SELECT * INTO src FROM public.code_of_conduct_templates
   WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
  IF src.id IS NULL THEN RAISE EXCEPTION 'No active template found'; END IF;

  INSERT INTO public.code_of_conduct_templates AS t (
    name, document_title, program_name, party_a_name, version,
    template_pdf_url, is_active, expiry_days, from_email, from_name, reply_to_email,
    email_subject, email_body, whatsapp_redirect_url, success_page_message,
    signed_copy_recipient_emails, send_signed_copy_to_member
  ) VALUES (
    'Diamond Membership Code of Conduct — Standard Track',
    src.document_title, src.program_name, src.party_a_name, src.version,
    'storage:code-of-conduct/templates/1787890185-standard-onboarding.pdf',
    true, src.expiry_days, src.from_email, src.from_name, src.reply_to_email,
    src.email_subject, src.email_body, src.whatsapp_redirect_url, src.success_page_message,
    src.signed_copy_recipient_emails, src.send_signed_copy_to_member
  ) RETURNING t.id INTO new_id;

  UPDATE public.code_of_conduct_templates
     SET name = 'Diamond Membership Code of Conduct — Same-Day Track'
   WHERE id = src.id;

  ALTER TABLE public.code_of_conduct_email_variants
    ADD COLUMN IF NOT EXISTS document_template_id uuid REFERENCES public.code_of_conduct_templates(id);

  UPDATE public.code_of_conduct_email_variants
     SET document_template_id = src.id
   WHERE condition_key = 'completed_within_1_day';

  UPDATE public.code_of_conduct_email_variants
     SET document_template_id = new_id
   WHERE condition_key = 'completed_after_1_day';

  INSERT INTO public.code_of_conduct_events (event_type, metadata)
  VALUES ('template_pdf_added', jsonb_build_object(
    'template_id', new_id,
    'file_path', 'templates/1787890185-standard-onboarding.pdf',
    'track', 'standard'
  ));
END $$;