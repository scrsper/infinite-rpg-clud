import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Babylon.js browser client. Separate from the legacy Three.js client (root vite.config.ts):
 * its own entry, its own output (`dist-web`), and it may import only browser-safe modules. That
 * boundary is enforced by tests/web-boundary.test.ts against the real bundle graph.
 */
export default defineConfig({
  root: resolve(__dirname, 'web'),
  base: './',
  publicDir: resolve(__dirname, 'web/public'),
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
    sourcemap: true,
    rollupOptions: { output: { manualChunks: { babylon: ['@babylonjs/core'] } } },
  },
  server: { port: 5180, host: '127.0.0.1', strictPort: true },
  esbuild: { legalComments: 'none' },
});
