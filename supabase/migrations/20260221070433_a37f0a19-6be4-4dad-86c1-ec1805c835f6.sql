
-- Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'agent', 'tax_processor', 'client');

-- Organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User roles table (separate from profiles per security best practice)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  full_name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user role function
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Get user org function
CREATE OR REPLACE FUNCTION public.get_user_org(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;

-- System settings
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  retry_gap_days INT DEFAULT 7,
  max_attempt_limit INT DEFAULT 3,
  leaderboard_reset_day INT DEFAULT 1,
  business_hours_start TIME DEFAULT '09:00',
  business_hours_end TIME DEFAULT '18:00',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT,
  lead_source TEXT,
  assigned_agent_id UUID REFERENCES public.profiles(id),
  status TEXT DEFAULT 'New' CHECK (status IN (
    'New','Not Answered','Not Interested','Other Firm',
    'Follow-Up','Converted','Closed','Wrong Number'
  )),
  attempt_count INT DEFAULT 0,
  next_retry_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Assignment history
CREATE TABLE public.assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_from UUID REFERENCES public.profiles(id),
  assigned_to UUID REFERENCES public.profiles(id),
  reason TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now()
);

-- Call dispositions
CREATE TABLE public.call_dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.profiles(id) NOT NULL,
  disposition_type TEXT NOT NULL CHECK (disposition_type IN (
    'Not Answered','Not Interested','Other Firm',
    'Follow-Up Required','Converted','Wrong Number'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  attempt_count_at_time INT,
  CONSTRAINT notes_required_for_answered CHECK (
    disposition_type = 'Not Answered' OR notes IS NOT NULL
  )
);

-- Follow-ups
CREATE TABLE public.followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.profiles(id) NOT NULL,
  follow_up_datetime TIMESTAMPTZ NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'Upcoming' CHECK (status IN ('Upcoming','Completed','Overdue')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cases
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  lead_id UUID REFERENCES public.leads(id) UNIQUE,
  current_stage TEXT DEFAULT 'Converted' CHECK (current_stage IN (
    'Converted','File Received','Intake Submitted',
    'Estimation Approved','Filing In Progress','Filed','Closed'
  )),
  sla_due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Case stage log
CREATE TABLE public.case_stage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT,
  changed_by UUID REFERENCES public.profiles(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  user_id UUID REFERENCES public.profiles(id),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  previous_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Revenue entries
CREATE TABLE public.revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  case_id UUID REFERENCES public.cases(id),
  agent_id UUID REFERENCES public.profiles(id) NOT NULL,
  amount_usd NUMERIC(10,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN (
    'Zelle','CashApp','Bank Transfer','Card','Check','Other'
  )),
  payment_date DATE NOT NULL,
  reference TEXT,
  locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: handle disposition
CREATE OR REPLACE FUNCTION public.handle_disposition()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  gap_days INT;
BEGIN
  SELECT retry_gap_days INTO gap_days
  FROM public.system_settings
  WHERE organization_id = NEW.organization_id
  LIMIT 1;

  IF gap_days IS NULL THEN gap_days := 7; END IF;

  IF NEW.disposition_type = 'Not Answered' THEN
    UPDATE public.leads SET
      status = 'Not Answered',
      attempt_count = attempt_count + 1,
      next_retry_date = now() + (gap_days || ' days')::INTERVAL,
      updated_at = now()
    WHERE id = NEW.lead_id;
  ELSIF NEW.disposition_type = 'Follow-Up Required' THEN
    UPDATE public.leads SET status = 'Follow-Up', updated_at = now()
    WHERE id = NEW.lead_id;
  ELSIF NEW.disposition_type = 'Converted' THEN
    UPDATE public.leads SET status = 'Converted', updated_at = now()
    WHERE id = NEW.lead_id;
    -- Auto-create case
    INSERT INTO public.cases (organization_id, lead_id)
    VALUES (NEW.organization_id, NEW.lead_id)
    ON CONFLICT (lead_id) DO NOTHING;
  ELSIF NEW.disposition_type IN ('Not Interested','Other Firm','Wrong Number') THEN
    UPDATE public.leads SET status = NEW.disposition_type, updated_at = now()
    WHERE id = NEW.lead_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_disposition_insert
  AFTER INSERT ON public.call_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.handle_disposition();

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_stage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_entries ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES

-- Organizations
CREATE POLICY "Users read own org" ON public.organizations FOR SELECT
  USING (id = public.get_user_org(auth.uid()));
CREATE POLICY "Super admin full org access" ON public.organizations FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- User roles
CREATE POLICY "Users read own role" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Admin manage roles" ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Profiles
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT
  USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "Admin read all profiles" ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin manage profiles" ON public.profiles FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- System settings
CREATE POLICY "Admin manage settings" ON public.system_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "All authenticated read settings" ON public.system_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Leads
CREATE POLICY "Agent read own leads" ON public.leads FOR SELECT
  USING (assigned_agent_id = auth.uid());
CREATE POLICY "Agent update own leads" ON public.leads FOR UPDATE
  USING (assigned_agent_id = auth.uid());
CREATE POLICY "Admin full leads" ON public.leads FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Agent insert leads" ON public.leads FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Assignment history
CREATE POLICY "Admin read assignment history" ON public.assignment_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Agent read own assignment history" ON public.assignment_history FOR SELECT
  USING (assigned_to = auth.uid() OR assigned_from = auth.uid());
CREATE POLICY "System insert assignment history" ON public.assignment_history FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Call dispositions
CREATE POLICY "Agent insert own disposition" ON public.call_dispositions
  FOR INSERT WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agent read own dispositions" ON public.call_dispositions
  FOR SELECT USING (agent_id = auth.uid());
CREATE POLICY "Admin read all dispositions" ON public.call_dispositions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Follow-ups
CREATE POLICY "Agent manage own followups" ON public.followups
  FOR ALL USING (agent_id = auth.uid());
CREATE POLICY "Admin full followup access" ON public.followups
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Cases
CREATE POLICY "Agent read own cases" ON public.cases FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.leads
    WHERE leads.id = cases.lead_id
    AND leads.assigned_agent_id = auth.uid()
  ));
CREATE POLICY "Admin full case access" ON public.cases FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Case stage log
CREATE POLICY "Admin read case stage log" ON public.case_stage_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Authenticated insert case stage log" ON public.case_stage_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Audit logs (immutable - SELECT only for admins)
CREATE POLICY "Admin read audit logs" ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "System insert audit logs" ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Revenue entries
CREATE POLICY "Agent insert own revenue" ON public.revenue_entries
  FOR INSERT WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agent update unlocked own revenue" ON public.revenue_entries
  FOR UPDATE USING (agent_id = auth.uid() AND locked = false);
CREATE POLICY "Agent read own revenue" ON public.revenue_entries
  FOR SELECT USING (agent_id = auth.uid());
CREATE POLICY "Admin full revenue access" ON public.revenue_entries
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.followups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cases;
