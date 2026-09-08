import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceGroups, indiaClock } from '../schedule.js';

test('India date rolls over independently of browser timezone', () => {
  const clock = indiaClock(new Date('2026-09-06T19:00:00Z'));
  assert.equal(clock.day, 'Mon');
  assert.equal(clock.time, '00:30');
  assert.equal(clock.date.toISOString(), '2026-09-07T00:00:00.000Z');
});

const day = '2026-09-08';
const doctors = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name }));
const shifts = ['A', 'B', 'C', 'F'].map((name) => ({ name, start: 540, end: 720 }));
const attendance = {
  status: 'ok',
  date: day,
  records: [
    { name: 'A', state: 'present' },
    { name: 'B', state: 'absent' },
    { name: 'D', state: 'present' },
    { name: 'E', state: 'absent' },
    { name: 'F', state: 'unconfirmed' },
    { name: 'Removed', state: 'present' },
  ],
};
const names = (group) => group.doctors.map((doctor) => doctor.name);

test('Only agreement confirms presence; other combinations are categorised separately', () => {
  const before = JSON.stringify({ doctors, shifts, attendance });
  const { groups } = attendanceGroups(doctors, shifts, attendance, day);
  assert.deepEqual(names(groups.confirmed), ['A']);
  assert.deepEqual(names(groups.absent), ['B']);
  assert.deepEqual(names(groups.unconfirmed), ['C', 'F']);
  assert.deepEqual(names(groups.unscheduled), ['D']);
  assert.deepEqual(names(groups.unpublished), []);
  assert.equal(JSON.stringify({ doctors, shifts, attendance }), before);
});

test('Missing, failed, offline and previous-day attendance cannot confirm presence', () => {
  for (const [input, offline] of [
    [undefined, false],
    [{ ...attendance, status: 'unavailable' }, false],
    [{ ...attendance, date: '2026-09-07' }, false],
    [attendance, true],
  ]) {
    const { available, groups } = attendanceGroups(doctors, shifts, input, day, offline);
    assert.equal(available, false);
    assert.deepEqual(names(groups.confirmed), []);
    assert.deepEqual(names(groups.unconfirmed), ['A', 'B', 'C', 'F']);
    assert.deepEqual(names(groups.unscheduled), []);
  }
});

test('An unpublished roster differs from an explicitly empty roster', () => {
  const missing = attendanceGroups(doctors, undefined, attendance, day).groups;
  assert.deepEqual(names(missing.confirmed), []);
  assert.deepEqual(names(missing.unpublished), ['A', 'D']);
  const empty = attendanceGroups(doctors, [], attendance, day).groups;
  assert.deepEqual(names(empty.confirmed), []);
  assert.deepEqual(names(empty.unscheduled), ['A', 'D']);
});
