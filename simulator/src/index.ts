import { config } from 'dotenv';

import { createSimulatorServer } from './server.js';

config({ path: new URL('../../.env', import.meta.url) });

const port = Number(process.env.SIMULATOR_PORT ?? 4100);
const server = createSimulatorServer();

server.listen(port, () => {
  console.log(`IHC simulator health service listening at http://localhost:${port}`);
  console.log('Sensor telemetry generation will be added in Phase 3.');
});

function shutDown(signal: string) {
  console.log(`${signal} received, closing simulator service`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutDown('SIGINT'));
process.on('SIGTERM', () => shutDown('SIGTERM'));
