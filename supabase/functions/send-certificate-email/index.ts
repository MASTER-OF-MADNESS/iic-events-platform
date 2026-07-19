// =============================================================================
// Edge Function: send-certificate-email
// Replaces: modules/certificates/send_certificate.php
// Sends certificate download links (signed URLs) via Resend API
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_NAME         = 'IIC Innovation Cell, VIT Vellore';
const FROM_EMAIL        = 'onboarding@resend.dev';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check — must be admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { event_id } = await req.json();
    if (!event_id) {
      return new Response(JSON.stringify({ error: 'event_id is required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ROLE_KEY);

    // Verify caller is admin
    const callerToken = authHeader.replace('Bearer ', '');
    const { data: { user: callerUser } } = await supabase.auth.getUser(callerToken);
    if (!callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single();

    if (!callerProfile || !['ADMIN', 'SUPER_ADMIN'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Admin access required.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch event
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('event_id, title')
      .eq('event_id', event_id)
      .single();

    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: 'Event not found.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch pending certificates (generated=YES, email_sent=NO or QUEUED)
    const { data: certificates, error: certErr } = await supabase
      .from('certificates')
      .select(`
        certificate_id, certificate_url, registration_id,
        registrations!inner ( user_id, event_id,
          profiles!inner ( name, email )
        )
      `)
      .eq('registrations.event_id', event_id)
      .eq('generated_status', 'YES')
      .in('email_sent', ['NO', 'QUEUED']);

    if (certErr || !certificates || certificates.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No unsent certificates found for this event. Certificates may have already been sent.',
      }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const cert of certificates) {
      const profile = (cert as any).registrations?.profiles;
      const recipientName  = profile?.name  || 'Participant';
      const recipientEmail = profile?.email || '';

      if (!recipientEmail) {
        failCount++;
        errors.push(`Missing email for certificate ${cert.certificate_id}`);
        continue;
      }

      // Generate a 1-hour signed URL for the certificate file
      let downloadUrl = '';
      if (cert.certificate_url) {
        const { data: signedData } = await supabase.storage
          .from('certificates')
          .createSignedUrl(cert.certificate_url.replace('certificates/', ''), 3600);
        downloadUrl = signedData?.signedUrl || '';
      }

      const subject  = `Your Certificate — ${event.title}`;
      const bodyText = buildCertBody(recipientName, event.title, downloadUrl);

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: [recipientEmail],
            subject,
            html: wrapHtml(subject, bodyText, downloadUrl),
          }),
        });

        if (emailRes.ok) {
          // Mark as sent
          await supabase
            .from('certificates')
            .update({ email_sent: 'YES' })
            .eq('certificate_id', cert.certificate_id);

          // Log to email_logs
          await supabase.from('email_logs').insert({
            user_id:    (cert as any).registrations?.user_id,
            event_id,
            email_type: 'CERTIFICATE',
          });

          successCount++;
        } else {
          failCount++;
          errors.push(`Failed to send to ${recipientEmail}`);
        }
      } catch (e) {
        failCount++;
        errors.push(`Error sending to ${recipientEmail}: ${e}`);
      }
    }

    // Log admin action
    await supabase.rpc('log_admin_action', {
      p_action:    `Sent ${successCount} certificate email(s) for event`,
      p_target_id: event_id,
      p_details:   { successCount, failCount, event_title: event.title },
    });

    return new Response(JSON.stringify({
      success:      successCount > 0,
      message:      `Sent ${successCount} certificate(s) via email.`,
      sent_count:   successCount,
      failed_count: failCount,
      total:        certificates.length,
      errors,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[send-certificate-email] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildCertBody(name: string, eventTitle: string, downloadUrl: string): string {
  return `Dear ${name},\n\nCongratulations! Your certificate of participation for "${eventTitle}" is ready.\n\n${downloadUrl ? 'Click the button below to download your certificate.' : 'Your certificate will be available in your dashboard.'}\n\nThank you for participating and we hope to see you at future events!\n\nBest regards,\nIIC Innovation Cell, VIT Vellore`;
}

function wrapHtml(subject: string, body: string, downloadUrl: string): string {
  const htmlBody = body.replace(/\n/g, '<br>');
  const downloadBtn = downloadUrl
    ? `<div style="text-align:center;margin:24px 0;">
        <a href="${downloadUrl}" style="background:#1B005D;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
          Download Certificate
        </a>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f8f9fa;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:#1B005D;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
      <h1 style="color:white;margin:0;font-size:20px;">🎓 Certificate Ready!</h1>
      <p style="color:#a5b4fc;margin:4px 0 0;font-size:13px;">IIC Innovation Cell, VIT Vellore</p>
    </div>
    <div style="background:white;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#1e293b;font-size:15px;line-height:1.7;margin:0;">${htmlBody}</p>
      ${downloadBtn}
      <p style="color:#64748b;font-size:13px;margin-top:16px;">
        <em>This download link is valid for 1 hour. Log in to your account to access your certificate anytime.</em>
      </p>
    </div>
  </div>
</body>
</html>`;
}
