export const HEALTH_CONTRACT_VERSION = 1 as const;
export const INGESTION_CONTRACT_VERSION = 1 as const;

export type ServiceName = 'api' | 'dashboard' | 'simulator';
export type HealthStatus = 'ok' | 'degraded';
export type DeviceCode =
  | 'fridge_male_ward'
  | 'fridge_female_ward'
  | 'doctors_room'
  | 'monitoring_room'
  | 'male_ward'
  | 'female_ward';
export type ReadingMetric = 'temperature' | 'humidity' | 'smoke' | 'detector_alarm';
export type ReadingUnit = 'celsius' | 'percent_rh' | 'ppm' | 'alarm_state';
export type ReadingQuality = 'good' | 'suspect' | 'invalid';

export interface HealthResponse {
  contractVersion: typeof HEALTH_CONTRACT_VERSION;
  service: ServiceName;
  status: HealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  version: string;
}

export interface SensorReadingInput {
  metric: ReadingMetric;
  value: number;
  unit: ReadingUnit;
  quality?: ReadingQuality;
  recordedAt: string;
}

export interface ReadingIngestionRequest {
  contractVersion?: typeof INGESTION_CONTRACT_VERSION;
  deviceCode: string;
  readings: SensorReadingInput[];
}

export interface ReadingIngestionResponse {
  contractVersion: typeof INGESTION_CONTRACT_VERSION;
  accepted: number;
  deviceCode: string;
  receivedAt: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

export const DEVICE_CODES: readonly DeviceCode[] = [
  'fridge_male_ward',
  'fridge_female_ward',
  'doctors_room',
  'monitoring_room',
  'male_ward',
  'female_ward',
] as const;

const metricUnits: Record<ReadingMetric, ReadingUnit> = {
  temperature: 'celsius',
  humidity: 'percent_rh',
  smoke: 'ppm',
  detector_alarm: 'alarm_state',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

export function isHealthy(response: HealthResponse): boolean {
  return response.status === 'ok';
}

export function validateReadingIngestionRequest(
  value: unknown,
  now = new Date(),
): ValidationResult<ReadingIngestionRequest> {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ['request body must be an object'] };
  }

  if (value.contractVersion !== undefined && value.contractVersion !== INGESTION_CONTRACT_VERSION) {
    errors.push(`contractVersion must be ${INGESTION_CONTRACT_VERSION}`);
  }

  if (typeof value.deviceCode !== 'string' || value.deviceCode.trim().length === 0) {
    errors.push('deviceCode is required');
  }

  if (!Array.isArray(value.readings) || value.readings.length === 0) {
    errors.push('readings must contain at least one item');
  }

  if (Array.isArray(value.readings) && value.readings.length > 16) {
    errors.push('readings must contain no more than 16 items');
  }

  const readings = Array.isArray(value.readings) ? value.readings : [];
  const validatedReadings: SensorReadingInput[] = [];

  readings.forEach((reading, index) => {
    const prefix = `readings[${index}]`;

    if (!isRecord(reading)) {
      errors.push(`${prefix} must be an object`);
      return;
    }

    if (!isOneOf(reading.metric, ['temperature', 'humidity', 'smoke', 'detector_alarm'])) {
      errors.push(`${prefix}.metric is invalid`);
      return;
    }

    const metric = reading.metric;

    if (!isOneOf(reading.unit, ['celsius', 'percent_rh', 'ppm', 'alarm_state'])) {
      errors.push(`${prefix}.unit is invalid`);
      return;
    }

    if (reading.unit !== metricUnits[metric]) {
      errors.push(`${prefix}.unit must be ${metricUnits[metric]} for ${metric}`);
    }

    if (typeof reading.value !== 'number' || !Number.isFinite(reading.value)) {
      errors.push(`${prefix}.value must be a finite number`);
    } else if (metric === 'temperature' && (reading.value < -50 || reading.value > 80)) {
      errors.push(`${prefix}.value is outside the supported temperature range`);
    } else if (metric === 'humidity' && (reading.value < 0 || reading.value > 100)) {
      errors.push(`${prefix}.value is outside the supported humidity range`);
    } else if (metric === 'smoke' && reading.value < 0) {
      errors.push(`${prefix}.value must not be negative`);
    } else if (metric === 'detector_alarm' && reading.value !== 0 && reading.value !== 1) {
      errors.push(`${prefix}.value must be 0 or 1 for detector_alarm`);
    }

    if (
      reading.quality !== undefined &&
      !isOneOf(reading.quality, ['good', 'suspect', 'invalid'])
    ) {
      errors.push(`${prefix}.quality is invalid`);
    }

    if (typeof reading.recordedAt !== 'string') {
      errors.push(`${prefix}.recordedAt is required`);
    } else {
      const recordedAtMs = Date.parse(reading.recordedAt);
      const nowMs = now.getTime();

      if (Number.isNaN(recordedAtMs)) {
        errors.push(`${prefix}.recordedAt must be an ISO timestamp`);
      } else if (recordedAtMs < nowMs - 24 * 60 * 60 * 1000) {
        errors.push(`${prefix}.recordedAt is too old`);
      } else if (recordedAtMs > nowMs + 5 * 60 * 1000) {
        errors.push(`${prefix}.recordedAt is too far in the future`);
      }
    }

    validatedReadings.push({
      metric,
      value: reading.value as number,
      unit: reading.unit,
      quality: (reading.quality as ReadingQuality | undefined) ?? 'good',
      recordedAt: reading.recordedAt as string,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    value: {
      contractVersion: INGESTION_CONTRACT_VERSION,
      deviceCode: value.deviceCode as string,
      readings: validatedReadings,
    },
  };
}
