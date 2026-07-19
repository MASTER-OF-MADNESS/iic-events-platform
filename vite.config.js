import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  root: '.',
  // CRITICAL: Tells Vite NOT to treat the "public" folder as static assets
  // so that we can process the JS/CSS files inside it.
  publicDir: false,

  resolve: {
    alias: {
      '/js':     fileURLToPath(new URL('./public/js',     import.meta.url)),
      '/css':    fileURLToPath(new URL('./public/css',    import.meta.url)),
      '/images': fileURLToPath(new URL('./public/images', import.meta.url)),
    },
  },
  
  optimizeDeps: {
    include: ['@supabase/supabase-js'],
  },
});
