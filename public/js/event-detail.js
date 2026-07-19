/* ============================================================
   event-detail.js — Zomato District Style Event Detail Page
   ============================================================ */
import api, { API_BASE } from './api.js';
import { updateNavbar, setActiveNavLink, isLoggedIn, getUser } from './auth.js';
import {
  initNavbarScroll, initMobileNav, getParam,
  formatDate, formatDateRange, formatTime, showToast, escapeHTML
} from './utils.js';

let eventId  = null;
let eventData = null;
let customFields = [];

document.addEventListener('DOMContentLoaded', () => {
  initNavbarScroll();
  initMobileNav();
  updateNavbar();
  setActiveNavLink();
  initDropdowns();
  initScrollReveal();

  eventId = getParam('id');
  if (!eventId) { window.location.href = 'events.html'; return; }

  loadEvent();
});

/* ── Dropdowns ── */
function initDropdowns() {
  document.querySelectorAll('.dropdown').forEach(dd => {
    dd.querySelector('button')?.addEventListener('click', e => {
      e.stopPropagation(); dd.classList.toggle('open');
    });
  });
  document.addEventListener('click', () =>
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open')));
}

/* ── Scroll Reveal (IntersectionObserver) ── */
function initScrollReveal() {
  const els = document.querySelectorAll('[data-reveal]:not(.revealed)');
  if (!els.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.01, rootMargin: '0px 0px -20px 0px' });

  els.forEach(el => {
    // Immediately reveal elements already in the viewport
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add('revealed');
    } else {
      observer.observe(el);
    }
  });
}

/* ── Load Event Data ── */
async function loadEvent() {
  try {
    const data = await api.getEvent(eventId);
    eventData = data.event || data;
    
    // Also load custom form fields from forms backend
    try {
      const formData = await api.getFormFields(eventId);
      customFields = formData.form?.fields || formData.fields || [];
    } catch {
      customFields = eventData.formFields || [];
    }

    renderEvent(eventData);
  } catch (err) {
    console.error('Failed to load event:', err);
    alert('Event not found or an error occurred.');
    window.location.href = 'events.html';
  }
}

/* ── Render Event ── */
function renderEvent(e) {
  document.title = `${e.title} — IIC Events`;

  // Poster Hero (3-part Zomato layout)
  const heroLeft = document.getElementById('heroImgLeft');
  const heroCenter = document.getElementById('heroImgCenter');
  const heroRight = document.getElementById('heroImgRight');
  const finalPosterUrl = e.poster;

  if (heroLeft) heroLeft.src = finalPosterUrl;
  if (heroCenter) heroCenter.src = finalPosterUrl;
  if (heroRight) heroRight.src = finalPosterUrl;

  // Header: Title + Subtitle
  setText('heroTitle', e.title);
  const dateStr = formatDateRange(e.date || e.event_date, e.to_date);
  const timeStr = `${formatTime(e.from_time)} ${e.to_time ? '– ' + formatTime(e.to_time) : ''}`.trim();
  setText('heroSubtitle', `${dateStr}${timeStr ? ', ' + timeStr : ''}`);

  // About: Description
  const desc = document.getElementById('eventDescription');
  if (desc) desc.innerHTML = e.description
    ? escapeHTML(e.description).replace(/\n/g, '<br>')
    : '<em>Description not available.</em>';

  // Event Details: Category + Fee
  setText('infoCategory', e.event_category || e.category || '—');
  setText('infoFee', e.fee_type === 'PAID' ? `₹${e.fee_amount || 0}` : 'Free');

  // Coordinators
  renderCoordinators(e);

  // Sidebar
  renderSidebar(e, dateStr, timeStr);

  // Registration logic
  renderRegForm(e);

  // Re-trigger scroll reveals for dynamically populated content
  initScrollReveal();
}

/* ── Render Coordinators ── */
function renderCoordinators(e) {
  const teacherList = document.getElementById('teacherCoordinatorsList');
  if (teacherList) {
    if (e.faculty_coordinators && e.faculty_coordinators.length > 0) {
      teacherList.innerHTML = e.faculty_coordinators.map(c =>
        `<li>${escapeHTML(c.name)} – ${escapeHTML(c.position || c.role || c.designation || 'Coordinator')}</li>`
      ).join('');
    } else {
      teacherList.innerHTML = '<li class="ed-coordinator-list__empty">None assigned</li>';
    }
  }

  const studentList = document.getElementById('studentCoordinatorsList');
  if (studentList) {
    if (e.student_coordinators && e.student_coordinators.length > 0) {
      studentList.innerHTML = e.student_coordinators.map(c =>
        `<li>${escapeHTML(c.name)} – ${escapeHTML(c.phone || c.mobile || 'No Mobile')}</li>`
      ).join('');
    } else {
      studentList.innerHTML = '<li class="ed-coordinator-list__empty">None assigned</li>';
    }
  }
}

/* ── Render Sidebar ── */
function renderSidebar(e, dateStr, timeStr) {
  // Clear skeleton loading classes
  const sidebarInner = document.getElementById('sidebarInner');
  if (sidebarInner) {
    sidebarInner.querySelectorAll('.skeleton').forEach(el => {
      el.classList.remove('skeleton');
    });
  }

  // Fee
  const feeText = e.fee_type === 'PAID' ? `₹${e.fee_amount || 0}` : 'Free';
  setText('sidebarPrice', feeText);
  const priceLabel = document.getElementById('sidebarPriceLabel');
  if (priceLabel) priceLabel.textContent = e.fee_type === 'PAID' ? '' : '';

  // CTA button text
  const ctaBtn = document.getElementById('sidebarRegBtn');
  const regModal = document.getElementById('regModal');
  const regModalClose = document.getElementById('regModalClose');

  if (ctaBtn) {
    ctaBtn.textContent = e.fee_type === 'PAID' ? 'Register' : 'Register Now';
    ctaBtn.addEventListener('click', () => {
      if (regModal) {
        regModal.classList.remove('hidden');
        // Small delay to allow display:block to apply before animating opacity
        requestAnimationFrame(() => regModal.classList.add('visible'));
      }
    });
  }

  // Modal close logic
  const closeModal = () => {
    if (regModal) {
      regModal.classList.remove('visible');
      setTimeout(() => regModal.classList.add('hidden'), 300);
    }
  };

  if (regModalClose) {
    regModalClose.addEventListener('click', closeModal);
  }
  if (regModal) {
    regModal.addEventListener('click', (e) => {
      if (e.target === regModal) closeModal();
    });
  }

  // Venue
  setText('sidebarVenue', e.venue || 'IIC Campus');
  setText('sidebarVenueSub', 'VIT Vellore');

  // Date & Time
  setText('sidebarDate', dateStr || '—');
  setText('sidebarTime', timeStr || 'Time TBA');

  // Registration Deadline
  const deadlineCard = document.getElementById('deadlineCard');
  if (deadlineCard) {
    if (e.registration_deadline) {
      deadlineCard.classList.remove('hidden');
      const parts = e.registration_deadline.split('-'); // YYYY-MM-DD
      const d = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
      const formattedDeadline = d.toLocaleDateString('en-US', { 
        day: 'numeric', month: 'short', year: 'numeric'
      });
      setText('sidebarDeadline', formattedDeadline);

      // Disable register button if deadline has passed
      if (new Date() > d) {
        const ctaBtn = document.getElementById('sidebarRegBtn');
        if (ctaBtn) {
          ctaBtn.disabled = true;
          ctaBtn.textContent = 'Registration Closed';
          ctaBtn.style.opacity = '0.5';
          ctaBtn.style.cursor = 'not-allowed';
          ctaBtn.style.pointerEvents = 'none';
        }
      }
    } else {
      deadlineCard.classList.add('hidden');
    }
  }
}

/* ── Registration Form ── */
function renderRegForm(event) {
  const card = document.getElementById('regModal'); 
  const formEl = document.getElementById('regForm');
  const fields = document.getElementById('dynamicFields');
  const feeCard = document.querySelector('.ed-sidebar-card--fee');
  if (!card || !formEl || !fields) return;

  const status = (event.status || '').toLowerCase();

  // Event ended
  if (status === 'completed' || status === 'archived') {
    if (feeCard) {
      feeCard.style.display = 'block';
      feeCard.style.padding = 'var(--space-md) var(--space-lg)';
      feeCard.innerHTML = `
        <div style="text-align:center;color:var(--text-muted);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 8px;display:block;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <h3 style="margin-bottom:4px;font-size:16px;color:var(--text-heading);font-family:'Poppins',sans-serif;">This event has ended</h3>
          <p style="font-size:13px;font-family:'Poppins',sans-serif;margin-bottom:8px;">Thank you to everyone who participated!</p>
        </div>`;
    }
    card.remove();
    return;
  }

  // Max capacity
  if (event.max_capacity != null && event.registrationCount != null) {
    if (event.registrationCount >= event.max_capacity) {
      if (feeCard) {
        feeCard.style.display = 'block';
        feeCard.style.padding = 'var(--space-md) var(--space-lg)';
        feeCard.innerHTML = `
          <div style="text-align:center;color:var(--text-muted);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-warning)" stroke-width="1.5" style="margin:0 auto 8px;display:block;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <h3 style="margin-bottom:4px;font-size:16px;color:var(--text-heading);font-family:'Poppins',sans-serif;">Registration Closed</h3>
            <p style="font-size:13px;font-family:'Poppins',sans-serif;margin-bottom:8px;">Maximum capacity reached.</p>
          </div>`;
      }
      card.remove();
      return;
    }
  }

  // Not logged in
  if (!isLoggedIn()) {
    // Keep form card hidden, just update the main CTA button
    const ctaBtn = document.getElementById('sidebarRegBtn');
    if (ctaBtn) {
      ctaBtn.textContent = 'Login to Register';
      ctaBtn.addEventListener('click', () => {
        window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      });
    }
    return;
  }

  // Check already registered
  checkAlreadyRegistered(event, formEl, fields);
}

async function checkAlreadyRegistered(event, formEl, fields) {
  try {
    const data = await api.getMyRegs();
    const myRegs = data.registrations || data || [];
    const alreadyRegistered = myRegs.some(r => {
      const regEventId = r.event_id || r.eventId || (r.event && (r.event.event_id || r.event.id));
      return regEventId === eventId;
    });

    if (alreadyRegistered) {
      // Show success in the fee card area directly
      const feeCard = document.querySelector('.ed-sidebar-card--fee');
      if (feeCard) {
        feeCard.style.display = 'block';
        feeCard.style.padding = 'var(--space-md) var(--space-lg)';
        feeCard.innerHTML = `
          <div style="text-align:center;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" stroke-width="2" style="margin:0 auto 12px;display:block;">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <h3 style="margin-bottom:4px;color:var(--text-heading);font-size:16px;font-family:'Poppins',sans-serif;font-weight:600;">You're Already Registered!</h3>
            <p style="color:var(--text-muted);margin-bottom:12px;font-size:13px;font-family:'Poppins',sans-serif;">Check your registrations for details.</p>
            <a href="my-registrations.html" class="btn btn-secondary" style="font-size:13px;font-family:'Poppins',sans-serif;width:100%;padding:8px;border:1px solid var(--accent-primary);">View My Registrations</a>
          </div>`;
      }
      // Hide form modal container
      const card = document.getElementById('regModal');
      if (card) card.remove();
      return;
    }
  } catch (err) {
    console.warn('Could not check registration status:', err);
  }

  // Not registered — show the form
  buildRegFormFields(event, formEl, fields);
}

function buildRegFormFields(event, formEl, fields) {
  const user = getUser() || {};
  let defaultHTML = `
    <div class="form-group">
      <label class="form-label" for="rf_name">Full Name</label>
      <input class="form-input" type="text" id="rf_name" value="${user.name || ''}" readonly style="background:var(--bg-section); cursor:default;" />
    </div>
    <div class="form-group">
      <label class="form-label" for="rf_email">Email Address</label>
      <input class="form-input" type="email" id="rf_email" value="${user.email || ''}" readonly style="background:var(--bg-section); cursor:default;" />
    </div>
  `;

  const customHTML = customFields.map(f => {
    const label = escapeHTML(f.field_label || f.label);
    const type = (f.field_type || f.type || 'text').toLowerCase();
    const required = f.is_required === 1 || f.required;
    let placeholder = escapeHTML(f.placeholder || '');
    const fieldName = label.toLowerCase().replace(/\s+/g, '_');

    let patternHtml = '';
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes('phone') || lowerLabel.includes('mobile') || type === 'tel') {
      patternHtml = ` pattern="(?!(.)\\1{9})(?!1234567890)(?!0123456789)(?!0987654321)(?!9876543210)(?!(\\d)\\2(\\d)\\3(\\d)\\4(\\d)\\5(\\d)\\6)(?!(\\d{2})\\7{4})(?!(\\d{3})\\8{2}\\d)(?!(\\d{4})\\9\\d{2})(?!00000|11111|22222|33333|44444|55555|66666|77777|88888|99999)[6-9]\\d{9}" title="Must be a valid 10-digit phone number. Fake/repetitive patterns are not allowed."`;
      if (!placeholder) placeholder = 'e.g. 9876543210';
    } else if (lowerLabel.includes('roll') || (lowerLabel.includes('reg') && lowerLabel.includes('no'))) {
      patternHtml = ` pattern="[0-9]{2}[A-Za-z]{3}[0-9]{4}" title="Must be a valid VIT Roll Number/Reg No (e.g., 22BCE1234)"`;
      if (!placeholder) placeholder = 'e.g. 22BCE1234';
    }

    return `
      <div class="form-group">
        <label class="form-label" for="rf_${f.id || f.field_id || fieldName}">${label}${required ? '<span>*</span>' : ''}</label>
        ${type === 'textarea'
          ? `<textarea class="form-textarea" id="rf_${f.id || f.field_id || fieldName}" name="${f.id || f.field_id || fieldName}" data-label="${label}" placeholder="${placeholder}" ${required ? 'required' : ''}></textarea>`
          : `<input class="form-input" type="${type}" id="rf_${f.id || f.field_id || fieldName}" name="${f.id || f.field_id || fieldName}" data-label="${label}" placeholder="${placeholder}" ${required ? 'required' : ''}${patternHtml} />`
        }
      </div>`;
  }).join('');

  fields.innerHTML = defaultHTML + customHTML;

  const submitBtn = document.getElementById('regSubmitBtn');
  if (submitBtn) {
    submitBtn.style.display = '';
    submitBtn.textContent = eventData.fee_type === 'PAID' ? 'Proceed to Payment' : 'Register';
  }

  // Modal will be shown via the Register Now button click

  if (!formEl.dataset.listenerAttached) {
    formEl.addEventListener('submit', handleRegSubmit);
    formEl.dataset.listenerAttached = 'true';
  }
}

async function handleRegSubmit(e) {
  e.preventDefault();
  
  if (!e.target.checkValidity()) {
    e.target.reportValidity();
    return;
  }

  if (!isLoggedIn()) {
    showToast('Please login to register for events.', 'warning', 'Login Required');
    const currentPath = window.location.pathname + window.location.search;
    setTimeout(() => window.location.href = `login.html?redirect=${encodeURIComponent(currentPath)}`, 1500);
    return;
  }

  const btn = document.getElementById('regSubmitBtn');
  btn.classList.add('btn-loading');
  btn.textContent = '';

  const formData = new FormData(e.target);
  
  const responses = [];
  let manualValid = true;

  formData.forEach((value, key) => {
    const val = value.trim();
    const inputEl = e.target.querySelector(`[name="${key}"]`);
    const label = inputEl ? (inputEl.dataset.label || key) : key;
    const lowerKey = label.toLowerCase();

    // Manual Regex Validation Fallback
    if (lowerKey.includes('phone') || lowerKey.includes('mobile')) {
      const phoneRegex = /^(?!(.)\1{9})(?!1234567890)(?!0123456789)(?!0987654321)(?!9876543210)(?!(\d)\2(\d)\3(\d)\4(\d)\5(\d)\6)(?!(\d{2})\7{4})(?!(\d{3})\8{2}\d)(?!(\d{4})\9\d{2})(?!00000|11111|22222|33333|44444|55555|66666|77777|88888|99999)[6-9]\d{9}$/;
      if (!phoneRegex.test(val)) {
        showToast(`Please enter a valid, real ${label}. Repetitive or sequential patterns are not allowed.`, 'error');
        manualValid = false;
      }
    } else if (lowerKey.includes('roll') || (lowerKey.includes('reg') && lowerKey.includes('no'))) {
      if (!/^[0-9]{2}[A-Za-z]{3}[0-9]{4}$/.test(val)) {
        showToast(`Invalid format for ${label}. Example: 22BCE1234`, 'error');
        manualValid = false;
      }
    }

    responses.push({
      field_id: key,
      response_text: val
    });
  });

  if (!manualValid) {
    btn.classList.remove('btn-loading');
    btn.textContent = eventData.fee_type === 'PAID' ? 'Proceed to Payment' : 'Register';
    return;
  }

  try {
    await api.registerForEvent(eventId, responses);
    
    if (eventData.fee_type === 'PAID') {
      showToast('Redirecting to payment portal...', 'info');
      window.location.href = 'https://events.vit.ac.in/';
      return;
    }

    document.getElementById('regForm').classList.add('hidden');
    document.getElementById('regSuccess').classList.remove('hidden');
    showToast('Successfully registered!', 'success', 'Registration Confirmed');

    // Instantly remove the Register button and replace the sidebar card content
    const feeCard = document.querySelector('.ed-sidebar-card--fee');
    if (feeCard) {
      feeCard.style.display = 'block';
      feeCard.style.padding = 'var(--space-md) var(--space-lg)';
      feeCard.innerHTML = `
        <div style="text-align:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" stroke-width="2" style="margin:0 auto 12px;display:block;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <h3 style="margin-bottom:4px;color:var(--text-heading);font-size:16px;font-family:'Poppins',sans-serif;font-weight:600;">You're Already Registered!</h3>
          <p style="color:var(--text-muted);margin-bottom:12px;font-size:13px;font-family:'Poppins',sans-serif;">Check your registrations for details.</p>
          <a href="my-registrations.html" class="btn btn-secondary" style="font-size:13px;font-family:'Poppins',sans-serif;width:100%;padding:8px;border:1px solid var(--accent-primary);">View My Registrations</a>
        </div>`;
    }

  } catch (err) {
    showToast(err.message || 'Registration failed. Try again.', 'error', 'Error');
    btn.classList.remove('btn-loading');
    btn.textContent = eventData.fee_type === 'PAID' ? 'Proceed to Payment' : 'Register';
  }
}

/* Helpers */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val || '—';
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
