import test from 'node:test';
import assert from 'node:assert/strict';
import { indiaClock } from '../schedule.js';

test('India date rolls over independently of browser timezone', () => {
  const clock = indiaClock(new Date('2026-09-06T19:00:00Z'));
  assert.equal(clock.day, 'Mon');
  assert.equal(clock.time, '00:30');
  assert.equal(clock.date.toISOString(), '2026-09-07T00:00:00.000Z');
});
