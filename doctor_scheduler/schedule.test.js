import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indiaClock, isActive, nextShift } from './schedule.js';

const lines = readFileSync(new URL('./data/schedule.csv', import.meta.url), 'utf8')
  .trim()
  .split(/\r?\n/);
const fields = lines.shift().split(',');
const shifts = lines.map((line) =>
  Object.fromEntries(line.split(',').map((value, index) => [fields[index], value])),
);
const idsAt = (day, time) =>
  shifts
    .filter((s) => isActive(s, day, time))
    .map((s) => s.doctor_id)
    .sort();

test('reference shifts overlap and end exactly at their boundary', () => {
  assert.deepEqual(idsAt('Tue', '18:00'), ['Prat', 'SKU']);
  assert.deepEqual(idsAt('Tue', '19:00'), ['SKU']);
  assert.deepEqual(idsAt('Mon', '05:59'), ['Adar']);
  assert.deepEqual(idsAt('Mon', '06:00'), ['AKS']);
});

test('preserves gaps, including Tuesday morning and Sunday night', () => {
  assert.deepEqual(idsAt('Tue', '00:00'), []);
  assert.deepEqual(idsAt('Wed', '05:30'), []);
  assert.deepEqual(idsAt('Mon', '12:00'), []);
  assert.deepEqual(idsAt('Sun', '21:30'), []);
  assert.deepEqual(idsAt('Mon', '21:30'), ['Adar']);
});

test('Sunday evening next shift wraps to Monday midnight', () => {
  const next = nextShift(shifts, 'Sun', '21:00');
  assert.equal(next.doctor_id, 'Adar');
  assert.equal(next.day, 'Mon');
  assert.equal(next.start, '00:00');
  assert.equal(next.offset, 180);
});

test('overnight shifts continue from their starting day', () => {
  const shift = { days: ['Sun'], start: '22:00', end: '06:00' };
  assert.equal(isActive(shift, 'Sun', '22:00'), true);
  assert.equal(isActive(shift, 'Mon', '05:59'), true);
  assert.equal(isActive(shift, 'Mon', '06:00'), false);
  assert.equal(isActive(shift, 'Sun', '05:00'), false);
});

test('India date rolls over independently of browser timezone', () => {
  const clock = indiaClock(new Date('2026-09-06T19:00:00Z'));
  assert.equal(clock.day, 'Mon');
  assert.equal(clock.time, '00:30');
  assert.equal(clock.date.toISOString(), '2026-09-07T00:00:00.000Z');
});
