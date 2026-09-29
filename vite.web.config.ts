import { defineConfig, type Plugin } from 'vite';
import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Babylon.js browser client. Separate from the legacy Three.js client (root vite.config.ts):
 * its own entry, its own output (`dist-web`), and it may import only browser-safe modules. That
 * boundary is enforced by tests/web-boundary.test.ts against the real bundle graph.
 */
const replays = (): Plugin => ({
  name: 'tv-dev-replays',
  apply: 'serve',
  configureServer(server) {
    // Recorded observer streams live in ignored local state (.debug/web/streams); only the dev server exposes them.
    server.middlewares.use('/replays', (req, res, next) => {
      const name = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
      if (!/^[\w.-]+\.json$/.test(name)) return next();
      const file = resolve(__dirname, '.debug/web/streams', name);
      if (!existsSync(file)) return next();
      res.setHeader('content-type', 'application/json'); createReadStream(file).pipe(res);
    });
  },
});

export default defineConfig({
  root: resolve(__dirname, 'web'),
  base: './',
  publicDir: resolve(__dirname, 'web/public'),
  plugins: [replays()],
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
    sourcemap: false,
    rollupOptions: { output: { manualChunks: { babylon: ['@babylonjs/core'] } } },
  },
  server: { port: 5180, host: '127.0.0.1', strictPort: true },
  esbuild: { legalComments: 'none' },
});
