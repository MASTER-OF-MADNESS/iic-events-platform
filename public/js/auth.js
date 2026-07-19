/* ============================================================
   auth.js — Supabase Auth Session Management & Guards
   Replaces: PHP cookie sessions + sessionStorage approach
   ============================================================ */
import { supabase, ALLOWED_EMAIL_DOMAIN } from './supabase-client.js';
import { showToast } from './utils.js';

// ── Session keys (kept for backward compat with any code that reads them) ─────
const TOKEN_KEY = 'iic_token';
const USER_KEY  = 'iic_user';

// ── Cached local user state (updated by onAuthStateChange) ───────────────────
let _currentUser = null;

// =============================================================================
// GETTERS
// =============================================================================

/** Returns the Supabase session access token, or null. */
export function getToken() {
  // Supabase stores token in its own localStorage key; we mirror to iic_token
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem('sb-access-token') || null;
}

/** Returns the cached user object { id, name, email, role } or null. */
export function getUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return _currentUser;
}

export function isLoggedIn() {
  return !!getUser();
}

export function isAdmin() {
  const role = getUser()?.role;
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function isSuperAdmin() {
  return getUser()?.role === 'SUPER_ADMIN';
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

/** Persist user to sessionStorage (mirrors old saveSession behaviour). */
export function saveSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token || 'supabase_session');
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  _currentUser = user;
}

/** Clear all session data. */
export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  _currentUser = null;
}

// =============================================================================
// LOGOUT
// =============================================================================

export async function logout() {
  try {
    await supabase.auth.signOut();
  } catch { /* ignore errors during signout */ }
  clearSession();
  showToast('Logged out successfully', 'success');
  setTimeout(() => {
    window.location.href = '/login.html';
  }, 600);
}

// =============================================================================
// ROUTE GUARDS
// =============================================================================

export function requireAuth(redirectTo = '/login.html') {
  if (!isLoggedIn()) {
    const dest = redirectTo + '?redirect=' + encodeURIComponent(window.location.pathname);
    window.location.href = dest;
    return false;
  }
  return true;
}

export function requireAdmin(redirectTo = '/admin/login.html') {
  if (!isLoggedIn() || !isAdmin()) {
    const dest = redirectTo + '?redirect=' + encodeURIComponent(window.location.pathname);
    window.location.href = dest;
    return false;
  }
  return true;
}

export function redirectIfLoggedIn(to = '/index.html') {
  if (isLoggedIn()) {
    window.location.href = isAdmin() ? '/admin/index.html' : to;
  }
}

// =============================================================================
// SESSION VALIDATION (async, hits Supabase)
// =============================================================================

/**
 * Validates the current session with Supabase and syncs the profile.
 * Replaces: PHP session_check.php + sessionStorage approach.
 */
export async function validateSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      clearSession();
      updateNavbar();
      return false;
    }

    // Fetch full profile
    let profile = null;
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('id', session.user.id)
      .single();

    if (prof) {
      profile = { id: prof.id, name: prof.name, email: prof.email, role: prof.role };
    }

    if (!profile) {
      clearSession();
      updateNavbar();
      return false;
    }

    const user = {
      id:    profile.id,
      name:  profile.name,
      email: profile.email,
      role:  profile.role,
    };

    saveSession(session.access_token, user);
    updateNavbar();
    return true;

  } catch (err) {
    console.warn('[auth] validateSession error (using cached session):', err);
    // Fall back to cached session so offline/slow networks don't break UX
    updateNavbar();
    return isLoggedIn();
  }
}

// =============================================================================
// NAVBAR UPDATE
// =============================================================================

export function updateNavbar() {
  const loginBtn   = document.getElementById('navLoginBtn');
  const userMenu   = document.getElementById('navUserMenu');
  const userAvatar = document.getElementById('navUserAvatar');
  const userName   = document.getElementById('navUserName');
  const userEmail  = document.getElementById('navUserEmail');
  const logoutBtn  = document.getElementById('navLogoutBtn');

  const user = getUser();

  if (user) {
    loginBtn?.classList.add('hidden');
    userMenu?.classList.remove('hidden');
    if (userAvatar) userAvatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
    if (userName)   userName.textContent   = user.name  || 'User';
    if (userEmail)  userEmail.textContent  = user.email || '';
    if (logoutBtn) {
      logoutBtn.style.cursor = 'pointer';
      logoutBtn.onclick = (e) => { e.preventDefault(); logout(); };
    }
  } else {
    loginBtn?.classList.remove('hidden');
    userMenu?.classList.add('hidden');
  }
}

// =============================================================================
// ACTIVE NAV LINK
// =============================================================================

export function setActiveNavLink() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar__nav a, .mobile-nav a').forEach(a => {
    const href = a.getAttribute('href')?.split('/').pop();
    if (href === path) a.classList.add('active');
    else               a.classList.remove('active');
  });
}

// =============================================================================
// SUPABASE REALTIME AUTH STATE LISTENER
// Replaces: polling / page-reload session checks
// =============================================================================

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    // Fetch profile for role info
    let profile = null;
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('id', session.user.id)
      .single();

    if (prof) {
      profile = { id: prof.id, name: prof.name, email: prof.email, role: prof.role };
    }

    if (profile) {
      saveSession(session.access_token, {
        id:    profile.id,
        name:  profile.name,
        email: profile.email,
        role:  profile.role,
      });
      updateNavbar();
    }
  } else if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
    if (event === 'SIGNED_OUT') {
      clearSession();
      updateNavbar();
    } else if (event === 'TOKEN_REFRESHED' && session) {
      // Update stored token with refreshed one
      const user = getUser();
      if (user) saveSession(session.access_token, user);
    }
  } else if (event === 'PASSWORD_RECOVERY') {
    // Redirect to password reset page
    window.location.href = '/login.html?mode=reset';
  }
});

// =============================================================================
// AUTO-VALIDATE ON PAGE LOAD
// =============================================================================

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    validateSession().then(() => {
      setActiveNavLink();
    });
  });
}
