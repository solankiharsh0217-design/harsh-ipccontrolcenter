
-- =========================================================================
-- PAID PIPELINE ENGINE — Phase 1
-- =========================================================================

-- 1. webinar_batches ------------------------------------------------------
CREATE TABLE public.webinar_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_name text NOT NULL,
  webinar_date date,
  webinar_type text,
  batch_name text NOT NULL,
  business_unit text NOT NULL DEFAULT 'IPC',
  offer_name text,
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wb_business_unit ON public.webinar_batches(business_unit) WHERE is_deleted = false;
CREATE INDEX idx_wb_date ON public.webinar_batches(webinar_date);

ALTER TABLE public.webinar_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY wb_admin ON public.webinar_batches FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY wb_read ON public.webinar_batches FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY wb_insert ON public.webinar_batches FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY wb_update_own ON public.webinar_batches FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_active(auth.uid()));

CREATE TRIGGER trg_wb_updated BEFORE UPDATE ON public.webinar_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. program_products -----------------------------------------------------
CREATE TABLE public.program_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit text NOT NULL DEFAULT 'IPC',
  product_name text NOT NULL,
  product_price_including_gst numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  gst_applicable boolean NOT NULL DEFAULT true,
  gst_rate numeric NOT NULL DEFAULT 18,
  default_token_amount numeric NOT NULL DEFAULT 0,
  revenue_recognition_rule text NOT NULL DEFAULT 'realized_revenue_only',
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_bu_active ON public.program_products(business_unit) WHERE is_active = true AND is_deleted = false;

ALTER TABLE public.program_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY pp_admin ON public.program_products FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY pp_read ON public.program_products FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY pp_insert ON public.program_products FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY pp_update_own ON public.program_products FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_active(auth.uid()));

CREATE TRIGGER trg_pp_updated BEFORE UPDATE ON public.program_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. paid_pipeline_settings (configurable lists) --------------------------
CREATE TABLE public.paid_pipeline_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit text,                       -- NULL = global default
  setting_type text NOT NULL,               -- payment_type | payment_model | pipeline_stage | finance_partner | finance_status | revenue_recognition_rule
  label text NOT NULL,
  value text,                               -- machine key (optional)
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false, -- seeded defaults flag
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pps_type_bu ON public.paid_pipeline_settings(setting_type, business_unit) WHERE is_active = true AND is_deleted = false;

ALTER TABLE public.paid_pipeline_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY pps_admin ON public.paid_pipeline_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY pps_read ON public.paid_pipeline_settings FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY pps_insert ON public.paid_pipeline_settings FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND (created_by = auth.uid() OR created_by IS NULL));
CREATE POLICY pps_update_own ON public.paid_pipeline_settings FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_active(auth.uid()));

CREATE TRIGGER trg_pps_updated BEFORE UPDATE ON public.paid_pipeline_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed defaults (global, business_unit IS NULL, is_system = true)
INSERT INTO public.paid_pipeline_settings (setting_type, label, value, sort_order, is_system) VALUES
  -- payment_type
  ('payment_type','Token','token',10,true),
  ('payment_type','Down Payment','down_payment',20,true),
  ('payment_type','Balance Payment','balance_payment',30,true),
  ('payment_type','Full Payment','full_payment',40,true),
  ('payment_type','EMI Disbursement','emi_disbursement',50,true),
  ('payment_type','Refund','refund',60,true),
  ('payment_type','Adjustment','adjustment',70,true),
  -- payment_model
  ('payment_model','Full Payment Collected','full_payment',10,true),
  ('payment_model','Token + Balance Later','token_balance_later',20,true),
  ('payment_model','Token + Finance / EMI','token_finance',30,true),
  ('payment_model','Partial Payment Collected','partial_payment',40,true),
  ('payment_model','No Token Collected','no_token',50,true),
  ('payment_model','Free Enrollment / Manual Approval','free_enrollment',60,true),
  -- pipeline_stage
  ('pipeline_stage','Token Paid','token_paid',10,true),
  ('pipeline_stage','Payment Follow-Up Pending','payment_followup_pending',20,true),
  ('pipeline_stage','Balance Pending','balance_pending',30,true),
  ('pipeline_stage','Finance / EMI Documents Pending','finance_docs_pending',40,true),
  ('pipeline_stage','Finance / EMI Applied','finance_applied',50,true),
  ('pipeline_stage','Finance / EMI Approved','finance_approved',60,true),
  ('pipeline_stage','Finance / EMI Disbursed','finance_disbursed',70,true),
  ('pipeline_stage','Full Payment Received','full_payment_received',80,true),
  ('pipeline_stage','Enrolled / Activated','enrolled',90,true),
  ('pipeline_stage','Dropped After Token','dropped_after_token',100,true),
  ('pipeline_stage','Refund / Adjustment','refund_adjustment',110,true),
  ('pipeline_stage','Closed Lost','closed_lost',120,true),
  -- finance_partner
  ('finance_partner','Bajaj Finance','bajaj',10,true),
  ('finance_partner','Razorpay EMI','razorpay',20,true),
  ('finance_partner','Credit Card EMI','cc_emi',30,true),
  ('finance_partner','Bank Transfer Installment','bank_installment',40,true),
  ('finance_partner','Manual Installment','manual',50,true),
  -- finance_status
  ('finance_status','Not Required','not_required',10,true),
  ('finance_status','Interested','interested',20,true),
  ('finance_status','Documents Pending','docs_pending',30,true),
  ('finance_status','Documents Submitted','docs_submitted',40,true),
  ('finance_status','Application Submitted','application_submitted',50,true),
  ('finance_status','Approved','approved',60,true),
  ('finance_status','Rejected','rejected',70,true),
  ('finance_status','Disbursed','disbursed',80,true),
  ('finance_status','Dropped','dropped',90,true),
  -- revenue_recognition_rule
  ('revenue_recognition_rule','Token Collected Only','token_only',10,true),
  ('revenue_recognition_rule','Full Deal Value','full_deal_value',20,true),
  ('revenue_recognition_rule','Realized Revenue Only','realized_revenue_only',30,true),
  ('revenue_recognition_rule','Finance Approved Amount','finance_approved_amount',40,true);

-- 4. paid_pipeline_leads --------------------------------------------------
CREATE TABLE public.paid_pipeline_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit text NOT NULL DEFAULT 'IPC',

  -- batch + product
  webinar_batch_id uuid REFERENCES public.webinar_batches(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.program_products(id) ON DELETE SET NULL,
  product_name_snapshot text,

  -- attribution context
  attribution_session_id uuid,
  attribution_sale_id text,
  attributed_media_buyer text,
  match_method text,
  source_webinar text,
  source_report_date date,
  created_from_attribution boolean NOT NULL DEFAULT false,

  -- buyer
  name text,
  email text,
  phone text,

  -- money
  deal_value_including_gst numeric NOT NULL DEFAULT 0,
  default_token_amount numeric NOT NULL DEFAULT 0,
  token_amount_collected numeric NOT NULL DEFAULT 0,
  total_collected numeric NOT NULL DEFAULT 0,
  balance_pending numeric NOT NULL DEFAULT 0,
  final_revenue_realized numeric NOT NULL DEFAULT 0,

  -- workflow
  payment_model text,
  payment_status text,
  pipeline_stage text,

  -- finance
  finance_required boolean NOT NULL DEFAULT false,
  finance_partner text,
  finance_status text,

  -- assignment
  assigned_sales_executive uuid,
  follow_up_date date,
  notes text,

  -- flags
  is_final_sale boolean NOT NULL DEFAULT false,
  is_enrolled boolean NOT NULL DEFAULT false,
  is_dropped boolean NOT NULL DEFAULT false,
  is_refunded boolean NOT NULL DEFAULT false,

  is_deleted boolean NOT NULL DEFAULT false,
  deleted_by uuid,
  deleted_at timestamptz,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ppl_batch ON public.paid_pipeline_leads(webinar_batch_id) WHERE is_deleted = false;
CREATE INDEX idx_ppl_attr_session ON public.paid_pipeline_leads(attribution_session_id);
CREATE INDEX idx_ppl_attr_sale ON public.paid_pipeline_leads(attribution_sale_id);
CREATE INDEX idx_ppl_email ON public.paid_pipeline_leads(lower(email));
CREATE INDEX idx_ppl_phone ON public.paid_pipeline_leads(phone);
CREATE INDEX idx_ppl_stage ON public.paid_pipeline_leads(pipeline_stage) WHERE is_deleted = false;
CREATE INDEX idx_ppl_assigned ON public.paid_pipeline_leads(assigned_sales_executive);

ALTER TABLE public.paid_pipeline_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY ppl_admin ON public.paid_pipeline_leads FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ppl_read ON public.paid_pipeline_leads FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY ppl_insert ON public.paid_pipeline_leads FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND created_by = auth.uid());
CREATE POLICY ppl_update ON public.paid_pipeline_leads FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND (
    created_by = auth.uid()
    OR assigned_sales_executive = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
  ))
  WITH CHECK (is_active(auth.uid()));

CREATE TRIGGER trg_ppl_updated BEFORE UPDATE ON public.paid_pipeline_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. paid_pipeline_payments ----------------------------------------------
CREATE TABLE public.paid_pipeline_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paid_pipeline_lead_id uuid NOT NULL REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE,
  payment_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_mode text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_reference text,
  is_token boolean NOT NULL DEFAULT false,
  is_final_payment boolean NOT NULL DEFAULT false,
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ppp_lead ON public.paid_pipeline_payments(paid_pipeline_lead_id) WHERE is_deleted = false;

ALTER TABLE public.paid_pipeline_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ppp_admin ON public.paid_pipeline_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ppp_read ON public.paid_pipeline_payments FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY ppp_insert ON public.paid_pipeline_payments FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.paid_pipeline_leads l
    WHERE l.id = paid_pipeline_payments.paid_pipeline_lead_id
      AND (l.created_by = auth.uid() OR l.assigned_sales_executive = auth.uid())
  ));
CREATE POLICY ppp_update ON public.paid_pipeline_payments FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_active(auth.uid()));

-- 6. paid_pipeline_finance_details ---------------------------------------
CREATE TABLE public.paid_pipeline_finance_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paid_pipeline_lead_id uuid NOT NULL UNIQUE REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE,
  finance_partner text,
  finance_status text,
  loan_amount numeric NOT NULL DEFAULT 0,
  down_payment numeric NOT NULL DEFAULT 0,
  application_date date,
  approval_date date,
  disbursement_date date,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paid_pipeline_finance_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY ppfd_admin ON public.paid_pipeline_finance_details FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ppfd_read ON public.paid_pipeline_finance_details FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY ppfd_write ON public.paid_pipeline_finance_details FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.paid_pipeline_leads l
    WHERE l.id = paid_pipeline_finance_details.paid_pipeline_lead_id
      AND (l.created_by = auth.uid() OR l.assigned_sales_executive = auth.uid())
  ));
CREATE POLICY ppfd_update ON public.paid_pipeline_finance_details FOR UPDATE TO authenticated
  USING (is_active(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.paid_pipeline_leads l
    WHERE l.id = paid_pipeline_finance_details.paid_pipeline_lead_id
      AND (l.created_by = auth.uid() OR l.assigned_sales_executive = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
  WITH CHECK (is_active(auth.uid()));

CREATE TRIGGER trg_ppfd_updated BEFORE UPDATE ON public.paid_pipeline_finance_details
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. paid_pipeline_activity_logs -----------------------------------------
CREATE TABLE public.paid_pipeline_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paid_pipeline_lead_id uuid NOT NULL REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ppal_lead ON public.paid_pipeline_activity_logs(paid_pipeline_lead_id, created_at DESC);

ALTER TABLE public.paid_pipeline_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ppal_admin ON public.paid_pipeline_activity_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ppal_read ON public.paid_pipeline_activity_logs FOR SELECT TO authenticated USING (is_active(auth.uid()));
CREATE POLICY ppal_insert ON public.paid_pipeline_activity_logs FOR INSERT TO authenticated
  WITH CHECK (is_active(auth.uid()));
