import { createServer } from 'node:http';

import type { HealthResponse } from '@ihc/shared';

import { SIMULATOR_SCENARIOS, type SimulatorScenario } from './telemetry.js';
import type { SimulatorRuntime } from './runtime.js';

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

export interface SimulatorServerOptions {
  runtime?: Pick<SimulatorRuntime, 'getState' | 'start' | 'stop'>;
  controlEnabled?: boolean;
  allowedOrigin?: string;
}

async function readJsonBody(request: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

export function createSimulatorServer(options: SimulatorServerOptions = {}) {
  return createServer((request, response) => {
    response.setHeader(
      'Access-Control-Allow-Origin',
      options.allowedOrigin ?? process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
    );
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify(getHealthStatus()));
      return;
    }

    if (request.url === '/api/v1/simulation') {
      if (!options.controlEnabled || !options.runtime) {
        response.writeHead(404);
        response.end(JSON.stringify({ error: 'Simulation controls are disabled' }));
        return;
      }

      if (request.method === 'GET') {
        response.writeHead(200);
        response.end(JSON.stringify(options.runtime.getState()));
        return;
      }

      if (request.method === 'POST') {
        void readJsonBody(request)
          .then((body) => {
            if (body.action === 'stop') {
              response.writeHead(200);
              response.end(JSON.stringify(options.runtime?.stop()));
              return;
            }
            if (
              body.action !== 'start' ||
              !SIMULATOR_SCENARIOS.includes(body.scenario as SimulatorScenario)
            ) {
              response.writeHead(400);
              response.end(
                JSON.stringify({ error: 'A valid start scenario or stop action is required' }),
              );
              return;
            }
            const intervalMs = Number(body.intervalMs ?? 10_000);
            response.writeHead(200);
            response.end(
              JSON.stringify(
                options.runtime?.start(body.scenario as SimulatorScenario, intervalMs),
              ),
            );
          })
          .catch((error: unknown) => {
            response.writeHead(400);
            response.end(
              JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid request' }),
            );
          });
        return;
      }
    }

    response.writeHead(404);
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}
