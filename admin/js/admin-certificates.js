import api from '/js/api.js';
import { supabase } from '/js/supabase-client.js';
import { showToast, formatDate, capitalize, escapeHTML } from '/js/utils.js';
import { requireAdmin } from './admin-auth.js';

let events = [];
let presentStudents = [];

// DOM Elements
const els = {
  genEventSelect: document.getElementById('genEventSelect'),
  eventConfigSection: document.getElementById('eventConfigSection')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  if (!requireAdmin()) return;
  
  // Event listeners
  els.genEventSelect.addEventListener('change', handleEventSelection);
  
  // Back Button
  document.getElementById('backToEventsBtn')?.addEventListener('click', showEventsList);
  
  // Main action buttons (below the present students table header)
  document.getElementById('btnGenerateMain')?.addEventListener('click', handleGenerateCerts);
  document.getElementById('btnSendEmailsMain')?.addEventListener('click', handleQueueEmail);
  document.getElementById('btnDownloadZipMain')?.addEventListener('click', handleDownloadZip);
  
  await loadEvents();
}

// ==========================================
// EVENT LOGIC & DATA
// ==========================================

async function loadEvents() {
  try {
    const res = await api.getEvents();
    const fetchedEvents = res.events || res || [];
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Completed events: status is completed or archived OR event date is in the past
    events = fetchedEvents.filter(e => {
      const status = (e.status || '').toLowerCase();
      if (status === 'completed' || status === 'archived') {
        return true;
      }
      const eventDate = new Date(e.date || e.event_date);
      return eventDate < now;
    });

    // Populate hidden select so its value can be set
    els.genEventSelect.innerHTML = events.map(e => `<option value="${e.id || e.event_id}">${e.title}</option>`).join('');

    renderEventsTable();
  } catch (err) {
    showToast(err.message || 'Failed to load events', 'error');
  }
}

function renderEventsTable() {
  const tbody = document.getElementById('eventsListBody');
  if (!tbody) return;

  if (events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:48px;color:#64748B;font-size:13px;">No completed events found.</td></tr>';
    return;
  }

  tbody.innerHTML = events.map(e => {
    const type = (e.type || e.event_type || 'internal').toLowerCase();
    const typeClass = type === 'internal' ? 'badge-primary' : 'badge-warning';

    return `
      <tr>
        <td style="font-weight:600;color:var(--text-heading);text-align: center;">${escapeHTML(e.title)}</td>
        <td style="text-align: center;">${formatDate(e.date || e.event_date)}</td>
        <td style="text-align: center;">${escapeHTML(e.venue || '—')}</td>
        <td style="text-align: center;"><span class="badge ${typeClass}">${capitalize(type)}</span></td>
        <td style="font-weight:700;text-align: center;">${e.registrationCount || 0}</td>
        <td style="text-align: center;">
          <button class="btn btn-primary btn-sm" onclick="viewEventCertificates('${e.id || e.event_id}')" style="margin: 0 auto;">
            Send Certificates
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.viewEventCertificates = async (eventId) => {
  const ev = events.find(e => (e.id || e.event_id) == eventId);
  if (!ev) return;

  // Set hidden select value
  els.genEventSelect.value = eventId;

  // UI transition
  document.getElementById('eventsView').style.display = 'none';
  document.getElementById('participantsView').style.display = 'block';
  document.getElementById('currentEventTitle').textContent = ev.title;

  // Load config & template
  await handleEventSelection();

  // Load present students details
  await loadPresentStudents(eventId);
};

function showEventsList() {
  document.getElementById('participantsView').style.display = 'none';
  document.getElementById('eventsView').style.display = 'block';
  els.genEventSelect.value = '';
  loadEvents();
}

async function loadPresentStudents(eventId) {
  const tbody = document.getElementById('presentStudentsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">Loading student records...</td></tr>';

  try {
    // 1. Get all registrations for this event
    const regsRes = await api.getEventRegs(eventId);
    const regs = regsRes.attendance || regsRes.registrations || [];

    // Filter to keep only PRESENT ones
    presentStudents = regs.filter(r => r.attendance_status === 'PRESENT' || r.status === 'PRESENT');

    // Certificates data is already included in the attendance response via get_attendance.php
    // (fields: certificate_generated, email_sent, certificate_url)


    renderPresentStudentsTable();
  } catch (err) {
    console.error('Failed to load present students:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--accent-danger);">Failed to load student records.</td></tr>';
  }
}

function renderPresentStudentsTable() {
  const tbody = document.getElementById('presentStudentsTableBody');
  if (!tbody) return;

  if (presentStudents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No present students found for this event.</td></tr>';
    return;
  }

  tbody.innerHTML = presentStudents.map(s => {
    const isGenerated = s.certificate_generated === 'YES';
    const genBadge = isGenerated 
      ? '<span class="badge badge-success">Generated</span>' 
      : '<span class="badge badge-danger">Not Generated</span>';

    let emailBadge = '<span class="badge badge-danger">Not Sent</span>';
    if (s.email_sent === 'YES') {
      emailBadge = '<span class="badge badge-success">Sent</span>';
    } else if (s.email_sent === 'QUEUED') {
      emailBadge = '<span class="badge badge-primary">Queued</span>';
    }

    const actions = s.certificate_url
        ? `<div style="display:flex;gap:8px;justify-content:center;">
             <button onclick="viewCertificate('${s.certificate_url}')" class="btn btn-secondary btn-sm" style="padding: 4px 10px;">View</button>
           </div>`
        : `<span style="color:var(--text-muted); font-size:12px;">Generate first</span>`;

    return `
      <tr>
        <td style="font-weight:600;color:var(--text-heading);text-align: center;">${escapeHTML(s.participant_name || s.name)}</td>
        <td style="text-align: center;">${escapeHTML(s.participant_email || s.email)}</td>
        <td style="text-align: center;"><span class="badge badge-success" style="margin: 0 auto;">Present</span></td>
        <td style="text-align: center;">${genBadge}</td>
        <td style="text-align: center;">${emailBadge}</td>
        <td style="text-align: center;">${actions}</td>
      </tr>
    `;
  }).join('');
}

window.viewCertificate = async function(path) {
  try {
    const { data, error } = await supabase.storage.from('certificates').createSignedUrl(path, 3600);
    if (error) throw error;
    if (data && data.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  } catch (err) {
    showToast('Could not open certificate. ' + err.message, 'error');
  }
};

async function handleEventSelection() {
  const eventId = els.genEventSelect.value;
  if (!eventId) return;
  
  els.eventConfigSection.style.display = 'block';
  
  const previewEl = document.getElementById('certTemplatePreview');
  const statusEl = document.getElementById('certTemplateStatus');
  const msgEl = document.getElementById('certTemplateMsg');
  
  try {
    const cacheBust = '?t=' + Date.now();
    const getPublicUrl = (path) => supabase.storage.from('cert-templates').getPublicUrl(path).data.publicUrl;
    
    const urlsToTry = [
      getPublicUrl(`${eventId}/template.png`),
      getPublicUrl(`${eventId}/template.jpg`),
      getPublicUrl(`${eventId}/template.jpeg`)
    ];
    let urlIndex = 0;
    
    // Check if template exists by trying to load the image
    const img = new Image();
    img.onload = () => {
      // Template exists — show thumbnail preview
      if (previewEl) {
        previewEl.innerHTML = `<img src="${img.src}" alt="Certificate Template" style="width:100%; height:100%; object-fit:cover;" />`;
      }
      if (statusEl) {
        statusEl.textContent = '✓ Certificate Template Ready';
        statusEl.style.color = '#059669';
      }
      if (msgEl) {
        msgEl.textContent = 'Template has been uploaded and configured via Event Details → Certificates tab.';
      }
      
      const btnGen = document.getElementById('btnGenerateMain');
      const btnEmail = document.getElementById('btnSendEmailsMain');
      const btnZip = document.getElementById('btnDownloadZipMain');
      if (btnGen) btnGen.disabled = false;
      if (btnEmail) btnEmail.disabled = false;
      if (btnZip) btnZip.disabled = false;
    };
    img.onerror = () => {
      urlIndex++;
      if (urlIndex < urlsToTry.length) {
        // Try the next URL
        img.src = urlsToTry[urlIndex] + cacheBust;
      } else {
        // All URLs failed, template not uploaded yet
        if (previewEl) {
          previewEl.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
        }
        if (statusEl) {
          statusEl.textContent = '⚠ No Template Uploaded';
          statusEl.style.color = '#dc2626';
        }
        if (msgEl) {
          msgEl.innerHTML = 'Upload and configure a certificate template first via <strong>Manage Events → Event Details → Certificates</strong> tab.';
        }
        
        const btnGen = document.getElementById('btnGenerateMain');
        const btnEmail = document.getElementById('btnSendEmailsMain');
        const btnZip = document.getElementById('btnDownloadZipMain');
        if (btnGen) btnGen.disabled = true;
        if (btnEmail) btnEmail.disabled = true;
        if (btnZip) btnZip.disabled = true;
      }
    };
    img.src = urlsToTry[0] + cacheBust;
  } catch (err) {
    console.error("Error loading event config:", err);
  }
}

// ==========================================
// GENERATION & DISPATCH
// ==========================================

async function handleGenerateCerts() {
  const eventId = els.genEventSelect.value;
  if (!eventId) return;
  
  const btn = document.getElementById('btnGenerateMain');
  
  if (!confirm('Generate certificates for all PRESENT attendees? This may take a minute.')) return;
  
  try {
    if (btn) {
      btn.textContent = 'Generating...';
      btn.disabled = true;
    }
    
    const res = await api.generateCerts(eventId);
    showToast(res.message || `Generated ${res.generated_count} certificates.`, 'success');
    
    // Reload student list to update table statuses
    await loadPresentStudents(eventId);
  } catch (err) {
    showToast(err.message || 'Generation failed.', 'error');
  } finally {
    if (btn) {
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg> Generate Certificates`;
      btn.disabled = false;
    }
  }
}

async function handleQueueEmail() {
  const eventId = els.genEventSelect.value;
  if (!eventId) return;
  
  const btn = document.getElementById('btnSendEmailsMain');
  
  if (!confirm('Queue emails to all students whose certificates have been generated?')) return;
  
  try {
    if (btn) {
      btn.textContent = 'Queuing...';
      btn.disabled = true;
    }
    
    const res = await api.queueCertEmails(eventId);
    showToast(res.message || 'Emails queued successfully.', 'success');
    
    // Reload student list to update table statuses
    await loadPresentStudents(eventId);
  } catch (err) {
    showToast(err.message || 'Failed to queue emails.', 'error');
  } finally {
    if (btn) {
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Email`;
      btn.disabled = false;
    }
  }
}

async function handleDownloadZip() {
  const eventId = els.genEventSelect.value;
  if (!eventId) return;
  
  const btnZip = document.getElementById('btnDownloadZipMain');
  if (btnZip) {
    btnZip.textContent = 'Downloading...';
    btnZip.disabled = true;
  }
  
  try {
    const res = await api.getCertificates(eventId);
    const certs = res.certificates || [];
    
    if (certs.length === 0) {
      showToast('No certificates found for this event.', 'warning');
      return;
    }
    
    let downloaded = 0;
    for (const cert of certs) {
      if (cert.certificate_url) {
        const { data, error } = await supabase.storage.from('certificates').createSignedUrl(cert.certificate_url, 3600);
        if (error || !data?.signedUrl) continue;
        
        const link = document.createElement('a');
        link.href = data.signedUrl;
        link.download = cert.certificate_url.split('/').pop();
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        downloaded++;
        await new Promise(r => setTimeout(r, 300));
      }
    }
    showToast(`${downloaded} certificate(s) downloaded successfully!`, 'success');
  } catch (err) {
    showToast('Failed to download certificates.', 'error');
  } finally {
    if (btnZip) {
      btnZip.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download All (ZIP)`;
      btnZip.disabled = false;
    }
  }
}
