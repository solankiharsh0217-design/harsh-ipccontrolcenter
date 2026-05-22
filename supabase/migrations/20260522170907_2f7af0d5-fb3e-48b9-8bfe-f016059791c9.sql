
CREATE TABLE IF NOT EXISTS public.offline_seminar_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_type text,
  event_date date,
  event_month text,
  city text,
  venue_name text,
  program_name text,
  business_unit text,
  ticket_price numeric NOT NULL DEFAULT 0,
  tickets_sold integer NOT NULL DEFAULT 0,
  ticket_revenue numeric NOT NULL DEFAULT 0,
  complimentary_passes integer NOT NULL DEFAULT 0,
  total_attendees integer NOT NULL DEFAULT 0,
  no_show_count integer NOT NULL DEFAULT 0,
  total_ad_spend numeric NOT NULL DEFAULT 0,
  total_event_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  program_price numeric NOT NULL DEFAULT 0,
  program_sales_count integer NOT NULL DEFAULT 0,
  program_booked_revenue numeric NOT NULL DEFAULT 0,
  program_revenue_collected numeric NOT NULL DEFAULT 0,
  program_revenue_pending numeric NOT NULL DEFAULT 0,
  refunds_adjustments numeric NOT NULL DEFAULT 0,
  total_gross_revenue numeric NOT NULL DEFAULT 0,
  total_realized_revenue numeric NOT NULL DEFAULT 0,
  total_pending_revenue numeric NOT NULL DEFAULT 0,
  net_profit numeric NOT NULL DEFAULT 0,
  net_profit_margin numeric,
  event_roas numeric,
  realized_roas numeric,
  profit_roi numeric,
  cost_per_attendee numeric,
  cost_per_sale numeric,
  break_even_sales_required numeric,
  media_buyer_breakdown jsonb,
  cost_breakdown jsonb,
  ticket_source_metadata jsonb,
  sales_source_metadata jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid
);

ALTER TABLE public.offline_seminar_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can view offline seminar reports"
ON public.offline_seminar_reports FOR SELECT
USING (public.is_active(auth.uid()));

CREATE POLICY "Active users can create offline seminar reports"
ON public.offline_seminar_reports FOR INSERT
WITH CHECK (public.is_active(auth.uid()));

CREATE POLICY "Active users can update offline seminar reports"
ON public.offline_seminar_reports FOR UPDATE
USING (public.is_active(auth.uid()));

CREATE POLICY "Active users can delete offline seminar reports"
ON public.offline_seminar_reports FOR DELETE
USING (public.is_active(auth.uid()));

CREATE TRIGGER trg_offline_seminar_reports_updated_at
BEFORE UPDATE ON public.offline_seminar_reports
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_offline_seminar_reports_event_date ON public.offline_seminar_reports(event_date);
CREATE INDEX IF NOT EXISTS idx_offline_seminar_reports_is_deleted ON public.offline_seminar_reports(is_deleted);
