/* ============================================================
   api.js — Supabase SDK API Layer
   Replaces: PHP fetch wrapper (modules/**\/*.php calls)

   DESIGN CONTRACT:
   Every method preserves the EXACT same name and return shape
   as the old PHP-backed api.js so that ZERO HTML files need
   to change. Only the implementation is swapped.
   ============================================================ */

import { supabase, APP_URL } from './supabase-client.js';

// ── Sentry Error Monitoring (Placeholder) ──────────────────────────────────────
// import * as Sentry from "@sentry/browser";
// Sentry.init({
//   dsn: "YOUR_SENTRY_DSN_HERE",
//   integrations: [new Sentry.BrowserTracing()],
//   tracesSampleRate: 1.0,
// });

// ── Custom error class (unchanged API surface) ────────────────────────────────
export class APIError extends Error {
  constructor(message, status = 0, data = {}) {
    super(message);
    this.name   = 'APIError';
    this.status = status;
    this.data   = data;
  }
}

// ── Internal helper: throw APIError from Supabase error objects ───────────────
function throwIf(error, fallback = 'An error occurred.') {
  if (!error) return;
  throw new APIError(error.message || fallback, error.status || 500, error);
}

// ── Compute dynamic event status (mirrors PHP computeStatus) ──────────────────
function computeStatus(eventDate, toDate) {
  const today   = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const endDate = toDate || eventDate;
  if (today >= eventDate && today <= endDate) return 'TODAY';
  if (endDate < today) return 'COMPLETED';
  return 'UPCOMING';
}

// ── Normalise an events row to match the old PHP response shape ───────────────
function normaliseEvent(e) {
  return {
    ...e,
    id:     e.event_id,
    date:   e.event_date,
    type:   e.event_type,
    from_time: e.from_time,
    poster: e.poster_url
      ? supabase.storage.from('event-posters').getPublicUrl(e.poster_url).data.publicUrl
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(e.title || 'Event')}&background=1a1a6c&color=ffffff&size=500`,
    status: computeStatus(e.event_date, e.to_date),
    faculty_coordinators: e.faculty_coordinators || [],
    student_coordinators: e.student_coordinators || [],
    registrationCount:    e.registrationCount    || 0,
  };
}

/* ============================================================
   AUTH MODULE
   ============================================================ */

/**
 * Email + password login.
 * Returns { success, user, role, name } — same shape as PHP login.php
 */
async function login({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new APIError(error.message, 401, error);

  const profile = await _getProfile(data.user.id);
  return {
    success: true,
    message: 'Login successful.',
    user:    { id: data.user.id, name: profile.name, email: profile.email, role: profile.role },
    role:    profile.role,
    name:    profile.name,
  };
}

/**
 * Email + password sign-up (student registration).
 * Returns { success, user }
 */
async function signup({ name, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name, role: 'USER' },
    },
  });
  if (error) throw new APIError(error.message, 400, error);

  return {
    success: true,
    message: data.session
      ? 'Account created successfully.'
      : 'Account created. Please check your email to verify your account.',
    user:    { id: data.user?.id, name, email, role: 'USER' },
  };
}

/**
 * Google OAuth login — redirects to Google, then back to app.
 * Call this from the login page; the redirect result is handled by auth.js.
 * Uses VITE_APP_URL so the redirect always lands on the correct portal
 * (student portal) regardless of which Vercel project triggers the login.
 */
async function googleLogin() {
  const redirectUrl = APP_URL.includes('localhost')
    ? `${APP_URL}/public/index.html`
    : `${APP_URL}/index.html`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw new APIError(error.message, 400, error);
  return { success: true };
}

/** Logout — clears Supabase session */
async function logout() {
  await supabase.auth.signOut();
  return { success: true };
}

/**
 * Check current session — returns same shape as PHP session_check.php
 */
async function me() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { logged_in: false };

  const profile = await _getProfile(user.id);
  return {
    logged_in: true,
    user_id:   user.id,
    name:      profile?.name  || user.email,
    email:     profile?.email || user.email,
    role:      profile?.role  || 'USER',
  };
}

/* ============================================================
   EVENTS MODULE
   ============================================================ */

/**
 * Get events list with optional filters.
 * Replaces: GET /modules/events/get_events.php
 */
async function getEvents(params = {}) {
  const { status, event_type, limit, search, stats } = params;

  // ── Stats mode ──────────────────────────────────────────────────────────
  if (stats === '1' || stats === 1) {
    return getStats();
  }

  let query = supabase
    .from('events')
    .select(`
      event_id, title, description, event_date, to_date, from_time,
      venue, event_category, event_type, status, poster_url, max_capacity,
      registration_deadline, email_template, email_subject,
      faculty_coordinators, student_coordinators, created_by, created_at,
      fee_type, fee_amount,
      registrations ( count )
    `)
    .order('event_date', { ascending: false })
    .order('from_time', { ascending: false });

  if (search) {
    query = query.ilike('title', `%${search}%`);
  }
  if (status && ['UPCOMING', 'COMPLETED', 'ARCHIVED'].includes(status)) {
    query = query.eq('status', status);
  }
  if (event_type && ['INTERNAL', 'EXTERNAL', 'BOTH'].includes(event_type)) {
    query = query.eq('event_type', event_type);
  }
  if (limit && Number(limit) > 0) {
    query = query.limit(Number(limit));
  }

  const { data, error } = await query;
  throwIf(error, 'Failed to fetch events.');

  const events = (data || []).map(e => normaliseEvent({
    ...e,
    registrationCount: e.registrations?.[0]?.count || 0,
  }));

  // Apply dynamic status filter AFTER fetching (computed from dates)
  const filtered = status
    ? events.filter(e => e.status === status)
    : events;

  return { success: true, events: filtered };
}

/**
 * Get a single event by ID.
 * Replaces: GET /modules/events/get_events.php?event_id=
 */
async function getEvent(eventId) {
  const { data, error } = await supabase
    .from('events')
    .select(`
      event_id, title, description, event_date, to_date, from_time,
      venue, event_category, event_type, status, poster_url, max_capacity,
      registration_deadline, email_template, email_subject,
      faculty_coordinators, student_coordinators, created_by, created_at,
      fee_type, fee_amount,
      registrations ( count )
    `)
    .eq('event_id', eventId)
    .single();

  if (error || !data) throw new APIError('Event not found.', 404);

  const event = normaliseEvent({
    ...data,
    registrationCount: data.registrations?.[0]?.count || 0,
  });

  return { success: true, event };
}

/**
 * Create a new event (with optional poster upload).
 * Replaces: POST /modules/events/create_event.php
 * @param {FormData} formData — contains all event fields + optional poster file
 */
async function createEvent(formData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new APIError('Authentication required.', 401);

  // ── Extract poster file if present ─────────────────────────────────────────
  let posterUrl = null;
  const posterFile = formData instanceof FormData ? formData.get('poster') : null;

  // ── Build event payload from FormData or plain object ──────────────────────
  const payload = _extractEventPayload(formData);

  // ── Validate required fields ────────────────────────────────────────────────
  _validateEventPayload(payload);

  // ── Upload poster to Supabase Storage ──────────────────────────────────────
  if (posterFile && posterFile.size > 0) {
    const ext      = posterFile.name.split('.').pop().toLowerCase();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const path     = `${payload.event_id || crypto.randomUUID()}/${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from('event-posters')
      .upload(path, posterFile, { contentType: posterFile.type, upsert: false });

    if (uploadErr) throw new APIError(`Poster upload failed: ${uploadErr.message}`, 500);
    posterUrl = path;
  }

  // ── Insert event row ────────────────────────────────────────────────────────
  const eventId = crypto.randomUUID();
  const { data, error } = await supabase
    .from('events')
    .insert({
      event_id:             eventId,
      title:                payload.title,
      description:          payload.description || '',
      event_date:           payload.event_date,
      to_date:              payload.to_date || payload.event_date,
      from_time:            payload.from_time,
      venue:                payload.venue,
      event_category:       payload.event_category,
      event_type:           payload.event_type,
      status:               'UPCOMING',
      poster_url:           posterUrl,
      max_capacity:         payload.max_capacity ? Number(payload.max_capacity) : null,
      registration_deadline: payload.registration_deadline || null,
      fee_type:             payload.fee_type   || 'FREE',
      fee_amount:           payload.fee_amount  ? Number(payload.fee_amount) : null,
      email_template:       payload.email_template || null,
      email_subject:        payload.email_subject  || null,
      faculty_coordinators: _parseJson(payload.faculty_coordinators, []),
      student_coordinators: _parseJson(payload.student_coordinators, []),
      created_by:           user.id,
    })
    .select()
    .single();

  if (error) throw new APIError(`Failed to create event: ${error.message}`, 500);

  // Audit log
  await supabase.rpc('log_admin_action', {
    p_action:    `Created event '${payload.title}'`,
    p_target_id: eventId,
    p_details:   { title: payload.title, category: payload.event_category },
  });

  return { success: true, message: 'Event created successfully.', event_id: eventId, poster_url: posterUrl };
}

/**
 * Update an existing event.
 * Replaces: POST /modules/events/update_event.php
 */
async function updateEvent(eventId, formDataOrObject) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new APIError('Authentication required.', 401);

  const payload = _extractEventPayload(formDataOrObject);

  // Handle poster replacement
  let posterUrl = payload.poster_url || undefined;
  const posterFile = formDataOrObject instanceof FormData
    ? formDataOrObject.get('poster')
    : null;

  if (posterFile && posterFile.size > 0) {
    const ext      = posterFile.name.split('.').pop().toLowerCase();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const path     = `${eventId}/${fileName}`;
    const { error: uploadErr } = await supabase.storage
      .from('event-posters')
      .upload(path, posterFile, { contentType: posterFile.type, upsert: true });
    if (uploadErr) throw new APIError(`Poster upload failed: ${uploadErr.message}`, 500);
    posterUrl = path;
  }

  const updateData = {
    ...(payload.title             && { title: payload.title }),
    ...(payload.description       !== undefined && { description: payload.description }),
    ...(payload.event_date        && { event_date: payload.event_date }),
    ...(payload.to_date           !== undefined && { to_date: payload.to_date }),
    ...(payload.from_time         && { from_time: payload.from_time }),
    ...(payload.venue             && { venue: payload.venue }),
    ...(payload.event_category    && { event_category: payload.event_category }),
    ...(payload.event_type        && { event_type: payload.event_type }),
    ...(payload.status            && { status: payload.status }),
    ...(posterUrl                 !== undefined && { poster_url: posterUrl }),
    ...(payload.max_capacity      !== undefined && { max_capacity: payload.max_capacity ? Number(payload.max_capacity) : null }),
    ...(payload.registration_deadline !== undefined && { registration_deadline: payload.registration_deadline || null }),
    ...(payload.fee_type          && { fee_type: payload.fee_type }),
    ...(payload.fee_amount        !== undefined && { fee_amount: payload.fee_amount ? Number(payload.fee_amount) : null }),
    ...(payload.email_template    !== undefined && { email_template: payload.email_template }),
    ...(payload.email_subject     !== undefined && { email_subject: payload.email_subject }),
    ...(payload.faculty_coordinators !== undefined && { faculty_coordinators: _parseJson(payload.faculty_coordinators, []) }),
    ...(payload.student_coordinators !== undefined && { student_coordinators: _parseJson(payload.student_coordinators, []) }),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('events').update(updateData).eq('event_id', eventId);
  if (error) throw new APIError(`Failed to update event: ${error.message}`, 500);

  await supabase.rpc('log_admin_action', {
    p_action:    `Updated event`,
    p_target_id: eventId,
  });

  return { success: true, message: 'Event updated successfully.' };
}

/**
 * Delete an event.
 * Replaces: POST /modules/events/delete_event.php
 */
async function deleteEvent(eventId) {
  // Get poster path to clean up storage
  const { data: evt } = await supabase
    .from('events')
    .select('poster_url, title')
    .eq('event_id', eventId)
    .single();

  const { error } = await supabase.from('events').delete().eq('event_id', eventId);
  if (error) throw new APIError(`Failed to delete event: ${error.message}`, 500);

  // Clean up poster from storage
  if (evt?.poster_url) {
    await supabase.storage.from('event-posters').remove([evt.poster_url]);
  }

  await supabase.rpc('log_admin_action', {
    p_action:    `Deleted event '${evt?.title || eventId}'`,
    p_target_id: eventId,
  });

  return { success: true, message: 'Event deleted successfully.' };
}

/* ============================================================
   FORMS MODULE
   ============================================================ */

/**
 * Get form fields for an event.
 * Replaces: GET /modules/forms/get_form.php?event_id=
 */
async function getFormFields(eventId) {
  const { data: form } = await supabase
    .from('forms')
    .select('form_id')
    .eq('event_id', eventId)
    .single();

  if (!form) return { success: true, fields: [] };

  const { data: fields, error } = await supabase
    .from('form_fields')
    .select('field_id, field_label, field_type, is_required, sort_order')
    .eq('form_id', form.form_id)
    .order('sort_order');

  throwIf(error, 'Failed to fetch form fields.');
  return { success: true, fields: fields || [], form_id: form.form_id };
}

/**
 * Save (upsert) form fields for an event.
 * Replaces: POST /modules/forms/create_form.php
 * @param {string} eventId
 * @param {Array}  fieldsArray — [{ field_label, field_type, is_required }, ...]
 */
async function saveFormFields(eventId, fieldsArray) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new APIError('Authentication required.', 401);

  // Upsert the form record
  const { data: form, error: formErr } = await supabase
    .from('forms')
    .upsert({ event_id: eventId, created_by: user.id }, { onConflict: 'event_id' })
    .select('form_id')
    .single();

  throwIf(formErr, 'Failed to save form.');

  // Delete existing fields and re-insert (clean replace)
  await supabase.from('form_fields').delete().eq('form_id', form.form_id);

  if (fieldsArray.length > 0) {
    const fields = fieldsArray.map((f, i) => ({
      form_id:     form.form_id,
      field_label: f.label || f.field_label,
      field_type:  (f.type || f.field_type || 'TEXT').toUpperCase(),
      is_required: !!(f.is_required === 1 || f.required === true || f.is_required === true),
      sort_order:  i,
    }));

    const { error: fieldsErr } = await supabase.from('form_fields').insert(fields);
    throwIf(fieldsErr, 'Failed to save form fields.');
  }

  return { success: true, message: 'Form saved successfully.', form_id: form.form_id };
}

/* ============================================================
   REGISTRATION MODULE
   ============================================================ */

/**
 * Register the current user for an event.
 * Replaces: POST /modules/registration/register_event.php
 * @param {string} eventId
 * @param {Array}  responsesArray — [{ field_id, response_text }, ...]
 */
async function registerForEvent(eventId, responsesArray = []) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new APIError('Authentication required. Please log in.', 401);

  // 1. Check eligibility (via DB function)
  const { data: eligibility, error: eligErr } = await supabase
    .rpc('check_registration_eligibility', { p_event_id: eventId, p_user_id: user.id });

  if (eligErr) throw new APIError('Failed to check eligibility.', 500);
  if (!eligibility?.eligible) {
    throw new APIError(eligibility?.reason || 'Registration not allowed.', 400);
  }

  // 2. Insert registration (unique constraint prevents duplicates at DB level)
  const { data: reg, error: regErr } = await supabase
    .from('registrations')
    .insert({ user_id: user.id, event_id: eventId })
    .select('registration_id')
    .single();

  if (regErr) {
    if (regErr.code === '23505') {
      throw new APIError('You are already registered for this event.', 409);
    }
    throw new APIError(`Registration failed: ${regErr.message}`, 500);
  }

  // 3. Insert form responses
  if (responsesArray.length > 0) {
    const responses = responsesArray
      .filter(r => r.field_id)
      .map(r => ({
        registration_id: reg.registration_id,
        field_id:        r.field_id,
        response_text:   r.response_text || r.field_value || '',
      }));

    if (responses.length > 0) {
      await supabase.from('responses').insert(responses);
    }
  }

  // 4. Trigger confirmation email (non-blocking — fire and forget)
  supabase.functions
    .invoke('send-registration-email', { body: { event_id: eventId, user_id: user.id } })
    .catch(e => console.warn('[api] Registration email failed (non-critical):', e));

  return {
    success: true,
    message: 'Registered for event successfully.',
    registration_id: reg.registration_id,
  };
}

/**
 * Get current user's registrations.
 * Replaces: GET /modules/registration/my_registrations.php
 */
async function getMyRegs() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new APIError('Authentication required.', 401);

  const { data, error } = await supabase
    .from('registrations')
    .select(`
      registration_id, registered_at,
      events (
        event_id, title, event_date, to_date, from_time, venue,
        event_category, poster_url, fee_type, status
      ),
      attendance ( status ),
      certificates ( certificate_id, generated_status, certificate_url )
    `)
    .eq('user_id', user.id)
    .order('registered_at', { ascending: false });

  throwIf(error, 'Failed to fetch registrations.');

  const registrations = (data || []).map(r => ({
    ...r,
    event: r.events ? normaliseEvent(r.events) : null,
    attendance_status: r.attendance?.[0]?.status || 'ABSENT',
    certificate: r.certificates?.[0] || null,
  }));

  return { success: true, registrations };
}

/* ============================================================
   ATTENDANCE MODULE
   ============================================================ */

/**
 * Get all registrations + attendance for an event.
 * Replaces: GET /modules/attendance/get_attendance.php?event_id=
 */
async function getEventRegs(eventId) {
  const { data, error } = await supabase
    .from('registrations')
    .select(`
      registration_id, registered_at,
      profiles ( id, name, email ),
      attendance ( status, updated_at ),
      responses ( response_text, form_fields ( field_label ) )
    `)
    .eq('event_id', eventId)
    .order('registered_at');

  throwIf(error, 'Failed to fetch registrations.');

  const registrations = (data || []).map(r => ({
    registration_id:   r.registration_id,
    registered_at:     r.registered_at,
    user_id:           r.profiles?.id,
    name:              r.profiles?.name,
    email:             r.profiles?.email,
    attendance_status: r.attendance?.[0]?.status || 'ABSENT',
    updated_at:        r.attendance?.[0]?.updated_at,
    responses:         (r.responses || []).map(resp => ({
      field_label:   resp.form_fields?.field_label,
      response_text: resp.response_text,
    })),
  }));

  return { success: true, registrations };
}

/**
 * Toggle attendance for a single registration.
 * Replaces: POST /modules/attendance/toggle_attendance.php
 */
async function toggleAttendance(registrationId, status) {
  if (!['PRESENT', 'ABSENT'].includes(status)) {
    throw new APIError('Status must be PRESENT or ABSENT.', 400);
  }

  const { error } = await supabase
    .from('attendance')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('registration_id', registrationId);

  throwIf(error, 'Failed to update attendance.');
  return { success: true, message: 'Attendance updated.', status };
}

/**
 * Bulk attendance upload (CSV rows → Edge Function).
 * Replaces: POST /modules/attendance/upload_attendance.php
 * @param {string} eventId
 * @param {Array}  records — [{ email, status }, ...]
 */
async function uploadAttendance(eventId, records) {
  const { data, error } = await supabase.functions.invoke('admin-operations', {
    body: { action: 'uploadAttendance', event_id: eventId, attendance_records: records },
  });
  if (error) throw new APIError(error.message, 500);
  return data;
}

/* ============================================================
   CERTIFICATES MODULE
   ============================================================ */

/**
 * Get certificates for an event.
 * Replaces: GET /modules/certificates/get_certificates.php?event_id=
 */
async function getCertificates(eventId) {
  const { data, error } = await supabase
    .from('certificates')
    .select(`
      certificate_id, certificate_number, verification_token,
      certificate_url, generated_status, email_sent, issued_at,
      registrations!inner (
        event_id,
        profiles ( name, email )
      )
    `)
    .eq('registrations.event_id', eventId);

  throwIf(error, 'Failed to fetch certificates.');
  return { success: true, certificates: data || [] };
}

/**
 * Save certificate template placeholder config.
 * Replaces: POST /modules/certificates/save_placeholders.php
 */
async function savePlaceholders({ event_id, placeholders }) {
  const { error } = await supabase
    .from('events')
    .update({ cert_template_config: placeholders })
    .eq('event_id', event_id);

  throwIf(error, 'Failed to save placeholders.');

  await supabase.rpc('log_admin_action', {
    p_action:    'Saved certificate template config',
    p_target_id: event_id,
  });

  return { success: true, message: 'Placeholders saved.' };
}

/**
 * Get certificate placeholder config for an event.
 * Replaces: GET /modules/certificates/get_placeholders.php
 */
async function getPlaceholders(eventId) {
  const { data, error } = await supabase
    .from('events')
    .select('cert_template_config')
    .eq('event_id', eventId)
    .single();

  throwIf(error, 'Failed to fetch placeholders.');
  return { success: true, placeholders: data?.cert_template_config || {} };
}

/**
 * Generate certificates (client-side Canvas engine).
 * Replaces: POST /modules/certificates/generate_certificate.php
 * Delegates to the CertificateGenerator module.
 */
async function generateCerts(eventId, options = {}) {
  const { CertificateGenerator } = await import('./certificate-generator.js');
  return CertificateGenerator.generateForEvent(eventId, options);
}

/**
 * Send certificate emails (Edge Function).
 * Replaces: POST /modules/certificates/send_certificate.php
 */
async function sendCerts(eventId) {
  const { data, error } = await supabase.functions.invoke('send-certificate-email', {
    body: { event_id: eventId },
  });
  if (error) throw new APIError(error.message, 500);
  return data;
}

/**
 * Queue certificate emails (same as sendCerts in new architecture).
 */
async function queueCertEmails(eventId) {
  return sendCerts(eventId);
}

/* ============================================================
   ADMIN STATS MODULE
   ============================================================ */

/**
 * Get dashboard statistics.
 * Replaces: GET /modules/events/get_events.php?stats=1
 */
async function getStats() {
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  throwIf(error, 'Failed to fetch dashboard stats.');
  return data || { success: false };
}

/** Get recent events (last 5). */
async function getRecentEvents() {
  return getEvents({ limit: 5 });
}

/* ============================================================
   ADMIN MANAGEMENT MODULE
   ============================================================ */

/**
 * Get all admins.
 * Replaces: GET /modules/users/get_admins.php
 */
async function getAdmins() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, created_at, created_by')
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .order('created_at');

  throwIf(error, 'Failed to fetch admins.');
  return {
    success: true,
    admins: (data || []).map(p => ({ admin_id: p.id, ...p })),
  };
}

/**
 * Add a new admin.
 * Replaces: POST /modules/users/add_admin.php
 */
async function addAdmin({ name, email, password, role = 'ADMIN' }) {
  const { data, error } = await supabase.functions.invoke('admin-operations', {
    body: { action: 'addAdmin', name, email, password, role },
  });
  if (error) throw new APIError(error.message, 500);
  if (!data?.success) throw new APIError(data?.error || 'Failed to add admin.', 400);
  return data;
}

/**
 * Remove an admin (downgrade to USER).
 * Replaces: POST /modules/users/remove_admin.php
 */
async function removeAdmin(adminId) {
  const { data, error } = await supabase.functions.invoke('admin-operations', {
    body: { action: 'removeAdmin', admin_id: adminId },
  });
  if (error) throw new APIError(error.message, 500);
  if (!data?.success) throw new APIError(data?.error || 'Failed to remove admin.', 400);
  return data;
}

/* ============================================================
   CERTIFICATE TEMPLATE UPLOAD
   ============================================================ */

/**
 * Upload certificate template image.
 * Replaces: POST /modules/certificates/upload_event_template.php
 */
async function uploadCertTemplate(eventId, file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${eventId}/template.${ext}`;

  const { error } = await supabase.storage
    .from('cert-templates')
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) throw new APIError(`Template upload failed: ${error.message}`, 500);

  await supabase.rpc('log_admin_action', {
    p_action:    'Uploaded certificate template',
    p_target_id: eventId,
    p_details:   { path },
  });

  return { success: true, message: 'Template uploaded.', path };
}

async function saveCertConfig(eventId, placeholders) {
  const { error } = await supabase.from('events').update({
    cert_template_config: placeholders
  }).eq('event_id', eventId);
  if (error) throw new APIError(`Failed to save config: ${error.message}`, 500);
  return { success: true };
}

/* ============================================================
   INTERNAL HELPERS
   ============================================================ */

async function _getProfile(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', userId)
    .single();

  if (profile) {
    return { id: profile.id, name: profile.name, email: profile.email, role: profile.role };
  }

  return {};
}

function _extractEventPayload(source) {
  if (source instanceof FormData) {
    const payload = {};
    for (const [key, value] of source.entries()) {
      if (key !== 'poster') payload[key] = value;
    }
    return payload;
  }
  return source;
}

function _validateEventPayload(p) {
  const required = ['title', 'event_date', 'from_time', 'venue', 'event_category', 'event_type'];
  const missing  = required.filter(k => !p[k]);
  if (missing.length) throw new APIError(`Missing required fields: ${missing.join(', ')}`, 400);
  if (p.title.length < 3)   throw new APIError('Title must be at least 3 characters.', 400);
  if (p.title.length > 150) throw new APIError('Title must not exceed 150 characters.', 400);
}

function _parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/* ============================================================
   PUBLIC API OBJECT (preserves exact same surface as old api.js)
   ============================================================ */
const api = {
  // Auth
  login,
  signup,
  googleLogin,
  logout,
  me,

  // Events
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,

  // Forms
  getFormFields,
  saveFormFields,

  // Registration
  registerForEvent,
  getMyRegs,

  // Attendance
  getEventRegs,
  toggleAttendance,
  uploadAttendance,

  // Certificates
  generateCerts,
  sendCerts,
  getCertificates,
  savePlaceholders,
  getPlaceholders,
  queueCertEmails,
  uploadCertTemplate,
  saveCertConfig,

  // Admin
  getStats,
  getRecentEvents,
  getAdmins,
  addAdmin,
  removeAdmin,
};

export default api;
// Legacy named export — old code may use: import { API_BASE } from './api.js'
export const API_BASE = '';

