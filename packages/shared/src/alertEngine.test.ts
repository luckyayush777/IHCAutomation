import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = (name: string) =>
  readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const deviceId = '00000000-0000-0000-0000-000000000001';
const baseTime = Date.parse('2026-09-05T10:00:00.000Z');
const at = (minute: number) => new Date(baseTime + minute * 60_000).toISOString();
const sample = (minute: number, value = 7, quality = 'good', metric = 'temperature') => ({
  metric,
  value,
  quality,
  unit: metric === 'temperature' ? 'celsius' : metric === 'humidity' ? 'percent_rh' : 'alarm_state',
  recordedAt: at(minute),
});
let db: PGlite;

async function upload(readings: ReturnType<typeof sample>[]) {
  const receivedAt = readings.reduce(
    (latest, reading) => (reading.recordedAt > latest ? reading.recordedAt : latest),
    at(0),
  );
  await db.query('select public.ingest_device_readings($1, $2::jsonb, $3::timestamptz)', [
    deviceId,
    JSON.stringify(readings),
    receivedAt,
  ]);
}
const alerts = async () =>
  (
    await db.query<{ status: string; triggered_at: Date; resolved_at: Date | null }>(
      'select status, triggered_at, resolved_at from alerts order by triggered_at',
    )
  ).rows;
const highRun = () => Array.from({ length: 11 }, (_, minute) => sample(minute));

beforeAll(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  // Core PostgreSQL supplies gen_random_uuid; PGlite does not bundle pgcrypto.
  await db.exec(
    migration('20260816093000_initial_monitoring_schema').replace(
      'create extension if not exists pgcrypto;',
      '',
    ),
  );
  await db.exec(migration('20260817120000_add_alert_engine'));
  await db.exec(migration('20260905120000_fix_alert_continuity'));
}, 30_000);

afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec('truncate alert_condition_states, alerts, readings, alert_rules, devices cascade;');
  await db.query(
    "insert into devices (id, device_code, name, location, device_type) values ($1, 'fridge_male_ward', 'Test fridge', 'Test', 'fridge_probe')",
    [deviceId],
  );
  await db.query(
    "insert into alert_rules (name, device_id, metric, minimum_value, maximum_value, duration_seconds, severity, recovery_seconds, hysteresis_value) values ('Fridge range', $1, 'temperature', 2, 5, 600, 'critical', 120, 0.2)",
    [deviceId],
  );
});

describe('PostgreSQL alert sequences', () => {
  it('recognizes an entire sustained excursion in the first, unordered batch', async () => {
    await upload(highRun().reverse());
    expect(await alerts()).toMatchObject([{ status: 'active', triggered_at: new Date(at(0)) }]);
  });

  it('records an excursion and its recovery when both arrive in one batch', async () => {
    await upload([...highRun(), sample(11, 3.5), sample(12, 3.5), sample(13, 3.5)].reverse());
    expect(await alerts()).toEqual([
      { status: 'resolved', triggered_at: new Date(at(0)), resolved_at: new Date(at(13)) },
    ]);
  });

  it('does not bridge a normal sample hidden inside a later batch', async () => {
    await upload(highRun().slice(0, 9));
    await upload([sample(10), sample(9, 3.5)]);
    expect(await alerts()).toEqual([]);
  });

  it('does not resolve across an intervening violation hidden inside a batch', async () => {
    await upload(highRun());
    await upload([sample(11, 3.5)]);
    await upload([sample(13, 3.5), sample(12)]);
    expect(await alerts()).toMatchObject([{ status: 'active' }]);
    await upload([sample(14, 3.5), sample(15, 3.5)]);
    expect(await alerts()).toMatchObject([{ status: 'resolved', resolved_at: new Date(at(15)) }]);
  });

  it('does not infer a sustained violation across missing data', async () => {
    await upload([sample(0), sample(20)]);
    expect(await alerts()).toEqual([]);
  });

  it('does not infer recovery across missing data', async () => {
    await upload(highRun());
    await upload([sample(11, 3.5), sample(20, 3.5)]);
    expect(await alerts()).toMatchObject([{ status: 'active' }]);
  });

  it.each(['invalid', 'suspect'])(
    'breaks violation and recovery continuity on %s samples',
    async (quality) => {
      await upload(
        highRun().map((reading, minute) => (minute === 5 ? sample(minute, 7, quality) : reading)),
      );
      expect(await alerts()).toEqual([]);
      await upload(Array.from({ length: 6 }, (_, minute) => sample(11 + minute)));
      expect(await alerts()).toMatchObject([{ status: 'active' }]);
      await upload([sample(17, 3.5), sample(18, 3.5, quality), sample(19, 3.5)]);
      expect(await alerts()).toMatchObject([{ status: 'active' }]);
    },
  );

  it('requires continuous evidence inside the hysteresis margin', async () => {
    await upload(highRun());
    await upload([sample(11, 4.7), sample(12, 4.9), sample(13, 4.7)]);
    expect(await alerts()).toMatchObject([{ status: 'active' }]);
    await upload([sample(14, 4.7), sample(15, 4.7)]);
    expect(await alerts()).toMatchObject([{ status: 'resolved' }]);
  });

  it('does not duplicate or reopen a resolved excursion on retry', async () => {
    const readings = [...highRun(), sample(11, 3.5), sample(12, 3.5), sample(13, 3.5)];
    await upload(readings);
    await upload(readings);
    expect(await alerts()).toMatchObject([{ status: 'resolved' }]);
    expect((await db.query('select * from readings')).rows).toHaveLength(14);
  });

  it('recognizes a sustained excursion when queued batches arrive out of order', async () => {
    await upload([sample(10)]);
    await upload(highRun().slice(0, 10));
    expect(await alerts()).toMatchObject([{ status: 'active', triggered_at: new Date(at(0)) }]);
  });

  it('retracts a false excursion when a late normal sample breaks continuity', async () => {
    await upload(highRun().filter((_reading, minute) => minute !== 9));
    expect(await alerts()).toMatchObject([{ status: 'active' }]);
    await upload([sample(9, 3.5)]);
    expect(await alerts()).toEqual([]);
  });

  it('reopens a falsely resolved excursion when a late violation interrupts recovery', async () => {
    await upload([...highRun(), sample(11, 3.5), sample(13, 3.5)]);
    expect(await alerts()).toMatchObject([{ status: 'resolved' }]);
    await upload([sample(12)]);
    expect(await alerts()).toMatchObject([{ status: 'active', resolved_at: null }]);
  });

  it('preserves alert identity and acknowledgement when backfill leaves the episode intact', async () => {
    await upload(highRun());
    await db.query("update alerts set status = 'acknowledged', acknowledged_at = $1", [at(11)]);
    const previous = (await db.query('select id, acknowledged_at from alerts')).rows;
    await upload([sample(0.5)]);
    expect((await db.query('select id, acknowledged_at from alerts')).rows).toEqual(previous);
    expect(await alerts()).toMatchObject([{ status: 'acknowledged' }]);
  });

  it('retains separate episodes within a batch', async () => {
    await db.exec('update alert_rules set duration_seconds = 120, recovery_seconds = 60');
    await upload([
      sample(0),
      sample(1),
      sample(2),
      sample(3, 3.5),
      sample(4, 3.5),
      sample(5),
      sample(6),
      sample(7),
    ]);
    expect(await alerts()).toMatchObject([{ status: 'resolved' }, { status: 'active' }]);
  });

  it('evaluates a detector alarm even when another sensor reports an impossible invalid value', async () => {
    await db.query(
      "insert into alert_rules (name, device_id, metric, maximum_value, duration_seconds, severity, recovery_seconds, hysteresis_value) values ('Detector alarm', $1, 'detector_alarm', 0, 1, 'emergency', 30, 0)",
      [deviceId],
    );
    await upload([
      sample(0, 118, 'invalid', 'humidity'),
      sample(0, 1, 'good', 'detector_alarm'),
      sample(1, 1, 'good', 'detector_alarm'),
    ]);
    expect(await alerts()).toMatchObject([{ status: 'active' }]);
  });

  it('rolls back the entire write if database evaluation fails', async () => {
    await db.exec(
      "create function pg_temp.fail_alert() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$; create trigger fail_alert before insert on alerts for each row execute function pg_temp.fail_alert();",
    );
    try {
      await expect(upload(highRun())).rejects.toThrow('test failure');
      expect((await db.query('select * from readings')).rows).toEqual([]);
      expect((await db.query('select last_seen_at from devices')).rows).toEqual([
        { last_seen_at: null },
      ]);
    } finally {
      await db.exec('drop trigger fail_alert on alerts');
    }
  });

  it('keeps the new ingestion function inaccessible to public clients', async () => {
    await db.exec('set role anon');
    try {
      await expect(
        db.query('select public.ingest_device_readings($1, $2::jsonb)', [deviceId, '[]']),
      ).rejects.toThrow('permission denied');
    } finally {
      await db.exec('reset role');
    }
  });

  it('upgrades existing alerts without trusting old recovery timers or replaying history', async () => {
    const legacy = new PGlite();
    try {
      await legacy.exec('create role anon; create role authenticated; create role service_role;');
      await legacy.exec(
        migration('20260816093000_initial_monitoring_schema').replace(
          'create extension if not exists pgcrypto;',
          '',
        ),
      );
      await legacy.exec(migration('20260817120000_add_alert_engine'));
      await legacy.query(
        "insert into devices (id, device_code, name, location, device_type) values ($1, 'fridge_male_ward', 'Test fridge', 'Test', 'fridge_probe')",
        [deviceId],
      );
      await legacy.query(
        "insert into alert_rules (name, device_id, metric, maximum_value, duration_seconds, severity, recovery_seconds) values ('Fridge range', $1, 'temperature', 5, 600, 'critical', 120)",
        [deviceId],
      );
      for (const minute of [0, 10, 11]) {
        await legacy.query(
          "insert into readings (device_id, metric, value, unit, recorded_at, received_at) values ($1, 'temperature', $2, 'celsius', $3, $3)",
          [deviceId, minute === 11 ? 3.5 : 7, at(minute)],
        );
        await legacy.query('select evaluate_device_alerts($1, $2)', [deviceId, at(minute)]);
      }
      const existing = (await legacy.query('select id from alerts')).rows;
      expect(existing).toHaveLength(1);
      await legacy.exec(migration('20260905120000_fix_alert_continuity'));
      expect((await legacy.query('select id from alerts')).rows).toEqual(existing);
      expect(
        (
          await legacy.query(
            'select violation_started_at, recovery_started_at from alert_condition_states',
          )
        ).rows,
      ).toEqual([{ violation_started_at: null, recovery_started_at: null }]);
      await legacy.query('select ingest_device_readings($1, $2::jsonb, $3)', [
        deviceId,
        JSON.stringify([sample(13, 3.5)]),
        at(13),
      ]);
      expect((await legacy.query('select status from alerts')).rows).toEqual([
        { status: 'active' },
      ]);
      await legacy.query('select ingest_device_readings($1, $2::jsonb, $3)', [
        deviceId,
        JSON.stringify([sample(14, 3.5), sample(15, 3.5)]),
        at(15),
      ]);
      expect((await legacy.query('select status from alerts')).rows).toEqual([
        { status: 'resolved' },
      ]);
    } finally {
      await legacy.close();
    }
  }, 30_000);
});
