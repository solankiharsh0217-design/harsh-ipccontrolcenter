ALTER TABLE public.daily_lead_reports ADD COLUMN IF NOT EXISTS report_status text NOT NULL DEFAULT 'saved';
ALTER TABLE public.daily_lead_report_media_buyers ADD COLUMN IF NOT EXISTS is_manual_lead_override boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_dlr_report_date ON public.daily_lead_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_dlr_created_by ON public.daily_lead_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_dlrmb_report_id ON public.daily_lead_report_media_buyers(report_id);
CREATE INDEX IF NOT EXISTS idx_dlraa_mb_id ON public.daily_lead_report_ad_accounts(report_media_buyer_id);