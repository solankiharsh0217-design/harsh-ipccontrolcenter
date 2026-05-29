
-- =========================================================
-- 1. Extend invoices table
-- =========================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS linked_client_name text,
  ADD COLUMN IF NOT EXISTS linked_client_email text,
  ADD COLUMN IF NOT EXISTS linked_client_phone text,
  ADD COLUMN IF NOT EXISTS billing_name text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_phone text,
  ADD COLUMN IF NOT EXISTS billing_gstin text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_state text,
  ADD COLUMN IF NOT EXISTS billing_state_code text,
  ADD COLUMN IF NOT EXISTS billing_country text,
  ADD COLUMN IF NOT EXISTS invoice_number_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS manual_invoice_number text,
  ADD COLUMN IF NOT EXISTS show_bank_details boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_payment_instructions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_signature boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_stamp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS salesperson_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_context_type text NOT NULL DEFAULT 'linked_paid_lead';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_number_mode_check') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_invoice_number_mode_check
      CHECK (invoice_number_mode IN ('auto','manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_context_type_check') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_context_type_check
      CHECK (invoice_context_type IN ('linked_paid_lead','manual','later_linked'));
  END IF;
END $$;

UPDATE public.invoices
   SET billing_name = COALESCE(billing_name, member_name),
       billing_email = COALESCE(billing_email, member_email),
       billing_phone = COALESCE(billing_phone, member_phone),
       linked_client_name = COALESCE(linked_client_name, member_name),
       linked_client_email = COALESCE(linked_client_email, member_email),
       linked_client_phone = COALESCE(linked_client_phone, member_phone),
       invoice_context_type = CASE
         WHEN paid_pipeline_lead_id IS NOT NULL THEN 'linked_paid_lead'
         ELSE 'manual'
       END
 WHERE billing_name IS NULL OR linked_client_name IS NULL;

-- =========================================================
-- 2. Item categories
-- =========================================================
CREATE TABLE IF NOT EXISTS public.invoice_item_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  default_hsn_sac text,
  default_gst_rate numeric DEFAULT 18,
  default_taxable_status text DEFAULT 'taxable',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_item_categories TO authenticated;
GRANT ALL ON public.invoice_item_categories TO service_role;

ALTER TABLE public.invoice_item_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_item_categories_select" ON public.invoice_item_categories;
CREATE POLICY "invoice_item_categories_select"
  ON public.invoice_item_categories FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "invoice_item_categories_admin_write" ON public.invoice_item_categories;
CREATE POLICY "invoice_item_categories_admin_write"
  ON public.invoice_item_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_invoice_item_categories_updated_at ON public.invoice_item_categories;
CREATE TRIGGER trg_invoice_item_categories_updated_at
  BEFORE UPDATE ON public.invoice_item_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- 3. Extend existing invoice_items table
-- =========================================================
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.invoice_item_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_status text DEFAULT 'taxable',
  ADD COLUMN IF NOT EXISTS unit text DEFAULT 'unit';

-- Backfill default_price from default_rate if needed
UPDATE public.invoice_items SET default_price = default_rate WHERE default_price IS NULL OR default_price = 0;

CREATE INDEX IF NOT EXISTS idx_invoice_items_name ON public.invoice_items USING gin (item_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoice_items_category ON public.invoice_items (category_id);

-- =========================================================
-- 4. Tax code master
-- =========================================================
CREATE TABLE IF NOT EXISTS public.tax_code_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  type text NOT NULL CHECK (type IN ('SAC','HSN')),
  description text NOT NULL,
  category text,
  gst_rate_default numeric,
  keywords text[],
  source text DEFAULT 'seed',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code, type)
);

CREATE INDEX IF NOT EXISTS idx_tax_code_code ON public.tax_code_master (code);
CREATE INDEX IF NOT EXISTS idx_tax_code_desc_trgm ON public.tax_code_master USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tax_code_keywords ON public.tax_code_master USING gin (keywords);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_code_master TO authenticated;
GRANT ALL ON public.tax_code_master TO service_role;

ALTER TABLE public.tax_code_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_code_master_select" ON public.tax_code_master;
CREATE POLICY "tax_code_master_select"
  ON public.tax_code_master FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()));

DROP POLICY IF EXISTS "tax_code_master_admin_write" ON public.tax_code_master;
CREATE POLICY "tax_code_master_admin_write"
  ON public.tax_code_master FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_tax_code_master_updated_at ON public.tax_code_master;
CREATE TRIGGER trg_tax_code_master_updated_at
  BEFORE UPDATE ON public.tax_code_master
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- 5. Tighten invoice_line_items + invoice_events SELECT
-- =========================================================
DROP POLICY IF EXISTS "invoice_line_items_select" ON public.invoice_line_items;
CREATE POLICY "invoice_line_items_select"
  ON public.invoice_line_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND public.is_active(auth.uid())
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR i.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.paid_pipeline_leads p
            WHERE p.id = i.paid_pipeline_lead_id
              AND p.assigned_sales_executive = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "invoice_events_select" ON public.invoice_events;
CREATE POLICY "invoice_events_select"
  ON public.invoice_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_events.invoice_id
        AND public.is_active(auth.uid())
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR i.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.paid_pipeline_leads p
            WHERE p.id = i.paid_pipeline_lead_id
              AND p.assigned_sales_executive = auth.uid()
          )
        )
    )
  );

-- =========================================================
-- 6. Manual invoice number RPC (admin only)
-- =========================================================
CREATE OR REPLACE FUNCTION public.assign_manual_invoice_number(_invoice_id uuid, _number text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trimmed text := btrim(coalesce(_number, ''));
  exists_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized: admin only';
  END IF;
  IF trimmed = '' THEN
    RAISE EXCEPTION 'invoice number cannot be empty';
  END IF;
  SELECT count(*) INTO exists_count FROM public.invoices
    WHERE invoice_number = trimmed AND id <> _invoice_id;
  IF exists_count > 0 THEN
    RAISE EXCEPTION 'invoice number % already exists', trimmed;
  END IF;
  UPDATE public.invoices
     SET invoice_number = trimmed,
         invoice_number_mode = 'manual',
         manual_invoice_number = trimmed
   WHERE id = _invoice_id;
  RETURN trimmed;
END $$;

-- =========================================================
-- 7. Seed item categories
-- =========================================================
INSERT INTO public.invoice_item_categories (name, default_hsn_sac, default_gst_rate)
VALUES
  ('Coaching Program', '999293', 18),
  ('Online Course', '999293', 18),
  ('Workshop', '999293', 18),
  ('Event', '998596', 18),
  ('Consulting', '998311', 18),
  ('Ads Management', '998361', 18),
  ('Photography Service', '998387', 18),
  ('Digital Product', '998439', 18),
  ('Membership', '999599', 18),
  ('Certification', '999294', 18),
  ('Other', NULL, 18)
ON CONFLICT (name) DO NOTHING;

-- =========================================================
-- 8. Seed tax_code_master with common SAC codes
-- =========================================================
INSERT INTO public.tax_code_master (code, type, description, category, gst_rate_default, keywords, source) VALUES
  ('999293','SAC','Commercial training and coaching services','Coaching/Training',18, ARRAY['coaching','training','course','class','program','education','tutor','workshop','seminar','skill'], 'seed'),
  ('999294','SAC','Other education and training services n.e.c.','Coaching/Training',18, ARRAY['education','training','certification','learning'], 'seed'),
  ('999291','SAC','Cultural education services','Coaching/Training',18, ARRAY['cultural','art','music education'], 'seed'),
  ('999292','SAC','Sports and recreation education services','Coaching/Training',18, ARRAY['sports','recreation','fitness training'], 'seed'),
  ('998361','SAC','Advertising services','Advertising/Marketing',18, ARRAY['advertising','ads','marketing','campaign','digital advertising','meta ads','google ads'], 'seed'),
  ('998362','SAC','Purchase or sale of advertising space or time, on commission','Advertising/Marketing',18, ARRAY['advertising space','media buying','commission'], 'seed'),
  ('998363','SAC','Sale of advertising space in print media','Advertising/Marketing',18, ARRAY['print advertising','newspaper'], 'seed'),
  ('998364','SAC','Sale of TV and radio advertising time','Advertising/Marketing',18, ARRAY['tv ads','radio ads','broadcast'], 'seed'),
  ('998365','SAC','Sale of internet advertising space','Advertising/Marketing',18, ARRAY['internet ads','online ads','digital ads','web advertising'], 'seed'),
  ('998366','SAC','Sale of other advertising space or time','Advertising/Marketing',18, ARRAY['outdoor advertising','billboard'], 'seed'),
  ('998311','SAC','Management consulting services','Consulting',18, ARRAY['consulting','consultancy','management consulting','business consulting','advisory','strategy'], 'seed'),
  ('998312','SAC','Business consulting services including public relations','Consulting',18, ARRAY['business consulting','pr','public relations'], 'seed'),
  ('998313','SAC','IT consulting and support services','Consulting',18, ARRAY['it consulting','tech support','software consulting'], 'seed'),
  ('998314','SAC','Information technology (IT) design and development services','IT/Tech',18, ARRAY['it design','software development','web development','app development','coding'], 'seed'),
  ('998315','SAC','Hosting and IT infrastructure provisioning services','IT/Tech',18, ARRAY['hosting','cloud','server','infrastructure'], 'seed'),
  ('998316','SAC','IT infrastructure and network management services','IT/Tech',18, ARRAY['network','infrastructure management'], 'seed'),
  ('998319','SAC','Other information technology services','IT/Tech',18, ARRAY['it services'], 'seed'),
  ('998596','SAC','Events, exhibitions, conventions and trade shows organisation','Events',18, ARRAY['event','exhibition','convention','conference','trade show','meetup','summit','event management'], 'seed'),
  ('998597','SAC','Convention and trade shows assistance and organization services','Events',18, ARRAY['convention','trade show organization'], 'seed'),
  ('999631','SAC','Services of performing artists','Entertainment',18, ARRAY['artist','performer','musician','singer','actor','entertainment','performance'], 'seed'),
  ('999632','SAC','Services of authors, composers, sculptors and other artists','Entertainment',18, ARRAY['author','composer','sculptor','artist'], 'seed'),
  ('998387','SAC','Photography and videography services','Photography/Media',18, ARRAY['photography','photo','videography','video','shoot','wedding photography','portrait','studio'], 'seed'),
  ('998386','SAC','Photographic and videographic processing services','Photography/Media',18, ARRAY['photo processing','video editing','post production','retouching'], 'seed'),
  ('998391','SAC','Specialty design services including interior, industrial, fashion','Design',18, ARRAY['design','interior design','industrial design','fashion design','specialty design'], 'seed'),
  ('998393','SAC','Graphic design services','Design',18, ARRAY['graphic design','logo','branding design','visual design'], 'seed'),
  ('998394','SAC','Trademarks and franchises','Design',18, ARRAY['trademark','franchise'], 'seed'),
  ('998399','SAC','Other professional, technical and business services','Professional',18, ARRAY['professional','technical','business services','other'], 'seed'),
  ('997211','SAC','Rental services involving own or leased residential property','Real Estate',18, ARRAY['rental','lease','residential rental','property'], 'seed'),
  ('997212','SAC','Rental services involving own or leased non-residential property','Real Estate',18, ARRAY['commercial rental','office rental','non-residential'], 'seed'),
  ('999595','SAC','Coaching centres','Coaching/Training',18, ARRAY['coaching centre','tuition','academy'], 'seed'),
  ('999599','SAC','Other educational support services','Coaching/Training',18, ARRAY['educational support','membership','community'], 'seed'),
  ('998439','SAC','Other on-line content not elsewhere classified','Digital Product',18, ARRAY['digital product','online content','ebook','downloadable','digital download'], 'seed'),
  ('998431','SAC','On-line text based information','Digital Product',18, ARRAY['online book','ebook','periodical','newsletter'], 'seed'),
  ('998433','SAC','On-line audio content','Digital Product',18, ARRAY['audio content','podcast','audiobook'], 'seed'),
  ('998434','SAC','On-line video content','Digital Product',18, ARRAY['online video','streaming','video content','course video'], 'seed'),
  ('998435','SAC','On-line software','Digital Product',18, ARRAY['software','saas','online software','app'], 'seed'),
  ('996331','SAC','Services provided by restaurants, cafes and similar eating facilities','Food/Hospitality',5, ARRAY['restaurant','cafe','food service'], 'seed'),
  ('996511','SAC','Road transport services of passengers','Transport',5, ARRAY['transport','taxi','cab'], 'seed'),
  ('996601','SAC','Rental services of road vehicles','Transport',18, ARRAY['vehicle rental','car rental'], 'seed')
ON CONFLICT (code, type) DO NOTHING;
