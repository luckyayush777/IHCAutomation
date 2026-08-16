import { createServer } from 'node:http';

import type { HealthResponse } from '@ihc/shared';

const startedAt = Date.now();

export function getHealthStatus(): HealthResponse {
  return {
    contractVersion: 1,
    service: 'simulator',
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    version: '0.1.0',
  };
}

export function createSimulatorServer() {
  return createServer((request, response) => {
    response.setHeader(
      'Access-Control-Allow-Origin',
      process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
    );
    response.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify(getHealthStatus()));
      return;
    }

    response.writeHead(404);
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}
