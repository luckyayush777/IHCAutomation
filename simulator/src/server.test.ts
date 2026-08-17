import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createSimulatorServer } from './server.js';
import {
  createScenarioReadingBatch,
  createNormalReadingBatch,
  readSimulatorConfig,
  sendNormalTelemetryTick,
  sendTelemetryTick,
} from './telemetry.js';

const openServers: ReturnType<typeof createSimulatorServer>[] = [];

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe('simulator health endpoint', () => {
  it('reports that the simulator process is ready', async () => {
    const server = createSimulatorServer();
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ service: 'simulator', status: 'ok' });
  });
});

describe('local simulator controls', () => {
  it('keeps controls unavailable unless explicitly enabled', async () => {
    const server = createSimulatorServer();
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/simulation`);
    expect(response.status).toBe(404);
  });

  it('starts and stops an enabled runtime with a validated scenario', async () => {
    let running = false;
    let scenario = 'normal';
    const state = () => ({
      configured: true,
      running,
      scenario,
      intervalMs: 10_000,
      tick: 0,
      lastRunAt: null,
      lastResults: [],
    });
    const runtime = {
      getState: state,
      start(nextScenario: string) {
        running = true;
        scenario = nextScenario;
        return state();
      },
      stop() {
        running = false;
        return state();
      },
    };
    const server = createSimulatorServer({
      controlEnabled: true,
      runtime: runtime as never,
    });
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const started = await fetch(`http://127.0.0.1:${port}/api/v1/simulation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start', scenario: 'high_fridge', intervalMs: 5000 }),
    });
    const startedBody = (await started.json()) as Record<string, unknown>;
    expect(started.status).toBe(200);
    expect(startedBody).toMatchObject({ running: true, scenario: 'high_fridge' });

    const stopped = await fetch(`http://127.0.0.1:${port}/api/v1/simulation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    const stoppedBody = (await stopped.json()) as Record<string, unknown>;
    expect(stopped.status).toBe(200);
    expect(stoppedBody.running).toBe(false);
  });
});

describe('normal telemetry generation', () => {
  it('creates fridge and room batches using the shared ingestion contract', () => {
    const recordedAt = new Date('2026-08-16T09:30:00.000Z');

    expect(createNormalReadingBatch('fridge_male_ward', recordedAt)).toMatchObject({
      contractVersion: 1,
      deviceCode: 'fridge_male_ward',
      readings: [{ metric: 'temperature', unit: 'celsius', quality: 'good' }],
    });

    expect(
      createNormalReadingBatch('male_ward', recordedAt).readings.map((reading) => reading.metric),
    ).toEqual(['temperature', 'humidity', 'smoke', 'detector_alarm']);
  });

  it('posts one normal batch per seeded device using only the simulator device token', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 202 });
    };

    const results = await sendNormalTelemetryTick(
      {
        ingestionApiUrl: 'http://localhost:4000/api/v1/readings',
        deviceToken: 'device-token',
        intervalMs: 60_000,
      },
      0,
      new Date('2026-08-16T09:30:00.000Z'),
      fetcher,
    );

    expect(results).toHaveLength(6);
    expect(results.every((result) => result.accepted)).toBe(true);
    expect(results.every((result) => result.attempts === 1)).toBe(true);
    expect(calls).toHaveLength(6);
    const firstCall = calls[0];

    expect(firstCall).toBeDefined();
    expect(firstCall?.init.headers).toMatchObject({
      authorization: 'Bearer device-token',
      'content-type': 'application/json',
    });
    expect(JSON.stringify(calls)).not.toContain('SUPABASE');
  });

  it('requires a device token before enabling telemetry', () => {
    expect(
      readSimulatorConfig({ INGESTION_API_URL: 'http://localhost:4000/api/v1/readings' }),
    ).toBeNull();
    expect(
      readSimulatorConfig({
        INGESTION_API_URL: 'http://localhost:4000/api/v1/readings',
        SIMULATOR_DEVICE_KEY: 'device-token',
        SIMULATOR_INTERVAL_MS: '30000',
        SIMULATOR_RETRY_ATTEMPTS: '2',
        SIMULATOR_SCENARIO: 'high_fridge',
      }),
    ).toEqual({
      ingestionApiUrl: 'http://localhost:4000/api/v1/readings',
      deviceToken: 'device-token',
      intervalMs: 30000,
      retryAttempts: 2,
      scenario: 'high_fridge',
    });
  });

  it('normalizes a base API URL to the ESP32 ingestion endpoint', () => {
    const config = readSimulatorConfig({
      SIMULATOR_DEVICE_KEY: 'test-token',
      INGESTION_API_URL: 'http://localhost:4000',
    });

    expect(config?.ingestionApiUrl).toBe('http://localhost:4000/api/v1/readings');
  });

  it('creates deterministic abnormal scenario batches', () => {
    const recordedAt = new Date('2026-08-16T09:30:00.000Z');

    expect(
      createScenarioReadingBatch('fridge_male_ward', recordedAt, 0, 'high_fridge').readings[0],
    ).toMatchObject({ metric: 'temperature', value: 6.2 });
    expect(
      createScenarioReadingBatch('fridge_female_ward', recordedAt, 0, 'low_fridge').readings[0],
    ).toMatchObject({ metric: 'temperature', value: 1.4 });
    expect(
      createScenarioReadingBatch('fridge_male_ward', recordedAt, 0, 'door_excursion').readings[0],
    ).toMatchObject({ metric: 'temperature', value: 7.4 });
    expect(
      createScenarioReadingBatch('female_ward', recordedAt, 0, 'high_humidity').readings.find(
        (reading) => reading.metric === 'humidity',
      ),
    ).toMatchObject({ value: 78 });
    expect(
      createScenarioReadingBatch('monitoring_room', recordedAt, 2, 'smoke_signal').readings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: 'smoke', value: 364 }),
        expect.objectContaining({ metric: 'detector_alarm', value: 1 }),
      ]),
    );
    expect(
      createScenarioReadingBatch('male_ward', recordedAt, 0, 'invalid_sensor').readings.find(
        (reading) => reading.metric === 'humidity',
      ),
    ).toMatchObject({ value: 118, quality: 'invalid' });
  });

  it('skips one device in the offline-device scenario', async () => {
    const calls: RequestInit[] = [];
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(null, { status: 202 });
    };

    const results = await sendTelemetryTick(
      {
        ingestionApiUrl: 'http://localhost:4000/api/v1/readings',
        deviceToken: 'device-token',
        intervalMs: 60_000,
        retryAttempts: 0,
        scenario: 'offline_device',
      },
      0,
      new Date('2026-08-16T09:30:00.000Z'),
      fetcher,
    );

    expect(results).toContainEqual(
      expect.objectContaining({ deviceCode: 'female_ward', skipped: true }),
    );
    expect(calls).toHaveLength(5);
  });

  it('retries network failures before reporting a failed batch', async () => {
    let attempts = 0;
    const fetcher = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('network down');
      return new Response(null, { status: 202 });
    };

    const results = await sendTelemetryTick(
      {
        ingestionApiUrl: 'http://localhost:4000/api/v1/readings',
        deviceToken: 'device-token',
        intervalMs: 60_000,
        retryAttempts: 1,
        scenario: 'normal',
      },
      0,
      new Date('2026-08-16T09:30:00.000Z'),
      fetcher,
    );

    expect(results[0]).toMatchObject({ accepted: true, attempts: 2 });
  });
});
