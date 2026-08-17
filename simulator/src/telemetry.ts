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
  retryAttempts: number;
  scenario: SimulatorScenario;
}

export interface SendResult {
  deviceCode: DeviceCode;
  status: number;
  accepted: boolean;
  attempts: number;
  skipped?: boolean;
}

export type SimulatorScenario =
  | 'normal'
  | 'high_fridge'
  | 'low_fridge'
  | 'door_excursion'
  | 'high_humidity'
  | 'smoke_signal'
  | 'invalid_sensor'
  | 'offline_device';

const roomDevices = new Set<DeviceCode>([
  'doctors_room',
  'monitoring_room',
  'male_ward',
  'female_ward',
]);

export const SIMULATOR_SCENARIOS: readonly SimulatorScenario[] = [
  'normal',
  'high_fridge',
  'low_fridge',
  'door_excursion',
  'high_humidity',
  'smoke_signal',
  'invalid_sensor',
  'offline_device',
] as const;

function createReading(
  metric: SensorReadingInput['metric'],
  value: number,
  unit: SensorReadingInput['unit'],
  recordedAt: string,
  quality: SensorReadingInput['quality'] = 'good',
): SensorReadingInput {
  return {
    metric,
    value,
    unit,
    quality,
    recordedAt,
  };
}

export function createScenarioReadingBatch(
  deviceCode: DeviceCode,
  recordedAt = new Date(),
  tick = 0,
  scenario: SimulatorScenario = 'normal',
): ReadingIngestionRequest {
  const phase = tick % 10;
  const timestamp = recordedAt.toISOString();
  const readings: SensorReadingInput[] = [];

  if (deviceCode.startsWith('fridge_')) {
    let temperature = 3.4 + phase * 0.06;

    if (scenario === 'high_fridge' && deviceCode === 'fridge_male_ward') {
      temperature = 6.2 + phase * 0.12;
    } else if (scenario === 'low_fridge' && deviceCode === 'fridge_female_ward') {
      temperature = 1.4 - phase * 0.04;
    } else if (scenario === 'door_excursion' && deviceCode === 'fridge_male_ward') {
      temperature = tick % 6 < 2 ? 7.4 : 3.8;
    } else if (scenario === 'invalid_sensor' && deviceCode === 'fridge_male_ward') {
      temperature = 91;
    }

    readings.push(
      createReading('temperature', Number(temperature.toFixed(2)), 'celsius', timestamp),
    );
  }

  if (roomDevices.has(deviceCode)) {
    const highHumidity = scenario === 'high_humidity' && deviceCode === 'female_ward';
    const smokeSignal = scenario === 'smoke_signal' && deviceCode === 'monitoring_room';
    const invalidRoom = scenario === 'invalid_sensor' && deviceCode === 'male_ward';
    const humidity = invalidRoom ? 118 : highHumidity ? 78 + phase * 0.8 : 51 + phase * 0.4;
    const smoke = smokeSignal ? 320 + phase * 22 : 2 + phase * 0.1;
    const alarm = smokeSignal && tick >= 2 ? 1 : 0;

    readings.push(
      createReading('temperature', Number((26.2 + phase * 0.08).toFixed(2)), 'celsius', timestamp),
      createReading(
        'humidity',
        Number(humidity.toFixed(1)),
        'percent_rh',
        timestamp,
        invalidRoom ? 'invalid' : 'good',
      ),
      createReading('smoke', Number(smoke.toFixed(1)), 'ppm', timestamp),
      createReading('detector_alarm', alarm, 'alarm_state', timestamp),
    );
  }

  return {
    contractVersion: INGESTION_CONTRACT_VERSION,
    deviceCode,
    readings,
  };
}

export function createNormalReadingBatch(
  deviceCode: DeviceCode,
  recordedAt = new Date(),
  tick = 0,
): ReadingIngestionRequest {
  return createScenarioReadingBatch(deviceCode, recordedAt, tick, 'normal');
}

function parseScenario(value: string | undefined): SimulatorScenario {
  if (!value) return 'normal';
  if (SIMULATOR_SCENARIOS.includes(value as SimulatorScenario)) return value as SimulatorScenario;

  return 'normal';
}

export function readSimulatorConfig(env = process.env): SimulatorConfig | null {
  const configuredApiUrl = env.INGESTION_API_URL ?? 'http://localhost:4000/api/v1/readings';
  const ingestionApiUrl = new URL(configuredApiUrl);
  if (ingestionApiUrl.pathname === '/') ingestionApiUrl.pathname = '/api/v1/readings';
  const deviceToken = env.SIMULATOR_DEVICE_KEY;
  const intervalMs = Number(env.SIMULATOR_INTERVAL_MS ?? 60_000);
  const retryAttempts = Number(env.SIMULATOR_RETRY_ATTEMPTS ?? 1);

  if (
    !deviceToken ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0 ||
    !Number.isInteger(retryAttempts) ||
    retryAttempts < 0
  ) {
    return null;
  }

  return {
    ingestionApiUrl: ingestionApiUrl.toString(),
    deviceToken,
    intervalMs,
    retryAttempts,
    scenario: parseScenario(env.SIMULATOR_SCENARIO),
  };
}

async function postWithRetry(
  config: SimulatorConfig,
  body: ReadingIngestionRequest,
  fetcher: typeof fetch,
): Promise<{ status: number; accepted: boolean; attempts: number }> {
  for (let attempt = 1; attempt <= config.retryAttempts + 1; attempt += 1) {
    try {
      const response = await fetcher(config.ingestionApiUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.deviceToken}`,
          'content-type': 'application/json',
          'user-agent': 'ihc-simulator/0.1.0',
        },
        body: JSON.stringify(body),
      });

      if (response.ok || attempt > config.retryAttempts) {
        return {
          status: response.status,
          accepted: response.ok,
          attempts: attempt,
        };
      }
    } catch {
      if (attempt > config.retryAttempts) {
        return {
          status: 0,
          accepted: false,
          attempts: attempt,
        };
      }
    }
  }

  return { status: 0, accepted: false, attempts: config.retryAttempts + 1 };
}

export async function sendTelemetryTick(
  config: SimulatorConfig,
  tick = 0,
  recordedAt = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<SendResult[]> {
  return Promise.all(
    DEVICE_CODES.map(async (deviceCode) => {
      if (config.scenario === 'offline_device' && deviceCode === 'female_ward') {
        return {
          deviceCode,
          status: 0,
          accepted: false,
          attempts: 0,
          skipped: true,
        };
      }

      const result = await postWithRetry(
        config,
        createScenarioReadingBatch(deviceCode, recordedAt, tick, config.scenario),
        fetcher,
      );

      return {
        deviceCode,
        ...result,
      };
    }),
  );
}

export async function sendNormalTelemetryTick(
  config: Omit<SimulatorConfig, 'scenario' | 'retryAttempts'> & {
    retryAttempts?: number;
    scenario?: SimulatorScenario;
  },
  tick = 0,
  recordedAt = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<SendResult[]> {
  return sendTelemetryTick(
    {
      ...config,
      retryAttempts: config.retryAttempts ?? 0,
      scenario: config.scenario ?? 'normal',
    },
    tick,
    recordedAt,
    fetcher,
  );
}
