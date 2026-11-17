import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Konfigurasi Vite untuk Developer Dashboard + injeksi otomatis URL API Cloud ke game HTML statis.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = (process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const configScript = `window.__FSRS_API_BASE_URL__ = ${JSON.stringify(apiBaseUrl)};\n`;

  return {
    plugins: [
      react(),
      {
        name: 'fsrs-api-config-injector',
        configureServer(server) {
          server.middlewares.use('/api-config.js', (_req, res) => {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.end(configScript);
          });
        },
        closeBundle() {
          const outFile = path.resolve(__dirname, 'dist', 'api-config.js');
          if (fs.existsSync(path.dirname(outFile))) {
            fs.writeFileSync(outFile, configScript, 'utf8');
          }
        },
      },
    ],
    server: {
      port: 5173,
      proxy: {
        // Proxy otomatis ke server backend Express.js pada saat pengembangan lokal.
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
