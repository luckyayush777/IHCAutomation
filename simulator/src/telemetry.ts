import {
  DEVICE_CODES,
  INGESTION_CONTRACT_VERSION,
  type DeviceCode,
  type ReadingIngestionRequest,
  type SensorReadingInput,
} from '@ihc/shared';

export interface SimulatorConfig {
  ingestionApiUrl: string;
  deviceToken: string;
  intervalMs: number;
}

export interface SendResult {
  deviceCode: DeviceCode;
  status: number;
  accepted: boolean;
}

const roomDevices = new Set<DeviceCode>([
  'doctors_room',
  'monitoring_room',
  'male_ward',
  'female_ward',
]);

export function createNormalReadingBatch(
  deviceCode: DeviceCode,
  recordedAt = new Date(),
  tick = 0,
): ReadingIngestionRequest {
  const phase = tick % 10;
  const timestamp = recordedAt.toISOString();
  const readings: SensorReadingInput[] = [];

  if (deviceCode.startsWith('fridge_')) {
    readings.push({
      metric: 'temperature',
      value: Number((3.4 + phase * 0.06).toFixed(2)),
      unit: 'celsius',
      quality: 'good',
      recordedAt: timestamp,
    });
  }

  if (roomDevices.has(deviceCode)) {
    readings.push(
      {
        metric: 'temperature',
        value: Number((26.2 + phase * 0.08).toFixed(2)),
        unit: 'celsius',
        quality: 'good',
        recordedAt: timestamp,
      },
      {
        metric: 'humidity',
        value: Number((51 + phase * 0.4).toFixed(1)),
        unit: 'percent_rh',
        quality: 'good',
        recordedAt: timestamp,
      },
      {
        metric: 'smoke',
        value: Number((2 + phase * 0.1).toFixed(1)),
        unit: 'ppm',
        quality: 'good',
        recordedAt: timestamp,
      },
      {
        metric: 'detector_alarm',
        value: 0,
        unit: 'alarm_state',
        quality: 'good',
        recordedAt: timestamp,
      },
    );
  }

  return {
    contractVersion: INGESTION_CONTRACT_VERSION,
    deviceCode,
    readings,
  };
}

export function readSimulatorConfig(env = process.env): SimulatorConfig | null {
  const ingestionApiUrl = env.INGESTION_API_URL ?? 'http://localhost:4000/api/v1/readings';
  const deviceToken = env.SIMULATOR_DEVICE_KEY;
  const intervalMs = Number(env.SIMULATOR_INTERVAL_MS ?? 60_000);

  if (!deviceToken || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return null;
  }

  return { ingestionApiUrl, deviceToken, intervalMs };
}

export async function sendNormalTelemetryTick(
  config: SimulatorConfig,
  tick = 0,
  recordedAt = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<SendResult[]> {
  return Promise.all(
    DEVICE_CODES.map(async (deviceCode) => {
      const response = await fetcher(config.ingestionApiUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.deviceToken}`,
          'content-type': 'application/json',
          'user-agent': 'ihc-simulator/0.1.0',
        },
        body: JSON.stringify(createNormalReadingBatch(deviceCode, recordedAt, tick)),
      });

      return {
        deviceCode,
        status: response.status,
        accepted: response.ok,
      };
    }),
  );
}
