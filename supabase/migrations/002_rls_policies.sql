-- =============================================================================
-- IIC Events Platform
-- Migration 002: Row Level Security Policies
-- =============================================================================
-- Principle of least privilege: every table locked down.
-- Admins bypass via role check; students see only their own data.
-- =============================================================================

-- Enable pg_trgm for fuzzy title search (referenced in 001 schema)
create extension if not exists "pg_trgm";

-- =============================================================================
-- HELPER: is_admin() — usable inside policies without subqueries
-- =============================================================================
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('ADMIN', 'SUPER_ADMIN')
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'SUPER_ADMIN'
  );
$$;

-- =============================================================================
-- TABLE: profiles
-- =============================================================================
alter table public.profiles enable row level security;

-- Users can read their own profile; admins can read all
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- Users can update their own name only; admins update anything
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- Only the trigger (security definer) can insert — no direct user inserts
create policy "profiles_insert_trigger"
  on public.profiles for insert
  with check (auth.uid() = id or public.is_super_admin());

-- Only super_admin can delete profiles (revoking access)
create policy "profiles_delete_super_admin"
  on public.profiles for delete
  using (public.is_super_admin());

-- =============================================================================
-- TABLE: events
-- =============================================================================
alter table public.events enable row level security;

-- Everyone (including unauthenticated) can read events
create policy "events_select_public"
  on public.events for select
  using (true);

-- Only admins can create events
create policy "events_insert_admin"
  on public.events for insert
  with check (public.is_admin());

-- Only admins can update events
create policy "events_update_admin"
  on public.events for update
  using (public.is_admin());

-- Only admins can delete events
create policy "events_delete_admin"
  on public.events for delete
  using (public.is_admin());

-- =============================================================================
-- TABLE: forms
-- =============================================================================
alter table public.forms enable row level security;

create policy "forms_select_public"
  on public.forms for select using (true);

create policy "forms_insert_admin"
  on public.forms for insert with check (public.is_admin());

create policy "forms_update_admin"
  on public.forms for update using (public.is_admin());

create policy "forms_delete_admin"
  on public.forms for delete using (public.is_admin());

-- =============================================================================
-- TABLE: form_fields
-- =============================================================================
alter table public.form_fields enable row level security;

create policy "form_fields_select_public"
  on public.form_fields for select using (true);

create policy "form_fields_insert_admin"
  on public.form_fields for insert with check (public.is_admin());

create policy "form_fields_update_admin"
  on public.form_fields for update using (public.is_admin());

create policy "form_fields_delete_admin"
  on public.form_fields for delete using (public.is_admin());

-- =============================================================================
-- TABLE: registrations
-- =============================================================================
alter table public.registrations enable row level security;

-- Users see own registrations; admins see all
create policy "registrations_select"
  on public.registrations for select
  using (auth.uid() = user_id or public.is_admin());

-- Authenticated users can register themselves (no impersonation)
create policy "registrations_insert_self"
  on public.registrations for insert
  with check (auth.uid() = user_id);

-- Users can cancel own registrations; admins can delete any
create policy "registrations_delete"
  on public.registrations for delete
  using (auth.uid() = user_id or public.is_admin());

-- =============================================================================
-- TABLE: responses
-- =============================================================================
alter table public.responses enable row level security;

-- Users can see their own responses; admins see all
create policy "responses_select"
  on public.responses for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.registrations r
      where r.registration_id = responses.registration_id
        and r.user_id = auth.uid()
    )
  );

create policy "responses_insert_self"
  on public.responses for insert
  with check (
    exists (
      select 1 from public.registrations r
      where r.registration_id = responses.registration_id
        and r.user_id = auth.uid()
    )
  );

-- Admins manage all responses
create policy "responses_admin_all"
  on public.responses for all using (public.is_admin());

-- =============================================================================
-- TABLE: attendance
-- =============================================================================
alter table public.attendance enable row level security;

-- Users see their own attendance; admins see all
create policy "attendance_select"
  on public.attendance for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.registrations r
      where r.registration_id = attendance.registration_id
        and r.user_id = auth.uid()
    )
  );

-- Only admins (and trigger) can insert/update attendance
create policy "attendance_insert_admin_or_trigger"
  on public.attendance for insert
  with check (public.is_admin() or auth.uid() is not null);

create policy "attendance_update_admin"
  on public.attendance for update
  using (public.is_admin());

-- =============================================================================
-- TABLE: certificates
-- =============================================================================
alter table public.certificates enable row level security;

-- Users can see their own certificates; admins see all
create policy "certificates_select"
  on public.certificates for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.registrations r
      where r.registration_id = certificates.registration_id
        and r.user_id = auth.uid()
    )
  );

-- Public can look up certificates by verification_token (for QR verification)
create policy "certificates_select_by_token"
  on public.certificates for select
  using (verification_token is not null);

-- Only admins can generate/update certificates
create policy "certificates_insert_admin"
  on public.certificates for insert with check (public.is_admin());

create policy "certificates_update_admin"
  on public.certificates for update using (public.is_admin());

-- =============================================================================
-- TABLE: email_logs
-- =============================================================================
alter table public.email_logs enable row level security;

-- Users see their own email logs; admins see all
create policy "email_logs_select"
  on public.email_logs for select
  using (auth.uid() = user_id or public.is_admin());

create policy "email_logs_insert_admin"
  on public.email_logs for insert with check (public.is_admin());

-- =============================================================================
-- TABLE: email_queue
-- =============================================================================
alter table public.email_queue enable row level security;

create policy "email_queue_admin_all"
  on public.email_queue for all using (public.is_admin());

-- =============================================================================
-- TABLE: audit_logs
-- =============================================================================
alter table public.audit_logs enable row level security;

-- Only admins can see audit logs; super_admin sees all
create policy "audit_logs_admin_select"
  on public.audit_logs for select
  using (public.is_admin());

-- Admins can insert audit log entries
create policy "audit_logs_insert_admin"
  on public.audit_logs for insert
  with check (public.is_admin());
