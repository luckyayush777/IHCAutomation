import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { SupabaseMonitoringStore, type MonitoringStore } from './monitoringStore.js';

class FakeMonitoringStore implements MonitoringStore {
  readonly stored: Array<{ deviceId: string; receivedAt: string; readingCount: number }> = [];

  constructor(
    private readonly devices = new Map([
      ['fridge_male_ward', { id: 'device-1', device_code: 'fridge_male_ward' }],
    ]),
  ) {}

  async findDeviceByCode(deviceCode: string) {
    return this.devices.get(deviceCode) ?? null;
  }

  async storeReadings(deviceId: string, requestBody: { readings: unknown[] }, receivedAt: string) {
    this.stored.push({ deviceId, receivedAt, readingCount: requestBody.readings.length });
  }

  async getDashboardSnapshot(generatedAt: string) {
    return {
      generatedAt,
      devices: [
        {
          id: 'device-1',
          device_code: 'fridge_male_ward',
          name: 'Fridge Male Ward',
          location: 'Male Ward',
          device_type: 'fridge_probe',
          status: 'online',
          last_seen_at: '2026-08-16T09:29:30.000Z',
        },
      ],
      readings: [
        {
          id: 1,
          device_id: 'device-1',
          metric: 'temperature',
          value: 4.2,
          unit: 'celsius',
          quality: 'good',
          recorded_at: '2026-08-16T09:29:30.000Z',
          received_at: '2026-08-16T09:30:00.000Z',
        },
      ],
      alertRules: [],
      alerts: [],
    };
  }
}

describe('API health endpoint', () => {
  it('reports a healthy API without exposing framework headers', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      contractVersion: 1,
      service: 'api',
      status: 'ok',
      version: '0.1.0',
    });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('dashboard data endpoint', () => {
  const now = () => new Date('2026-08-16T09:30:00.000Z');

  it('returns a read-only dashboard snapshot', async () => {
    const response = await request(
      createApp({ monitoringStore: new FakeMonitoringStore(), now }),
    ).get('/api/v1/dashboard');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      generatedAt: '2026-08-16T09:30:00.000Z',
      devices: [{ device_code: 'fridge_male_ward', status: 'online' }],
      readings: [{ metric: 'temperature', value: 4.2 }],
      alertRules: [],
      alerts: [],
    });
  });

  it('reports missing monitoring storage', async () => {
    const response = await request(createApp({ monitoringStore: null, now })).get(
      '/api/v1/dashboard',
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'monitoring store is not configured' });
  });
});

describe('reading ingestion endpoint', () => {
  const now = () => new Date('2026-08-16T09:30:00.000Z');
  const validPayload = {
    contractVersion: 1,
    deviceCode: 'fridge_male_ward',
    readings: [
      {
        metric: 'temperature',
        value: 4.2,
        unit: 'celsius',
        recordedAt: '2026-08-16T09:29:30.000Z',
      },
    ],
  };

  it('stores a valid authenticated reading batch', async () => {
    const store = new FakeMonitoringStore();
    const response = await request(
      createApp({ deviceToken: 'test-device-token', monitoringStore: store, now }),
    )
      .post('/api/v1/readings')
      .set('Authorization', 'Bearer test-device-token')
      .send(validPayload);

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      contractVersion: 1,
      accepted: 1,
      deviceCode: 'fridge_male_ward',
      receivedAt: '2026-08-16T09:30:00.000Z',
    });
    expect(store.stored).toEqual([
      {
        deviceId: 'device-1',
        readingCount: 1,
        receivedAt: '2026-08-16T09:30:00.000Z',
      },
    ]);
  });

  it('rejects missing or invalid device tokens', async () => {
    const app = createApp({
      deviceToken: 'test-device-token',
      monitoringStore: new FakeMonitoringStore(),
      now,
    });

    expect((await request(app).post('/api/v1/readings').send(validPayload)).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/readings')
          .set('Authorization', 'Bearer wrong-token')
          .send(validPayload)
      ).status,
    ).toBe(401);
  });

  it('rejects invalid readings before touching storage', async () => {
    const store = new FakeMonitoringStore();
    const response = await request(
      createApp({ deviceToken: 'test-device-token', monitoringStore: store, now }),
    )
      .post('/api/v1/readings')
      .set('Authorization', 'Bearer test-device-token')
      .send({
        deviceCode: 'fridge_male_ward',
        readings: [{ metric: 'humidity', value: 120, unit: 'celsius', recordedAt: 'bad-date' }],
      });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        'readings[0].unit must be percent_rh for humidity',
        'readings[0].value is outside the supported humidity range',
        'readings[0].recordedAt must be an ISO timestamp',
      ]),
    );
    expect(store.stored).toEqual([]);
  });

  it('accepts delayed queued readings within the retry window', async () => {
    const store = new FakeMonitoringStore();
    const response = await request(
      createApp({ deviceToken: 'test-device-token', monitoringStore: store, now }),
    )
      .post('/api/v1/readings')
      .set('Authorization', 'Bearer test-device-token')
      .send({
        contractVersion: 1,
        deviceCode: 'fridge_male_ward',
        readings: [
          {
            metric: 'temperature',
            value: 4.2,
            unit: 'celsius',
            recordedAt: '2026-08-15T09:31:00.000Z',
          },
        ],
      });

    expect(response.status).toBe(202);
    expect(store.stored).toHaveLength(1);
  });

  it('rejects unknown devices', async () => {
    const response = await request(
      createApp({
        deviceToken: 'test-device-token',
        monitoringStore: new FakeMonitoringStore(new Map()),
        now,
      }),
    )
      .post('/api/v1/readings')
      .set('Authorization', 'Bearer test-device-token')
      .send(validPayload);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'unknown deviceCode' });
  });

  it('reports missing server configuration without accepting readings', async () => {
    const response = await request(
      createApp({ deviceToken: '', monitoringStore: new FakeMonitoringStore(), now }),
    )
      .post('/api/v1/readings')
      .set('Authorization', 'Bearer test-device-token')
      .send(validPayload);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'ingestion is not configured' });
  });
});

describe('Supabase monitoring storage', () => {
  it('stores readings with an idempotent conflict policy', async () => {
    const calls: Array<{ path: string; init: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ path: String(url), init: init ?? {} });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const store = new SupabaseMonitoringStore(
      'https://example.supabase.co',
      'server-secret',
      fetcher,
    );

    await store.storeReadings(
      'device-1',
      {
        deviceCode: 'fridge_male_ward',
        readings: [
          {
            metric: 'temperature',
            value: 4.2,
            unit: 'celsius',
            recordedAt: '2026-08-16T09:29:30.000Z',
          },
        ],
      },
      '2026-08-16T09:30:00.000Z',
    );

    expect(calls[0]?.path).toContain('readings?on_conflict=device_id,metric,recorded_at');
    expect(calls[0]?.init.headers).toMatchObject({
      prefer: 'resolution=ignore-duplicates,return=minimal',
    });
  });
});
