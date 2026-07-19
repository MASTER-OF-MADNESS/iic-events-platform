/* ============================================================
   supabase-client.js — Single Supabase client instance
   Import this everywhere instead of creating new clients.
   ============================================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

// Read from Vite env (VITE_ prefix) or from window (for plain HTML without bundler)
const SUPABASE_URL      = import.meta.env?.VITE_SUPABASE_URL
                       || window.__SUPABASE_URL__
                       || '';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY
                       || window.__SUPABASE_ANON_KEY__
                       || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[supabase-client] Missing SUPABASE_URL or SUPABASE_ANON_KEY.\n' +
    'Copy .env.example → .env and fill in your Supabase project credentials.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session across page reloads using localStorage
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,       // handles OAuth redirect tokens in URL
  },
  global: {
    headers: {
      'x-application-name': 'iic-events-platform',
    },
  },
});

// Expose for non-module scripts (legacy compatibility)
window.__supabase = supabase;

export const SUPABASE_URL_EXPORT = SUPABASE_URL;
export const GOOGLE_CLIENT_ID    = import.meta.env?.VITE_GOOGLE_CLIENT_ID
                                || window.__GOOGLE_CLIENT_ID__
                                || '';
export const ALLOWED_EMAIL_DOMAIN = import.meta.env?.VITE_ALLOWED_EMAIL_DOMAIN
                                  || window.__ALLOWED_EMAIL_DOMAIN__
                                  || 'vitstudent.ac.in';
export const APP_URL              = import.meta.env?.VITE_APP_URL
                                  || window.location.origin;

export default supabase;
