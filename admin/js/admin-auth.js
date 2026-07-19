/* ============================================================
   admin-auth.js — Admin Route Guard (Supabase version)
   Replaces: PHP session-based admin guard
   ============================================================ */
import { supabase } from '/js/supabase-client.js';
import { showToast, escapeHTML } from '/js/utils.js';

// ── Re-export everything from public auth for convenience ─────────────────────
export {
  getToken, getUser, isLoggedIn, isAdmin, isSuperAdmin,
  saveSession, clearSession, validateSession, updateNavbar,
} from '/js/auth.js';

import { getUser, isLoggedIn, isAdmin, clearSession, validateSession } from '/js/auth.js';

export function requireAdmin() {
  if (!isAdmin()) {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `/login.html?redirect=${encodeURIComponent(currentPath)}`;
    return false;
  }
  return true;
}

// =============================================================================
// ADMIN ROUTE ENFORCEMENT
// Runs immediately on import (same behaviour as old admin-auth.js)
// =============================================================================

async function enforceAdminAccess() {
  // Quick sync check first (from cache)
  if (isLoggedIn() && isAdmin()) {
    initAdminUI();
    return;
  }

  // Async validation with Supabase
  const valid = await validateSession();
  if (!valid || !isAdmin()) {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `/login.html?redirect=${encodeURIComponent(currentPath)}`;
    return;
  }

  initAdminUI();
}

export async function logout() {
  try { await supabase.auth.signOut(); } catch { /* ignore */ }
  clearSession();
  showToast('Logged out successfully', 'success');
  setTimeout(() => { window.location.href = '/login.html'; }, 600);
}

// =============================================================================
// INIT ADMIN UI (populate profile elements + wire up controls)
// =============================================================================

function initAdminUI() {
  const init = () => {
    const user = getUser();
    if (user) {
      // Avatar initials
      const avatarEl = document.getElementById('adminAvatar');
      if (avatarEl) avatarEl.textContent = (user.name || 'A').charAt(0).toUpperCase();

      // Profile dropdown info
      const nameEl  = document.getElementById('adminProfileName');
      const emailEl = document.getElementById('adminProfileEmail');
      if (nameEl)  nameEl.textContent  = user.name  || 'Administrator';
      if (emailEl) emailEl.textContent = (user.email || '').toLowerCase();

      // Role display
      const displayRole = (user.role || 'ADMIN')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, l => l.toUpperCase());

      const roleUIEl      = document.getElementById('adminProfileRoleUI');
      const dropdownRoleEl = document.getElementById('dropdownRole');
      if (roleUIEl)      roleUIEl.textContent      = displayRole;
      if (dropdownRoleEl) dropdownRoleEl.textContent = displayRole;

      // Hide Admins nav link for regular ADMIN (only SUPER_ADMIN sees it)
      if (user.role !== 'SUPER_ADMIN') {
        document.querySelectorAll('a[href="admins.html"]').forEach(el => {
          el.style.display = 'none';
        });
      }
    }

    // ── Profile Dropdown Toggle ────────────────────────────────────────────
    const profileMenuBtn  = document.getElementById('profileMenuBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    if (profileMenuBtn && profileDropdown) {
      profileMenuBtn.addEventListener('click', e => {
        e.stopPropagation();
        profileDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', e => {
        if (!profileDropdown.classList.contains('hidden') && !profileDropdown.contains(e.target)) {
          profileDropdown.classList.add('hidden');
        }
      });
    }

    // ── Logout Buttons ────────────────────────────────────────────────────
    document.querySelectorAll('.logout-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.preventDefault(); logout(); });
    });

    // ── Global Search Modal ───────────────────────────────────────────────
    initGlobalSearch();

    // ── Mobile Sidebar Toggle ─────────────────────────────────────────────
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar       = document.getElementById('adminSidebar');

    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', e => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
      });
      document.addEventListener('click', e => {
        if (sidebar.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            e.target !== sidebarToggle) {
          sidebar.classList.remove('open');
        }
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

// =============================================================================
// GLOBAL SEARCH MODAL
// =============================================================================

function initGlobalSearch() {
  if (document.getElementById('globalSearchOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id        = 'globalSearchOverlay';
  overlay.className = 'global-search-overlay hidden';
  overlay.innerHTML = `
    <div class="global-search-modal" id="globalSearchModal">
      <div class="global-search-modal__header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="globalSearchInput" placeholder="Search for events..." autocomplete="off">
        <button id="closeGlobalSearchBtn" class="close-search-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="global-search-modal__results" id="globalSearchResults">
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Type to search events...</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const openBtn        = document.getElementById('openGlobalSearchBtn');
  const closeBtn       = document.getElementById('closeGlobalSearchBtn');
  const searchInput    = document.getElementById('globalSearchInput');
  const resultsContainer = document.getElementById('globalSearchResults');

  const openSearch = () => {
    overlay.classList.remove('hidden');
    setTimeout(() => searchInput.focus(), 100);
  };
  const closeSearch = () => {
    overlay.classList.add('hidden');
    searchInput.value = '';
    resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Type to search events...</div>';
  };

  if (openBtn) openBtn.addEventListener('click', openSearch);
  closeBtn?.addEventListener('click', closeSearch);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSearch(); });

  let timeoutId;
  searchInput.addEventListener('input', e => {
    clearTimeout(timeoutId);
    const query = e.target.value.trim();
    if (!query) {
      resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Type to search events...</div>';
      return;
    }
    resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Searching...</div>';

    timeoutId = setTimeout(async () => {
      try {
        const { default: api } = await import('/js/api.js');
        const res = await api.getEvents({ search: query });
        if (!res?.success || res.events.length === 0) {
          resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">No events found.</div>';
          return;
        }
        const currentPath = window.location.pathname;
        resultsContainer.innerHTML = res.events.map(ev => {
          let href = `event-detail.html?id=${ev.id}`;
          if (currentPath.includes('participants.html')) {
            href = `javascript:void(0);`;
          } else if (currentPath.includes('certificates.html')) {
            href = `javascript:void(0);`;
          }
          return `
          <a href="${href}" class="search-result-item" onclick="document.getElementById('globalSearchOverlay').classList.add('hidden')">
            <div class="search-result-item__img" style="background-image:url('${ev.poster || ''}')"></div>
            <div class="search-result-item__info">
              <div class="search-result-item__title">${escapeHTML(ev.title)}</div>
              <div class="search-result-item__sub">${new Date(ev.date).toLocaleDateString()} &bull; ${escapeHTML(ev.venue)}</div>
            </div>
          </a>`;
        }).join('');
      } catch {
        resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--accent-danger);font-size:13px;">Error loading results.</div>';
      }
    }, 300);
  });
}

// ── Run enforcement immediately ───────────────────────────────────────────────
enforceAdminAccess();
