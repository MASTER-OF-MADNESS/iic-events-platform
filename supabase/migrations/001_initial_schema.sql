-- =============================================================================
-- IIC Innovation Event Management System
-- Migration 001: Initial PostgreSQL Schema
-- Replaces: database/schema.sql (MySQL)
-- =============================================================================
-- Run this in: Supabase Dashboard → SQL Editor
-- Or via: supabase db push (with CLI)
-- =============================================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";
-- Enable trigram matching for fuzzy search (used in GIN indexes)
create extension if not exists "pg_trgm";

-- =============================================================================
-- TABLE: profiles
-- Extends auth.users (Supabase Auth). One row per auth user.
-- Replaces: MySQL `users` table + `admins` table (merged into one)
-- =============================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text not null,
  email        text not null unique,
  role         text not null default 'USER'
                 check (role in ('USER', 'ADMIN', 'SUPER_ADMIN')),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Extended user profile. role=USER for students, ADMIN/SUPER_ADMIN for staff.';

-- Index for fast email lookups
create index if not exists idx_profiles_email on public.profiles(lower(email));
create index if not exists idx_profiles_role  on public.profiles(role);

-- =============================================================================
-- TABLE: events
-- =============================================================================
create table if not exists public.events (
  event_id              uuid primary key default gen_random_uuid(),
  title                 text not null check (char_length(title) between 3 and 150),
  description           text,
  event_date            date not null,
  to_date               date,
  from_time             time not null,
  to_time               time,
  venue                 text not null check (char_length(venue) <= 150),
  event_category        text not null
                          check (event_category in
                            ('Hackathon','Workshop','Talk','Makeathon','Ideathon','Conclave','Expo')),
  event_type            text not null
                          check (event_type in ('INTERNAL','EXTERNAL','BOTH')),
  status                text not null default 'UPCOMING'
                          check (status in ('UPCOMING','COMPLETED','ARCHIVED')),
  poster_url            text,          -- Supabase Storage path
  max_capacity          integer check (max_capacity > 0),
  registration_deadline date,
  fee_type              text not null default 'FREE'
                          check (fee_type in ('FREE','PAID')),
  fee_amount            integer check (fee_amount > 0),
  email_template        text,
  email_subject         text,
  faculty_coordinators  jsonb default '[]'::jsonb,
  student_coordinators  jsonb default '[]'::jsonb,
  cert_template_config  jsonb default '{}'::jsonb,  -- replaces data_{event_id}.json file
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column public.events.poster_url         is 'Supabase Storage path: event-posters/{event_id}/{filename}';
comment on column public.events.cert_template_config is 'JSON placeholder positions for certificate generator';

create index if not exists idx_events_status    on public.events(status);
create index if not exists idx_events_date      on public.events(event_date desc);
create index if not exists idx_events_category  on public.events(event_category);
create index if not exists idx_events_type      on public.events(event_type);
-- Full-text search index on title
create index if not exists idx_events_title_trgm on public.events using gin (title gin_trgm_ops);

-- =============================================================================
-- TABLE: forms
-- =============================================================================
create table if not exists public.forms (
  form_id    uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(event_id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_forms_event_unique on public.forms(event_id);

-- =============================================================================
-- TABLE: form_fields
-- =============================================================================
create table if not exists public.form_fields (
  field_id    uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.forms(form_id) on delete cascade,
  field_label text not null,
  field_type  text not null
                check (field_type in ('TEXT','NUMBER','DROPDOWN','CHECKBOX','EMAIL','TEL','TEXTAREA')),
  is_required boolean not null default false,
  sort_order  integer not null default 0
);

create index if not exists idx_form_fields_form on public.form_fields(form_id);

-- =============================================================================
-- TABLE: registrations
-- =============================================================================
create table if not exists public.registrations (
  registration_id uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  event_id        uuid not null references public.events(event_id) on delete cascade,
  registered_at   timestamptz not null default now(),
  unique (user_id, event_id)
);

create index if not exists idx_reg_event_id on public.registrations(event_id);
create index if not exists idx_reg_user_id  on public.registrations(user_id);

-- =============================================================================
-- TABLE: responses
-- Stores dynamic form answers per registration
-- =============================================================================
create table if not exists public.responses (
  response_id   uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  field_id        uuid not null references public.form_fields(field_id) on delete cascade,
  response_text   text
);

create index if not exists idx_responses_reg on public.responses(registration_id);

-- =============================================================================
-- TABLE: attendance
-- =============================================================================
create table if not exists public.attendance (
  attendance_id   uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(registration_id) on delete cascade,
  status          text not null default 'ABSENT'
                    check (status in ('PRESENT','ABSENT')),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_attendance_status on public.attendance(status);

-- =============================================================================
-- TABLE: certificates
-- =============================================================================
create table if not exists public.certificates (
  certificate_id     uuid primary key default gen_random_uuid(),
  certificate_number text unique,            -- e.g. IIC-20250318-A3F2
  verification_token text unique,            -- random token for QR URL
  registration_id    uuid not null unique references public.registrations(registration_id) on delete cascade,
  certificate_url    text,                   -- Supabase Storage path
  generated_status   text not null default 'NO'
                       check (generated_status in ('YES','NO')),
  email_sent         text not null default 'NO'
                       check (email_sent in ('YES','NO','QUEUED')),
  issued_at          timestamptz
);

create index if not exists idx_cert_generated on public.certificates(generated_status);
create index if not exists idx_cert_email_sent on public.certificates(email_sent);

-- =============================================================================
-- TABLE: email_logs
-- Audit trail for all sent emails
-- =============================================================================
create table if not exists public.email_logs (
  email_id   uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  event_id   uuid not null references public.events(event_id) on delete cascade,
  email_type text not null
               check (email_type in ('REGISTRATION_CONFIRMATION','CERTIFICATE')),
  sent_at    timestamptz not null default now()
);

create index if not exists idx_email_log_user_event on public.email_logs(user_id, event_id);

-- =============================================================================
-- TABLE: email_queue
-- Background certificate email dispatch queue
-- =============================================================================
create table if not exists public.email_queue (
  queue_id       uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates(certificate_id) on delete cascade,
  status         text not null default 'PENDING'
                   check (status in ('PENDING','SENT','FAILED')),
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  error_message  text
);

create index if not exists idx_email_queue_status on public.email_queue(status);

-- =============================================================================
-- TABLE: audit_logs
-- Admin action logging for security/compliance
-- =============================================================================
create table if not exists public.audit_logs (
  log_id     uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references public.profiles(id) on delete cascade,
  action     text not null,
  target_id  uuid,
  details    jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_admin  on public.audit_logs(admin_id);
create index if not exists idx_audit_action on public.audit_logs(action);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- =============================================================================
-- TRIGGERS: auto-update updated_at columns
-- =============================================================================
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.handle_updated_at();

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- =============================================================================
-- TRIGGER: auto-create profile when a new Supabase Auth user signs up
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'USER')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Fires after every new auth user creation
create or replace trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- TRIGGER: auto-insert attendance=ABSENT row on new registration
-- =============================================================================
create or replace function public.handle_new_registration()
returns trigger language plpgsql security definer as $$
begin
  insert into public.attendance (registration_id, status)
  values (new.registration_id, 'ABSENT')
  on conflict (registration_id) do nothing;
  return new;
end;
$$;

create or replace trigger trg_on_registration_created
  after insert on public.registrations
  for each row execute function public.handle_new_registration();
