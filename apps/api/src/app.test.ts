import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { SupabaseMonitoringStore, type MonitoringStore } from './monitoringStore.js';

class FakeMonitoringStore implements MonitoringStore {
  readonly stored: Array<{ deviceId: string; receivedAt: string; readingCount: number }> = [];
  readonly evaluatedDevices: Array<{ deviceId: string; evaluatedAt: string }> = [];
  readonly offlineEvaluations: Array<{ evaluatedAt: string; deviceId?: string }> = [];
  readonly rosterUpdates: Array<{ doctorCode: string; slotCount: number }> = [];

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

  async evaluateDeviceAlerts(deviceId: string, evaluatedAt: string) {
    this.evaluatedDevices.push({ deviceId, evaluatedAt });
  }

  async evaluateOfflineAlerts(evaluatedAt: string, deviceId?: string) {
    this.offlineEvaluations.push({ evaluatedAt, deviceId });
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
      doctors: [
        {
          id: 'doctor-1',
          doctor_code: 'duty_medical_officer',
          display_name: 'Duty Medical Officer',
          role: 'Medical Officer',
          department: 'General Medicine',
          room: 'Consultation Room 1',
          display_order: 1,
          is_active: true,
        },
      ],
      doctorAvailability: [
        {
          id: 'availability-1',
          doctor_id: 'doctor-1',
          weekday: 0,
          start_time: '09:00:00',
          end_time: '17:00:00',
          availability_type: 'available' as const,
          note: 'General consultation',
          valid_from: null,
          valid_until: null,
        },
      ],
    };
  }

  async getDoctorRoster() {
    const snapshot = await this.getDashboardSnapshot('2026-08-16T09:30:00.000Z');
    return {
      doctors: snapshot.doctors,
      doctorAvailability: snapshot.doctorAvailability,
    };
  }

  async upsertDoctorRosterEntry(input: { doctorCode: string; availability: unknown[] }) {
    this.rosterUpdates.push({ doctorCode: input.doctorCode, slotCount: input.availability.length });
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
      doctors: [{ doctor_code: 'duty_medical_officer' }],
      doctorAvailability: [{ doctor_id: 'doctor-1', availability_type: 'available' }],
    });
  });

  it('reports missing monitoring storage', async () => {
    const response = await request(createApp({ monitoringStore: null, now })).get(
      '/api/v1/dashboard',
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'monitoring store is not configured' });
  });

  it('rejects malformed dashboard history bounds', async () => {
    const response = await request(
      createApp({ monitoringStore: new FakeMonitoringStore(), now }),
    ).get('/api/v1/dashboard?from=not-a-date');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'from and to must be ISO timestamps' });
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
    expect(store.evaluatedDevices).toEqual([
      { deviceId: 'device-1', evaluatedAt: '2026-08-16T09:30:00.000Z' },
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

describe('doctor roster administration', () => {
  const validDoctor = {
    displayName: 'Duty Doctor',
    role: 'Medical Officer',
    department: 'General Medicine',
    room: 'Consultation Room 1',
    displayOrder: 1,
    isActive: true,
    availability: [
      {
        weekday: 1,
        startTime: '09:00',
        endTime: '17:00',
        availabilityType: 'available',
        note: 'General consultation',
      },
    ],
  };

  it('requires the separate admin token', async () => {
    const app = createApp({
      adminToken: 'admin-test-token',
      monitoringStore: new FakeMonitoringStore(),
    });
    expect((await request(app).get('/api/v1/admin/roster')).status).toBe(401);
  });

  it('returns and updates the public roster for an authenticated local administrator', async () => {
    const store = new FakeMonitoringStore();
    const app = createApp({ adminToken: 'admin-test-token', monitoringStore: store });
    const roster = await request(app)
      .get('/api/v1/admin/roster')
      .set('Authorization', 'Bearer admin-test-token');
    const update = await request(app)
      .put('/api/v1/admin/doctors/duty_doctor')
      .set('Authorization', 'Bearer admin-test-token')
      .send(validDoctor);

    expect(roster.status).toBe(200);
    expect(roster.body.doctors).toHaveLength(1);
    expect(update.status).toBe(200);
    expect(update.body).toEqual({ doctorCode: 'duty_doctor', updated: true });
    expect(store.rosterUpdates).toEqual([{ doctorCode: 'duty_doctor', slotCount: 1 }]);
  });

  it('rejects malformed roster hours', async () => {
    const response = await request(
      createApp({ adminToken: 'admin-test-token', monitoringStore: new FakeMonitoringStore() }),
    )
      .put('/api/v1/admin/doctors/duty_doctor')
      .set('Authorization', 'Bearer admin-test-token')
      .send({
        ...validDoctor,
        availability: [{ ...validDoctor.availability[0], startTime: '17:00', endTime: '09:00' }],
      });

    expect(response.status).toBe(400);
    expect(response.body.details).toContain('availability[0].endTime must be after startTime');
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

  it('uses device and bounded history filters for dashboard details', async () => {
    const calls: string[] = [];
    const fetcher = async (url: string | URL | Request) => {
      calls.push(String(url));
      const body = calls.length === 1 ? [{ id: 'device-1', device_code: 'fridge_male_ward' }] : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const store = new SupabaseMonitoringStore(
      'https://example.supabase.co',
      'server-secret',
      fetcher,
    );

    await store.getDashboardSnapshot('2026-08-16T10:00:00.000Z', {
      deviceCode: 'fridge_male_ward',
      from: '2026-08-16T09:00:00.000Z',
      to: '2026-08-16T10:00:00.000Z',
    });

    expect(calls[0]).toContain('device_code=eq.fridge_male_ward');
    expect(calls[1]).toContain('device_id=in.%28device-1%29');
    expect(calls[1]).toContain('recorded_at=gte.2026-08-16T09%3A00%3A00.000Z');
    expect(calls[1]).toContain('recorded_at=lte.2026-08-16T10%3A00%3A00.000Z');
    expect(calls.some((call) => call.includes('/doctors?'))).toBe(true);
    expect(calls.some((call) => call.includes('/doctor_availability?'))).toBe(true);
  });

  it('evaluates reading and heartbeat rules through server-only RPCs', async () => {
    const calls: Array<{ path: string; body: string | undefined }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ path: String(url), body: init?.body as string | undefined });
      return new Response(null, { status: 204 });
    };
    const store = new SupabaseMonitoringStore(
      'https://example.supabase.co',
      'server-secret',
      fetcher,
    );

    await store.evaluateDeviceAlerts('device-1', '2026-08-16T10:00:00.000Z');

    expect(calls.map((call) => call.path)).toEqual([
      'https://example.supabase.co/rest/v1/rpc/evaluate_device_alerts',
      'https://example.supabase.co/rest/v1/rpc/evaluate_offline_alerts',
    ]);
    expect(JSON.parse(calls[1]?.body ?? '{}')).toEqual({
      p_evaluated_at: '2026-08-16T10:00:00.000Z',
      p_device_id: 'device-1',
    });
  });
});
