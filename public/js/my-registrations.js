/* ============================================================
   my-registrations.js — My Registrations Page with PHP Backend Integration
   ============================================================ */
import api from './api.js';
import { supabase } from './supabase-client.js';
import { updateNavbar, setActiveNavLink, requireAuth } from './auth.js';
import {
  initNavbarScroll, initMobileNav, showToast, formatDate, formatTime
} from './utils.js';

let allRegs = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  initNavbarScroll();
  initMobileNav();
  updateNavbar();
  setActiveNavLink();
  initDropdowns();
  initFilters();
  loadRegistrations();
});

function initDropdowns() {
  document.querySelectorAll('.dropdown').forEach(dd => {
    dd.querySelector('button')?.addEventListener('click', e => {
      e.stopPropagation(); dd.classList.toggle('open');
    });
  });
  document.addEventListener('click', () =>
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open')));
}

function initFilters() {
  document.querySelectorAll('#regFilterPills .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#regFilterPills .pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderRegs();
    });
  });
}

async function loadRegistrations() {
  const list = document.getElementById('regList');
  list.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px;">${Array(3).fill(`
    <div style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:var(--radius-card);padding:16px;display:flex;gap:16px;">
      <div class="skeleton" style="width:100px;height:120px;border-radius:8px;flex-shrink:0;"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:10px;padding-top:4px;">
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line long"></div>
        <div class="skeleton skeleton-line medium"></div>
      </div>
    </div>`).join('')}</div>`;

  try {
    const data = await api.getMyRegs();
    allRegs = data.registrations || data || [];
    renderRegs();
  } catch (err) {
    console.error('Failed to load registrations:', err);
    allRegs = [];
    renderRegs();
    showToast('Could not load registrations.', 'error');
  }
}

function renderRegs() {
  const list  = document.getElementById('regList');
  const count = document.getElementById('regCount');

  const filtered = allRegs.filter(r => {
    const event = r.event || r;
    const status = (event.status || '').toLowerCase();
    if (currentFilter === 'all') return true;
    return status === currentFilter;
  });

  if (count) count.textContent = `${filtered.length} registration${filtered.length !== 1 ? 's' : ''}`;

  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <h3 class="empty-state__title">No registrations found</h3>
        <p class="empty-state__text">${currentFilter === 'all' ? "You haven't registered for any events yet." : `No ${currentFilter} events.`}</p>
        <a href="events.html" class="btn btn-primary">Browse Events</a>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map(reg => buildRegCard(reg)).join('');
}

function buildRegCard(reg) {
  const e = reg.event || reg;
  const status = (e.status || 'upcoming').toLowerCase();
  
  // Resilient attendance status check
  const attended = reg.attended !== undefined 
    ? reg.attended 
    : (reg.attendance_status === 'PRESENT' || reg.attendance === 'PRESENT');
    
  const certData = reg.certificate || {};
  const rawCert  = certData.certificate_url || reg.certificateUrl || reg.cert_url;
  const hasCert  = rawCert && (certData.generated_status === 'YES' || reg.hasCert);
  
  let dateStr = (e.date || e.event_date) ? formatDate(e.date || e.event_date) : '—';
  if (e.from_time) {
    let timeStr = formatTime(e.from_time);
    if (e.to_time) timeStr += ' - ' + formatTime(e.to_time);
    dateStr += ' • ' + timeStr;
  }
  const statusClass = status === 'completed' ? 'badge-success' : status === 'today' ? 'badge-warning' : 'badge-primary';
  const statusLabel = status === 'completed' ? 'Completed' : status === 'today' ? 'Today' : 'Upcoming';

  const rawPoster = e.poster || e.poster_url;
  let posterSrc = rawPoster;
  if (rawPoster) {
    if (rawPoster.startsWith('http') || rawPoster.startsWith('blob:')) {
      posterSrc = rawPoster;
    } else {
      posterSrc = supabase.storage.from('event-posters').getPublicUrl(rawPoster).data?.publicUrl || posterSrc;
    }
  }

  return `
  <div class="my-reg-card">
    <img class="my-reg-card__thumb"
         src="${posterSrc}"
         alt="${e.title || 'Event'}" loading="lazy" />
    <div class="my-reg-card__body">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <div class="my-reg-card__title">${e.title || 'Unknown Event'}</div>
        <span class="badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="my-reg-card__meta">
        <span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${dateStr}
        </span>
        <span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;margin-right:4px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${e.venue || 'IIC Campus'}
        </span>
        ${status === 'completed' && attended !== null && attended !== undefined ? `<span>Attendance: <strong style="color:${attended ? 'var(--accent-success)' : 'var(--accent-danger)'}">${attended ? '✓ Present' : '✗ Absent'}</strong></span>` : ''}
      </div>
      <div class="my-reg-card__actions">
        <a href="event-detail.html?id=${e.id || e.event_id || reg.eventId}" class="btn btn-secondary btn-sm">View Event</a>
        ${hasCert
          ? `<button onclick="downloadCertificate('${rawCert}')" class="btn btn-success btn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download Certificate
            </button>`
          : status === 'completed'
            ? `<span class="badge badge-muted">Certificate Pending</span>`
            : ''
        }
      </div>
    </div>
  </div>`;
}

window.downloadCertificate = async (path) => {
  try {
    const { data, error } = await supabase.storage.from('certificates').createSignedUrl(path, 60);
    if (error || !data?.signedUrl) throw new Error('Failed to generate download link');
    
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = `Certificate_${path.split('/').pop()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    showToast('Failed to download certificate.', 'error');
  }
};
