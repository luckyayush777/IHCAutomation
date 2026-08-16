import { describe, expect, it } from 'vitest';

import { buildDashboardModel, formatReading } from './dashboardData.js';

const snapshot = {
  generatedAt: '2026-08-16T09:35:00.000Z',
  devices: [
    {
      id: 'device-1',
      device_code: 'fridge_male_ward',
      name: 'Fridge Male Ward',
      location: 'Male Ward',
      device_type: 'fridge_probe',
      status: 'online',
      last_seen_at: '2026-08-16T09:34:30.000Z',
    },
    {
      id: 'device-2',
      device_code: 'female_ward',
      name: 'Female Ward',
      location: 'Female Ward',
      device_type: 'room_monitor',
      status: 'online',
      last_seen_at: '2026-08-16T09:20:00.000Z',
    },
  ],
  readings: [
    {
      id: 2,
      device_id: 'device-1',
      metric: 'temperature',
      value: 7.1,
      unit: 'celsius',
      quality: 'good',
      recorded_at: '2026-08-16T09:34:30.000Z',
      received_at: '2026-08-16T09:35:00.000Z',
    },
    {
      id: 1,
      device_id: 'device-1',
      metric: 'temperature',
      value: 4.2,
      unit: 'celsius',
      quality: 'good',
      recorded_at: '2026-08-16T09:33:30.000Z',
      received_at: '2026-08-16T09:34:00.000Z',
    },
  ],
  alertRules: [],
  alerts: [],
};

describe('dashboard data model', () => {
  it('uses the latest reading and marks out-of-range fridges for attention', () => {
    const model = buildDashboardModel(snapshot);

    expect(model.devices[0]).toMatchObject({
      device_code: 'fridge_male_ward',
      primaryReading: '7.1 C',
      statusKind: 'alert',
    });
    expect(model.summary).toMatchObject({
      alert: 1,
      offline: 1,
    });
  });

  it('formats readings for compact dashboard labels', () => {
    expect(formatReading(undefined)).toBe('--');
    expect(formatReading({ metric: 'humidity', value: 55.25 })).toBe('55.3 % RH');
    expect(formatReading({ metric: 'detector_alarm', value: 0 })).toBe('Clear');
  });
});
