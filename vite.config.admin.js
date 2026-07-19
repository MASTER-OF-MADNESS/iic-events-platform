// vite.config.admin.js
// ─────────────────────────────────────────────────────────────
// Build config for Vercel Project 2 — Admin Portal
// Build command : npm run build:admin
// Output dir    : dist-admin/
// Vercel project: iic-admin (or your chosen project name)
// ─────────────────────────────────────────────────────────────

import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  root: 'admin',
  publicDir: '../static',

  resolve: {
    alias: {
      // Admin pages import shared CSS/JS from /public/
      '/js':     fileURLToPath(new URL('./public/js',     import.meta.url)),
      '/css':    fileURLToPath(new URL('./public/css',    import.meta.url)),
      '/images': fileURLToPath(new URL('./public/images', import.meta.url)),
    },
  },

  build: {
    outDir: '../dist-admin',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./admin/index.html', import.meta.url)),
        login: fileURLToPath(new URL('./admin/login.html', import.meta.url)),
        events: fileURLToPath(new URL('./admin/events.html', import.meta.url)),
        eventDetail: fileURLToPath(new URL('./admin/event-detail.html', import.meta.url)),
        participants: fileURLToPath(new URL('./admin/participants.html', import.meta.url)),
        admins: fileURLToPath(new URL('./admin/admins.html', import.meta.url)),
        certificates: fileURLToPath(new URL('./admin/certificates.html', import.meta.url)),
      }
    }
  },

  optimizeDeps: {
    include: ['@supabase/supabase-js'],
  },
});
