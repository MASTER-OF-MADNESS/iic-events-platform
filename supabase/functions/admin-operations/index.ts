// =============================================================================
// Edge Function: admin-operations
// Handles privileged admin operations requiring service role:
//   - addAdmin: Creates Supabase Auth user + sets ADMIN role in profiles
//   - removeAdmin: Downgrades role to USER
//   - uploadAttendanceCsv: Bulk attendance update from CSV data
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ROLE_KEY);

  // Authenticate caller
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const callerToken = authHeader.replace('Bearer ', '');
  const { data: { user: callerUser } } = await supabase.auth.getUser(callerToken);
  if (!callerUser) return json({ error: 'Unauthorized' }, 401);

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', callerUser.id)
    .single();

  const callerRole = callerProfile?.role || 'USER';

  // Parse request
  const body = await req.json();
  const { action } = body;

  switch (action) {
    // ── Add Admin ────────────────────────────────────────────────────────────
    case 'addAdmin': {
      if (callerRole !== 'SUPER_ADMIN') {
        return json({ error: 'Only SUPER_ADMIN can add administrators.' }, 403);
      }

      const { name, email, password, role = 'ADMIN' } = body;

      if (!name || !email) {
        return json({ error: 'Name and email are required.' }, 400);
      }

      const validRoles = ['ADMIN', 'SUPER_ADMIN'];
      const targetRole = validRoles.includes(role) ? role : 'ADMIN';
      // Non-super-admin cannot grant super-admin
      const finalRole = (targetRole === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') ? 'ADMIN' : targetRole;

      // Check if profile already exists with admin role
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, role, email')
        .eq('email', email.toLowerCase())
        .single();

      if (existingProfile && ['ADMIN', 'SUPER_ADMIN'].includes(existingProfile.role)) {
        return json({ error: 'This email is already an admin.' }, 400);
      }

      let authUserId: string;

      if (existingProfile) {
        // Existing user — just upgrade role
        authUserId = existingProfile.id;
        await supabase.from('profiles').update({ role: finalRole }).eq('id', authUserId);
      } else {
        // Create new Supabase Auth user
        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: password || generateTempPassword(),
          email_confirm: true,
          user_metadata: { full_name: name, role: finalRole },
        });

        if (createErr || !newUser.user) {
          console.error('[admin-operations] createUser error:', createErr);
          return json({ error: 'Failed to create user account. ' + (createErr?.message || '') }, 500);
        }

        authUserId = newUser.user.id;

        // Upsert profile
        await supabase.from('profiles').upsert({
          id:   authUserId,
          name,
          email: email.toLowerCase(),
          role: finalRole,
          created_by: callerUser.id,
        });
      }

      // Audit log
      await supabase.rpc('log_admin_action', {
        p_action:    `Added admin: ${email} (${finalRole})`,
        p_target_id: authUserId,
        p_details:   { email, role: finalRole, created_by: callerUser.id },
      });

      return json({
        success: true,
        message: 'Admin added successfully.',
        admin: { id: authUserId, name, email, role: finalRole },
      });
    }

    // ── Remove Admin ─────────────────────────────────────────────────────────
    case 'removeAdmin': {
      if (callerRole !== 'SUPER_ADMIN') {
        return json({ error: 'Only SUPER_ADMIN can remove administrators.' }, 403);
      }

      const { admin_id } = body;
      if (!admin_id) return json({ error: 'admin_id is required.' }, 400);

      // Cannot remove self
      if (admin_id === callerUser.id) {
        return json({ error: 'You cannot remove yourself as admin.' }, 400);
      }

      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', admin_id)
        .single();

      if (!targetProfile) return json({ error: 'Admin not found.' }, 404);

      await supabase.from('profiles').update({ role: 'USER' }).eq('id', admin_id);

      await supabase.rpc('log_admin_action', {
        p_action:    `Removed admin: ${targetProfile.email}`,
        p_target_id: admin_id,
        p_details:   { email: targetProfile.email, previous_role: targetProfile.role },
      });

      return json({ success: true, message: 'Admin removed successfully.' });
    }

    // ── Bulk Attendance Upload ────────────────────────────────────────────────
    case 'uploadAttendance': {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(callerRole)) {
        return json({ error: 'Admin access required.' }, 403);
      }

      const { event_id, attendance_records } = body;
      // attendance_records: [{ email: string, status: 'PRESENT'|'ABSENT' }, ...]
      if (!event_id || !Array.isArray(attendance_records)) {
        return json({ error: 'event_id and attendance_records array are required.' }, 400);
      }

      let updated = 0;
      let notFound = 0;
      const errors: string[] = [];

      for (const record of attendance_records) {
        const email = (record.email || '').toLowerCase().trim();
        const status = record.status === 'PRESENT' ? 'PRESENT' : 'ABSENT';

        if (!email) continue;

        // Find user by email
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();

        if (!profile) { notFound++; errors.push(`User not found: ${email}`); continue; }

        // Find registration for this event
        const { data: reg } = await supabase
          .from('registrations')
          .select('registration_id')
          .eq('user_id', profile.id)
          .eq('event_id', event_id)
          .single();

        if (!reg) { notFound++; errors.push(`Not registered: ${email}`); continue; }

        // Update attendance
        await supabase
          .from('attendance')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('registration_id', reg.registration_id);

        updated++;
      }

      await supabase.rpc('log_admin_action', {
        p_action:    `Bulk attendance upload for event`,
        p_target_id: event_id,
        p_details:   { updated, notFound, total: attendance_records.length },
      });

      return json({ success: true, updated, not_found: notFound, errors });
    }

    default:
      return json({ error: `Unknown action: ${action}` }, 400);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function generateTempPassword(): string {
  return 'Temp@' + Math.random().toString(36).slice(2, 10) + '!';
}
