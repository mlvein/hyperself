import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  // pdf.js v4 uses top-level await: needs es2022+ everywhere, not just build.
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
  optimizeDeps: {
    esbuildOptions: { target: 'es2022' },
  },
});
