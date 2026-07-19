/* ============================================================
   certificate-generator.js
   Client-side certificate generation engine using Canvas API.

   Replaces: PHP GD library in generate_certificate.php
   Uses: HTML Canvas API + qrcode.js library

   Flow:
   1. Fetch attendees from Supabase (PRESENT status)
   2. Download template image from Supabase Storage
   3. For each attendee:
      a. Draw template on Canvas
      b. Overlay text fields (name, event, reg number)
      c. Render QR code from verification URL
      d. Export Canvas → PNG Blob
      e. Upload to Supabase Storage
      f. Upsert certificate row in DB
   ============================================================ */

import { supabase, APP_URL } from './supabase-client.js';

// ── QR code library (loaded from CDN — lightweight, no build step needed) ─────
const QR_CDN = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';

let _qrLoaded = false;
async function loadQRLib() {
  if (_qrLoaded || typeof window.QRCode !== 'undefined') { _qrLoaded = true; return; }
  await new Promise((resolve, reject) => {
    const s   = document.createElement('script');
    s.src     = QR_CDN;
    s.onload  = () => { _qrLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export const CertificateGenerator = {

  // ==========================================================================
  // PUBLIC: generateForEvent
  // Main entry point — mirrors the PHP generate_certificate.php behaviour
  // ==========================================================================

  async generateForEvent(eventId, options = {}) {
    const progressCb = options.onProgress || (() => {});
    progressCb({ stage: 'init', message: 'Loading dependencies...' });

    try {
      await loadQRLib();

      // 1. Fetch event + placeholder config
      const { data: event, error: evtErr } = await supabase
        .from('events')
        .select('event_id, title, event_date, cert_template_config')
        .eq('event_id', eventId)
        .single();

      if (evtErr || !event) throw new Error('Event not found.');

      const placeholders = event.cert_template_config || {};

      // 2. Fetch PRESENT attendees with form responses
      const { data: attendees, error: attErr } = await supabase
        .from('registrations')
        .select(`
          registration_id,
          users ( user_id, name, email ),
          attendance!inner ( status ),
          responses (
            response_text,
            form_fields ( field_label )
          )
        `)
        .eq('event_id', eventId)
        .eq('attendance.status', 'PRESENT');

      if (attErr) throw new Error('Failed to fetch attendees: ' + attErr.message);
      if (!attendees || attendees.length === 0) {
        return { success: false, error: 'No attendees marked PRESENT for this event.' };
      }

      // 3. Download template image from Supabase Storage
      progressCb({ stage: 'template', message: 'Loading certificate template...' });
      const templateImage = await this._loadTemplateImage(eventId);
      if (!templateImage) {
        return { success: false, error: 'Certificate template not found. Please upload a template first.' };
      }

      // 4. Generate certificates
      const dateStr       = new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-IN', {
        day: '2-digit', month: 'long', year: 'numeric',
      });
      let generatedCount  = 0;
      let errorCount      = 0;
      const errors        = [];

      for (const [i, attendee] of attendees.entries()) {
        const profile  = attendee.users;
        if (!profile) continue;

        progressCb({
          stage:   'generating',
          message: `Generating certificate ${i + 1}/${attendees.length}: ${profile.name}`,
          current: i + 1,
          total:   attendees.length,
        });

        try {
          await this._generateOne({
            eventId,
            eventTitle:  event.title,
            eventDate:   dateStr,
            attendee,
            placeholders,
            templateImage,
          });
          generatedCount++;
        } catch (err) {
          errorCount++;
          errors.push(`${profile.name}: ${err.message}`);
          console.error('[CertGen] Failed for', profile.name, err);
        }
      }

      progressCb({ stage: 'done', message: 'Generation complete.', generatedCount });

      return {
        success:         generatedCount > 0,
        message:         `Generated ${generatedCount} certificate(s) successfully.`,
        generated_count: generatedCount,
        error_count:     errorCount,
        errors,
      };

    } catch (err) {
      console.error('[CertGen] Fatal error:', err);
      return { success: false, error: err.message };
    }
  },

  // ==========================================================================
  // PRIVATE: _loadTemplateImage
  // Downloads template from Supabase Storage → HTMLImageElement
  // ==========================================================================

  async _loadTemplateImage(eventId) {
    const extensions = ['jpg', 'jpeg', 'png', 'webp'];

    for (const ext of extensions) {
      const path = `${eventId}/template.${ext}`;
      const { data } = await supabase.storage
        .from('cert-templates')
        .createSignedUrl(path, 300); // 5-minute signed URL

      if (!data?.signedUrl) continue;

      try {
        const img = await this._loadImage(data.signedUrl);
        return img;
      } catch { /* try next extension */ }
    }

    return null;
  },

  // ==========================================================================
  // PRIVATE: _generateOne
  // Generates and uploads one certificate
  // ==========================================================================

  async _generateOne({ eventId, eventTitle, eventDate, attendee, placeholders, templateImage }) {
    const profile     = attendee.users;
    const registrationId = attendee.registration_id;

    // Extract registration number from form responses
    const regNumber = (attendee.responses || []).find(r =>
      (r.form_fields?.field_label || '').toLowerCase().includes('registration')
    )?.response_text || '';

    // ── Check for existing certificate (regeneration support) ───────────────
    const { data: existing } = await supabase
      .from('certificates')
      .select('certificate_id, certificate_number, verification_token, certificate_url')
      .eq('registration_id', registrationId)
      .single();

    const certNumber    = existing?.certificate_number || this._genCertNumber();
    const verifyToken   = existing?.verification_token || this._genToken(64);
    const verifyUrl     = `${APP_URL}/verify.html?token=${verifyToken}`;

    // ── Draw certificate on Canvas ──────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.width  = templateImage.naturalWidth  || templateImage.width;
    canvas.height = templateImage.naturalHeight || templateImage.height;
    const ctx = canvas.getContext('2d');

    // Draw template background
    ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);

    // ── Overlay text fields ─────────────────────────────────────────────────
    const fieldValues = {
      student_name: profile.name,
      reg_number:   regNumber,
      event_name:   eventTitle,
      event_date:   eventDate,
    };

    for (const [field, value] of Object.entries(fieldValues)) {
      const ph = placeholders[field];
      if (!ph || !value) continue;
      this._drawText(ctx, value, ph);
    }

    // ── Overlay QR code ─────────────────────────────────────────────────────
    const qrPh = placeholders['qr_code'];
    if (qrPh) {
      const qrCanvas = await this._generateQR(verifyUrl, qrPh.width || 120);
      ctx.drawImage(
        qrCanvas,
        qrPh.x - (qrPh.width || 120) / 2,
        qrPh.y - (qrPh.height || 120) / 2,
        qrPh.width  || 120,
        qrPh.height || 120,
      );
    }

    // ── Export to PNG Blob ──────────────────────────────────────────────────
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.92));

    // ── Upload to Supabase Storage ──────────────────────────────────────────
    const fileName = `cert_${this._genToken(8)}.png`;
    const storagePath = `${eventId}/${fileName}`;

    // Remove old file if regenerating
    if (existing?.certificate_url) {
      await supabase.storage.from('certificates').remove([existing.certificate_url]);
    }

    const { error: uploadErr } = await supabase.storage
      .from('certificates')
      .upload(storagePath, blob, { contentType: 'image/png', upsert: false });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    // ── Upsert certificate DB record ────────────────────────────────────────
    const now = new Date().toISOString();
    if (existing) {
      await supabase.from('certificates').update({
        certificate_url:  storagePath,
        generated_status: 'YES',
        issued_at:        now,
      }).eq('certificate_id', existing.certificate_id);
    } else {
      await supabase.from('certificates').insert({
        certificate_number: certNumber,
        verification_token: verifyToken,
        registration_id:    registrationId,
        certificate_url:    storagePath,
        generated_status:   'YES',
        email_sent:         'NO',
        issued_at:          now,
      });
    }
  },

  // ==========================================================================
  // PRIVATE: _drawText
  // Draws one placeholder field on Canvas (matches PHP GD overlay logic)
  // ==========================================================================

  _drawText(ctx, text, ph) {
    const x         = ph.x         || 0;
    const y         = ph.y         || 0;
    const fontSize  = ph.fontSize  || 24;
    const fontColor = ph.fontColor || '#1B005D';
    const alignment = ph.alignment || 'center';
    const fontFamily = ph.fontFamily === 'Poppins-Bold' ? 'bold Poppins' : (ph.fontFamily || 'Poppins');

    ctx.save();
    ctx.font         = `${ph.fontWeight || (fontFamily.startsWith('bold') ? 'bold' : '600')} ${fontSize}px ${fontFamily}, Arial, sans-serif`;
    ctx.fillStyle    = fontColor;
    ctx.textBaseline = 'middle';
    ctx.textAlign    = alignment === 'center' ? 'center' : (alignment === 'right' ? 'right' : 'left');

    ctx.fillText(text, x, y);
    ctx.restore();
  },

  // ==========================================================================
  // PRIVATE: _generateQR
  // Renders a QR code onto an offscreen canvas and returns it
  // ==========================================================================

  async _generateQR(url, size = 120) {
    const qrCanvas = document.createElement('canvas');
    await window.QRCode.toCanvas(qrCanvas, url, {
      width:        size,
      margin:       1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
    return qrCanvas;
  },

  // ==========================================================================
  // PRIVATE: _loadImage
  // Loads an image URL → HTMLImageElement (with CORS)
  // ==========================================================================

  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img   = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src     = url;
    });
  },

  // ==========================================================================
  // PRIVATE: Utility generators
  // ==========================================================================

  _genCertNumber() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `IIC-${date}-${rand}`;
  },

  _genToken(bytes = 32) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').slice(0, bytes);
  },

  // ==========================================================================
  // PUBLIC: previewTemplate
  // Renders template + sample placeholder values for the admin preview UI
  // ==========================================================================

  async previewTemplate(eventId, placeholders, sampleValues = {}) {
    const templateImage = await this._loadTemplateImage(eventId);
    if (!templateImage) throw new Error('Template not found.');

    const canvas = document.createElement('canvas');
    canvas.width  = templateImage.naturalWidth  || templateImage.width;
    canvas.height = templateImage.naturalHeight || templateImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(templateImage, 0, 0);

    const defaults = {
      student_name: sampleValues.student_name || 'John Doe',
      reg_number:   sampleValues.reg_number   || '22BCE1234',
      event_name:   sampleValues.event_name   || 'Innovation Event',
      event_date:   sampleValues.event_date   || '15 September 2026',
    };

    for (const [field, value] of Object.entries(defaults)) {
      const ph = placeholders[field];
      if (ph) this._drawText(ctx, value, ph);
    }

    const qrPh = placeholders['qr_code'];
    if (qrPh) {
      await loadQRLib();
      const qrCanvas = await this._generateQR('https://iic.vit.ac.in/verify', qrPh.width || 120);
      ctx.drawImage(qrCanvas, qrPh.x - (qrPh.width || 120) / 2, qrPh.y - (qrPh.height || 120) / 2, qrPh.width || 120, qrPh.height || 120);
    }

    return canvas;
  },
};

export default CertificateGenerator;
