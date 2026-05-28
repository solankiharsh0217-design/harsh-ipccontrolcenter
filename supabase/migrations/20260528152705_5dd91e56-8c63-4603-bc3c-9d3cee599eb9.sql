
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace text NOT NULL DEFAULT 'default' UNIQUE,
  legal_name text, brand_name text, business_type text, company_id text,
  gstin text, pan text, address text, city text, state text, state_code text,
  country text DEFAULT 'India', phone text, email text, website text,
  logo_url text, accent_color text DEFAULT '#111827',
  signature_url text, stamp_url text,
  bank_account_name text, bank_account_number text, bank_ifsc text,
  bank_account_type text, bank_name text, bank_branch text, upi_id text,
  sender_name text, sender_email text, reply_to_email text, support_email text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_settings_read_active" ON public.company_settings FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "company_settings_admin_insert" ON public.company_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "company_settings_admin_update" ON public.company_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "company_settings_admin_delete" ON public.company_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.invoice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace text NOT NULL DEFAULT 'default' UNIQUE,
  invoice_prefix text NOT NULL DEFAULT 'INV-',
  next_invoice_number integer NOT NULL DEFAULT 1,
  number_padding integer NOT NULL DEFAULT 4,
  fy_format text,
  reset_yearly boolean NOT NULL DEFAULT false,
  last_reset_fy text,
  gst_enabled_default boolean NOT NULL DEFAULT true,
  allow_invoice_level_gst_choice boolean NOT NULL DEFAULT true,
  default_invoice_type text NOT NULL DEFAULT 'gst' CHECK (default_invoice_type IN ('gst','non_gst')),
  default_gst_rate numeric NOT NULL DEFAULT 18,
  default_tax_mode text NOT NULL DEFAULT 'exclusive' CHECK (default_tax_mode IN ('exclusive','inclusive')),
  default_tax_split text NOT NULL DEFAULT 'cgst_sgst' CHECK (default_tax_split IN ('cgst_sgst','igst','none')),
  default_place_of_supply text,
  hsn_sac_required boolean NOT NULL DEFAULT true,
  default_hsn_sac text,
  default_notes text,
  default_terms text,
  default_email_subject text DEFAULT 'Invoice {{invoice_number}} from {{company_name}}',
  default_email_body text DEFAULT 'Hi {{member_name}},\n\nPlease find attached invoice {{invoice_number}} for {{program_name}}.\n\nTotal: {{total_amount}}\nBalance due: {{balance_due}}\n\nRegards,\n{{brand_name}}',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_settings TO authenticated;
GRANT ALL ON public.invoice_settings TO service_role;
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_settings_read_active" ON public.invoice_settings FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "invoice_settings_admin_insert" ON public.invoice_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "invoice_settings_admin_update" ON public.invoice_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "invoice_settings_admin_delete" ON public.invoice_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_invoice_settings_updated_at BEFORE UPDATE ON public.invoice_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.company_settings (workspace) VALUES ('default') ON CONFLICT DO NOTHING;
INSERT INTO public.invoice_settings (workspace) VALUES ('default') ON CONFLICT DO NOTHING;

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL, description text, hsn_sac text,
  default_rate numeric NOT NULL DEFAULT 0,
  default_gst_rate numeric NOT NULL DEFAULT 18,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_items_read_active" ON public.invoice_items FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "invoice_items_admin_insert" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "invoice_items_admin_update" ON public.invoice_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "invoice_items_admin_delete" ON public.invoice_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_invoice_items_updated_at BEFORE UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE,
  invoice_date date, due_date date, terms text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','sent','paid','cancelled','void')),
  invoice_type text NOT NULL DEFAULT 'gst' CHECK (invoice_type IN ('gst','non_gst')),
  invoice_mode text NOT NULL DEFAULT 'full_deal' CHECK (invoice_mode IN ('full_deal','token','balance','custom')),
  paid_pipeline_lead_id uuid REFERENCES public.paid_pipeline_leads(id) ON DELETE SET NULL,
  crm_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  member_name text, member_email text, member_phone text,
  billing_address text, place_of_supply text,
  seller_snapshot_json jsonb, buyer_snapshot_json jsonb, tax_snapshot_json jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  taxable_amount numeric NOT NULL DEFAULT 0,
  cgst_amount numeric NOT NULL DEFAULT 0,
  sgst_amount numeric NOT NULL DEFAULT 0,
  igst_amount numeric NOT NULL DEFAULT 0,
  adjustment_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_made numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  amount_in_words text, notes text, terms_and_conditions text,
  created_by uuid,
  issued_at timestamptz, sent_at timestamptz, sent_to text, last_generated_at timestamptz,
  cancelled_at timestamptz, cancelled_by uuid, cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_paid_lead ON public.invoices(paid_pipeline_lead_id);
CREATE INDEX idx_invoices_crm_lead ON public.invoices(crm_lead_id);
CREATE INDEX idx_invoices_created_by ON public.invoices(created_by);
CREATE INDEX idx_invoices_status ON public.invoices(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_select_scoped" ON public.invoices FOR SELECT TO authenticated USING (
  public.is_active(auth.uid()) AND (
    public.has_role(auth.uid(),'admin'::app_role)
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.paid_pipeline_leads p WHERE p.id = invoices.paid_pipeline_lead_id AND p.assigned_sales_executive = auth.uid())
  )
);
CREATE POLICY "invoices_insert_self" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "invoices_update_draft" ON public.invoices FOR UPDATE TO authenticated USING (
  public.is_active(auth.uid()) AND (public.has_role(auth.uid(),'admin'::app_role) OR (created_by = auth.uid() AND status = 'draft'))
);
CREATE POLICY "invoices_delete_admin" ON public.invoices FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_name text NOT NULL, description text, hsn_sac text,
  quantity numeric NOT NULL DEFAULT 1,
  rate numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  cgst_amount numeric NOT NULL DEFAULT 0,
  sgst_amount numeric NOT NULL DEFAULT 0,
  igst_amount numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_line_items_invoice ON public.invoice_line_items(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_line_items_select" ON public.invoice_line_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_line_items.invoice_id)
);
CREATE POLICY "invoice_line_items_all" ON public.invoice_line_items FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_line_items.invoice_id AND (public.has_role(auth.uid(),'admin'::app_role) OR (i.created_by = auth.uid() AND i.status = 'draft')))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_line_items.invoice_id AND (public.has_role(auth.uid(),'admin'::app_role) OR (i.created_by = auth.uid() AND i.status = 'draft')))
);

CREATE TABLE public.invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata_json jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_events_invoice ON public.invoice_events(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_events TO authenticated;
GRANT ALL ON public.invoice_events TO service_role;
ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_events_select" ON public.invoice_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_events.invoice_id)
);
CREATE POLICY "invoice_events_insert" ON public.invoice_events FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_events.invoice_id)
  AND (created_by IS NULL OR created_by = auth.uid())
);

CREATE OR REPLACE FUNCTION public.assign_next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  num integer;
  fy text;
  formatted text;
BEGIN
  IF NOT public.is_active(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO s FROM public.invoice_settings WHERE workspace = 'default' FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.invoice_settings (workspace) VALUES ('default') RETURNING * INTO s;
  END IF;

  IF EXTRACT(MONTH FROM CURRENT_DATE) >= 4 THEN
    fy := to_char(CURRENT_DATE, 'YY') || '-' || to_char(CURRENT_DATE + interval '1 year', 'YY');
  ELSE
    fy := to_char(CURRENT_DATE - interval '1 year', 'YY') || '-' || to_char(CURRENT_DATE, 'YY');
  END IF;

  IF s.reset_yearly AND (s.last_reset_fy IS DISTINCT FROM fy) THEN
    UPDATE public.invoice_settings SET next_invoice_number = 1, last_reset_fy = fy WHERE id = s.id RETURNING * INTO s;
  END IF;

  num := s.next_invoice_number;
  UPDATE public.invoice_settings SET next_invoice_number = num + 1 WHERE id = s.id;

  formatted := COALESCE(s.invoice_prefix, 'INV-')
    || CASE WHEN s.fy_format IS NOT NULL AND s.fy_format <> '' THEN fy || '/' ELSE '' END
    || lpad(num::text, GREATEST(COALESCE(s.number_padding,4),1), '0');
  RETURN formatted;
END $$;
REVOKE ALL ON FUNCTION public.assign_next_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_next_invoice_number() TO authenticated;

INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-assets','invoice-assets',true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "invoice_assets_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'invoice-assets');
CREATE POLICY "invoice_assets_admin_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoice-assets' AND public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "invoice_assets_admin_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'invoice-assets' AND public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "invoice_assets_admin_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'invoice-assets' AND public.has_role(auth.uid(),'admin'::app_role));
