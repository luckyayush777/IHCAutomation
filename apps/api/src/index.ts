import { config } from 'dotenv';

import { createApp } from './app.js';

config({ path: new URL('../../../.env', import.meta.url) });

const port = Number(process.env.API_PORT ?? 4000);
const app = createApp();

const server = app.listen(port, () => {
  console.log(`IHC API listening at http://localhost:${port}`);
});

function shutDown(signal: string) {
  console.log(`${signal} received, closing API server`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutDown('SIGINT'));
process.on('SIGTERM', () => shutDown('SIGTERM'));
