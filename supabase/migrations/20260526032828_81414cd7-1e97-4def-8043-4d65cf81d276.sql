ALTER TABLE public.code_of_conduct_requests
  ADD COLUMN IF NOT EXISTS signed_pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_pdf_generation_error text;

ALTER TABLE public.code_of_conduct_templates
  ADD COLUMN IF NOT EXISTS pdf_signature_page_number integer,
  ADD COLUMN IF NOT EXISTS pdf_signature_name_x numeric DEFAULT 150,
  ADD COLUMN IF NOT EXISTS pdf_signature_name_y numeric DEFAULT 180,
  ADD COLUMN IF NOT EXISTS pdf_signature_image_x numeric DEFAULT 150,
  ADD COLUMN IF NOT EXISTS pdf_signature_image_y numeric DEFAULT 110,
  ADD COLUMN IF NOT EXISTS pdf_signature_image_width numeric DEFAULT 220,
  ADD COLUMN IF NOT EXISTS pdf_signature_image_height numeric DEFAULT 70,
  ADD COLUMN IF NOT EXISTS pdf_signature_date_x numeric DEFAULT 150,
  ADD COLUMN IF NOT EXISTS pdf_signature_date_y numeric DEFAULT 70,
  ADD COLUMN IF NOT EXISTS pdf_signature_font_size numeric DEFAULT 11;