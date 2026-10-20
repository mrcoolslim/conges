-- ============================================================================
-- SCHEMA & ROW LEVEL SECURITY (RLS) MIGRATION FOR LEAVE MANAGEMENT APP
-- ============================================================================

-- 1. ENUMS
CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'MANAGER', 'DRH');
CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE half_day_option AS ENUM ('NONE', 'MORNING', 'AFTERNOON');

-- 2. TEAMS / SERVICES
CREATE TABLE public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    manager_id UUID, -- References profiles(id)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PROFILES (Extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
    role user_role NOT NULL DEFAULT 'EMPLOYEE',
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Foreign Key Constraint for Team Manager
ALTER TABLE public.teams ADD CONSTRAINT fk_team_manager
    FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. LEAVE TYPES
CREATE TABLE public.leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    default_days_per_year NUMERIC(4,1) NOT NULL DEFAULT 25.0,
    requires_attachment BOOLEAN DEFAULT FALSE,
    color_code VARCHAR(7) DEFAULT '#3B82F6'
);

-- Seed Default Leave Types
INSERT INTO public.leave_types (name, default_days_per_year, requires_attachment, color_code) VALUES
('Congé annuel', 30.0, FALSE, '#3B82F6'),
('Congé de maladie', 0.0, FALSE, '#EF4444'),
('Congé de maternité', 0.0, FALSE, '#8B5CF6'),
('Récupération', 0.0, FALSE, '#10B981'),
('Autorisation spéciale', 0.0, FALSE, '#F59E0B');

-- Tunisia's Islamic holidays are announced annually; HR enters their confirmed
-- dates here so leave-day calculations follow the official local calendar.
CREATE TABLE public.public_holidays (
    holiday_date DATE PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

-- 5. LEAVE BALANCES
CREATE TABLE public.leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
    year INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    allocated_days NUMERIC(4,1) NOT NULL,
    used_days NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    UNIQUE(user_id, leave_type_id, year)
);

-- 6. LEAVE REQUESTS
CREATE TABLE public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id),
    leave_type_id UUID NOT NULL REFERENCES public.leave_types(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    half_day half_day_option DEFAULT 'NONE',
    total_days NUMERIC(4,1) NOT NULL,
    reason TEXT,
    status leave_status NOT NULL DEFAULT 'PENDING',
    reviewer_id UUID REFERENCES public.profiles(id),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_dates CHECK (end_date >= start_date),
    CONSTRAINT positive_total_days CHECK (total_days > 0)
);

-- 7. NOTIFICATIONS
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. AUDIT LOGS
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- HELPER FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to handle new user registration automatically from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        'EMPLOYEE'
    );

    -- Initialize default leave balances for current year
    INSERT INTO public.leave_balances (user_id, leave_type_id, year, allocated_days, used_days)
    SELECT
        NEW.id,
        id,
        EXTRACT(YEAR FROM CURRENT_DATE)::INT,
        default_days_per_year,
        0.0
    FROM public.leave_types;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Trigger on auth.users insert
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Recalculate durations in the database so direct Data API calls cannot
-- submit a forged number of days or create a pre-approved request.
CREATE OR REPLACE FUNCTION public.set_leave_request_workdays()
RETURNS TRIGGER AS $$
DECLARE
    working_days NUMERIC(4,1);
BEGIN
    SELECT COUNT(*)::NUMERIC INTO working_days
    FROM generate_series(NEW.start_date, NEW.end_date, INTERVAL '1 day') AS calendar_day(day)
    WHERE EXTRACT(ISODOW FROM calendar_day.day) BETWEEN 1 AND 5
      AND TO_CHAR(calendar_day.day, 'MM-DD') NOT IN ('01-01','03-20','04-09','05-01','07-25','08-13','10-15','12-17')
      AND NOT EXISTS (
          SELECT 1 FROM public.public_holidays holiday
          WHERE holiday.holiday_date = calendar_day.day::DATE
      );

    NEW.total_days := GREATEST(working_days - CASE WHEN NEW.half_day = 'NONE' THEN 0 ELSE 0.5 END, 0);
    NEW.status := 'PENDING';
    NEW.reviewer_id := NULL;
    NEW.rejection_reason := NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER calculate_leave_request_workdays
    BEFORE INSERT ON public.leave_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_leave_request_workdays();

-- Security Helper Functions for RLS
CREATE OR REPLACE FUNCTION public.get_auth_role() RETURNS user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.get_auth_team_id() RETURNS UUID AS $$
    SELECT team_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.get_auth_hire_date() RETURNS DATE AS $$
    SELECT hire_date FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

-- These helpers are used by RLS policies, but must not be callable by anonymous
-- API clients. The signup trigger is only invoked by auth.users inserts.
REVOKE ALL ON FUNCTION public.get_auth_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_auth_team_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_auth_hire_date() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_team_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_hire_date() TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PROFILES POLICIES
-- ----------------------------------------------------------------------------
-- Users can read profiles in their team, managers read their team, DRH reads all
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT USING (
    auth.uid() = id
    OR team_id = public.get_auth_team_id()
    OR public.get_auth_role() = 'DRH'
    OR (public.get_auth_role() = 'MANAGER' AND team_id = public.get_auth_team_id())
);

-- Users can update their own profile name; DRH can update role/team_id for anyone
CREATE POLICY "profiles_update_self" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id
    AND role = public.get_auth_role()
    AND team_id IS NOT DISTINCT FROM public.get_auth_team_id()
    AND hire_date IS NOT DISTINCT FROM public.get_auth_hire_date()
);

CREATE POLICY "profiles_update_drh" ON public.profiles
FOR UPDATE TO authenticated
USING (public.get_auth_role() = 'DRH')
WITH CHECK (public.get_auth_role() = 'DRH');

-- ----------------------------------------------------------------------------
-- TEAMS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "teams_select_policy" ON public.teams
FOR SELECT USING (TRUE); -- Everyone can view team list

CREATE POLICY "teams_all_drh" ON public.teams
FOR ALL USING (public.get_auth_role() = 'DRH');

-- ----------------------------------------------------------------------------
-- LEAVE TYPES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "leave_types_select" ON public.leave_types
FOR SELECT USING (TRUE);

CREATE POLICY "leave_types_manage_drh" ON public.leave_types
FOR ALL USING (public.get_auth_role() = 'DRH');

-- ----------------------------------------------------------------------------
-- LEAVE BALANCES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "leave_balances_select" ON public.leave_balances
FOR SELECT USING (
    auth.uid() = user_id
    OR (
        public.get_auth_role() = 'MANAGER'
        AND user_id IN (
            SELECT id FROM public.profiles
            WHERE team_id = public.get_auth_team_id()
        )
    )
    OR public.get_auth_role() = 'DRH'
);

CREATE POLICY "leave_balances_manage_drh" ON public.leave_balances
FOR ALL USING (public.get_auth_role() = 'DRH');

-- ----------------------------------------------------------------------------
-- LEAVE REQUESTS POLICIES
-- ----------------------------------------------------------------------------
-- SELECT:
-- 1) Own requests (all statuses)
-- 2) Team calendar: APPROVED requests in same team
-- 3) Manager: ALL requests in manager's team
-- 4) DRH: ALL requests
CREATE POLICY "leave_requests_select_policy" ON public.leave_requests
FOR SELECT USING (
    auth.uid() = user_id
    OR (team_id = public.get_auth_team_id() AND status = 'APPROVED')
    OR (team_id = public.get_auth_team_id() AND public.get_auth_role() = 'MANAGER')
    OR (public.get_auth_role() = 'DRH')
);

-- INSERT: Authenticated users for themselves matching their profile team_id
CREATE POLICY "leave_requests_insert_policy" ON public.leave_requests
FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND team_id IS NOT DISTINCT FROM public.get_auth_team_id()
    AND status = 'PENDING'
    AND reviewer_id IS NULL
);

REVOKE INSERT ON public.leave_requests FROM authenticated;
GRANT INSERT (user_id, team_id, leave_type_id, start_date, end_date, half_day, total_days, reason)
ON public.leave_requests TO authenticated;

-- UPDATE:
-- 1) Employee can CANCEL their own PENDING request
-- 2) Manager can approve/reject requests for their team
-- 3) DRH can update any request
CREATE POLICY "leave_requests_cancel_own_pending" ON public.leave_requests
FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'PENDING')
WITH CHECK (auth.uid() = user_id AND status = 'CANCELLED');

CREATE POLICY "leave_requests_manager_review" ON public.leave_requests
FOR UPDATE TO authenticated
USING (
    team_id = public.get_auth_team_id()
    AND public.get_auth_role() = 'MANAGER'
    AND status = 'PENDING'
    AND user_id <> auth.uid()
)
WITH CHECK (
    team_id = public.get_auth_team_id()
    AND status IN ('APPROVED', 'REJECTED')
    AND reviewer_id = auth.uid()
);

CREATE POLICY "leave_requests_drh_review" ON public.leave_requests
FOR UPDATE TO authenticated
USING (public.get_auth_role() = 'DRH' AND status = 'PENDING')
WITH CHECK (status IN ('APPROVED', 'REJECTED') AND reviewer_id = auth.uid());

REVOKE UPDATE ON public.leave_requests FROM authenticated;
GRANT UPDATE (status, rejection_reason, reviewer_id, updated_at)
ON public.leave_requests TO authenticated;

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "notifications_owner" ON public.notifications
FOR ALL USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- AUDIT LOGS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "audit_logs_drh_select" ON public.audit_logs
FOR SELECT USING (public.get_auth_role() = 'DRH');

CREATE POLICY "public_holidays_authenticated_read" ON public.public_holidays
FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "public_holidays_drh_manage" ON public.public_holidays
FOR ALL TO authenticated
USING (public.get_auth_role() = 'DRH')
WITH CHECK (public.get_auth_role() = 'DRH');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_holidays TO authenticated;
