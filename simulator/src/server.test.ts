import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createSimulatorServer } from './server.js';
import {
  createNormalReadingBatch,
  readSimulatorConfig,
  sendNormalTelemetryTick,
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
      }),
    ).toEqual({
      ingestionApiUrl: 'http://localhost:4000/api/v1/readings',
      deviceToken: 'device-token',
      intervalMs: 30000,
    });
  });
});
