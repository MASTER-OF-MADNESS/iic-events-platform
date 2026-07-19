/* ============================================================
   login.js — Login Page (Supabase Auth)
   Supports: Google OAuth + Email/Password login
   Replaces: PHP google_login.php + login.php calls
   ============================================================ */
import api from './api.js';
import { supabase, GOOGLE_CLIENT_ID, ALLOWED_EMAIL_DOMAIN } from './supabase-client.js';
import { saveSession, redirectIfLoggedIn, validateSession } from './auth.js';
import { showToast, getParam, getSafeRedirect } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Handle OAuth redirect callback (Google login returns here)
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await validateSession();
    const redirect = getParam('redirect');
    window.location.href = getSafeRedirect(redirect, 'index.html');
    return;
  }

  // If already logged in, redirect away
  redirectIfLoggedIn();

  // ── Email/Password form ──────────────────────────────────────────────────
  initEmailPasswordForm();

  // ── Google Sign-In button ────────────────────────────────────────────────
  initGoogleSignIn();

  // ── Password reset mode ──────────────────────────────────────────────────
  if (getParam('mode') === 'reset') {
    initPasswordReset();
  }

  // ── Tab switching (if login.html has tabs) ───────────────────────────────
  initTabSwitching();
});

// =============================================================================
// EMAIL / PASSWORD LOGIN
// =============================================================================

function initEmailPasswordForm() {
  const loginForm = document.getElementById('loginForm');
  if (!loginForm) return;

  const emailEl   = document.getElementById('loginEmail');
  const passwordEl = document.getElementById('loginPassword');
  const btn       = document.getElementById('loginBtn');
  const formErr   = document.getElementById('formError');
  const formErrTxt = document.getElementById('formErrorText');

  // Show/hide password toggle
  document.getElementById('toggleLoginPw')?.addEventListener('click', () => {
    passwordEl.type = passwordEl.type === 'text' ? 'password' : 'text';
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (formErr) formErr.classList.add('hidden');

    const email    = emailEl?.value.trim() || '';
    const password = passwordEl?.value     || '';

    if (!email || !password) {
      showFormError(formErr, formErrTxt, 'Email and password are required.');
      return;
    }

    setLoading(btn, true, 'Signing in...');

    try {
      const res = await api.login({ email, password });
      saveSession(res.user?.id || 'session', res.user);
      showToast('Welcome back!', 'success');

      const redirect = getParam('redirect');
      setTimeout(() => {
        // Redirect admins to admin dashboard
        if (res.role === 'ADMIN' || res.role === 'SUPER_ADMIN') {
          window.location.href = getSafeRedirect(redirect, '/admin/index.html');
        } else {
          window.location.href = getSafeRedirect(redirect, '/index.html');
        }
      }, 600);

    } catch (err) {
      showFormError(formErr, formErrTxt, err.message || 'Invalid email or password.');
      setLoading(btn, false, 'Sign In');
    }
  });
}

// =============================================================================
// GOOGLE OAUTH
// Uses Supabase signInWithOAuth — redirects to Google, returns to this page
// =============================================================================

function initGoogleSignIn() {
  // Method 1: Supabase OAuth button (renders our own button)
  const googleBtn = document.getElementById('googleSignInBtn');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      googleBtn.disabled = true;
      googleBtn.textContent = 'Redirecting...';
      try {
        await api.googleLogin();
        // Page will redirect — no further action needed
      } catch (err) {
        showToast(err.message || 'Google sign-in failed.', 'error');
        googleBtn.disabled = false;
        googleBtn.textContent = 'Continue with Google';
      }
    });
    return;
  }

  // Method 2: Google Identity Services library (rendered button)
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('YOUR_')) {
    console.warn('[login] VITE_GOOGLE_CLIENT_ID not configured.');
    return;
  }
  waitForGoogleLib();
}

function waitForGoogleLib(retries = 30) {
  if (typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.initialize({
      client_id:   GOOGLE_CLIENT_ID,
      callback:    handleGoogleCallback,
      auto_select: false,
    });
    const container = document.querySelector('.g_id_signin');
    if (container) {
      google.accounts.id.renderButton(container, {
        type: 'standard', shape: 'pill', theme: 'outline',
        text: 'signin_with', size: 'large', logo_alignment: 'left',
        width: Math.min(320, (container.offsetWidth || 320) - 32),
      });
    }
  } else if (retries > 0) {
    setTimeout(() => waitForGoogleLib(retries - 1), 200);
  }
}

/**
 * Google Identity Services callback (for rendered button only).
 * With Supabase OAuth this is not used — kept for compatibility
 * in case the HTML uses the old Google button.
 */
window.handleGoogleSignIn = async function(response) {
  const loading      = document.getElementById('authLoading');
  const btnContainer = document.getElementById('googleBtnContainer');
  const formErr      = document.getElementById('formError');
  const formErrTxt   = document.getElementById('formErrorText');

  if (formErr) formErr.classList.add('hidden');
  if (loading) loading.classList.add('active');
  if (btnContainer) btnContainer.style.display = 'none';

  try {
    // Exchange Google credential via Supabase (uses signInWithIdToken)
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider:   'google',
      token:      response.credential,
    });

    if (error) throw new Error(error.message);

    // Fetch profile
    let profile = null;
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('id', data.user.id)
      .single();

    if (prof) {
      profile = { id: prof.id, name: prof.name, email: prof.email, role: prof.role };
    }

    if (!profile) throw new Error('Failed to load profile. Please try again.');

    // Enforce email domain restriction
    if (!profile.email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      await supabase.auth.signOut();
      throw new Error(`Only @${ALLOWED_EMAIL_DOMAIN} accounts are allowed.`);
    }

    saveSession(data.session.access_token, {
      id: profile.id, name: profile.name, email: profile.email, role: profile.role,
    });

    showToast('Welcome!', 'success');
    const redirect = getParam('redirect');
    setTimeout(() => {
      window.location.href = getSafeRedirect(redirect, profile.role !== 'USER' ? '/admin/index.html' : '/index.html');
    }, 600);

  } catch (err) {
    if (loading) loading.classList.remove('active');
    if (btnContainer) btnContainer.style.display = '';
    showFormError(formErr, formErrTxt, err.message || 'Google sign-in failed. Please try again.');
  }
};

// Alias for old code compatibility
window.handleGoogleCallback = window.handleGoogleSignIn;

// =============================================================================
// PASSWORD RESET
// =============================================================================

function initPasswordReset() {
  const resetForm = document.getElementById('resetPasswordForm');
  if (!resetForm) return;

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPw = document.getElementById('newPassword')?.value || '';
    const btn   = document.getElementById('resetBtn');
    setLoading(btn, true, 'Updating...');

    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw new Error(error.message);
      showToast('Password updated successfully!', 'success');
      setTimeout(() => { window.location.href = '/login.html'; }, 1500);
    } catch (err) {
      showToast(err.message || 'Password reset failed.', 'error');
      setLoading(btn, false, 'Update Password');
    }
  });
}

// Forgot password form
const forgotForm = document.getElementById('forgotPasswordForm');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgotEmail')?.value.trim();
    const btn   = document.getElementById('forgotBtn');
    setLoading(btn, true, 'Sending...');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login.html?mode=reset`,
      });
      if (error) throw new Error(error.message);
      showToast('Password reset email sent! Check your inbox.', 'success');
      setLoading(btn, false, 'Send Reset Email');
    } catch (err) {
      showToast(err.message || 'Failed to send reset email.', 'error');
      setLoading(btn, false, 'Send Reset Email');
    }
  });
}

// =============================================================================
// TAB SWITCHING (login / register tabs in same page)
// =============================================================================

function initTabSwitching() {
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('[data-tab-content]').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.querySelector(`[data-tab-content="${target}"]`)?.classList.remove('hidden');
    });
  });
}

// =============================================================================
// HELPERS
// =============================================================================

function showFormError(formErr, formErrTxt, message) {
  if (formErr) formErr.classList.remove('hidden');
  if (formErrTxt) formErrTxt.textContent = message;
}

function setLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) btn.classList.add('btn-loading');
  else         btn.classList.remove('btn-loading');
  if (label)   btn.textContent = label;
}
