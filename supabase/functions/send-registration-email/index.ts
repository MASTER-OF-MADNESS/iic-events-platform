// =============================================================================
// Edge Function: send-registration-email
// Replaces: config/mail_helper.php → sendRegistrationEmail()
// Triggered by: api.js after successful event registration
// Runtime: Deno (Supabase Edge Functions)
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY     = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_NAME          = 'IIC Innovation Cell, VIT Vellore';
const FROM_EMAIL         = 'onboarding@resend.dev'; // Configure in Resend dashboard

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated (JWT from Supabase Auth)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { event_id, user_id } = await req.json();

    if (!event_id || !user_id) {
      return new Response(JSON.stringify({ error: 'event_id and user_id are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role to bypass RLS for email sending
    const supabase = createClient(SUPABASE_URL, SUPABASE_ROLE_KEY);

    // 1. Fetch user profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', user_id)
      .single();

    if (profileErr || !profile) {
      console.error('[send-registration-email] Profile not found:', profileErr);
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch event details
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('title, event_date, to_date, venue, email_template, email_subject')
      .eq('event_id', event_id)
      .single();

    if (eventErr || !event) {
      console.error('[send-registration-email] Event not found:', eventErr);
      return new Response(JSON.stringify({ error: 'Event not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Build email content
    const dateStr = formatEventDate(event.event_date, event.to_date);
    const subject = replacePlaceholders(
      event.email_subject || `Registration Confirmed — ${event.title}`,
      { student_name: profile.name, event_title: event.title, event_date: dateStr, venue: event.venue }
    );
    const bodyText = replacePlaceholders(
      event.email_template || buildDefaultBody(profile.name, event.title, dateStr, event.venue),
      { student_name: profile.name, event_title: event.title, event_date: dateStr, venue: event.venue }
    );

    // 4. Send via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [profile.email],
        subject,
        html: wrapInHtmlTemplate(subject, bodyText),
      }),
    });

    if (!emailRes.ok) {
      const resendError = await emailRes.json();
      console.error('[send-registration-email] Resend error:', resendError);
      // Log failure but don't crash the registration
      return new Response(JSON.stringify({ success: false, error: 'Email delivery failed.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Log to email_logs
    await supabase.from('email_logs').insert({
      user_id,
      event_id,
      email_type: 'REGISTRATION_CONFIRMATION',
    });

    console.log(`[send-registration-email] Sent to ${profile.email} for event ${event.title}`);

    return new Response(JSON.stringify({ success: true, message: 'Email sent.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[send-registration-email] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── Utilities ─────────────────────────────────────────────────────────────────

function replacePlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}

function formatEventDate(from: string, to?: string | null): string {
  const fromDate = new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (to && to !== from) {
    const toDate = new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${fromDate} – ${toDate}`;
  }
  return fromDate;
}

function buildDefaultBody(name: string, title: string, date: string, venue: string): string {
  return `Dear ${name},\n\nYour registration for "${title}" has been confirmed!\n\nEvent Details:\n📅 Date: ${date}\n📍 Venue: ${venue}\n\nPlease make sure to arrive on time. We look forward to seeing you there!\n\nBest regards,\nIIC Innovation Cell, VIT Vellore`;
}

function wrapInHtmlTemplate(subject: string, bodyText: string): string {
  const htmlBody = bodyText.replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f8f9fa;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:#1B005D;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
      <h1 style="color:white;margin:0;font-size:20px;font-weight:600;">IIC Innovation Cell</h1>
      <p style="color:#a5b4fc;margin:4px 0 0;font-size:13px;">VIT Vellore</p>
    </div>
    <div style="background:white;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#1e293b;font-size:15px;line-height:1.7;margin:0;">${htmlBody}</p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
      © VIT Vellore — IIC Innovation Cell<br>
      <a href="https://innovations.vit.ac.in" style="color:#6366f1;">innovations.vit.ac.in</a>
    </p>
  </div>
</body>
</html>`;
}
