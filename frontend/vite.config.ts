import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Preview serves HTTPS only when local certificates are present. The clean
// handoff bundle deliberately omits them, so builds and HTTP previews must
// work without a `frontend/certs` folder.
const certDir = fileURLToPath(new URL('./certs/', import.meta.url));
const keyPath = `${certDir}key.pem`;
const certPath = `${certDir}cert.pem`;
const httpsConfig =
  !process.env.VITE_HTTP_ONLY && existsSync(keyPath) && existsSync(certPath)
    ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
    : undefined;

// The LAN deployment serves the SPA and API from one nginx origin. During
// local development Vite proxies /api to the FastAPI server on 8010.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 8443,
    https: process.env.VITE_HTTP_ONLY ? undefined : httpsConfig,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
