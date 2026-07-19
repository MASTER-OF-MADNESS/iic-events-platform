// vite.config.public.js
// ─────────────────────────────────────────────────────────────
// Build config for Vercel Project 1 — Student Portal (Public)
// Build command : npm run build:public
// Output dir    : dist-public/
// Vercel project: iic-events (or your chosen project name)
// ─────────────────────────────────────────────────────────────

import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  root: 'public',
  publicDir: false,

  resolve: {
    alias: {
      '/js':     fileURLToPath(new URL('./public/js',     import.meta.url)),
      '/css':    fileURLToPath(new URL('./public/css',    import.meta.url)),
      '/images': fileURLToPath(new URL('./public/images', import.meta.url)),
    },
  },

  build: {
    outDir: '../dist-public',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./public/index.html', import.meta.url)),
        login: fileURLToPath(new URL('./public/login.html', import.meta.url)),
        events: fileURLToPath(new URL('./public/events.html', import.meta.url)),
        eventDetail: fileURLToPath(new URL('./public/event-detail.html', import.meta.url)),
        myRegistrations: fileURLToPath(new URL('./public/my-registrations.html', import.meta.url)),
        register: fileURLToPath(new URL('./public/register.html', import.meta.url)),
        verify: fileURLToPath(new URL('./public/verify.html', import.meta.url)),
        '404': fileURLToPath(new URL('./public/404.html', import.meta.url)),
        terms: fileURLToPath(new URL('./public/terms.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./public/privacy.html', import.meta.url)),
      }
    }
  },

  optimizeDeps: {
    include: ['@supabase/supabase-js'],
  },
});
