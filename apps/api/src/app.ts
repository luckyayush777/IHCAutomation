import cors from 'cors';
import express from 'express';

import type { HealthResponse } from '@ihc/shared';

const startedAt = Date.now();

export function createApp() {
  const app = express();
  const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173';

  app.disable('x-powered-by');
  app.use(cors({ origin: allowedOrigin }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/', (_request, response) => {
    response.json({
      service: 'IHC Automation API',
      documentation: '/health',
    });
  });

  app.get('/health', (_request, response) => {
    const payload: HealthResponse = {
      contractVersion: 1,
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      version: '0.1.0',
    };

    response.status(200).json(payload);
  });

  return app;
}
