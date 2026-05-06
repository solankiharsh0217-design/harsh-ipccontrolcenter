-- Enums
CREATE TYPE public.lead_grade AS ENUM ('hot','warm','cold','non-attendee','super-hot','very-cold');
CREATE TYPE public.pipeline_type AS ENUM ('unpaid','paid','custom');
CREATE TYPE public.lead_type AS ENUM ('paid','unpaid');
CREATE TYPE public.activity_channel AS ENUM ('call','whatsapp','email','sms','note','system');

-- Pipelines
CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.pipeline_type NOT NULL DEFAULT 'custom',
  position int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read pipelines" ON public.pipelines FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "admins manage pipelines" ON public.pipelines FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Stages
CREATE TABLE public.stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'gray',
  position int NOT NULL DEFAULT 0,
  is_protected boolean NOT NULL DEFAULT false,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read stages" ON public.stages FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "admins manage stages" ON public.stages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_stages_pipeline ON public.stages(pipeline_id, position);

-- Leads
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  email text,
  phone text,
  country text,
  score int NOT NULL DEFAULT 0,
  grade public.lead_grade NOT NULL DEFAULT 'cold',
  webinar_source text,
  webinar_date date,
  webinar_name text,
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  assigned_agent_id uuid,
  deal_value numeric NOT NULL DEFAULT 118000,
  program_name text NOT NULL DEFAULT 'IPC Diamond Program',
  lead_type public.lead_type NOT NULL DEFAULT 'unpaid',
  total_minutes int NOT NULL DEFAULT 0,
  attendance_pct numeric NOT NULL DEFAULT 0,
  sessions_count int NOT NULL DEFAULT 0,
  first_join_time timestamptz,
  is_super_hot boolean NOT NULL DEFAULT false,
  webinar_count int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX leads_unique_email ON public.leads(lower(email)) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX idx_leads_pipeline_stage ON public.leads(pipeline_id, stage_id);
CREATE INDEX idx_leads_agent ON public.leads(assigned_agent_id);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read leads" ON public.leads FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "admins manage leads" ON public.leads FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "agents insert leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));
CREATE POLICY "agents update assigned leads" ON public.leads FOR UPDATE TO authenticated USING (public.is_active(auth.uid()) AND (assigned_agent_id = auth.uid() OR assigned_agent_id IS NULL));

-- Activity logs
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid,
  agent_name text,
  channel public.activity_channel NOT NULL DEFAULT 'note',
  note text NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read activity" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "members insert activity" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));
CREATE POLICY "admins manage activity" ON public.activity_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_activity_lead ON public.activity_logs(lead_id, logged_at DESC);

-- Follow up reminders
CREATE TABLE public.follow_up_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid,
  reminder_date date NOT NULL,
  reminder_time time,
  channel public.activity_channel NOT NULL DEFAULT 'call',
  note text,
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read reminders" ON public.follow_up_reminders FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "members manage reminders" ON public.follow_up_reminders FOR ALL TO authenticated USING (public.is_active(auth.uid())) WITH CHECK (public.is_active(auth.uid()));
CREATE INDEX idx_reminders_lead ON public.follow_up_reminders(lead_id);
CREATE INDEX idx_reminders_date ON public.follow_up_reminders(reminder_date);

-- Lead Qualifier sessions
CREATE TABLE public.lead_qualifier_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_name text NOT NULL,
  webinar_date date,
  total_duration int,
  registrants int,
  viewers int,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_qualifier_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read sessions" ON public.lead_qualifier_sessions FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "members insert sessions" ON public.lead_qualifier_sessions FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "admins manage sessions" ON public.lead_qualifier_sessions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Updated_at trigger for leads
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed default pipelines + stages
DO $$
DECLARE p1 uuid; p2 uuid;
BEGIN
  INSERT INTO public.pipelines(name,type,position) VALUES ('Sales Pipeline (Unpaid)','unpaid',0) RETURNING id INTO p1;
  INSERT INTO public.pipelines(name,type,position) VALUES ('Paid — Onboarding','paid',1) RETURNING id INTO p2;

  INSERT INTO public.stages(pipeline_id,name,color,position,is_protected,is_won,is_lost) VALUES
    (p1,'New','purple',0,false,false,false),
    (p1,'Attempted','gray',1,false,false,false),
    (p1,'Connected','blue',2,false,false,false),
    (p1,'Interested','gold',3,false,false,false),
    (p1,'Follow-up Scheduled','amber',4,false,false,false),
    (p1,'Proposal Sent','blue',5,false,false,false),
    (p1,'Closed Won','green',6,true,true,false),
    (p1,'Closed Lost','red',7,true,false,true),
    (p1,'Not Reachable','gray',8,false,false,false);

  INSERT INTO public.stages(pipeline_id,name,color,position,is_protected,is_won,is_lost) VALUES
    (p2,'Payment Confirmed','green',0,false,false,false),
    (p2,'Welcome Call Done','blue',1,false,false,false),
    (p2,'Onboarding Call Done','blue',2,false,false,false),
    (p2,'Documents Requested','amber',3,false,false,false),
    (p2,'Documents Received','amber',4,false,false,false),
    (p2,'Bajaj Finance Submitted','purple',5,false,false,false),
    (p2,'Finance Approved','purple',6,false,false,false),
    (p2,'Code of Conduct Signed','gold',7,false,false,false),
    (p2,'Access Given','gold',8,false,false,false),
    (p2,'Active Member','green',9,true,true,false);
END $$;