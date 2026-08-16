import { config } from 'dotenv';

import { createSimulatorServer } from './server.js';
import { readSimulatorConfig, sendNormalTelemetryTick } from './telemetry.js';

config({ path: new URL('../../.env', import.meta.url) });

const port = Number(process.env.SIMULATOR_PORT ?? 4100);
const server = createSimulatorServer();
const simulatorConfig = readSimulatorConfig();
let telemetryTimer: NodeJS.Timeout | undefined;
let tick = 0;

async function sendTelemetry() {
  if (!simulatorConfig) {
    return;
  }

  try {
    const results = await sendNormalTelemetryTick(simulatorConfig, tick);
    tick += 1;
    const accepted = results.filter((result) => result.accepted).length;
    console.log(`Simulator telemetry tick accepted ${accepted}/${results.length} device batches`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Simulator telemetry tick failed');
  }
}

server.listen(port, () => {
  console.log(`IHC simulator health service listening at http://localhost:${port}`);

  if (!simulatorConfig) {
    console.log('Simulator telemetry is disabled until SIMULATOR_DEVICE_KEY is configured.');
    return;
  }

  console.log(`Simulator telemetry posting to ${simulatorConfig.ingestionApiUrl}`);
  void sendTelemetry();
  telemetryTimer = setInterval(() => void sendTelemetry(), simulatorConfig.intervalMs);
});

function shutDown(signal: string) {
  console.log(`${signal} received, closing simulator service`);
  if (telemetryTimer) {
    clearInterval(telemetryTimer);
  }
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutDown('SIGINT'));
process.on('SIGTERM', () => shutDown('SIGTERM'));
