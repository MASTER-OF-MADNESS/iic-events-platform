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
  },

  optimizeDeps: {
    include: ['@supabase/supabase-js'],
  },
});
