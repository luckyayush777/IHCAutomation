import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envDir: '../..',
  build: {
    rollupOptions: {
      input: {
        dashboard: resolve(configDirectory, 'index.html'),
        simulation: resolve(configDirectory, 'simulation.html'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['chart.js', 'chart.js/auto'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    environment: 'jsdom',
  },
});
