import cors from 'cors';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';

import {
  INGESTION_CONTRACT_VERSION,
  validateReadingIngestionRequest,
  type HealthResponse,
  type ReadingIngestionResponse,
} from '@ihc/shared';

import {
  createMonitoringStoreFromEnv,
  type DoctorRosterInput,
  type MonitoringStore,
} from './monitoringStore.js';

const startedAt = Date.now();

export interface AppOptions {
  adminToken?: string;
  deviceToken?: string;
  dashboardDirectory?: string;
  monitoringStore?: MonitoringStore | null;
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tokensMatch(actual: string | null, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function validateDoctorRosterInput(
  value: unknown,
  doctorCode: string,
): { value?: DoctorRosterInput; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { errors: ['request body must be an object'] };
  const requiredText = (name: 'displayName' | 'role') => {
    const item = value[name];
    if (typeof item !== 'string' || item.trim().length === 0 || item.length > 100)
      errors.push(`${name} must be 1 to 100 characters`);
    return typeof item === 'string' ? item.trim() : '';
  };
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(doctorCode)) errors.push('doctorCode is invalid');
  const displayName = requiredText('displayName');
  const role = requiredText('role');
  const optionalText = (name: 'department' | 'room') => {
    const item = value[name];
    if (item !== undefined && (typeof item !== 'string' || item.length > 100))
      errors.push(`${name} must be no more than 100 characters`);
    return typeof item === 'string' ? item.trim() : undefined;
  };
  const department = optionalText('department');
  const room = optionalText('room');
  const displayOrder = value.displayOrder ?? 0;
  if (!Number.isInteger(displayOrder) || Number(displayOrder) < 0 || Number(displayOrder) > 999)
    errors.push('displayOrder must be an integer from 0 to 999');
  if (typeof value.isActive !== 'boolean') errors.push('isActive must be a boolean');
  if (!Array.isArray(value.availability) || value.availability.length > 50)
    errors.push('availability must be an array with no more than 50 slots');
  const slots = Array.isArray(value.availability) ? value.availability : [];
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const allowedTypes = ['available', 'on_call', 'appointment_only', 'unavailable'] as const;
  const availability = slots.map((slot, index) => {
    const prefix = `availability[${index}]`;
    if (!isRecord(slot)) {
      errors.push(`${prefix} must be an object`);
      return null;
    }
    if (!Number.isInteger(slot.weekday) || Number(slot.weekday) < 0 || Number(slot.weekday) > 6)
      errors.push(`${prefix}.weekday must be an integer from 0 to 6`);
    if (typeof slot.startTime !== 'string' || !timePattern.test(slot.startTime))
      errors.push(`${prefix}.startTime must use HH:MM`);
    if (typeof slot.endTime !== 'string' || !timePattern.test(slot.endTime))
      errors.push(`${prefix}.endTime must use HH:MM`);
    if (
      typeof slot.startTime === 'string' &&
      typeof slot.endTime === 'string' &&
      slot.startTime >= slot.endTime
    )
      errors.push(`${prefix}.endTime must be after startTime`);
    if (!allowedTypes.includes(slot.availabilityType as (typeof allowedTypes)[number]))
      errors.push(`${prefix}.availabilityType is invalid`);
    for (const field of ['validFrom', 'validUntil'] as const) {
      if (slot[field] != null && slot[field] !== '' && !datePattern.test(String(slot[field])))
        errors.push(`${prefix}.${field} must use YYYY-MM-DD`);
    }
    if (slot.note != null && (typeof slot.note !== 'string' || slot.note.length > 160))
      errors.push(`${prefix}.note must be no more than 160 characters`);
    return {
      weekday: Number(slot.weekday),
      startTime: String(slot.startTime),
      endTime: String(slot.endTime),
      availabilityType:
        slot.availabilityType as DoctorRosterInput['availability'][number]['availabilityType'],
      note: typeof slot.note === 'string' ? slot.note.trim() : undefined,
      validFrom: typeof slot.validFrom === 'string' ? slot.validFrom : undefined,
      validUntil: typeof slot.validUntil === 'string' ? slot.validUntil : undefined,
    };
  });
  if (errors.length) return { errors };
  return {
    errors,
    value: {
      doctorCode,
      displayName,
      role,
      department,
      room,
      displayOrder: Number(displayOrder),
      isActive: value.isActive as boolean,
      availability: availability.filter((slot) => slot !== null),
    },
  };
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
  const adminToken = options.adminToken ?? process.env.ADMIN_API_KEY;
  const deviceToken = options.deviceToken ?? process.env.SIMULATOR_DEVICE_KEY;
  const monitoringStore = options.monitoringStore ?? createMonitoringStoreFromEnv();
  const now = options.now ?? (() => new Date());

  app.disable('x-powered-by');
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json({ limit: '32kb' }));
  if (options.dashboardDirectory) app.use(express.static(options.dashboardDirectory));

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

  app.get('/api/v1/admin/roster', async (request, response, next) => {
    try {
      if (!isLoopbackAddress(request.ip)) {
        response.status(403).json({ error: 'roster administration is available only on the Pi' });
        return;
      }
      if (!adminToken) {
        response.status(503).json({ error: 'roster administration is not configured' });
        return;
      }
      if (!tokensMatch(getBearerToken(request.header('authorization')), adminToken)) {
        response.status(401).json({ error: 'missing or invalid admin token' });
        return;
      }
      if (!monitoringStore) {
        response.status(503).json({ error: 'monitoring store is not configured' });
        return;
      }
      response.status(200).json(await monitoringStore.getDoctorRoster());
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/v1/admin/doctors/:doctorCode', async (request, response, next) => {
    try {
      if (!isLoopbackAddress(request.ip)) {
        response.status(403).json({ error: 'roster administration is available only on the Pi' });
        return;
      }
      if (!adminToken) {
        response.status(503).json({ error: 'roster administration is not configured' });
        return;
      }
      if (!tokensMatch(getBearerToken(request.header('authorization')), adminToken)) {
        response.status(401).json({ error: 'missing or invalid admin token' });
        return;
      }
      if (!monitoringStore) {
        response.status(503).json({ error: 'monitoring store is not configured' });
        return;
      }
      const validation = validateDoctorRosterInput(request.body, request.params.doctorCode);
      if (!validation.value) {
        response
          .status(400)
          .json({ error: 'invalid doctor roster entry', details: validation.errors });
        return;
      }
      await monitoringStore.upsertDoctorRosterEntry(validation.value);
      response.status(200).json({ doctorCode: validation.value.doctorCode, updated: true });
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
      await monitoringStore.evaluateDeviceAlerts(device.id, receivedAt);

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
