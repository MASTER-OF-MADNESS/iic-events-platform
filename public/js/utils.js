/* ============================================================
   utils.js — Shared Utilities
   ============================================================ */

/* ── TOAST NOTIFICATIONS ── */
let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

const ICONS = {
  success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00b894" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fdcb6e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0984e3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

export function showToast(message, type = 'info', title = '', duration = 4000) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${escapeHTML(title)}</div>` : ''}
      <div class="toast-msg">${escapeHTML(message)}</div>
    </div>
    <button class="toast-close" aria-label="Close">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;

  toast.querySelector('.toast-close').onclick = () => removeToast(toast);
  container.appendChild(toast);

  if (duration > 0) setTimeout(() => removeToast(toast), duration);
  return toast;
}

function removeToast(toast) {
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
}

/* ── DATE FORMATTING ── */
export function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', ...opts
  });
}

export function formatDateRange(fromStr, toStr) {
  if (!fromStr) return '';
  const fromDate = new Date(fromStr);
  const toDate = toStr ? new Date(toStr) : null;

  const fDay = fromDate.getDate();
  const fMonth = fromDate.toLocaleString('en-IN', { month: 'short' });
  const fYear = fromDate.getFullYear();

  if (!toDate || fromStr === toStr) {
    return `${fDay} ${fMonth} ${fYear}`;
  }

  const tDay = toDate.getDate();
  const tMonth = toDate.toLocaleString('en-IN', { month: 'short' });
  const tYear = toDate.getFullYear();

  if (fYear !== tYear) {
    return `${fDay} ${fMonth} ${fYear} - ${tDay} ${tMonth} ${tYear}`;
  } else if (fMonth !== tMonth) {
    return `${fDay} ${fMonth} - ${tDay} ${tMonth} ${fYear}`;
  } else {
    return `${fDay} - ${tDay} ${fMonth} ${fYear}`;
  }
}

export function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hh = h.padStart(2, '0');
  const mm = (m || '00').padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' at ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── VALIDATORS ── */
export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(pw) {
  return {
    length:  pw.length >= 8,
    upper:   /[A-Z]/.test(pw),
    number:  /\d/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}

export function passwordStrength(pw) {
  const v = validatePassword(pw);
  const score = Object.values(v).filter(Boolean).length;
  if (score <= 1) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}

export function validateRequired(val) {
  return val !== undefined && val !== null && String(val).trim() !== '';
}

/* ── DEBOUNCE ── */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* ── MODAL HELPERS ── */
export function openModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('visible'));
  document.body.style.overflow = 'hidden';
}

export function closeModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;
  overlay.classList.remove('visible');
  overlay.addEventListener('transitionend', () => {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }, { once: true });
}

export function initModalClose(modalId) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(modalId);
  });
  overlay.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(modalId));
  });
}

/* ── SCROLL ANIMATIONS ── */
export function initScrollAnimations() {
  const els = document.querySelectorAll('.animate-on-scroll');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => observer.observe(el));
}

/* ── COUNTER ANIMATION ── */
export function animateCounter(el, target, duration = 1500) {
  let start = 0;
  const step = Math.ceil(target / (duration / 16));
  const timer = setInterval(() => {
    start += step;
    if (start >= target) { start = target; clearInterval(timer); }
    el.textContent = start.toLocaleString('en-IN');
  }, 16);
}

/* ── SKELETON LOADERS ── */
export function showSkeletons(container, count = 6) {
  container.innerHTML = Array(count).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line long"></div>
        <div class="skeleton skeleton-line medium"></div>
        <div class="skeleton skeleton-btn"></div>
      </div>
    </div>`).join('');
}

/* ── EMPTY STATE ── */
export function showEmptyState(container, { title = 'Nothing here', text = '', icon = '', action = '' } = {}) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state__icon">
        ${icon || `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`}
      </div>
      <h3 class="empty-state__title">${title}</h3>
      ${text ? `<p class="empty-state__text">${text}</p>` : ''}
      ${action}
    </div>`;
}

/* ── QUERY STRING HELPERS ── */
export function getParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

export function getSafeRedirect(url, defaultUrl = '/index.html') {
  if (!url || typeof url !== 'string') return defaultUrl;
  // Only allow relative paths (must start with / and not //)
  if (url.startsWith('/') && !url.startsWith('//')) {
    return url;
  }
  return defaultUrl;
}

export function setParams(params) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  });
  history.replaceState(null, '', url.toString());
}

/* ── EVENT CARD BUILDER ── */
export function buildEventCard(event) {
  const id = event.id || event.event_id;
  const rawPoster = event.poster || event.poster_url;
  let poster;
  if (!rawPoster) {
    poster = `https://placehold.co/400x500/1A1A6C/ffffff?text=${encodeURIComponent(event.title || 'IIC Event')}`;
  } else if (rawPoster.startsWith('http') || rawPoster.startsWith('/')) {
    poster = rawPoster;
  } else {
    poster = `/iic_events/${rawPoster}`;
  }
  const dateVal = event.date || event.event_date;
  const toDateVal = event.to_date;
  const category = event.event_category || event.category || 'Event';
  const dateFormatted = formatDateRange(dateVal, toDateVal);
  let timeStr = '';
  if (event.from_time) {
    timeStr = formatTime(event.from_time);
    if (event.to_time) {
      timeStr += ' - ' + formatTime(event.to_time);
    }
  }
  const dateCategoryText = timeStr ? `${dateFormatted} • ${timeStr}` : (dateFormatted || '');
  const isCompleted = (event.status || '').toLowerCase() === 'completed';
  const completedClass = isCompleted ? ' hp-card--completed' : '';

  const priceText = category;

  return `
    <a href="event-detail.html?id=${id}" class="hp-card animate-on-scroll${completedClass}">
      <div class="hp-card__img">
        <img src="${poster}" alt="${event.title || ''}" loading="lazy" />
      </div>
      <div class="hp-card__body">
        <div class="hp-card__date">${dateCategoryText}</div>
        <div class="hp-card__title">${event.title || 'Untitled Event'}</div>
        <div class="hp-card__venue">${event.venue || ''}</div>
        <div class="hp-card__price">${priceText}</div>
      </div>
    </a>`;
}

/* ── MISC HELPERS ── */
export function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

export function truncate(str, len = 80) {
  return str && str.length > len ? str.slice(0, len) + '…' : str;
}

export function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success'));
}

/* ── NAVBAR SCROLL SHADOW ── */
export function initNavbarScroll() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const toggle = () => nav.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
}

/* ── MOBILE HAMBURGER ── */
export function initMobileNav() {
  const burger  = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  if (!burger || !mobileNav) return;
  burger.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('open');
    burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
  });
  // Close on link click
  mobileNav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      burger.classList.remove('open');
    });
  });
}

/* ── HTML ESCAPING FOR XSS MITIGATION ── */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── GLOBAL SEARCH BUTTON ── */
document.addEventListener('DOMContentLoaded', () => {
  const initGlobalSearch = () => {
    if (!document.getElementById('globalSearchOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'globalSearchOverlay';
      overlay.className = 'global-search-overlay hidden';
      overlay.innerHTML = `
        <div class="global-search-modal" id="globalSearchModal">
          <div class="global-search-modal__header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="globalSearchInput" placeholder="Search for events..." autocomplete="off">
            <button id="closeGlobalSearchBtn" class="close-search-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="global-search-modal__results" id="globalSearchResults">
            <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Type to search events...</div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const openBtns = document.querySelectorAll('.navbar__search-btn');
    const overlay = document.getElementById('globalSearchOverlay');
    const closeBtn = document.getElementById('closeGlobalSearchBtn');
    const searchInput = document.getElementById('globalSearchInput');
    const resultsContainer = document.getElementById('globalSearchResults');

    const openSearch = () => {
      overlay.classList.remove('hidden');
      setTimeout(() => searchInput.focus(), 100);
    };

    const closeSearch = () => {
      overlay.classList.add('hidden');
      searchInput.value = '';
      resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Type to search events...</div>';
    };

    openBtns.forEach(btn => btn.addEventListener('click', openSearch));
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });

    let timeoutId;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeoutId);
      const query = e.target.value.trim();
      if (!query) {
        resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Type to search events...</div>';
        return;
      }
      
      resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Searching...</div>';
      
      timeoutId = setTimeout(async () => {
        try {
          const { default: api } = await import('./api.js');
          const res = await api.getEvents({ search: query });
          if (res && res.success) {
            if (res.events.length === 0) {
              resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">No events found.</div>';
              return;
            }
            resultsContainer.innerHTML = res.events.map(ev => {
              return `
              <a href="event-detail.html?id=${ev.id}" class="search-result-item">
                <div class="search-result-item__img" style="background-image: url('${ev.poster ? '' + ev.poster : ''}')"></div>
                <div class="search-result-item__info">
                  <div class="search-result-item__title">${ev.title}</div>
                  <div class="search-result-item__sub">${new Date(ev.date).toLocaleDateString()} &bull; ${ev.venue}</div>
                </div>
              </a>
              `;
            }).join('');
          }
        } catch (err) {
          console.error(err);
          resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--accent-danger); font-size: 13px;">Error loading results.</div>';
        }
      }, 300);
    });
  };

  initGlobalSearch();
});
