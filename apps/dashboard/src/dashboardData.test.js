import { describe, expect, it } from 'vitest';

import {
  buildDashboardModel,
  buildDoctorAvailabilityModel,
  formatReading,
} from './dashboardData.js';

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
  doctors: [
    {
      id: 'doctor-1',
      doctor_code: 'duty_doctor',
      display_name: 'Duty Doctor',
      role: 'Medical Officer',
      department: 'General Medicine',
      room: 'Consultation Room 1',
      display_order: 1,
      is_active: true,
    },
  ],
  doctorAvailability: [
    {
      id: 'slot-1',
      doctor_id: 'doctor-1',
      weekday: 0,
      start_time: '09:00:00',
      end_time: '17:00:00',
      availability_type: 'available',
      note: 'General consultation',
      valid_from: null,
      valid_until: null,
    },
  ],
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

  it('calculates current doctor availability in the health-centre time zone', () => {
    const doctors = buildDoctorAvailabilityModel(snapshot);

    expect(doctors[0]).toMatchObject({
      display_name: 'Duty Doctor',
      availabilityKind: 'available',
      availabilityLabel: 'Available now',
      scheduleLabel: '09:00–17:00',
    });
    expect(buildDashboardModel(snapshot).summary.doctorsAvailable).toBe(1);
  });

  it('formats readings for compact dashboard labels', () => {
    expect(formatReading(undefined)).toBe('--');
    expect(formatReading({ metric: 'humidity', value: 55.25 })).toBe('55.3 % RH');
    expect(formatReading({ metric: 'detector_alarm', value: 0 })).toBe('Clear');
  });
});
