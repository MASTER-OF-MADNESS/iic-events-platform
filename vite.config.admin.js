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
  publicDir: false,

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
  },

  optimizeDeps: {
    include: ['@supabase/supabase-js'],
  },
});
