import cors from 'cors';
import express from 'express';

import {
  INGESTION_CONTRACT_VERSION,
  validateReadingIngestionRequest,
  type HealthResponse,
  type ReadingIngestionResponse,
} from '@ihc/shared';

import { createMonitoringStoreFromEnv, type MonitoringStore } from './monitoringStore.js';

const startedAt = Date.now();

export interface AppOptions {
  deviceToken?: string;
  monitoringStore?: MonitoringStore | null;
  now?: () => Date;
}

function getBearerToken(authorizationHeader: string | undefined): string | null {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function getAllowedOrigins(): string[] {
  const configuredOrigin = process.env.ALLOWED_ORIGIN;

  if (configuredOrigin) {
    return configuredOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

function getDashboardQuery(query: express.Request['query']) {
  const value = (name: 'deviceCode' | 'from' | 'to') => {
    const raw = query[name];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  };
  const from = value('from');
  const to = value('to');
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) return null;
  return { deviceCode: value('deviceCode'), from, to };
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const allowedOrigins = getAllowedOrigins();
  const deviceToken = options.deviceToken ?? process.env.SIMULATOR_DEVICE_KEY;
  const monitoringStore = options.monitoringStore ?? createMonitoringStoreFromEnv();
  const now = options.now ?? (() => new Date());

  app.disable('x-powered-by');
  app.use(cors({ origin: allowedOrigins }));
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

  app.get('/api/v1/dashboard', async (request, response, next) => {
    try {
      if (!monitoringStore) {
        response.status(503).json({ error: 'monitoring store is not configured' });
        return;
      }

      const query = getDashboardQuery(request.query);
      if (!query) {
        response.status(400).json({ error: 'from and to must be ISO timestamps' });
        return;
      }
      const generatedAt = now().toISOString();
      const snapshot = await monitoringStore.getDashboardSnapshot(generatedAt, query);
      response.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/readings', async (request, response, next) => {
    try {
      if (!deviceToken) {
        response.status(503).json({ error: 'ingestion is not configured' });
        return;
      }

      if (getBearerToken(request.header('authorization')) !== deviceToken) {
        response.status(401).json({ error: 'missing or invalid device token' });
        return;
      }

      if (!monitoringStore) {
        response.status(503).json({ error: 'monitoring store is not configured' });
        return;
      }

      const validation = validateReadingIngestionRequest(request.body, now());

      if (!validation.ok || !validation.value) {
        response.status(400).json({ error: 'invalid reading payload', details: validation.errors });
        return;
      }

      const device = await monitoringStore.findDeviceByCode(validation.value.deviceCode);

      if (!device) {
        response.status(404).json({ error: 'unknown deviceCode' });
        return;
      }

      const receivedAt = now().toISOString();
      await monitoringStore.storeReadings(device.id, validation.value, receivedAt);

      const payload: ReadingIngestionResponse = {
        contractVersion: INGESTION_CONTRACT_VERSION,
        accepted: validation.value.readings.length,
        deviceCode: validation.value.deviceCode,
        receivedAt,
      };

      response.status(202).json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      void next;
      console.error(error instanceof Error ? error.message : 'Unexpected API error');
      response.status(502).json({ error: 'failed to store readings' });
    },
  );

  return app;
}
