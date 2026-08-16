import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const migration = readFileSync(
  join(rootDir, 'supabase', 'migrations', '20260816093000_initial_monitoring_schema.sql'),
  'utf8',
);
const seed = readFileSync(join(rootDir, 'supabase', 'seed.sql'), 'utf8');

describe('Supabase monitoring schema', () => {
  it('creates the core monitoring tables with row level security', () => {
    for (const table of ['devices', 'readings', 'alert_rules', 'alerts']) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`on public.${table} for select`);
    }
  });

  it('keeps public clients read-only while preserving service-role writes', () => {
    expect(migration).toContain(
      'grant select (id, device_code, name, location, device_type, status, last_seen_at, created_at)',
    );
    expect(migration).toContain(
      'grant select (id, device_id, metric, value, unit, quality, recorded_at, received_at)',
    );
    expect(migration).toContain('grant all on table public.devices to service_role');
    expect(migration).not.toMatch(/for\s+(insert|update|delete)\s+to\s+anon/i);
  });

  it('defines constraints and indexes required by the dashboard and alert engine', () => {
    expect(migration).toContain("device_type in ('fridge_probe', 'room_monitor')");
    expect(migration).toContain("status in ('online', 'offline', 'maintenance', 'disabled')");
    expect(migration).toContain("metric in ('temperature', 'humidity', 'smoke', 'detector_alarm')");
    expect(migration).toContain("severity in ('warning', 'critical', 'emergency')");
    expect(migration).toContain('on public.readings (device_id, metric, recorded_at desc)');
    expect(migration).toContain('readings_device_metric_recorded_at_unique_idx');
    expect(migration).toContain('alerts_one_open_per_rule_device_idx');
  });

  it('seeds the approved prototype devices and refrigerator rules', () => {
    for (const slug of [
      'fridge_male_ward',
      'fridge_female_ward',
      'doctors_room',
      'monitoring_room',
      'male_ward',
      'female_ward',
    ]) {
      expect(seed).toContain(slug);
    }

    expect(seed).toContain('2.000');
    expect(seed).toContain('5.000');
    expect(seed).toContain('600');
  });
});
