import { describe, expect, it } from 'vitest';

import { buildDashboardModel, buildSafetyWheelModel, formatReading } from './dashboardData.js';

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

  it('moves threshold breaches into danger while keeping detector state explicit', () => {
    const wheel = buildSafetyWheelModel(
      {
        ...snapshot,
        readings: [
          ...snapshot.readings,
          {
            id: 3,
            device_id: 'device-1',
            metric: 'detector_alarm',
            value: 0,
            unit: 'boolean',
            quality: 'good',
            recorded_at: '2026-08-16T09:34:30.000Z',
            received_at: '2026-08-16T09:35:00.000Z',
          },
        ],
      },
      'fridge_male_ward',
    );

    expect(wheel).toMatchObject({
      title: 'Fridge Male Ward',
      status: 'danger',
      headline: 'Attention needed',
    });
    expect(wheel.metrics.find((metric) => metric.id === 'temperature')).toMatchObject({
      status: 'danger',
      statusLabel: 'Too high',
    });
    expect(wheel.metrics.find((metric) => metric.id === 'temperature').risk).toBeGreaterThan(0.8);
    expect(wheel.metrics.find((metric) => metric.id === 'smoke')).toMatchObject({
      reading: 'Clear',
      status: 'safe',
    });
  });

  it.each([
    ['invalid safe value', { value: 3.5, quality: 'invalid' }],
    ['invalid high value', { value: 7, quality: 'invalid' }],
    ['suspect value', { value: 3.5, quality: 'suspect' }],
    ['stale value', { value: 3.5, recorded_at: '2026-08-16T08:00:00.000Z' }],
    ['future timestamp', { value: 3.5, recorded_at: '2026-08-16T09:36:00.000Z' }],
  ])('marks %s unavailable instead of safe or a threshold alarm', (_label, overrides) => {
    const data = {
      ...snapshot,
      devices: [snapshot.devices[0]],
      readings: [{ ...snapshot.readings[0], ...overrides }],
    };
    const model = buildSafetyWheelModel(data, 'fridge_male_ward');
    expect(model.status).toBe('unknown');
    expect(model.metrics.find((metric) => metric.id === 'temperature')).toMatchObject({
      status: 'unknown',
      reading: '--',
      unavailable: true,
    });
    expect(buildDashboardModel(data).devices[0].statusLabel).toBe('Sensor data unavailable');
  });

  it('does not report an online fridge without temperature data as safe', () => {
    const data = { ...snapshot, devices: [snapshot.devices[0]], readings: [] };
    expect(buildSafetyWheelModel(data).status).toBe('unknown');
  });

  it('does not let a healthy device hide another device with missing sensor data', () => {
    const data = {
      ...snapshot,
      devices: [
        snapshot.devices[0],
        { ...snapshot.devices[0], id: 'device-3', device_code: 'fridge_female_ward' },
      ],
      readings: [{ ...snapshot.readings[0], value: 3.5 }],
    };
    expect(buildSafetyWheelModel(data).status).toBe('unknown');
  });

  it('ignores sensors that are not fitted to a fridge', () => {
    const data = {
      ...snapshot,
      devices: [snapshot.devices[0]],
      readings: [{ ...snapshot.readings[0], value: 3.5 }],
    };
    expect(buildSafetyWheelModel(data)).toMatchObject({ status: 'safe', title: 'Whole facility' });
  });

  it('keeps an acknowledged alert visible even when the current sample is normal', () => {
    const data = {
      ...snapshot,
      devices: [snapshot.devices[0]],
      readings: [{ ...snapshot.readings[0], value: 3.5 }],
      alertRules: [
        {
          id: 'r1',
          device_id: 'device-1',
          metric: 'temperature',
          minimum_value: 2,
          maximum_value: 5,
          enabled: true,
        },
      ],
      alerts: [{ id: 'a1', rule_id: 'r1', device_id: 'device-1', status: 'acknowledged' }],
    };
    expect(buildSafetyWheelModel(data).status).toBe('danger');
    expect(buildDashboardModel(data).summary.activeAlerts).toBe(1);
  });

  it('ages cached readings against the current time', () => {
    const data = {
      ...snapshot,
      devices: [snapshot.devices[0]],
      readings: [{ ...snapshot.readings[0], value: 3.5 }],
    };
    const model = buildSafetyWheelModel(data, undefined, '2026-08-16T09:45:00.000Z');
    expect(model.status).not.toBe('safe');
    expect(model.metrics.find((metric) => metric.id === 'temperature').statusLabel).toBe(
      'Reading stale',
    );
  });

  it('does not treat an invalid detector value as an alarm or all-clear', () => {
    const data = {
      ...snapshot,
      devices: [{ ...snapshot.devices[0], device_type: 'room_monitor' }],
      readings: [
        { ...snapshot.readings[0], value: 3.5 },
        { ...snapshot.readings[0], metric: 'humidity', value: 50 },
        { ...snapshot.readings[0], metric: 'detector_alarm', value: 1, quality: 'invalid' },
      ],
    };
    const model = buildSafetyWheelModel(data);
    expect(model.status).toBe('unknown');
    expect(model.metrics.find((metric) => metric.id === 'smoke')).toMatchObject({
      status: 'unknown',
      statusLabel: 'Sensor fault',
    });
  });
});
