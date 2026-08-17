import { config } from 'dotenv';

import { createSimulatorServer } from './server.js';
import { SimulatorRuntime } from './runtime.js';
import { readSimulatorConfig } from './telemetry.js';

config({ path: new URL('../../.env', import.meta.url) });

const port = Number(process.env.SIMULATOR_PORT ?? 4100);
const host = process.env.SIMULATOR_HOST ?? '127.0.0.1';
const simulatorConfig = readSimulatorConfig();
const runtime = new SimulatorRuntime(simulatorConfig);
const controlEnabled = process.env.SIMULATOR_CONTROL_ENABLED === 'true';
const server = createSimulatorServer({ runtime, controlEnabled });

server.listen(port, host, () => {
  console.log(`IHC simulator health service listening at http://${host}:${port}`);

  if (!simulatorConfig) {
    console.log('Simulator telemetry is disabled until SIMULATOR_DEVICE_KEY is configured.');
    return;
  }

  console.log(
    `Simulator ${simulatorConfig.scenario} telemetry posting to ${simulatorConfig.ingestionApiUrl}`,
  );
  runtime.start();
  if (controlEnabled) console.log('Local simulation controls are enabled.');
});

function shutDown(signal: string) {
  console.log(`${signal} received, closing simulator service`);
  runtime.stop();
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutDown('SIGINT'));
process.on('SIGTERM', () => shutDown('SIGTERM'));
