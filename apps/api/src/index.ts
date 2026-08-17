import { config } from 'dotenv';

import { createApp } from './app.js';
import { createMonitoringStoreFromEnv } from './monitoringStore.js';

config({ path: new URL('../../../.env', import.meta.url) });

const port = Number(process.env.API_PORT ?? 4000);
const monitoringStore = createMonitoringStoreFromEnv();
const app = createApp({ monitoringStore });
const offlineCheckIntervalMs = Number(process.env.OFFLINE_CHECK_INTERVAL_MS ?? 30_000);
let offlineCheckTimer: NodeJS.Timeout | undefined;

const server = app.listen(port, () => {
  console.log(`IHC API listening at http://localhost:${port}`);
  if (monitoringStore && Number.isFinite(offlineCheckIntervalMs) && offlineCheckIntervalMs > 0) {
    const evaluateOfflineDevices = async () => {
      try {
        await monitoringStore.evaluateOfflineAlerts(new Date().toISOString());
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Offline alert evaluation failed');
      }
    };
    void evaluateOfflineDevices();
    offlineCheckTimer = setInterval(() => void evaluateOfflineDevices(), offlineCheckIntervalMs);
  }
});

function shutDown(signal: string) {
  console.log(`${signal} received, closing API server`);
  if (offlineCheckTimer) clearInterval(offlineCheckTimer);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutDown('SIGINT'));
process.on('SIGTERM', () => shutDown('SIGTERM'));
