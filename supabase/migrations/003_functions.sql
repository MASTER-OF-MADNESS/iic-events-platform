-- =============================================================================
-- IIC Events Platform
-- Migration 003: PostgreSQL Helper Functions
-- Replaces: PHP business logic in get_events.php (stats, status computation)
-- =============================================================================

-- =============================================================================
-- FUNCTION: compute_event_status
-- Dynamically computes TODAY / UPCOMING / COMPLETED based on date
-- Replaces: PHP computeStatus() in get_events.php
-- =============================================================================
create or replace function public.compute_event_status(
  p_event_date date,
  p_to_date    date default null
)
returns text language plpgsql stable as $$
declare
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_end     date := coalesce(p_to_date, p_event_date);
begin
  if v_today >= p_event_date and v_today <= v_end then
    return 'TODAY';
  elsif v_end < v_today then
    return 'COMPLETED';
  else
    return 'UPCOMING';
  end if;
end;
$$;

-- =============================================================================
-- FUNCTION: get_dashboard_stats
-- Returns aggregate counts for admin dashboard
-- Replaces: PHP stats mode in get_events.php
-- =============================================================================
create or replace function public.get_dashboard_stats()
returns json language plpgsql security definer as $$
declare
  v_total_events         bigint;
  v_upcoming_events      bigint;
  v_total_registrations  bigint;
  v_certificates_issued  bigint;
  v_type_breakdown       json;
  v_weekly_registrations json;
begin
  select count(*) into v_total_events from public.events;

  select count(*) into v_upcoming_events
  from public.events
  where public.compute_event_status(event_date, to_date) in ('UPCOMING', 'TODAY');

  select count(*) into v_total_registrations from public.registrations;

  select count(*) into v_certificates_issued
  from public.certificates where generated_status = 'YES';

  -- Event type breakdown
  select json_object_agg(event_type, cnt) into v_type_breakdown
  from (
    select event_type, count(*) as cnt
    from public.events
    group by event_type
  ) t;

  -- Weekly registrations (last 7 days, Mon-Sun array)
  select json_agg(day_count order by day_index) into v_weekly_registrations
  from (
    select
      extract(isodow from registered_at at time zone 'Asia/Kolkata')::int - 1 as day_index,
      count(*) as day_count
    from public.registrations
    where registered_at >= now() - interval '7 days'
    group by 1
  ) t
  right join generate_series(0, 6) as s(day_index) using (day_index);

  return json_build_object(
    'success',               true,
    'totalEvents',           v_total_events,
    'upcomingEvents',        v_upcoming_events,
    'totalRegistrations',    v_total_registrations,
    'certificatesGenerated', v_certificates_issued,
    'certificatesIssued',    v_certificates_issued,
    'totalCertificates',     v_certificates_issued,
    'typeBreakdown',         coalesce(v_type_breakdown, '{}'::json),
    'weeklyRegistrations',   coalesce(v_weekly_registrations, '[0,0,0,0,0,0,0]'::json)
  );
end;
$$;

-- Grant execution to authenticated users (RLS on the function itself)
grant execute on function public.get_dashboard_stats() to authenticated;

-- =============================================================================
-- FUNCTION: get_event_with_stats
-- Returns a single event enriched with registration count + dynamic status
-- Replaces: Single-event mode in get_events.php
-- =============================================================================
create or replace function public.get_event_with_stats(p_event_id uuid)
returns json language plpgsql security definer as $$
declare
  v_event    json;
  v_reg_count bigint;
begin
  select row_to_json(e) into v_event
  from (
    select *,
           public.compute_event_status(event_date, to_date) as computed_status
    from public.events
    where event_id = p_event_id
  ) e;

  if v_event is null then
    return null;
  end if;

  select count(*) into v_reg_count
  from public.registrations
  where event_id = p_event_id;

  return v_event::jsonb || json_build_object('registrationCount', v_reg_count)::jsonb;
end;
$$;

grant execute on function public.get_event_with_stats(uuid) to anon, authenticated;

-- =============================================================================
-- FUNCTION: log_admin_action
-- Appends a record to audit_logs. Called by Edge Functions / client.
-- Replaces: PHP logAdminAction() in config/db.php
-- =============================================================================
create or replace function public.log_admin_action(
  p_action    text,
  p_target_id uuid    default null,
  p_details   jsonb   default '{}'::jsonb,
  p_ip        text    default null
)
returns void language plpgsql security definer as $$
begin
  -- Silently skip if caller is not an admin (don't error, just no-op)
  if not public.is_admin() then return; end if;

  insert into public.audit_logs (admin_id, action, target_id, details, ip_address)
  values (auth.uid(), p_action, p_target_id, p_details, p_ip);
end;
$$;

grant execute on function public.log_admin_action(text, uuid, jsonb, text) to authenticated;

-- =============================================================================
-- FUNCTION: check_registration_eligibility
-- Returns eligibility info before a student registers for an event
-- Consolidates PHP logic from register_event.php
-- =============================================================================
create or replace function public.check_registration_eligibility(
  p_event_id uuid,
  p_user_id  uuid
)
returns json language plpgsql security definer as $$
declare
  v_event          record;
  v_reg_count      bigint;
  v_already_reg    boolean;
  v_user_email     text;
  v_now            timestamptz := now() at time zone 'Asia/Kolkata';
begin
  select * into v_event from public.events where event_id = p_event_id limit 1;
  if not found then
    return json_build_object('eligible', false, 'reason', 'Event not found.');
  end if;

  -- Dynamic status check
  if public.compute_event_status(v_event.event_date, v_event.to_date) = 'COMPLETED' then
    return json_build_object('eligible', false, 'reason', 'This event has already ended.');
  end if;

  -- Registration deadline
  if v_event.registration_deadline is not null then
    if (v_event.registration_deadline + interval '1 day' - interval '1 second') < v_now then
      return json_build_object('eligible', false, 'reason', 'Registration deadline has passed.');
    end if;
  end if;

  -- Capacity check
  if v_event.max_capacity is not null then
    select count(*) into v_reg_count
    from public.registrations where event_id = p_event_id;
    if v_reg_count >= v_event.max_capacity then
      return json_build_object('eligible', false, 'reason', 'Event has reached maximum capacity.');
    end if;
  end if;

  -- Duplicate registration
  select exists(
    select 1 from public.registrations
    where user_id = p_user_id and event_id = p_event_id
  ) into v_already_reg;
  if v_already_reg then
    return json_build_object('eligible', false, 'reason', 'You are already registered for this event.');
  end if;

  -- INTERNAL event email restriction
  if v_event.event_type = 'INTERNAL' then
    select email into v_user_email from public.profiles where id = p_user_id;
    if not (lower(v_user_email) like '%@vitstudent.ac.in') then
      return json_build_object(
        'eligible', false,
        'reason', 'Internal events are restricted to VIT students (@vitstudent.ac.in).'
      );
    end if;
  end if;

  return json_build_object(
    'eligible',      true,
    'event_type',    v_event.event_type,
    'fee_type',      v_event.fee_type,
    'fee_amount',    v_event.fee_amount
  );
end;
$$;

grant execute on function public.check_registration_eligibility(uuid, uuid) to authenticated;

-- =============================================================================
-- FUNCTION: verify_certificate_by_token
-- Public lookup for QR-based certificate verification
-- Replaces: modules/certificates/verify_certificate.php
-- =============================================================================
create or replace function public.verify_certificate_by_token(p_token text)
returns json language plpgsql security definer as $$
declare
  v_result json;
begin
  select json_build_object(
    'found',              true,
    'certificate_number', c.certificate_number,
    'issued_at',          c.issued_at,
    'student_name',       p.name,
    'student_email',      p.email,
    'event_title',        e.title,
    'event_date',         e.event_date,
    'venue',              e.venue
  )
  into v_result
  from public.certificates c
  join public.registrations r on r.registration_id = c.registration_id
  join public.profiles p      on p.id = r.user_id
  join public.events e        on e.event_id = r.event_id
  where c.verification_token = p_token
    and c.generated_status = 'YES'
  limit 1;

  if v_result is null then
    return json_build_object('found', false, 'reason', 'Certificate not found or invalid token.');
  end if;

  return v_result;
end;
$$;

-- Public verification — no auth required
grant execute on function public.verify_certificate_by_token(text) to anon, authenticated;
